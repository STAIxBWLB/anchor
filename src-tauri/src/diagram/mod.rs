//! Diagram-mode workspace commands.
//!
//! Diagrams live at `<workspace>/diagrams/<name>.cmd.json`. Name validation
//! rejects path traversal (`..`, `/`, `\\`, NUL) and leading-dot entries, mirroring
//! the safety rules in `studio/mod.rs` and the workspace write-allow guard.
//!
//! `diagram_export_blob` remains a Phase 4 stub — it is wired here so the
//! invoke handler list stays stable across phases.

use crate::vault::{lexical_normalize, resolve_inside_vault};
use crate::vault_list::{assert_anchor_can_write, WorkspaceWriteAction};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const DIAGRAMS_DIR: &str = "diagrams";
const DIAGRAM_EXT: &str = ".cmd.json";
const TITLE_PROBE_BYTES: usize = 1024;
const MAX_NAME_LEN: usize = 160;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DiagramFile {
    pub name: String,
    pub size: u64,
    pub modified_at: i64,
    pub doc_title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotMeta {
    pub doc_id: String,
    pub snapshot_ts: String,
    pub size: u64,
}

fn diagrams_root(work_path: &str) -> Result<PathBuf, String> {
    resolve_inside_vault(work_path, DIAGRAMS_DIR)
}

fn validate_name(name: &str) -> Result<&str, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Diagram name is required".to_string());
    }
    if trimmed.len() > MAX_NAME_LEN {
        return Err(format!("Diagram name too long (max {MAX_NAME_LEN})"));
    }
    if trimmed.starts_with('.')
        || trimmed.contains("..")
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || trimmed.contains('\0')
    {
        return Err(format!("Invalid diagram name: {name}"));
    }
    Ok(trimmed)
}

fn ensure_within(parent: &Path, child: &Path) -> Result<(), String> {
    let normalized = lexical_normalize(child);
    if !normalized.starts_with(parent) {
        return Err("Diagram path escapes the diagrams folder".to_string());
    }
    Ok(())
}

fn diagram_file_path(work_path: &str, name: &str) -> Result<PathBuf, String> {
    let trimmed = validate_name(name)?;
    let root = diagrams_root(work_path)?;
    let candidate = root.join(format!("{trimmed}{DIAGRAM_EXT}"));
    ensure_within(&root, &candidate)?;
    Ok(candidate)
}

fn modified_unix_ms(meta: &fs::Metadata) -> i64 {
    let modified = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
    match modified.duration_since(UNIX_EPOCH) {
        Ok(d) => d.as_millis() as i64,
        Err(err) => -(err.duration().as_millis() as i64),
    }
}

fn extract_doc_title(file_path: &Path) -> String {
    let Ok(file) = fs::File::open(file_path) else {
        return String::new();
    };
    use std::io::Read;
    let mut probe = Vec::with_capacity(TITLE_PROBE_BYTES);
    let _ = file.take(TITLE_PROBE_BYTES as u64).read_to_end(&mut probe);
    let text = String::from_utf8_lossy(&probe);
    let Some(idx) = text.find("\"docTitle\"") else {
        return String::new();
    };
    let after = &text[idx + "\"docTitle\"".len()..];
    let Some(colon) = after.find(':') else {
        return String::new();
    };
    let Some(open) = after[colon..].find('"') else {
        return String::new();
    };
    let start = colon + open + 1;
    let rest = &after[start..];
    let Some(end) = rest.find('"') else {
        return String::new();
    };
    rest[..end].to_string()
}

#[tauri::command]
pub fn diagram_save_document(
    workspace: String,
    name: String,
    body: String,
) -> Result<(), String> {
    let path = diagram_file_path(&workspace, &name)?;
    let action = if path.is_file() {
        WorkspaceWriteAction::Modify
    } else {
        WorkspaceWriteAction::Create
    };
    assert_anchor_can_write(&workspace, action)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Cannot create diagrams folder: {err}"))?;
    }
    let payload = if body.ends_with('\n') {
        body
    } else {
        format!("{body}\n")
    };
    fs::write(&path, payload).map_err(|err| format!("Cannot write diagram: {err}"))?;
    Ok(())
}

#[tauri::command]
pub fn diagram_load_document(workspace: String, name: String) -> Result<String, String> {
    let path = diagram_file_path(&workspace, &name)?;
    if !path.is_file() {
        return Err(format!("Diagram not found: {name}"));
    }
    fs::read_to_string(&path).map_err(|err| format!("Cannot read diagram: {err}"))
}

#[tauri::command]
pub fn diagram_list_documents(workspace: String) -> Result<Vec<DiagramFile>, String> {
    let root = diagrams_root(&workspace)?;
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut out: Vec<DiagramFile> = Vec::new();
    let read = fs::read_dir(&root).map_err(|err| format!("Cannot read diagrams: {err}"))?;
    for entry in read {
        let Ok(entry) = entry else { continue };
        let path = entry.path();
        let Some(file_name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if !file_name.ends_with(DIAGRAM_EXT) {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        if !meta.is_file() {
            continue;
        }
        let name = file_name
            .strip_suffix(DIAGRAM_EXT)
            .unwrap_or(file_name)
            .to_string();
        let doc_title = extract_doc_title(&path);
        out.push(DiagramFile {
            name,
            size: meta.len(),
            modified_at: modified_unix_ms(&meta),
            doc_title,
        });
    }
    out.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    Ok(out)
}

#[tauri::command]
pub fn diagram_delete_document(workspace: String, name: String) -> Result<bool, String> {
    let path = diagram_file_path(&workspace, &name)?;
    if !path.is_file() {
        return Ok(false);
    }
    assert_anchor_can_write(&workspace, WorkspaceWriteAction::Delete)?;
    fs::remove_file(&path).map_err(|err| format!("Cannot delete diagram: {err}"))?;
    Ok(true)
}

#[tauri::command]
pub fn diagram_export_blob(
    _workspace: String,
    _name: String,
    _kind: String,
    _bytes: Vec<u8>,
) -> Result<String, String> {
    Err("diagram_export_blob is implemented in Phase 4".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread::sleep;
    use std::time::Duration;
    use tempfile::TempDir;

    fn setup_workspace() -> (TempDir, String) {
        let tmp = TempDir::new().expect("tempdir");
        let work = tmp.path().to_string_lossy().to_string();
        // create .anchor folder so resolve_inside_vault treats it as a workspace
        fs::create_dir_all(tmp.path().join(".anchor")).expect("anchor dir");
        (tmp, work)
    }

    #[test]
    fn validate_name_rejects_traversal() {
        assert!(validate_name("../bad").is_err());
        assert!(validate_name("..").is_err());
        assert!(validate_name("a/b").is_err());
        assert!(validate_name("a\\b").is_err());
        assert!(validate_name(".hidden").is_err());
        assert!(validate_name("").is_err());
        assert!(validate_name("with\0nul").is_err());
        assert!(validate_name("My Diagram 1").is_ok());
        assert!(validate_name("주가지표").is_ok());
    }

    #[test]
    fn save_load_round_trips() {
        let (_tmp, work) = setup_workspace();
        let body = r#"{"v":7,"docTitle":"hello","nodes":[],"edges":[],"layers":[]}"#;
        diagram_save_document(work.clone(), "demo".into(), body.into()).unwrap();
        let loaded = diagram_load_document(work, "demo".into()).unwrap();
        assert!(loaded.contains("\"v\":7"));
        assert!(loaded.contains("hello"));
    }

    #[test]
    fn list_sorts_by_mtime_descending() {
        let (_tmp, work) = setup_workspace();
        let body = r#"{"v":7,"docTitle":"a","nodes":[],"edges":[],"layers":[]}"#;
        diagram_save_document(work.clone(), "first".into(), body.into()).unwrap();
        sleep(Duration::from_millis(15));
        let body2 = r#"{"v":7,"docTitle":"b","nodes":[],"edges":[],"layers":[]}"#;
        diagram_save_document(work.clone(), "second".into(), body2.into()).unwrap();
        let listed = diagram_list_documents(work).unwrap();
        assert_eq!(listed.len(), 2);
        assert_eq!(listed[0].name, "second");
        assert_eq!(listed[0].doc_title, "b");
        assert_eq!(listed[1].name, "first");
        assert_eq!(listed[1].doc_title, "a");
    }

    #[test]
    fn delete_returns_false_when_missing() {
        let (_tmp, work) = setup_workspace();
        assert_eq!(diagram_delete_document(work, "ghost".into()).unwrap(), false);
    }

    #[test]
    fn delete_removes_existing() {
        let (_tmp, work) = setup_workspace();
        let body = r#"{"v":7,"docTitle":"x","nodes":[],"edges":[],"layers":[]}"#;
        diagram_save_document(work.clone(), "x".into(), body.into()).unwrap();
        assert!(diagram_delete_document(work.clone(), "x".into()).unwrap());
        let listed = diagram_list_documents(work).unwrap();
        assert!(listed.is_empty());
    }

    #[test]
    fn save_rejects_bad_name() {
        let (_tmp, work) = setup_workspace();
        assert!(diagram_save_document(work, "../escape".into(), "{}".into()).is_err());
    }

    #[test]
    fn list_skips_non_cmd_files() {
        let (_tmp, work) = setup_workspace();
        let body = r#"{"v":7,"docTitle":"keep","nodes":[],"edges":[],"layers":[]}"#;
        diagram_save_document(work.clone(), "keep".into(), body.into()).unwrap();
        // stray file in diagrams/
        let path = PathBuf::from(&work).join(DIAGRAMS_DIR).join("stray.txt");
        fs::write(&path, "noise").unwrap();
        let listed = diagram_list_documents(work).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].name, "keep");
    }

    #[test]
    fn export_blob_is_phase_4_stub() {
        let err = diagram_export_blob("w".into(), "n".into(), "png".into(), vec![]).unwrap_err();
        assert!(err.contains("Phase 4"));
    }
}
