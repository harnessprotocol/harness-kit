use serde::{Deserialize, Serialize};

/// A message in the Ollama chat API (snake_case — matches Ollama wire format)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// Chat request payload (snake_case — matches Ollama wire format)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,
}

/// Model info from Ollama /api/tags (snake_case — matches Ollama wire format)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified_at: Option<String>,
}

/// /api/tags response envelope (snake_case — matches Ollama wire format)
#[derive(Debug, Clone, Deserialize)]
pub struct ModelsResponse {
    pub models: Vec<ModelInfo>,
}

/// Streaming chunk sent to the frontend via Tauri Channel (camelCase for JS)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatChunk {
    pub content: String,
    pub done: bool,
}

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
