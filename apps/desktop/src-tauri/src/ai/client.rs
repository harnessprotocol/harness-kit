use futures_util::StreamExt;
use reqwest::Client;
use serde_json::json;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::time::timeout;

use crate::ai::types::{
    ChatRequest, DownloadProgress, ModelInfo, ModelsResponse, PullProgressRaw, StreamEvent,
    ToolCall,
};

// ─── UTF-8-safe stream buffer ────────────────────────────────────────────────

/// Accumulates raw bytes and drains complete newline-terminated lines.
/// Splitting on `b'\n'` before UTF-8 decoding prevents replacement-char
/// corruption when a multi-byte codepoint straddles a TCP read boundary.
pub struct StreamBuffer {
    buf: Vec<u8>,
}

impl StreamBuffer {
    pub fn new() -> Self {
        Self { buf: Vec::new() }
    }

    pub fn push(&mut self, bytes: &[u8]) {
        self.buf.extend_from_slice(bytes);
    }

    /// Drains all complete lines (terminated by `\n`) from the buffer.
    /// Returns `Ok(line)` for valid UTF-8 lines and `Err(msg)` for invalid ones.
    /// Empty / whitespace-only lines are silently skipped.
    pub fn drain_lines(&mut self) -> Vec<Result<String, String>> {
        let mut out = Vec::new();
        while let Some(pos) = self.buf.iter().position(|&b| b == b'\n') {
            let line_bytes = self.buf[..pos].to_vec();
            self.buf = self.buf[pos + 1..].to_vec();
            match std::str::from_utf8(&line_bytes) {
                Ok(s) => {
                    let trimmed = s.trim().to_string();
                    if !trimmed.is_empty() {
                        out.push(Ok(trimmed));
                    }
                }
                Err(_) => out.push(Err("Non-UTF-8 bytes in stream line — skipped".to_string())),
            }
        }
        out
    }
}

// ─── Pure line parser ────────────────────────────────────────────────────────

/// Parse one NDJSON line from the Ollama chat stream into zero or more events.
///
/// Priority: tool_calls > text content > done flag.
/// A single line can yield multiple events (e.g. Text + Done), so returns Vec.
/// Malformed JSON yields a single Warn event.
pub fn parse_line(line: &str) -> Vec<StreamEvent> {
    if line.trim().is_empty() {
        return vec![];
    }

    let json: serde_json::Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(_) => {
            let preview = &line[..line.len().min(120)];
            return vec![StreamEvent::Warn {
                message: format!("Malformed JSON in stream: {}", preview),
            }];
        }
    };

    let mut events = Vec::new();

    // Tool calls take priority over text (they're mutually exclusive in practice,
    // but checking first prevents accidentally emitting an empty Text event)
    if let Some(arr) = json.pointer("/message/tool_calls").and_then(|v| v.as_array()) {
        if !arr.is_empty() {
            match serde_json::from_value::<Vec<ToolCall>>(serde_json::Value::Array(arr.clone())) {
                Ok(calls) => events.push(StreamEvent::ToolCalls { calls }),
                Err(e) => events.push(StreamEvent::Warn {
                    message: format!("Failed to parse tool_calls: {}", e),
                }),
            }
        }
    }

    // Non-empty content chunk
    if let Some(content) = json.pointer("/message/content").and_then(|v| v.as_str()) {
        if !content.is_empty() {
            events.push(StreamEvent::Text {
                content: content.to_string(),
            });
        }
    }

    // Done flag (may accompany the last content chunk, though Ollama usually sends
    // an empty-content done line after all content chunks)
    if json["done"].as_bool().unwrap_or(false) {
        let eval_count = json["eval_count"].as_u64();
        let prompt_eval_count = json["prompt_eval_count"].as_u64();
        events.push(StreamEvent::Done {
            eval_count,
            prompt_eval_count,
        });
    }

    events
}

// ─── Ollama client ───────────────────────────────────────────────────────────

/// Shared Ollama HTTP client — stored as Tauri managed state.
pub struct OllamaClient {
    client: Client,
    /// Runtime-configurable base URL (default: http://localhost:11434).
    pub base_url: Arc<Mutex<String>>,
}

/// App-level AI state managed by Tauri.
pub struct OllamaState {
    pub client: OllamaClient,
    /// Set to `true` to abort the current stream_chat call.
    pub cancel: Arc<AtomicBool>,
}

impl OllamaState {
    pub fn new(endpoint: impl Into<String>) -> Self {
        Self {
            client: OllamaClient::new(endpoint),
            cancel: Arc::new(AtomicBool::new(false)),
        }
    }
}

impl OllamaClient {
    pub fn new(endpoint: impl Into<String>) -> Self {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(3))
            .pool_idle_timeout(Duration::from_secs(30))
            .user_agent("harness-kit/ai-chat")
            .build()
            .expect("reqwest client build failed");
        Self {
            client,
            base_url: Arc::new(Mutex::new(endpoint.into())),
        }
    }

    fn base_url(&self) -> String {
        self.base_url.lock().unwrap().clone()
    }

    /// Returns `true` if the Ollama service is reachable.
    pub async fn check_health(&self) -> bool {
        let url = format!("{}/api/tags", self.base_url());
        self.client
            .get(&url)
            .timeout(Duration::from_secs(3))
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
    }

    /// Returns the list of locally available models.
    pub async fn list_models(&self) -> Result<Vec<ModelInfo>, String> {
        let url = format!("{}/api/tags", self.base_url());
        let response = self
            .client
            .get(&url)
            .timeout(Duration::from_secs(10))
            .send()
            .await
            .map_err(|e| format!("Failed to reach Ollama: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Ollama returned {}", response.status()));
        }

        let body: ModelsResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse model list: {}", e))?;

        Ok(body.models)
    }

    /// Streams a chat completion, emitting `StreamEvent`s via `on_event`.
    ///
    /// - Cancellable via the shared `cancel` atomic flag.
    /// - Idle timeout: if no bytes arrive for 60 s, returns an error.
    /// - UTF-8 safe: uses a byte buffer split on `\n` before decoding.
    /// - Supports tool-calling: emits `StreamEvent::ToolCalls` when the model
    ///   requests tools, then `StreamEvent::Done`.
    pub async fn stream_chat<F>(
        &self,
        request: ChatRequest,
        cancel: Arc<AtomicBool>,
        mut on_event: F,
    ) -> Result<(), String>
    where
        F: FnMut(StreamEvent) -> Result<(), String>,
    {
        let mut req = request;
        req.stream = Some(true);

        let url = format!("{}/api/chat", self.base_url());
        let response = self
            .client
            .post(&url)
            .json(&req)
            .send()
            .await
            .map_err(|e| format!("Failed to reach Ollama: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            if status.as_u16() == 400 && body.contains("does not support tools") {
                return Err("MODEL_NO_TOOLS".to_string());
            }
            return Err(format!("Ollama returned {}: {}", status, body.trim()));
        }

        let mut stream = response.bytes_stream();
        let mut buf = StreamBuffer::new();

        loop {
            if cancel.load(Ordering::Relaxed) {
                let _ = on_event(StreamEvent::Done {
                    eval_count: None,
                    prompt_eval_count: None,
                });
                return Ok(());
            }

            // Idle timeout: surface an error if no bytes arrive for 60s.
            let chunk_result = match timeout(Duration::from_secs(60), stream.next()).await {
                Ok(Some(r)) => r,
                Ok(None) => break, // stream ended cleanly
                Err(_) => return Err("Stream idle timeout (60s with no data)".to_string()),
            };

            let bytes = chunk_result.map_err(|e| format!("Stream error: {}", e))?;
            buf.push(&bytes);

            for line_result in buf.drain_lines() {
                match line_result {
                    Ok(line) => {
                        for event in parse_line(&line) {
                            let is_done = matches!(event, StreamEvent::Done { .. });
                            on_event(event)?;
                            if is_done {
                                return Ok(());
                            }
                        }
                    }
                    Err(msg) => {
                        on_event(StreamEvent::Warn { message: msg })?;
                    }
                }
            }
        }

        Ok(())
    }

    /// Downloads a model, calling `on_progress` with each progress update.
    pub async fn pull_model<F>(&self, model: &str, mut on_progress: F) -> Result<(), String>
    where
        F: FnMut(DownloadProgress) -> Result<(), String>,
    {
        let url = format!("{}/api/pull", self.base_url());
        let payload = json!({ "name": model, "stream": true });

        let response = self
            .client
            .post(&url)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Failed to reach Ollama: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Ollama returned {} for pull", response.status()));
        }

        let mut stream = response.bytes_stream();
        let mut buf = StreamBuffer::new();
        let model_name = model.to_string();

        while let Some(chunk_result) = stream.next().await {
            let bytes = chunk_result.map_err(|e| format!("Pull stream error: {}", e))?;
            buf.push(&bytes);

            for line_result in buf.drain_lines() {
                let line = match line_result {
                    Ok(l) => l,
                    Err(_) => continue,
                };
                if let Ok(raw) = serde_json::from_str::<PullProgressRaw>(&line) {
                    let done = raw.status == "success";
                    on_progress(DownloadProgress {
                        model: model_name.clone(),
                        status: raw.status,
                        completed: raw.completed,
                        total: raw.total,
                        done,
                    })?;
                    if done {
                        return Ok(());
                    }
                }
            }
        }

        Ok(())
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_empty_line() {
        assert!(parse_line("").is_empty());
        assert!(parse_line("   ").is_empty());
    }

    #[test]
    fn parse_text_chunk() {
        let line = r#"{"message":{"role":"assistant","content":"Hello"},"done":false}"#;
        let events = parse_line(line);
        assert_eq!(events.len(), 1);
        assert!(matches!(&events[0], StreamEvent::Text { content } if content == "Hello"));
    }

    #[test]
    fn parse_done_chunk() {
        let line = r#"{"message":{"role":"assistant","content":""},"done":true,"eval_count":42,"prompt_eval_count":7}"#;
        let events = parse_line(line);
        assert_eq!(events.len(), 1);
        assert!(matches!(
            &events[0],
            StreamEvent::Done { eval_count: Some(42), prompt_eval_count: Some(7) }
        ));
    }

    #[test]
    fn parse_tool_calls_chunk() {
        let line = r#"{"message":{"role":"assistant","content":"","tool_calls":[{"function":{"name":"security.read_permissions","arguments":{}}}]},"done":false}"#;
        let events = parse_line(line);
        assert_eq!(events.len(), 1);
        let StreamEvent::ToolCalls { calls } = &events[0] else {
            panic!("expected ToolCalls, got {:?}", events[0]);
        };
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].function.name, "security.read_permissions");
    }

    #[test]
    fn parse_malformed_json() {
        let events = parse_line("not valid json {{{");
        assert_eq!(events.len(), 1);
        assert!(matches!(&events[0], StreamEvent::Warn { .. }));
    }

    #[test]
    fn stream_buffer_basic() {
        let mut buf = StreamBuffer::new();
        buf.push(b"line1\nline2\n");
        let lines = buf.drain_lines();
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].as_deref().unwrap(), "line1");
        assert_eq!(lines[1].as_deref().unwrap(), "line2");
    }

    #[test]
    fn stream_buffer_partial_line_retained() {
        let mut buf = StreamBuffer::new();
        buf.push(b"partial");
        assert!(buf.drain_lines().is_empty());
        buf.push(b" done\n");
        let lines = buf.drain_lines();
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].as_deref().unwrap(), "partial done");
    }

    #[test]
    fn stream_buffer_utf8_boundary() {
        // "é" is 0xC3 0xA9 — split across two pushes
        let mut buf = StreamBuffer::new();
        buf.push(&[0xC3]); // first byte of é
        assert!(buf.drain_lines().is_empty()); // no newline yet
        buf.push(&[0xA9, b'\n']); // second byte + newline
        let lines = buf.drain_lines();
        assert_eq!(lines.len(), 1);
        let line = lines[0].as_deref().unwrap();
        // The two bytes together are valid UTF-8 "é"
        assert_eq!(line, "é");
    }

    #[test]
    fn stream_buffer_invalid_utf8_line() {
        let mut buf = StreamBuffer::new();
        buf.push(&[0xFF, 0xFE, b'\n']); // invalid UTF-8
        let lines = buf.drain_lines();
        assert_eq!(lines.len(), 1);
        assert!(lines[0].is_err());
    }
}
