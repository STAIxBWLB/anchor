// Export manifest types + planner.

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Docx,
    Hwpx,
    Pdf,
}

impl ExportFormat {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value.to_ascii_lowercase().as_str() {
            "docx" => Ok(ExportFormat::Docx),
            "hwpx" => Ok(ExportFormat::Hwpx),
            "pdf" => Ok(ExportFormat::Pdf),
            other => Err(format!("unsupported format: {}", other)),
        }
    }

    pub fn extension(&self) -> &'static str {
        match self {
            ExportFormat::Docx => "docx",
            ExportFormat::Hwpx => "hwpx",
            ExportFormat::Pdf => "pdf",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ExportOutputStatus {
    /// Path computed; conversion not yet attempted.
    Planned,
    /// Skill dispatch in flight.
    Pending,
    /// Output file written + sha256 captured.
    Ready,
    /// Conversion attempted and failed; `reason` is set.
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportOutputEntry {
    pub format: ExportFormat,
    /// Workspace-relative path of the output file.
    pub path: String,
    pub status: ExportOutputStatus,
    #[serde(default)]
    pub sha256: Option<String>,
    #[serde(default)]
    pub byte_size: Option<u64>,
    #[serde(default)]
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportManifest {
    /// Manifest schema version (bumped when the on-disk shape changes).
    pub schema_version: u32,
    /// Workspace-relative source markdown path.
    pub source: String,
    pub source_sha256: String,
    pub source_byte_size: u64,
    pub generated_at: String,
    pub outputs: Vec<ExportOutputEntry>,
}

const SCHEMA_VERSION: u32 = 1;

/// Compute the sha256 of the source file contents (hex string).
pub fn compute_source_sha256(path: &Path) -> io::Result<(String, u64)> {
    let bytes = std::fs::read(path)?;
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    Ok((hex(hasher.finalize().as_slice()), bytes.len() as u64))
}

fn hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        use std::fmt::Write;
        let _ = write!(&mut s, "{:02x}", b);
    }
    s
}

pub fn plan_bundle(
    workspace_root: &Path,
    source_rel_or_abs: &str,
    formats: &[ExportFormat],
    output_dir_override: Option<&str>,
) -> io::Result<(PathBuf, ExportManifest)> {
    let source_path = resolve_source(workspace_root, source_rel_or_abs)?;
    if !source_path.exists() {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            format!("source not found: {}", source_path.display()),
        ));
    }

    let source_rel = source_path
        .strip_prefix(workspace_root)
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|_| source_path.clone());

    let bundle_dir = match output_dir_override {
        Some(rel) => workspace_root.join(rel),
        None => {
            let stem = source_path
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "export".to_string());
            source_path
                .parent()
                .unwrap_or_else(|| Path::new("."))
                .join(format!("{stem}.exports"))
        }
    };
    std::fs::create_dir_all(&bundle_dir)?;

    let (source_sha256, source_byte_size) = compute_source_sha256(&source_path)?;

    let stem = source_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "output".to_string());
    let bundle_rel = bundle_dir
        .strip_prefix(workspace_root)
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|_| bundle_dir.clone());

    let outputs = formats
        .iter()
        .map(|fmt| ExportOutputEntry {
            format: *fmt,
            path: bundle_rel
                .join(format!("{stem}.{}", fmt.extension()))
                .to_string_lossy()
                .to_string(),
            status: ExportOutputStatus::Planned,
            sha256: None,
            byte_size: None,
            reason: None,
        })
        .collect();

    let manifest = ExportManifest {
        schema_version: SCHEMA_VERSION,
        source: source_rel.to_string_lossy().to_string(),
        source_sha256,
        source_byte_size,
        generated_at: Utc::now().to_rfc3339(),
        outputs,
    };

    let manifest_path = bundle_dir.join("manifest.yaml");
    let yaml = serde_yaml::to_string(&manifest)
        .map_err(|e| io::Error::new(io::ErrorKind::Other, e))?;
    std::fs::write(&manifest_path, yaml)?;

    Ok((manifest_path, manifest))
}

fn resolve_source(workspace_root: &Path, source: &str) -> io::Result<PathBuf> {
    let candidate = Path::new(source);
    if candidate.is_absolute() {
        return Ok(candidate.to_path_buf());
    }
    Ok(workspace_root.join(source))
}

pub fn load_manifest(path: &Path) -> io::Result<ExportManifest> {
    let text = std::fs::read_to_string(path)?;
    serde_yaml::from_str(&text).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
}

pub fn save_manifest(path: &Path, manifest: &ExportManifest) -> io::Result<()> {
    let yaml =
        serde_yaml::to_string(manifest).map_err(|e| io::Error::new(io::ErrorKind::Other, e))?;
    std::fs::write(path, yaml)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn setup_workspace() -> (TempDir, PathBuf) {
        let tmp = TempDir::new().unwrap();
        let source = tmp.path().join("projects/x/draft.md");
        std::fs::create_dir_all(source.parent().unwrap()).unwrap();
        std::fs::write(&source, "# Title\n\nbody\n").unwrap();
        (tmp, source)
    }

    #[test]
    fn plan_bundle_writes_manifest_with_planned_entries() {
        let (tmp, source) = setup_workspace();
        let (manifest_path, manifest) = plan_bundle(
            tmp.path(),
            source.to_string_lossy().as_ref(),
            &[ExportFormat::Docx, ExportFormat::Hwpx, ExportFormat::Pdf],
            None,
        )
        .unwrap();

        assert!(manifest_path.exists(), "manifest.yaml must be written");
        assert_eq!(manifest.schema_version, 1);
        assert_eq!(manifest.outputs.len(), 3);
        for out in &manifest.outputs {
            assert_eq!(out.status, ExportOutputStatus::Planned);
            assert!(out.path.ends_with(&format!(".{}", out.format.extension())));
        }
        assert_eq!(manifest.source_byte_size, "# Title\n\nbody\n".len() as u64);
    }

    #[test]
    fn plan_bundle_source_sha_roundtrips() {
        let (tmp, source) = setup_workspace();
        let (_path, manifest) = plan_bundle(
            tmp.path(),
            source.to_string_lossy().as_ref(),
            &[ExportFormat::Docx],
            None,
        )
        .unwrap();
        let (recomputed, size) = compute_source_sha256(&source).unwrap();
        assert_eq!(manifest.source_sha256, recomputed);
        assert_eq!(manifest.source_byte_size, size);
    }

    #[test]
    fn plan_bundle_honors_output_dir_override() {
        let (tmp, source) = setup_workspace();
        let (path, manifest) = plan_bundle(
            tmp.path(),
            source.to_string_lossy().as_ref(),
            &[ExportFormat::Pdf],
            Some("projects/x/.anchor/exports/draft"),
        )
        .unwrap();
        assert!(path.to_string_lossy().contains(".anchor/exports/draft"));
        let pdf = &manifest.outputs[0];
        assert!(pdf.path.starts_with("projects/x/.anchor/exports/draft/"));
    }

    #[test]
    fn export_format_parse_rejects_unknown() {
        assert!(ExportFormat::parse("md").is_err());
        assert_eq!(ExportFormat::parse("DOCX").unwrap(), ExportFormat::Docx);
    }

    #[test]
    fn plan_bundle_missing_source_errors() {
        let tmp = TempDir::new().unwrap();
        let res = plan_bundle(
            tmp.path(),
            "projects/missing/doc.md",
            &[ExportFormat::Docx],
            None,
        );
        assert!(res.is_err());
    }
}
