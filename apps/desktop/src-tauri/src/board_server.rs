use std::net::TcpListener;

const PORT: u16 = 4800;

pub struct BoardServerState;

impl BoardServerState {
    pub fn new() -> Self {
        Self
    }

    /// Returns true if the board server appears to be running.
    pub fn check(&self) -> bool {
        port_in_use(PORT)
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
