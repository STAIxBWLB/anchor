fn main() {
    // include_dir!("skills-bootstrap") output is not invalidated by cargo on
    // its own; without this, release builds can embed a stale bootstrap
    // snapshot. Deliberately NOT watching ../skills: live skill edits ship as
    // signed skills-channel bundles and must not trigger Cargo rebuilds.
    println!("cargo:rerun-if-changed=skills-bootstrap");
    tauri_build::build()
}
