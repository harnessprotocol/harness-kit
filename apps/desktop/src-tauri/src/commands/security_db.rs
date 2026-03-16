use crate::db::Db;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AuditEntry {
    pub id: String,
    pub timestamp: String,
    pub event_type: String,
    pub category: String,
    pub summary: String,
    pub details: Option<String>,
    pub source: String,
}

#[tauri::command]
pub fn list_audit_entries(
    db: State<'_, Db>,
    limit: Option<i64>,
    offset: Option<i64>,
    category: Option<String>,
) -> Result<Vec<AuditEntry>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let limit = limit.unwrap_or(50);
    let offset = offset.unwrap_or(0);

    let (sql, params): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = if let Some(ref cat) = category {
        (
            "SELECT id, timestamp, event_type, category, summary, details, source FROM audit_log WHERE category = ?1 ORDER BY timestamp DESC LIMIT ?2 OFFSET ?3".to_string(),
            vec![
                Box::new(cat.clone()) as Box<dyn rusqlite::types::ToSql>,
                Box::new(limit),
                Box::new(offset),
            ],
        )
    } else {
        (
            "SELECT id, timestamp, event_type, category, summary, details, source FROM audit_log ORDER BY timestamp DESC LIMIT ?1 OFFSET ?2".to_string(),
            vec![
                Box::new(limit) as Box<dyn rusqlite::types::ToSql>,
                Box::new(offset),
            ],
        )
    };

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let params_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let entries = stmt
        .query_map(params_refs.as_slice(), |row| {
            Ok(AuditEntry {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                event_type: row.get(2)?,
                category: row.get(3)?,
                summary: row.get(4)?,
                details: row.get(5)?,
                source: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(entries)
}

#[tauri::command]
pub fn clear_audit_entries(
    db: State<'_, Db>,
    before_date: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM audit_log WHERE timestamp < ?1",
        rusqlite::params![before_date],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
