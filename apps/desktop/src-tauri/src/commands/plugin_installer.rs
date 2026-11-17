//! Allowlisted bridge that lets the webview run a plugin installer CLI.
//!
//! The webview has no general process-spawn or shell capability (the default
//! capability grants none). These two commands are the only way it reaches an
//! installer, and each enforces its own limits natively:
//!
//! - `run_plugin_installer` runs `claude`, `copilot` or `codex` only, and only
//!   when the argument vector matches one of a few exact shapes
//!   (`validate_invocation`). It spawns with an argument vector and no shell,
//!   stdin closed, `NO_COLOR=1`, a 180 second timeout and the last 64 KiB of
//!   each output stream. A working directory must be a project root the user
//!   granted in the native folder dialog.
//! - `which_plugin_installer` answers only for those three names, by PATH
//!   lookup, and never runs the binary.
//!
//! The result serializes to core's `ProcessResult` union
//! (`packages/core/src/process-runner.ts`). A refusal is an ordinary
//! `spawn-failed` answer whose reason starts with `refused:`.

use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tokio::io::{AsyncRead, AsyncReadExt};
use tokio::process::Command;

use super::fs_scope::granted_root_for;

const ALLOWED_BINARIES: [&str; 3] = ["claude", "copilot", "codex"];
const RUN_TIMEOUT: Duration = Duration::from_secs(180);
const OUTPUT_CAP: usize = 64 * 1024;
/// How long to wait for a pipe to close after the child exited or was killed.
/// A grandchild that inherited the pipe would otherwise hold the reader open.
const DRAIN_GRACE: Duration = Duration::from_secs(2);

/// Serializes to core's `ProcessResult`.
#[derive(Debug, Serialize, PartialEq)]
#[serde(tag = "status", rename_all = "kebab-case", rename_all_fields = "camelCase")]
pub enum RunResult {
    Ok { exit_code: i32, stdout: String, stderr: String },
    SpawnFailed { reason: String },
    TimedOut { stdout: String, stderr: String, timeout_ms: u64 },
}

fn valid_part(part: &str) -> bool {
    let mut chars = part.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_alphanumeric())
        && chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

/// `name@marketplace`, each part matching `^[A-Za-z0-9][A-Za-z0-9._-]*$`.
fn check_plugin_id(id: &str) -> Result<(), String> {
    let parts: Vec<&str> = id.split('@').collect();
    if parts.len() == 2 && parts.iter().all(|p| valid_part(p)) {
        Ok(())
    } else {
        Err(format!("plugin id {id:?} is not name@marketplace"))
    }
}

/// `owner/repo`, each part matching the same pattern.
fn check_repo(source: &str) -> Result<(), String> {
    let parts: Vec<&str> = source.split('/').collect();
    if parts.len() == 2 && parts.iter().all(|p| valid_part(p)) {
        Ok(())
    } else {
        Err(format!("marketplace source {source:?} is not owner/repo"))
    }
}

/// `<id>` followed by nothing, or by one optional `flag`
/// (an empty `values` list means the flag takes none).
fn check_id_and_flag(rest: &[&str], flag: &str, values: &[&str]) -> Result<(), String> {
    let Some((id, tail)) = rest.split_first() else {
        return Err("missing plugin id".into());
    };
    check_plugin_id(id)?;
    match (tail, values.is_empty()) {
        ([], _) => Ok(()),
        ([f], true) if *f == flag => Ok(()),
        ([f, v], false) if *f == flag => {
            if values.contains(v) {
                Ok(())
            } else {
                Err(format!("{flag} value {v:?} is not one of {}", values.join("|")))
            }
        }
        (extra, _) => Err(format!("unexpected argument {:?}", extra[0])),
    }
}

/// Accept exactly the argument vectors the installers need and refuse the
/// rest. The returned message names the rejected part; the caller prefixes it
/// with `refused: `.
fn validate_invocation(command: &str, args: &[String]) -> Result<(), String> {
    let a: Vec<&str> = args.iter().map(String::as_str).collect();
    match command {
        "claude" => match a.as_slice() {
            ["plugin", "install" | "uninstall", rest @ ..] => {
                check_id_and_flag(rest, "--scope", &["user", "project", "local"])
            }
            ["plugin", "marketplace", "add", rest @ ..] => match rest {
                [] => Err("missing marketplace source".into()),
                [source] => check_repo(source),
                [_, extra, ..] => Err(format!("unexpected argument {extra:?}")),
            },
            ["plugin", verb, ..] => Err(format!("claude plugin {verb:?} is not allowed")),
            _ => Err("claude is only allowed to run `plugin ...`".into()),
        },
        "copilot" => match a.as_slice() {
            ["plugin", "install" | "uninstall", rest @ ..] => check_id_and_flag(rest, "", &[]),
            ["plugin", verb, ..] => Err(format!("copilot plugin {verb:?} is not allowed")),
            _ => Err("copilot is only allowed to run `plugin ...`".into()),
        },
        "codex" => match a.as_slice() {
            ["plugin", "add" | "remove", rest @ ..] => check_id_and_flag(rest, "--json", &[]),
            ["plugin", verb, ..] => Err(format!("codex plugin {verb:?} is not allowed")),
            _ => Err("codex is only allowed to run `plugin ...`".into()),
        },
        other => Err(format!("binary {other:?} is not an allowed installer")),
    }
}

fn is_executable_file(path: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        path.metadata().is_ok_and(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
    }
    #[cfg(not(unix))]
    {
        path.is_file()
    }
}

/// First executable file named `binary` on the `path_env` entries.
fn find_in_path(binary: &str, path_env: &OsStr) -> Option<PathBuf> {
    std::env::split_paths(path_env)
        .filter(|dir| !dir.as_os_str().is_empty())
        .map(|dir| dir.join(binary))
        .find(|candidate| is_executable_file(candidate))
}

/// Keep reading `stream` into `buf`, retaining only the last `OUTPUT_CAP` bytes.
async fn pump<R: AsyncRead + Unpin>(mut stream: R, buf: Arc<Mutex<Vec<u8>>>) {
    let mut chunk = [0u8; 8192];
    loop {
        match stream.read(&mut chunk).await {
            Ok(0) | Err(_) => break,
            Ok(n) => {
                let Ok(mut b) = buf.lock() else { break };
                b.extend_from_slice(&chunk[..n]);
                if b.len() > OUTPUT_CAP {
                    let excess = b.len() - OUTPUT_CAP;
                    b.drain(..excess);
                }
            }
        }
    }
}

fn text(buf: &Arc<Mutex<Vec<u8>>>) -> String {
    buf.lock().map(|b| String::from_utf8_lossy(&b).into_owned()).unwrap_or_default()
}

fn spawn_failed(reason: impl Into<String>) -> RunResult {
    RunResult::SpawnFailed { reason: reason.into() }
}

/// Run an already validated invocation. `path_env` is the PATH to resolve the
/// binary on, passed in so tests need not mutate the process environment.
async fn run_with(
    path_env: &OsStr,
    command: &str,
    args: &[String],
    cwd: Option<&Path>,
    timeout: Duration,
) -> RunResult {
    let Some(binary) = find_in_path(command, path_env) else {
        return spawn_failed(format!("{command} was not found on PATH"));
    };
    let mut cmd = Command::new(&binary);
    cmd.args(args)
        .env("NO_COLOR", "1")
        .env("PATH", path_env)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => return spawn_failed(format!("could not start {command}: {e}")),
    };
    let out = Arc::new(Mutex::new(Vec::new()));
    let err = Arc::new(Mutex::new(Vec::new()));
    let mut readers = Vec::new();
    if let Some(s) = child.stdout.take() {
        readers.push(tokio::spawn(pump(s, out.clone())));
    }
    if let Some(s) = child.stderr.take() {
        readers.push(tokio::spawn(pump(s, err.clone())));
    }
    let waited = tokio::time::timeout(timeout, child.wait()).await;
    let timed_out = waited.is_err();
    if timed_out {
        let _ = child.kill().await;
    }
    for reader in readers {
        let abort = reader.abort_handle();
        if tokio::time::timeout(DRAIN_GRACE, reader).await.is_err() {
            abort.abort();
        }
    }
    match waited {
        Err(_) => RunResult::TimedOut {
            stdout: text(&out),
            stderr: text(&err),
            timeout_ms: timeout.as_millis() as u64,
        },
        Ok(Err(e)) => spawn_failed(format!("could not wait for {command}: {e}")),
        Ok(Ok(status)) => RunResult::Ok {
            exit_code: status.code().unwrap_or(-1),
            stdout: text(&out),
            stderr: text(&err),
        },
    }
}

/// A requested working directory must be a project root the user granted (or
/// inside one). Returns the canonical path to run in.
fn check_cwd(cwd: &str) -> Result<PathBuf, String> {
    let canonical = Path::new(cwd)
        .canonicalize()
        .map_err(|_| format!("working directory {cwd:?} does not exist"))?;
    if !canonical.is_dir() || granted_root_for(&canonical).is_none() {
        return Err(format!("working directory {cwd:?} is not a granted project root"));
    }
    Ok(canonical)
}

#[tauri::command]
pub async fn run_plugin_installer(
    command: String,
    args: Vec<String>,
    cwd: Option<String>,
) -> Result<RunResult, String> {
    if let Err(why) = validate_invocation(&command, &args) {
        return Ok(spawn_failed(format!("refused: {why}")));
    }
    let dir = match cwd.as_deref().map(check_cwd).transpose() {
        Ok(d) => d,
        Err(why) => return Ok(spawn_failed(format!("refused: {why}"))),
    };
    let path_env = std::env::var_os("PATH").unwrap_or_default();
    Ok(run_with(&path_env, &command, &args, dir.as_deref(), RUN_TIMEOUT).await)
}

#[tauri::command]
pub fn which_plugin_installer(binary: String) -> Option<String> {
    if !ALLOWED_BINARIES.contains(&binary.as_str()) {
        return None;
    }
    let path_env = std::env::var_os("PATH")?;
    find_in_path(&binary, &path_env).map(|p| p.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(args: &[&str]) -> Vec<String> {
        args.iter().map(|s| s.to_string()).collect()
    }

    fn ok(command: &str, args: &[&str]) {
        assert_eq!(validate_invocation(command, &v(args)), Ok(()), "{command} {args:?}");
    }

    fn refused(command: &str, args: &[&str], names: &str) {
        let err = validate_invocation(command, &v(args))
            .expect_err(&format!("{command} {args:?} should be refused"));
        assert!(err.contains(names), "{err:?} should name {names:?}");
    }

    #[test]
    fn allowed_shapes_pass() {
        ok("claude", &["plugin", "install", "explain@harness-kit"]);
        for scope in ["user", "project", "local"] {
            ok("claude", &["plugin", "install", "explain@harness-kit", "--scope", scope]);
            ok("claude", &["plugin", "uninstall", "a.b_c@m-1", "--scope", scope]);
        }
        ok("claude", &["plugin", "uninstall", "explain@harness-kit"]);
        ok("claude", &["plugin", "marketplace", "add", "harnessprotocol/harness-kit"]);
        ok("copilot", &["plugin", "install", "explain@harness-kit"]);
        ok("copilot", &["plugin", "uninstall", "explain@harness-kit"]);
        ok("codex", &["plugin", "add", "explain@harness-kit"]);
        ok("codex", &["plugin", "add", "explain@harness-kit", "--json"]);
        ok("codex", &["plugin", "remove", "explain@harness-kit"]);
        ok("codex", &["plugin", "remove", "explain@harness-kit", "--json"]);
    }

    #[test]
    fn unknown_binary_is_refused() {
        refused("sh", &["plugin", "install", "a@b"], "sh");
        refused("/bin/claude", &["plugin", "install", "a@b"], "/bin/claude");
    }

    #[test]
    fn unknown_verb_is_refused() {
        refused("claude", &["plugin", "enable", "a@b"], "enable");
        refused("copilot", &["plugin", "add", "a@b"], "add");
        refused("codex", &["plugin", "install", "a@b"], "install");
        refused("claude", &["run", "x"], "plugin");
        refused("claude", &[], "plugin");
    }

    #[test]
    fn dangerous_flags_are_refused() {
        refused("claude", &["plugin", "install", "a@b", "-y"], "-y");
        refused("claude", &["plugin", "install", "a@b", "--config", "x=y"], "--config");
        refused("claude", &["plugin", "install", "a@b", "--marketplace", "a/b"], "--marketplace");
        refused("claude", &["plugin", "install", "a@b", "--scope", "global"], "global");
        refused("claude", &["plugin", "install", "a@b", "--yes"], "--yes");
        refused("claude", &["plugin", "install", "a@b", "--accept-command"], "--accept-command");
        refused("copilot", &["plugin", "install", "a@b", "--json"], "--json");
        refused("codex", &["plugin", "add", "a@b", "-y"], "-y");
    }

    #[test]
    fn bad_ids_are_refused() {
        for id in ["-x@y", "a@b@c", "a/b@c", "a@..", "a b@c", "a\0b@c", "ab", "@b", "a@", ""] {
            let args = ["plugin", "install", id];
            let err = validate_invocation("claude", &v(&args)).expect_err(id);
            assert!(err.contains(&format!("{id:?}")), "{err:?} should name {id:?}");
        }
    }

    #[test]
    fn missing_id_and_extra_args_are_refused() {
        refused("claude", &["plugin", "install"], "missing");
        refused("claude", &["plugin", "install", "a@b", "--scope", "user", "x"], "x");
        refused("claude", &["plugin", "install", "a@b", "extra"], "extra");
        refused("claude", &["plugin", "install", "a@b", "--scope"], "--scope");
        refused("copilot", &["plugin", "install", "a@b", "extra"], "extra");
        refused("codex", &["plugin", "add", "a@b", "--json", "x"], "--json");
        refused("claude", &["plugin", "marketplace", "add", "a/b", "extra"], "extra");
        refused("claude", &["plugin", "marketplace", "add"], "missing");
    }

    #[test]
    fn bad_marketplace_sources_are_refused() {
        for source in ["a/b/c", "../x", "-a/b", "ab", "a/", "/b", "a/-b", "a b/c"] {
            let err = validate_invocation("claude", &v(&["plugin", "marketplace", "add", source]))
                .expect_err(source);
            assert!(err.contains(&format!("{source:?}")), "{err:?} should name {source:?}");
        }
    }

    #[test]
    fn which_refuses_names_off_the_allowlist() {
        assert_eq!(which_plugin_installer("sh".into()), None);
        assert_eq!(which_plugin_installer("/bin/sh".into()), None);
        assert_eq!(which_plugin_installer("".into()), None);
    }

    #[cfg(unix)]
    mod run {
        use super::super::*;
        use std::ffi::OsString;
        use std::os::unix::fs::PermissionsExt;

        /// A temp dir holding a fake `claude` script; returns it with a PATH
        /// that puts it first.
        fn fake_claude(body: &str) -> (tempfile::TempDir, OsString) {
            let dir = tempfile::tempdir().unwrap();
            let bin = dir.path().join("claude");
            std::fs::write(&bin, format!("#!/bin/sh\n{body}\n")).unwrap();
            std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755)).unwrap();
            let path = std::env::join_paths([dir.path(), Path::new("/usr/bin"), Path::new("/bin")]).unwrap();
            (dir, path)
        }

        fn args() -> Vec<String> {
            ["plugin", "install", "a@b"].iter().map(|s| s.to_string()).collect()
        }

        const LONG: Duration = Duration::from_secs(30);

        #[tokio::test]
        async fn passes_exit_code_and_output_through() {
            let (_d, path) = fake_claude("echo out; echo err >&2; exit 3");
            let got = run_with(&path, "claude", &args(), None, LONG).await;
            assert_eq!(got, RunResult::Ok { exit_code: 3, stdout: "out\n".into(), stderr: "err\n".into() });
        }

        #[tokio::test]
        async fn sets_no_color_closes_stdin_and_passes_args() {
            let (_d, path) = fake_claude("echo \"$NO_COLOR $*\"; cat | wc -c");
            let got = run_with(&path, "claude", &args(), None, LONG).await;
            let RunResult::Ok { exit_code: 0, stdout, .. } = got else { panic!("{got:?}") };
            assert_eq!(stdout.lines().next(), Some("1 plugin install a@b"));
            assert_eq!(stdout.lines().nth(1).map(str::trim), Some("0"));
        }

        #[tokio::test]
        async fn keeps_the_last_64_kib_of_each_stream() {
            let (_d, path) = fake_claude(
                "head -c 40960 /dev/zero | tr '\\0' a; head -c 65536 /dev/zero | tr '\\0' b; \
                 head -c 102400 /dev/zero | tr '\\0' c >&2",
            );
            let got = run_with(&path, "claude", &args(), None, LONG).await;
            let RunResult::Ok { stdout, stderr, .. } = got else { panic!("{got:?}") };
            assert_eq!(stdout.len(), OUTPUT_CAP);
            assert!(stdout.bytes().all(|b| b == b'b'));
            assert_eq!(stderr.len(), OUTPUT_CAP);
        }

        #[tokio::test]
        async fn kills_on_timeout_and_returns_output_so_far() {
            let (_d, path) = fake_claude("echo started; exec sleep 30");
            let got = run_with(&path, "claude", &args(), None, Duration::from_millis(500)).await;
            let RunResult::TimedOut { stdout, timeout_ms, .. } = got else { panic!("{got:?}") };
            assert_eq!(stdout, "started\n");
            assert_eq!(timeout_ms, 500);
        }

        #[tokio::test]
        async fn missing_binary_is_spawn_failed() {
            let dir = tempfile::tempdir().unwrap();
            let got = run_with(dir.path().as_os_str(), "claude", &args(), None, LONG).await;
            assert!(matches!(got, RunResult::SpawnFailed { .. }), "{got:?}");
        }

        #[tokio::test]
        async fn command_refuses_an_invalid_invocation_without_spawning() {
            let got = run_plugin_installer("sh".into(), vec!["-c".into(), "true".into()], None).await;
            let Ok(RunResult::SpawnFailed { reason }) = got else { panic!("{got:?}") };
            assert!(reason.starts_with("refused:") && reason.contains("\"sh\""), "{reason}");
        }

        #[tokio::test]
        async fn command_refuses_an_ungranted_cwd() {
            let dir = tempfile::tempdir().unwrap();
            let cwd = dir.path().to_string_lossy().into_owned();
            let got = run_plugin_installer("claude".into(), args(), Some(cwd)).await;
            let Ok(RunResult::SpawnFailed { reason }) = got else { panic!("{got:?}") };
            assert!(reason.starts_with("refused:") && reason.contains("granted"), "{reason}");
        }

        #[test]
        fn granted_cwd_is_accepted_and_runs_there() {
            let dir = tempfile::tempdir().unwrap();
            let canonical = dir.path().canonicalize().unwrap();
            crate::commands::fs_scope::remember_granted_root(canonical.clone());
            let checked = check_cwd(&dir.path().to_string_lossy()).unwrap();
            assert_eq!(checked, canonical);
            let (_d, path) = fake_claude("pwd");
            let rt = tokio::runtime::Runtime::new().unwrap();
            let got = rt.block_on(run_with(&path, "claude", &args(), Some(&checked), LONG));
            let RunResult::Ok { stdout, .. } = got else { panic!("{got:?}") };
            assert_eq!(stdout.trim(), canonical.to_string_lossy());
        }

        #[test]
        fn result_serializes_to_core_process_result() {
            let ok = serde_json::to_value(RunResult::Ok { exit_code: 0, stdout: "o".into(), stderr: "e".into() }).unwrap();
            assert_eq!(ok, serde_json::json!({"status":"ok","exitCode":0,"stdout":"o","stderr":"e"}));
            let sf = serde_json::to_value(spawn_failed("x")).unwrap();
            assert_eq!(sf, serde_json::json!({"status":"spawn-failed","reason":"x"}));
            let to = serde_json::to_value(RunResult::TimedOut { stdout: "o".into(), stderr: "e".into(), timeout_ms: 5 }).unwrap();
            assert_eq!(to, serde_json::json!({"status":"timed-out","stdout":"o","stderr":"e","timeoutMs":5}));
        }
    }
}
