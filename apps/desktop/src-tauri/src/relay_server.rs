//! In-process WebSocket relay server.
//! Implements the same JSON protocol as packages/chat-relay.

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use tokio::net::TcpListener;
use tokio::sync::mpsc;
use tokio::task::AbortHandle;
use tokio_tungstenite::tungstenite::Message;

const RING_BUFFER_CAP: usize = 500;

// ── Shared state ────────────────────────────────────────────

struct Member {
    nickname: String,
    tx: mpsc::UnboundedSender<Message>,
}

struct Room {
    name: Option<String>,
    members: HashMap<String, Member>, // key = addr string
    messages: VecDeque<Value>,
}

impl Room {
    fn new(name: Option<String>) -> Self {
        Self { name, members: HashMap::new(), messages: VecDeque::new() }
    }

    fn push_message(&mut self, msg: Value) {
        if self.messages.len() >= RING_BUFFER_CAP {
            self.messages.pop_front();
        }
        self.messages.push_back(msg);
    }

    fn broadcast(&self, msg: &Value, exclude: Option<&str>) {
        let text = Message::Text(msg.to_string().into());
        for (addr, member) in &self.members {
            if exclude == Some(addr.as_str()) { continue; }
            member.tx.send(text.clone()).ok();
        }
    }

    fn broadcast_all(&self, msg: &Value) {
        self.broadcast(msg, None);
    }

    fn members_list(&self) -> Value {
        json!(self.members.values().map(|m| m.nickname.as_str()).collect::<Vec<_>>())
    }
}

pub struct RelayState {
    rooms: HashMap<String, Room>,
}

impl RelayState {
    fn new() -> Self {
        Self { rooms: HashMap::new() }
    }
}

pub type SharedRelayState = Arc<Mutex<RelayState>>;

// ── Room code generation ─────────────────────────────────────

fn generate_code() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let t = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().subsec_nanos();
    let consonants: Vec<char> = "BCDFGHJKLMNPQRSTVWXYZ".chars().collect();
    let alphanum: Vec<char> = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".chars().collect();
    let prefix: String = (0..3).map(|i| consonants[((t >> (i * 7)) as usize) % consonants.len()]).collect();
    let suffix: String = (0..3).map(|i| alphanum[((t >> (i * 5 + 3)) as usize) % alphanum.len()]).collect();
    format!("{}-{}", prefix, suffix)
}

fn unique_code(state: &RelayState) -> String {
    for _ in 0..20 {
        let code = generate_code();
        if !state.rooms.contains_key(&code) {
            return code;
        }
    }
    generate_code() // fallback
}

// ── Message handler ──────────────────────────────────────────

fn send(tx: &mpsc::UnboundedSender<Message>, msg: Value) {
    tx.send(Message::Text(msg.to_string().into())).ok();
}

fn handle_message(
    raw: &str,
    addr: &str,
    current_room: &mut Option<String>,
    state: &SharedRelayState,
    tx: &mpsc::UnboundedSender<Message>,
) {
    let msg: Value = match serde_json::from_str(raw) {
        Ok(v) => v,
        Err(_) => return,
    };

    let msg_type = match msg["type"].as_str() {
        Some(t) => t,
        None => return,
    };

    match msg_type {
        "create_room" => {
            let nickname = match msg["nickname"].as_str() {
                Some(n) if !n.is_empty() && n.len() <= 32 => n.to_string(),
                _ => {
                    send(tx, json!({"type":"room_error","error":"nickname must be 1–32 characters"}));
                    return;
                }
            };
            if let Some(name) = msg["name"].as_str() {
                if name.len() > 64 {
                    send(tx, json!({"type":"room_error","error":"room name must be ≤ 64 characters"}));
                    return;
                }
            }

            let mut st = state.lock().unwrap();

            // Leave current room if in one
            if let Some(code) = current_room.take() {
                leave_room_inner(addr, &code, &mut st);
            }

            let code = unique_code(&st);
            let name = msg["name"].as_str().filter(|n| !n.is_empty()).map(String::from);
            let mut room = Room::new(name.clone());
            room.members.insert(addr.to_string(), Member { nickname: nickname.clone(), tx: tx.clone() });
            let sys_msg = json!({
                "id": format!("sys-{}", uuid::Uuid::new_v4()),
                "roomCode": code,
                "type": "system",
                "nickname": nickname,
                "timestamp": chrono::Utc::now().to_rfc3339(),
                "event": "room_created",
                "detail": null
            });
            room.push_message(sys_msg);
            let members = room.members_list();
            st.rooms.insert(code.clone(), room);
            *current_room = Some(code.clone());

            drop(st); // release lock before sending

            let mut resp = json!({"type":"room_created","code":code});
            if let Some(n) = name { resp["name"] = json!(n); }
            send(tx, resp);
            send(tx, json!({"type":"room_joined","code":code,"members":members,"history":[]}));
        }

        "join_room" => {
            let code = match msg["code"].as_str() {
                Some(c) => c.to_string(),
                None => {
                    send(tx, json!({"type":"room_error","error":"missing room code"}));
                    return;
                }
            };
            let nickname = match msg["nickname"].as_str() {
                Some(n) if !n.is_empty() && n.len() <= 32 => n.to_string(),
                _ => {
                    send(tx, json!({"type":"room_error","error":"nickname must be 1–32 characters"}));
                    return;
                }
            };

            let mut st = state.lock().unwrap();

            // Check room exists and nickname isn't taken
            let room = match st.rooms.get(&code) {
                Some(r) => r,
                None => {
                    drop(st);
                    send(tx, json!({"type":"room_error","error":"room not found"}));
                    return;
                }
            };
            if room.members.values().any(|m| m.nickname == nickname) {
                drop(st);
                send(tx, json!({"type":"room_error","error":format!("Nickname \"{}\" is already taken in this room", nickname)}));
                return;
            }

            // Leave current room if different
            let old_code = current_room.take();
            if let Some(ref old) = old_code {
                if old != &code {
                    leave_room_inner(addr, old, &mut st);
                }
            }

            // Now join the new room
            let room = st.rooms.get_mut(&code).unwrap();
            room.members.insert(addr.to_string(), Member { nickname: nickname.clone(), tx: tx.clone() });
            let sys_msg = json!({
                "id": format!("sys-{}", uuid::Uuid::new_v4()),
                "roomCode": code,
                "type": "system",
                "nickname": nickname,
                "timestamp": chrono::Utc::now().to_rfc3339(),
                "event": "join",
                "detail": null
            });
            room.push_message(sys_msg.clone());
            let history: Vec<&Value> = room.messages.iter().collect();
            let members = room.members_list();
            let room_name = room.name.clone();

            let mut joined = json!({"type":"room_joined","code":code,"members":members,"history":history});
            if let Some(ref n) = room_name { joined["name"] = json!(n); }

            let presence = json!({"type":"presence","members":members});
            let sys_broadcast = json!({"type":"message","message":sys_msg});
            room.broadcast(&presence, Some(addr));
            room.broadcast(&sys_broadcast, Some(addr));

            drop(st);

            *current_room = Some(code);
            send(tx, joined);
        }

        "leave_room" => {
            if let Some(code) = current_room.take() {
                let mut st = state.lock().unwrap();
                leave_room_inner(addr, &code, &mut st);
            }
        }

        "chat" => {
            let code = match current_room.as_ref() {
                Some(c) => c.clone(),
                None => return,
            };
            let body = match msg["body"].as_str() {
                Some(b) if b.len() <= 4_000 => b.to_string(),
                Some(_) => {
                    send(tx, json!({"type":"room_error","error":"message too long (max 4000 chars)"}));
                    return;
                }
                None => return,
            };

            let mut st = state.lock().unwrap();
            let room = match st.rooms.get_mut(&code) {
                Some(r) => r,
                None => return,
            };
            let nickname = match room.members.get(addr) {
                Some(m) => m.nickname.clone(),
                None => return,
            };
            let chat_msg = json!({
                "id": uuid::Uuid::new_v4().to_string(),
                "roomCode": code,
                "type": "chat",
                "nickname": nickname,
                "timestamp": chrono::Utc::now().to_rfc3339(),
                "body": body
            });
            room.push_message(chat_msg.clone());
            room.broadcast_all(&json!({"type":"message","message":chat_msg}));
        }

        "share" => {
            let code = match current_room.as_ref() { Some(c) => c.clone(), None => return };

            let action = match msg["action"].as_str() { Some(a) => a.to_string(), None => return };
            let target = match msg["target"].as_str() {
                Some(t) if t.len() <= 256 => t.to_string(),
                _ => {
                    send(tx, json!({"type":"room_error","error":"invalid share target"}));
                    return;
                }
            };
            let detail = msg["detail"].clone();
            let diff = msg["diff"].clone();
            let pullable = msg["pullable"].as_bool().unwrap_or(false);

            let mut st = state.lock().unwrap();
            let room = match st.rooms.get_mut(&code) { Some(r) => r, None => return };
            let nickname = match room.members.get(addr) { Some(m) => m.nickname.clone(), None => return };

            let share_msg = json!({
                "id": uuid::Uuid::new_v4().to_string(),
                "roomCode": code,
                "type": "share",
                "nickname": nickname,
                "timestamp": chrono::Utc::now().to_rfc3339(),
                "action": action,
                "target": target,
                "detail": detail,
                "diff": diff,
                "pullable": pullable
            });
            room.push_message(share_msg.clone());
            room.broadcast_all(&json!({"type":"message","message":share_msg}));
        }

        "typing" => {
            let code = match current_room.as_ref() { Some(c) => c.clone(), None => return };
            let typing = msg["typing"].as_bool().unwrap_or(false);

            let st = state.lock().unwrap();
            let room = match st.rooms.get(&code) { Some(r) => r, None => return };
            let nickname = match room.members.get(addr) { Some(m) => m.nickname.clone(), None => return };
            room.broadcast(&json!({"type":"typing_update","nickname":nickname,"typing":typing}), Some(addr));
        }

        "heartbeat" => { /* keep-alive, no-op */ }
        _ => {}
    }
}

fn leave_room_inner(addr: &str, code: &str, st: &mut RelayState) {
    let room = match st.rooms.get_mut(code) { Some(r) => r, None => return };
    let nickname = match room.members.remove(addr) { Some(m) => m.nickname, None => return };
    if room.members.is_empty() {
        st.rooms.remove(code);
        return;
    }
    let sys_msg = json!({
        "id": format!("sys-{}", uuid::Uuid::new_v4()),
        "roomCode": code,
        "type": "system",
        "nickname": nickname,
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "event": "leave",
        "detail": null
    });
    room.push_message(sys_msg.clone());
    let members = room.members_list();
    room.broadcast_all(&json!({"type":"message","message":sys_msg}));
    room.broadcast_all(&json!({"type":"presence","members":members}));
}

// ── Server entry point ───────────────────────────────────────

pub struct RelayHandle {
    pub port: u16,
    abort: AbortHandle,
}

impl RelayHandle {
    pub fn stop(&self) {
        self.abort.abort();
    }
}

pub async fn start_relay(port: u16) -> Result<RelayHandle, String> {
    let addr = format!("0.0.0.0:{}", port);
    let listener = TcpListener::bind(&addr).await.map_err(|e| e.to_string())?;
    let actual_port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let state: SharedRelayState = Arc::new(Mutex::new(RelayState::new()));

    let task = tokio::spawn(async move {
        loop {
            let (stream, addr) = match listener.accept().await {
                Ok(v) => v,
                Err(_) => break,
            };
            let state = state.clone();
            tokio::spawn(handle_connection(stream, addr, state));
        }
    });

    Ok(RelayHandle { port: actual_port, abort: task.abort_handle() })
}

async fn handle_connection(
    stream: tokio::net::TcpStream,
    addr: SocketAddr,
    state: SharedRelayState,
) {
    let ws_stream = match tokio_tungstenite::accept_async(stream).await {
        Ok(ws) => ws,
        Err(_) => return,
    };
    let (mut write, mut read) = ws_stream.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();
    let addr_str = addr.to_string();
    let mut current_room: Option<String> = None;

    // Forward outgoing messages
    let write_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if write.send(msg).await.is_err() { break; }
        }
    });

    // Handle incoming
    while let Some(Ok(msg)) = read.next().await {
        match msg {
            Message::Text(text) => {
                handle_message(&text, &addr_str, &mut current_room, &state, &tx);
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    // Cleanup
    if let Some(code) = current_room.take() {
        let mut st = state.lock().unwrap();
        leave_room_inner(&addr_str, &code, &mut st);
    }
    write_task.abort();
}
