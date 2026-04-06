use futures_util::StreamExt;
use reqwest::Client;
use serde_json::json;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use crate::ai::types::{
    ChatChunk, ChatRequest, DownloadProgress, ModelInfo, ModelsResponse, PullProgressRaw,
};

/// Shared Ollama HTTP client — stored as Tauri managed state.
/// `reqwest::Client` is `Clone + Send + Sync` so `OllamaClient` is too.
pub struct OllamaClient {
    client: Client,
    base_url: String,
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
        Self {
            client: Client::new(),
            base_url: endpoint.into(),
        }
    }

    /// Returns `true` if the Ollama service is reachable.
    pub async fn check_health(&self) -> bool {
        let url = format!("{}/api/tags", self.base_url);
        self.client
            .get(&url)
            .timeout(std::time::Duration::from_secs(3))
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
    }

    /// Returns the list of locally available models.
    pub async fn list_models(&self) -> Result<Vec<ModelInfo>, String> {
        let url = format!("{}/api/tags", self.base_url);
        let response = self
            .client
            .get(&url)
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

    /// Streams a chat completion. Calls `on_chunk` for every token.
    /// Returns early (without error) if `cancel` is set to `true`.
    pub async fn stream_chat<F>(
        &self,
        request: ChatRequest,
        cancel: Arc<AtomicBool>,
        mut on_chunk: F,
    ) -> Result<(), String>
    where
        F: FnMut(ChatChunk) -> Result<(), String>,
    {
        let mut req = request;
        req.stream = Some(true);

        let url = format!("{}/api/chat", self.base_url);
        let response = self
            .client
            .post(&url)
            .json(&req)
            .send()
            .await
            .map_err(|e| format!("Failed to reach Ollama: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Ollama returned {}", response.status()));
        }

        let mut stream = response.bytes_stream();
        let mut buffer = String::new();

        while let Some(chunk_result) = stream.next().await {
            if cancel.load(Ordering::Relaxed) {
                // Send a done chunk so the frontend knows streaming ended
                let _ = on_chunk(ChatChunk { content: String::new(), done: true });
                return Ok(());
            }

            let bytes = chunk_result.map_err(|e| format!("Stream error: {}", e))?;
            buffer.push_str(&String::from_utf8_lossy(&bytes));

            while let Some(pos) = buffer.find('\n') {
                let line = buffer[..pos].trim().to_string();
                buffer = buffer[pos + 1..].to_string();

                if line.is_empty() {
                    continue;
                }

                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                    let content = json["message"]["content"]
                        .as_str()
                        .unwrap_or("")
                        .to_string();
                    let done = json["done"].as_bool().unwrap_or(false);

                    on_chunk(ChatChunk { content, done })?;

                    if done {
                        return Ok(());
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
        let url = format!("{}/api/pull", self.base_url);
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
        let mut buffer = String::new();
        let model_name = model.to_string();

        while let Some(chunk_result) = stream.next().await {
            let bytes = chunk_result.map_err(|e| format!("Pull stream error: {}", e))?;
            buffer.push_str(&String::from_utf8_lossy(&bytes));

            while let Some(pos) = buffer.find('\n') {
                let line = buffer[..pos].trim().to_string();
                buffer = buffer[pos + 1..].to_string();

                if line.is_empty() {
                    continue;
                }

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
