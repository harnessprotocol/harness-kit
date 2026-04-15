use serde::{Deserialize, Serialize};

// ─── Tool-calling schema ─────────────────────────────────────────────────────

/// A parsed tool call returned by the model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallFunction {
    pub name: String,
    /// Ollama sends arguments as a JSON object (not a string)
    pub arguments: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub function: ToolCallFunction,
}

/// Tool definition sent to Ollama in the request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefFunction {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDef {
    #[serde(rename = "type")]
    pub kind: String, // always "function"
    pub function: ToolDefFunction,
}

// ─── Chat message / request ──────────────────────────────────────────────────

/// A message in the Ollama chat API (snake_case — matches Ollama wire format)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String, // "system" | "user" | "assistant" | "tool"
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub content: String,
    /// Tool response: the name of the tool that produced this message
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Model-generated tool calls (assistant turn)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
}

/// Chat request payload (snake_case — matches Ollama wire format)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<ToolDef>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keep_alive: Option<String>,
}

// ─── Streaming events (frontend-facing, camelCase) ───────────────────────────

/// Tagged streaming event sent to the frontend via Tauri Channel.
///
/// Uses `tag = "kind"` so the frontend can switch on `event.kind`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind", content = "data")]
pub enum StreamEvent {
    /// A text content chunk
    Text { content: String },
    /// Model requested one or more tool calls
    ToolCalls { calls: Vec<ToolCall> },
    /// Stream finished (carries Ollama eval metrics)
    Done {
        eval_count: Option<u64>,
        prompt_eval_count: Option<u64>,
    },
    /// Non-fatal warning (e.g. non-UTF-8 bytes, malformed JSON line)
    Warn { message: String },
}

// ─── Model info ──────────────────────────────────────────────────────────────

/// Model info from Ollama /api/tags (snake_case — matches Ollama wire format)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified_at: Option<String>,
}

/// /api/tags response envelope
#[derive(Debug, Clone, Deserialize)]
pub struct ModelsResponse {
    pub models: Vec<ModelInfo>,
}

// ─── Pull progress ───────────────────────────────────────────────────────────

/// Raw pull-progress line from Ollama (snake_case — matches Ollama wire format)
#[derive(Debug, Deserialize)]
pub struct PullProgressRaw {
    pub status: String,
    pub completed: Option<i64>,
    pub total: Option<i64>,
}

/// Download progress sent to the frontend via Tauri Channel (camelCase for JS)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub model: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<i64>,
    pub done: bool,
}
