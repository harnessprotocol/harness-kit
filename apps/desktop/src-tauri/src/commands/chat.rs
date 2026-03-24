use crate::db::Db;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRoomRow {
    pub code: String,
    pub name: Option<String>,
    pub nickname: String,
    pub server_url: String,
    pub joined_at: String,
    pub left_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageRow {
    pub id: String,
    pub room_code: String,
    pub msg_type: String,
    pub nickname: String,
    pub timestamp: String,
    pub body: Option<String>,
    pub action: Option<String>,
    pub target: Option<String>,
    pub detail: Option<String>,
    pub event_type: Option<String>,
}

#[tauri::command]
pub fn chat_save_room(
    db: State<'_, Db>,
    code: String,
    name: Option<String>,
    nickname: String,
    server_url: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let joined_at = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT OR REPLACE INTO chat_rooms (code, name, nickname, server_url, joined_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![code, name, nickname, server_url, joined_at],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn chat_leave_room(
    db: State<'_, Db>,
    code: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let left_at = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE chat_rooms SET left_at = ?1 WHERE code = ?2",
        rusqlite::params![left_at, code],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn chat_list_rooms(
    db: State<'_, Db>,
) -> Result<Vec<ChatRoomRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT code, name, nickname, server_url, joined_at, left_at FROM chat_rooms ORDER BY joined_at DESC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(ChatRoomRow {
                code: row.get(0)?,
                name: row.get(1)?,
                nickname: row.get(2)?,
                server_url: row.get(3)?,
                joined_at: row.get(4)?,
                left_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[tauri::command]
pub fn chat_save_messages(
    db: State<'_, Db>,
    messages: Vec<ChatMessageRow>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| e.to_string())?;

    for msg in &messages {
        tx.execute(
            "INSERT OR IGNORE INTO chat_messages (id, room_code, type, nickname, timestamp, body, action, target, detail, event_type) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            rusqlite::params![
                msg.id,
                msg.room_code,
                msg.msg_type,
                msg.nickname,
                msg.timestamp,
                msg.body,
                msg.action,
                msg.target,
                msg.detail,
                msg.event_type,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn chat_load_messages(
    db: State<'_, Db>,
    room_code: String,
    limit: u32,
    before: Option<String>,
) -> Result<Vec<ChatMessageRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut rows: Vec<ChatMessageRow> = if let Some(ref before_ts) = before {
        let mut stmt = conn
            .prepare(
                "SELECT id, room_code, type, nickname, timestamp, body, action, target, detail, event_type \
                 FROM chat_messages WHERE room_code = ?1 AND timestamp < ?2 \
                 ORDER BY timestamp DESC LIMIT ?3",
            )
            .map_err(|e| e.to_string())?;

        let collected = stmt
            .query_map(rusqlite::params![room_code, before_ts, limit], |row| {
                Ok(ChatMessageRow {
                    id: row.get(0)?,
                    room_code: row.get(1)?,
                    msg_type: row.get(2)?,
                    nickname: row.get(3)?,
                    timestamp: row.get(4)?,
                    body: row.get(5)?,
                    action: row.get(6)?,
                    target: row.get(7)?,
                    detail: row.get(8)?,
                    event_type: row.get(9)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        collected
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT id, room_code, type, nickname, timestamp, body, action, target, detail, event_type \
                 FROM chat_messages WHERE room_code = ?1 \
                 ORDER BY timestamp DESC LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;

        let collected = stmt
            .query_map(rusqlite::params![room_code, limit], |row| {
                Ok(ChatMessageRow {
                    id: row.get(0)?,
                    room_code: row.get(1)?,
                    msg_type: row.get(2)?,
                    nickname: row.get(3)?,
                    timestamp: row.get(4)?,
                    body: row.get(5)?,
                    action: row.get(6)?,
                    target: row.get(7)?,
                    detail: row.get(8)?,
                    event_type: row.get(9)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        collected
    };

    // Reverse so results are in ascending (chronological) order
    rows.reverse();
    Ok(rows)
}

#[tauri::command]
pub fn chat_purge_room(
    db: State<'_, Db>,
    code: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM chat_rooms WHERE code = ?1",
        rusqlite::params![code],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
