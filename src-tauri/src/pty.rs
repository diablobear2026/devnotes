use portable_pty::{native_pty_system, CommandBuilder, MasterPty, Child, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::ipc::Channel;
use tauri::State;
use uuid::Uuid;

pub struct PtySession {
    pub master: Box<dyn MasterPty + Send>,
    pub writer: Box<dyn Write + Send>,
    pub reader: Box<dyn Read + Send>,
    pub child: Box<dyn Child + Send + Sync>,
}

pub fn spawn_session(cwd: &str) -> Result<PtySession, String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let mut cmd = CommandBuilder::new(shell);
    cmd.cwd(cwd);

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

    Ok(PtySession { master: pair.master, writer, reader, child })
}

struct PtyHandle {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
pub struct PtyState {
    sessions: Mutex<HashMap<String, PtyHandle>>,
}

impl PtyState {
    pub fn spawn(
        &self,
        cwd: &str,
        mut on_data: impl FnMut(String) + Send + 'static,
    ) -> Result<String, String> {
        let session = spawn_session(cwd)?;
        let PtySession { master, writer, mut reader, child } = session;

        let session_id = Uuid::new_v4().to_string();

        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => on_data(String::from_utf8_lossy(&buf[..n]).into_owned()),
                    Err(_) => break,
                }
            }
        });

        self.sessions
            .lock()
            .map_err(|e| e.to_string())?
            .insert(session_id.clone(), PtyHandle { master, writer, child });

        Ok(session_id)
    }

    pub fn write(&self, session_id: &str, data: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        if let Some(handle) = sessions.get_mut(session_id) {
            handle.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        if let Some(handle) = sessions.get(session_id) {
            handle
                .master
                .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn kill(&self, session_id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        if let Some(mut handle) = sessions.remove(session_id) {
            handle.child.kill().map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn kill_all(&self) {
        if let Ok(mut sessions) = self.sessions.lock() {
            for (_, mut handle) in sessions.drain() {
                let _ = handle.child.kill();
            }
        }
    }
}

#[tauri::command]
pub fn pty_spawn(state: State<PtyState>, cwd: String, on_data: Channel<String>) -> Result<String, String> {
    state.spawn(&cwd, move |chunk| {
        let _ = on_data.send(chunk);
    })
}

#[tauri::command]
pub fn pty_write(state: State<PtyState>, session_id: String, data: String) -> Result<(), String> {
    state.write(&session_id, &data)
}

#[tauri::command]
pub fn pty_resize(state: State<PtyState>, session_id: String, cols: u16, rows: u16) -> Result<(), String> {
    state.resize(&session_id, cols, rows)
}

#[tauri::command]
pub fn pty_kill(state: State<PtyState>, session_id: String) -> Result<(), String> {
    state.kill(&session_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[test]
    fn spawns_a_shell_and_echoes_input() {
        let cwd = std::env::temp_dir();
        let mut session = spawn_session(cwd.to_str().unwrap()).expect("failed to spawn pty session");

        session.writer.write_all(b"echo hello-pty-test\n").expect("write failed");

        let (tx, rx) = std::sync::mpsc::channel::<String>();
        let mut reader = session.reader;
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let chunk = String::from_utf8_lossy(&buf[..n]).into_owned();
                        if tx.send(chunk).is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
        });

        let mut collected = String::new();
        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            match rx.recv_timeout(Duration::from_millis(200)) {
                Ok(chunk) => {
                    collected.push_str(&chunk);
                    if collected.contains("hello-pty-test") {
                        break;
                    }
                }
                Err(_) => continue,
            }
        }

        assert!(
            collected.contains("hello-pty-test"),
            "pty output did not contain expected echo, got: {collected}"
        );
        let _ = session.child.kill();
    }
}

#[cfg(test)]
mod state_tests {
    use super::*;
    use std::sync::{Arc, Mutex as StdMutex};
    use std::time::{Duration, Instant};

    #[test]
    fn spawn_write_and_receive_output() {
        let state = PtyState::default();
        let received: Arc<StdMutex<String>> = Arc::new(StdMutex::new(String::new()));
        let received_clone = received.clone();

        let cwd = std::env::temp_dir();
        let session_id = state
            .spawn(cwd.to_str().unwrap(), move |chunk| {
                received_clone.lock().unwrap().push_str(&chunk);
            })
            .expect("spawn failed");

        state.write(&session_id, "echo hello-handle-test\n").expect("write failed");

        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            if received.lock().unwrap().contains("hello-handle-test") {
                break;
            }
            if Instant::now() > deadline {
                break;
            }
            std::thread::sleep(Duration::from_millis(100));
        }

        assert!(received.lock().unwrap().contains("hello-handle-test"));
        state.kill(&session_id).expect("kill failed");
    }

    #[test]
    fn kill_all_removes_every_session() {
        let state = PtyState::default();
        let cwd = std::env::temp_dir();
        state.spawn(cwd.to_str().unwrap(), |_| {}).unwrap();
        state.spawn(cwd.to_str().unwrap(), |_| {}).unwrap();
        assert_eq!(state.sessions.lock().unwrap().len(), 2);

        state.kill_all();
        assert_eq!(state.sessions.lock().unwrap().len(), 0);
    }
}
