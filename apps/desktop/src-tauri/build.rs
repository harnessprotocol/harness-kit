fn main() {
    // Derive repo root: CARGO_MANIFEST_DIR = apps/desktop/src-tauri
    // 3 parents up reaches the repo root
    let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest_dir
        .parent().unwrap() // apps/desktop
        .parent().unwrap() // apps
        .parent().unwrap(); // repo root
    let board_server_dir = repo_root.join("packages").join("board-server");

    println!("cargo:rustc-env=BOARD_SERVER_DIR={}", board_server_dir.display());
    println!("cargo:rerun-if-changed=build.rs");

    tauri_build::build()
}
