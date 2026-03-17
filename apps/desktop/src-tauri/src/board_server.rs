use std::net::TcpListener;
use std::process::{Child, Command};
use std::sync::Mutex;

const BOARD_SERVER_DIR: &str = env!("BOARD_SERVER_DIR");
const PORT: u16 = 4800;

pub struct BoardServerState {
    child: Mutex<Option<Child>>,
}

impl BoardServerState {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
        }
    }

    pub fn start(&self) {
        if port_in_use(PORT) {
            eprintln!("[board-server] port {} already in use — skipping spawn", PORT);
            return;
        }

        let dist = std::path::Path::new(BOARD_SERVER_DIR)
            .join("dist")
            .join("index.js");

        if !dist.exists() {
            eprintln!(
                "[board-server] dist/index.js not found at {:?} — skipping spawn",
                dist
            );
            return;
        }

        match Command::new("node")
            .arg(&dist)
            .current_dir(BOARD_SERVER_DIR)
            .spawn()
        {
            Ok(child) => {
                eprintln!("[board-server] spawned (pid {})", child.id());
                *self.child.lock().unwrap() = Some(child);
            }
            Err(e) => {
                eprintln!("[board-server] failed to spawn node: {}", e);
            }
        }
    }

    pub fn stop(&self) {
        if let Some(mut child) = self.child.lock().unwrap().take() {
            let _ = child.kill();
            let _ = child.wait();
            eprintln!("[board-server] stopped");
        }
    }
}

fn port_in_use(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_err()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    #[test]
    fn port_in_use_returns_false_for_free_port() {
        // Bind to 0 to get an ephemeral port, then drop to free it
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        assert!(!port_in_use(port));
    }

    #[test]
    fn port_in_use_returns_true_for_occupied_port() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        // listener still bound — port is occupied
        assert!(port_in_use(port));
    }
}
