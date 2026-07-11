use std::fs;
use std::io::Write;
use std::path::Path;

/// Write a same-filesystem temporary file, flush it, then atomically replace
/// the destination. `tempfile::persist` uses replace semantics on Windows,
/// where `std::fs::rename` cannot overwrite an existing file.
pub(crate) fn write_atomic(path: &Path, content: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("Cannot determine parent directory for {}", path.display()))?;
    fs::create_dir_all(parent)
        .map_err(|err| format!("Cannot create {}: {err}", parent.display()))?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("file");
    let mut temp = tempfile::Builder::new()
        .prefix(&format!(".{file_name}.maru-tmp-"))
        .tempfile_in(parent)
        .map_err(|err| format!("Cannot create temporary file: {err}"))?;
    temp.write_all(content)
        .map_err(|err| format!("Cannot write temporary file: {err}"))?;
    temp.as_file()
        .sync_all()
        .map_err(|err| format!("Cannot sync temporary file: {err}"))?;
    temp.persist(path).map(|_| ()).map_err(|err| {
        format!(
            "Cannot atomically replace {}: {}",
            path.display(),
            err.error
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn replaces_existing_file_without_leaving_a_temp_file() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("note.md");
        fs::write(&path, "old").unwrap();

        write_atomic(&path, b"new").unwrap();

        assert_eq!(fs::read_to_string(&path).unwrap(), "new");
        assert_eq!(fs::read_dir(tmp.path()).unwrap().count(), 1);
    }
}
