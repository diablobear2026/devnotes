use portable_pty::{native_pty_system, CommandBuilder, MasterPty, Child, PtySize};
use std::io::{Read, Write};

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
