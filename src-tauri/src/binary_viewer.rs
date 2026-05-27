use crate::kordoc_lite::{
    detect_document_format_path, extract_hwpx_text_html, DocumentFormat, HwpxPreview,
};
use crate::vault::resolve_inside_vault;
use encoding_rs::EUC_KR;
use serde::{Deserialize, Serialize};
use std::ffi::OsStr;
use std::fs;
use std::io::Read;
use std::path::Path;
use std::process::Command;
use zip::ZipArchive;

const DEFAULT_TEXT_LIMIT_BYTES: u64 = 2 * 1024 * 1024; // 2 MiB
const ARCHIVE_ENTRY_LIMIT: usize = 5000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ViewerCategory {
    Image,
    Svg,
    Pdf,
    Docx,
    Xlsx,
    Hwpx,
    Audio,
    Video,
    Text,
    Archive,
    Unsupported,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewerClassification {
    pub category: ViewerCategory,
    pub mime: Option<String>,
    pub extension: Option<String>,
    pub size_bytes: u64,
    pub detected_format: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextPreview {
    pub content: String,
    pub truncated: bool,
    pub encoding: String,
    pub byte_count: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveEntry {
    pub name: String,
    pub size: u64,
    pub compressed_size: u64,
    pub is_dir: bool,
}

#[tauri::command]
pub fn binary_viewer_classify(
    vault_path: String,
    target_path: String,
) -> Result<ViewerClassification, String> {
    let target = resolve_inside_vault(&vault_path, &target_path)?;
    require_existing_file(&target)?;
    let metadata = fs::metadata(&target).map_err(|err| format!("Cannot stat target: {err}"))?;
    let extension = target
        .extension()
        .and_then(OsStr::to_str)
        .map(str::to_ascii_lowercase);
    let mime = mime_guess::from_path(&target)
        .first()
        .map(|m| m.essence_str().to_string());
    let detected_format = match detect_document_format_path(&target) {
        Ok(format) => format_label(format).to_string(),
        Err(_) => "unknown".to_string(),
    };
    let category = classify(extension.as_deref(), &detected_format);
    Ok(ViewerClassification {
        category,
        mime,
        extension,
        size_bytes: metadata.len(),
        detected_format,
    })
}

#[tauri::command]
pub fn binary_viewer_read_text(
    vault_path: String,
    target_path: String,
    max_bytes: Option<u64>,
) -> Result<TextPreview, String> {
    let target = resolve_inside_vault(&vault_path, &target_path)?;
    require_existing_file(&target)?;
    let limit = max_bytes.unwrap_or(DEFAULT_TEXT_LIMIT_BYTES);
    let metadata = fs::metadata(&target).map_err(|err| format!("Cannot stat target: {err}"))?;
    let total_bytes = metadata.len();
    let truncated = total_bytes > limit;
    let read_limit = if truncated { limit } else { total_bytes };
    let mut file = fs::File::open(&target).map_err(|err| format!("Cannot open target: {err}"))?;
    let mut buf = Vec::with_capacity(read_limit as usize);
    file.by_ref()
        .take(read_limit)
        .read_to_end(&mut buf)
        .map_err(|err| format!("Cannot read target: {err}"))?;
    let (content, encoding) = decode_text(&buf);
    Ok(TextPreview {
        content,
        truncated,
        encoding,
        byte_count: total_bytes,
    })
}

#[tauri::command]
pub fn binary_viewer_read_archive(
    vault_path: String,
    target_path: String,
) -> Result<Vec<ArchiveEntry>, String> {
    let target = resolve_inside_vault(&vault_path, &target_path)?;
    require_existing_file(&target)?;
    let file = fs::File::open(&target).map_err(|err| format!("Cannot open target: {err}"))?;
    let mut archive = ZipArchive::new(file).map_err(|err| format!("Invalid ZIP file: {err}"))?;
    let count = archive.len().min(ARCHIVE_ENTRY_LIMIT);
    let mut entries = Vec::with_capacity(count);
    for index in 0..count {
        let entry = archive
            .by_index(index)
            .map_err(|err| format!("Cannot read ZIP entry {index}: {err}"))?;
        entries.push(ArchiveEntry {
            name: entry.name().to_string(),
            size: entry.size(),
            compressed_size: entry.compressed_size(),
            is_dir: entry.is_dir(),
        });
    }
    Ok(entries)
}

#[tauri::command]
pub fn binary_viewer_extract_hwpx(
    vault_path: String,
    target_path: String,
) -> Result<HwpxPreview, String> {
    let target = resolve_inside_vault(&vault_path, &target_path)?;
    require_existing_file(&target)?;
    extract_hwpx_text_html(&target)
}

#[tauri::command]
pub fn binary_viewer_open_external(
    vault_path: String,
    target_path: String,
) -> Result<(), String> {
    let target = resolve_inside_vault(&vault_path, &target_path)?;
    if !target.exists() {
        return Err(format!("Target does not exist: {}", target.display()));
    }
    let target_str = target
        .to_str()
        .ok_or_else(|| "Path is not valid UTF-8".to_string())?
        .to_string();
    spawn_external(&target_str)
}

#[cfg(target_os = "macos")]
fn spawn_external(target: &str) -> Result<(), String> {
    Command::new("open")
        .arg(target)
        .spawn()
        .map_err(|err| format!("Cannot open externally: {err}"))?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn spawn_external(target: &str) -> Result<(), String> {
    Command::new("cmd")
        .args(["/C", "start", "", target])
        .spawn()
        .map_err(|err| format!("Cannot open externally: {err}"))?;
    Ok(())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn spawn_external(target: &str) -> Result<(), String> {
    Command::new("xdg-open")
        .arg(target)
        .spawn()
        .map_err(|err| format!("Cannot open externally: {err}"))?;
    Ok(())
}

fn require_existing_file(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Err(format!("Target does not exist: {}", path.display()));
    }
    if !path.is_file() {
        return Err(format!("Target is not a regular file: {}", path.display()));
    }
    Ok(())
}

fn classify(ext: Option<&str>, detected_format: &str) -> ViewerCategory {
    match ext {
        Some(
            "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "ico" | "tiff" | "tif" | "heic"
            | "heif" | "avif",
        ) => ViewerCategory::Image,
        Some("svg") => ViewerCategory::Svg,
        Some("pdf") => ViewerCategory::Pdf,
        Some("docx") => ViewerCategory::Docx,
        Some("xlsx" | "xls" | "xlsm") => ViewerCategory::Xlsx,
        Some("hwpx") => ViewerCategory::Hwpx,
        Some("mp3" | "wav" | "ogg" | "oga" | "flac" | "m4a" | "aac" | "opus") => {
            ViewerCategory::Audio
        }
        Some("mp4" | "mov" | "mkv" | "avi" | "webm" | "m4v") => ViewerCategory::Video,
        Some(
            "txt" | "log" | "srt" | "csv" | "tsv" | "json" | "xml" | "yaml" | "yml" | "toml"
            | "ini" | "conf" | "cfg" | "env" | "html" | "htm" | "css" | "scss" | "sass" | "less"
            | "js" | "mjs" | "cjs" | "ts" | "tsx" | "jsx" | "py" | "rs" | "go" | "java" | "kt"
            | "swift" | "c" | "cc" | "cpp" | "h" | "hpp" | "sql" | "sh" | "bash" | "zsh"
            | "fish" | "rb" | "php" | "lua" | "vim" | "dockerfile" | "gradle" | "properties",
        ) => ViewerCategory::Text,
        Some("zip" | "jar" | "war" | "apk" | "epub" | "ipa") => ViewerCategory::Archive,
        _ => match detected_format {
            "pdf" => ViewerCategory::Pdf,
            "docx" => ViewerCategory::Docx,
            "xlsx" => ViewerCategory::Xlsx,
            "hwpx" => ViewerCategory::Hwpx,
            _ => ViewerCategory::Unsupported,
        },
    }
}

fn format_label(format: DocumentFormat) -> &'static str {
    match format {
        DocumentFormat::Hwpx => "hwpx",
        DocumentFormat::Docx => "docx",
        DocumentFormat::Xlsx => "xlsx",
        DocumentFormat::Pdf => "pdf",
        DocumentFormat::Hwp => "hwp",
        DocumentFormat::Hwp3 => "hwp3",
        DocumentFormat::Hwpml => "hwpml",
        DocumentFormat::Unknown => "unknown",
    }
}

fn decode_text(bytes: &[u8]) -> (String, String) {
    if let Ok(s) = std::str::from_utf8(bytes) {
        return (s.to_string(), "utf-8".to_string());
    }
    let (decoded, _used, had_errors) = EUC_KR.decode(bytes);
    if !had_errors {
        return (decoded.into_owned(), "euc-kr".to_string());
    }
    (
        String::from_utf8_lossy(bytes).into_owned(),
        "utf-8-lossy".to_string(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn classify_dispatches_on_extension() {
        let cases = [
            ("foo.png", ViewerCategory::Image),
            ("foo.SVG", ViewerCategory::Svg),
            ("foo.pdf", ViewerCategory::Pdf),
            ("foo.docx", ViewerCategory::Docx),
            ("foo.xlsx", ViewerCategory::Xlsx),
            ("foo.hwpx", ViewerCategory::Hwpx),
            ("foo.mp4", ViewerCategory::Video),
            ("foo.mp3", ViewerCategory::Audio),
            ("foo.txt", ViewerCategory::Text),
            ("foo.zip", ViewerCategory::Archive),
            ("foo.unknown", ViewerCategory::Unsupported),
        ];
        for (name, expected) in cases {
            let ext = Path::new(name)
                .extension()
                .and_then(OsStr::to_str)
                .map(str::to_ascii_lowercase);
            let cat = classify(ext.as_deref(), "unknown");
            assert_eq!(cat, expected, "category for {name}");
        }
    }

    #[test]
    fn classify_falls_back_to_detected_format() {
        assert_eq!(classify(None, "pdf"), ViewerCategory::Pdf);
        assert_eq!(classify(Some("bin"), "hwpx"), ViewerCategory::Hwpx);
        assert_eq!(classify(Some("bin"), "unknown"), ViewerCategory::Unsupported);
    }

    #[test]
    fn decode_text_prefers_utf8() {
        let (content, encoding) = decode_text("hello 한글".as_bytes());
        assert_eq!(content, "hello 한글");
        assert_eq!(encoding, "utf-8");
    }

    #[test]
    fn decode_text_falls_back_to_euc_kr() {
        // "한글" in EUC-KR (CP949): 0xC7 0xD1 0xB1 0xDB
        let bytes = vec![0xC7, 0xD1, 0xB1, 0xDB];
        let (content, encoding) = decode_text(&bytes);
        assert_eq!(content, "한글");
        assert_eq!(encoding, "euc-kr");
    }

    #[test]
    fn read_text_truncates_large_files() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("big.txt");
        fs::write(&path, "a".repeat(1000)).unwrap();
        let preview = binary_viewer_read_text(
            tmp.path().to_str().unwrap().to_string(),
            path.to_str().unwrap().to_string(),
            Some(100),
        )
        .unwrap();
        assert!(preview.truncated);
        assert_eq!(preview.content.len(), 100);
        assert_eq!(preview.byte_count, 1000);
    }

    #[test]
    fn read_text_handles_cp949_file() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("ko.txt");
        let cp949_bytes = vec![0xC7, 0xD1, 0xB1, 0xDB];
        fs::write(&path, &cp949_bytes).unwrap();
        let preview = binary_viewer_read_text(
            tmp.path().to_str().unwrap().to_string(),
            path.to_str().unwrap().to_string(),
            None,
        )
        .unwrap();
        assert_eq!(preview.encoding, "euc-kr");
        assert_eq!(preview.content, "한글");
    }

    #[test]
    fn classify_rejects_outside_vault() {
        let tmp = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        let outside_file = outside.path().join("x.png");
        fs::write(&outside_file, b"\x89PNG\r\n").unwrap();
        let err = binary_viewer_classify(
            tmp.path().to_str().unwrap().to_string(),
            outside_file.to_str().unwrap().to_string(),
        )
        .unwrap_err();
        assert!(
            err.contains("escapes") || err.contains("outside") || err.contains("does not"),
            "unexpected err: {err}"
        );
    }

    #[test]
    fn classify_reports_metadata() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("note.txt");
        fs::write(&path, b"hello").unwrap();
        let report = binary_viewer_classify(
            tmp.path().to_str().unwrap().to_string(),
            path.to_str().unwrap().to_string(),
        )
        .unwrap();
        assert_eq!(report.category, ViewerCategory::Text);
        assert_eq!(report.extension.as_deref(), Some("txt"));
        assert_eq!(report.size_bytes, 5);
    }
}
