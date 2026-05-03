// Workspace registry. Anchor stores registered document roots in
// `<config>/com.anchor.app/workspaces.json`. Older builds wrote the same
// concept to `vaults.json`; the loader migrates that shape on first use
// and keeps the old file untouched.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

const APP_CONFIG_DIR: &str = "com.anchor.app";
const WORKSPACE_REGISTRY_FILE: &str = "workspaces.json";
const LEGACY_VAULTS_FILE: &str = "vaults.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRootEntry {
    pub label: String,
    pub path: String,
    /// "private" | "public". Public workspaces are optional and may be
    /// read-only, but visibility and write policy stay independent.
    pub visibility: String,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "external_writer"
    )]
    pub external_writer: Option<String>,
    /// "direct" | "delegated". Derived from external_writer for legacy
    /// imports and v1 add/upsert calls.
    pub write_policy: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActiveByVisibility {
    #[serde(default)]
    pub private: Option<String>,
    #[serde(default)]
    pub public: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRegistry {
    pub workspaces: Vec<WorkspaceRootEntry>,
    #[serde(default)]
    pub active_by_visibility: ActiveByVisibility,
    #[serde(default, alias = "hidden_defaults")]
    pub hidden_defaults: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct LegacyVaultList {
    #[serde(default)]
    vaults: Vec<LegacyVaultRegistryEntry>,
    #[serde(default, alias = "active_vault")]
    active_vault: Option<String>,
    #[serde(default, alias = "hidden_defaults")]
    hidden_defaults: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct LegacyVaultRegistryEntry {
    label: String,
    path: String,
    #[serde(default, alias = "external_writer")]
    external_writer: Option<String>,
    #[serde(default)]
    workspace_root: Option<String>,
    #[serde(default)]
    role: Option<String>,
}

fn app_config_dir() -> Result<PathBuf, String> {
    dirs::config_dir().ok_or_else(|| "Could not determine config directory".to_string())
}

fn preferred_app_config_path(file_name: &str) -> Result<PathBuf, String> {
    Ok(app_config_dir()?.join(APP_CONFIG_DIR).join(file_name))
}

fn workspace_registry_path() -> Result<PathBuf, String> {
    preferred_app_config_path(WORKSPACE_REGISTRY_FILE)
}

fn legacy_vault_list_path() -> Result<PathBuf, String> {
    preferred_app_config_path(LEGACY_VAULTS_FILE)
}

fn load_registry_at(path: &Path, legacy_path: &Path) -> Result<WorkspaceRegistry, String> {
    if path.exists() {
        let content =
            fs::read_to_string(path).map_err(|e| format!("Failed to read workspace list: {e}"))?;
        let mut registry: WorkspaceRegistry =
            serde_json::from_str(&content).map_err(|e| format!("Failed to parse workspace list: {e}"))?;
        normalize_registry(&mut registry);
        return Ok(registry);
    }

    let legacy = load_legacy_at(legacy_path)?;
    let mut registry = migrate_legacy_vault_list(legacy);
    normalize_registry(&mut registry);
    if !registry.workspaces.is_empty() {
        save_registry_at(path, &registry)?;
    }
    Ok(registry)
}

fn load_legacy_at(path: &Path) -> Result<LegacyVaultList, String> {
    if !path.exists() {
        return Ok(LegacyVaultList::default());
    }
    let content =
        fs::read_to_string(path).map_err(|e| format!("Failed to read legacy vault list: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse legacy vault list: {e}"))
}

fn save_registry_at(path: &Path, registry: &WorkspaceRegistry) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config directory: {e}"))?;
    }
    let json = serde_json::to_string_pretty(registry)
        .map_err(|e| format!("Failed to serialize workspace list: {e}"))?;
    fs::write(path, json).map_err(|e| format!("Failed to write workspace list: {e}"))
}

fn load_registry() -> Result<WorkspaceRegistry, String> {
    load_registry_at(&workspace_registry_path()?, &legacy_vault_list_path()?)
}

fn save_registry(registry: &WorkspaceRegistry) -> Result<(), String> {
    save_registry_at(&workspace_registry_path()?, registry)
}

fn normalize_visibility(value: &str) -> String {
    if value == "public" {
        "public".to_string()
    } else {
        "private".to_string()
    }
}

fn infer_write_policy(external_writer: &Option<String>) -> String {
    if external_writer.is_some() {
        "delegated".to_string()
    } else {
        "direct".to_string()
    }
}

fn normalize_registry(registry: &mut WorkspaceRegistry) {
    for entry in &mut registry.workspaces {
        entry.visibility = normalize_visibility(&entry.visibility);
        if entry.write_policy != "delegated" && entry.write_policy != "direct" {
            entry.write_policy = infer_write_policy(&entry.external_writer);
        }
        if entry.external_writer.is_some() {
            entry.write_policy = "delegated".to_string();
        }
    }

    if !active_path_is_valid(registry, "private", registry.active_by_visibility.private.as_deref())
    {
        registry.active_by_visibility.private = first_path_for_visibility(registry, "private");
    }
    if !active_path_is_valid(registry, "public", registry.active_by_visibility.public.as_deref()) {
        registry.active_by_visibility.public = first_path_for_visibility(registry, "public");
    }
}

fn active_path_is_valid(
    registry: &WorkspaceRegistry,
    visibility: &str,
    active: Option<&str>,
) -> bool {
    let Some(active) = active else {
        return false;
    };
    registry
        .workspaces
        .iter()
        .any(|entry| entry.path == active && entry.visibility == visibility)
}

fn first_path_for_visibility(registry: &WorkspaceRegistry, visibility: &str) -> Option<String> {
    registry
        .workspaces
        .iter()
        .find(|entry| entry.visibility == visibility)
        .map(|entry| entry.path.clone())
}

fn active_slot<'a>(
    active: &'a mut ActiveByVisibility,
    visibility: &str,
) -> &'a mut Option<String> {
    if visibility == "public" {
        &mut active.public
    } else {
        &mut active.private
    }
}

fn migrate_legacy_vault_list(legacy: LegacyVaultList) -> WorkspaceRegistry {
    let mut registry = WorkspaceRegistry {
        hidden_defaults: legacy.hidden_defaults,
        ..WorkspaceRegistry::default()
    };

    for entry in legacy.vaults {
        let visibility = if entry.role.as_deref() == Some("vault") || entry.external_writer.is_some()
        {
            "public"
        } else {
            "private"
        };
        registry.workspaces.push(WorkspaceRootEntry {
            label: entry.label,
            path: entry.path,
            visibility: visibility.to_string(),
            external_writer: entry.external_writer.clone(),
            write_policy: infer_write_policy(&entry.external_writer),
        });
    }

    if let Some(active) = legacy.active_vault {
        if let Some(active_entry) = registry.workspaces.iter().find(|entry| entry.path == active) {
            *active_slot(&mut registry.active_by_visibility, &active_entry.visibility) =
                Some(active);
        }
    }
    registry
}

#[tauri::command]
pub fn list_workspace_roots() -> Result<WorkspaceRegistry, String> {
    load_registry()
}

pub fn assert_anchor_owns_writes(workspace_path: &str) -> Result<(), String> {
    let registry = load_registry()?;
    if let Some(writer) = delegated_writer_for_path(&registry, workspace_path) {
        return Err(format!(
            "Workspace writes are delegated to {writer}; Anchor will not write directly."
        ));
    }
    Ok(())
}

fn delegated_writer_for_path(registry: &WorkspaceRegistry, workspace_path: &str) -> Option<String> {
    registry
        .workspaces
        .iter()
        .find(|workspace| workspace.path == workspace_path)
        .and_then(|workspace| {
            if workspace.write_policy == "delegated" || workspace.external_writer.is_some() {
                Some(
                    workspace
                        .external_writer
                        .clone()
                        .unwrap_or_else(|| "external writer".to_string()),
                )
            } else {
                None
            }
        })
}

#[tauri::command]
pub fn add_workspace_root(
    label: String,
    path: String,
    visibility: String,
    external_writer: Option<String>,
) -> Result<WorkspaceRegistry, String> {
    upsert_workspace_root(WorkspaceRootEntry {
        label,
        path,
        visibility: normalize_visibility(&visibility),
        write_policy: infer_write_policy(&external_writer),
        external_writer,
    })
}

pub fn upsert_workspace_root(entry: WorkspaceRootEntry) -> Result<WorkspaceRegistry, String> {
    let mut registry = load_registry()?;
    let mut normalized = entry;
    normalized.visibility = normalize_visibility(&normalized.visibility);
    normalized.write_policy = infer_write_policy(&normalized.external_writer);
    let active_path = normalized.path.clone();
    let active_visibility = normalized.visibility.clone();

    if let Some(existing) = registry
        .workspaces
        .iter_mut()
        .find(|workspace| workspace.path == normalized.path)
    {
        *existing = normalized;
    } else {
        registry.workspaces.push(normalized);
    }
    *active_slot(&mut registry.active_by_visibility, &active_visibility) = Some(active_path);
    normalize_registry(&mut registry);
    save_registry(&registry)?;
    Ok(registry)
}

#[tauri::command]
pub fn remove_workspace_root(path: String) -> Result<WorkspaceRegistry, String> {
    let mut registry = load_registry()?;
    let removed_visibility = registry
        .workspaces
        .iter()
        .find(|workspace| workspace.path == path)
        .map(|workspace| workspace.visibility.clone());
    registry.workspaces.retain(|workspace| workspace.path != path);
    if let Some(visibility) = removed_visibility {
        let slot = active_slot(&mut registry.active_by_visibility, &visibility);
        if slot.as_deref() == Some(path.as_str()) {
            *slot = None;
        }
    }
    normalize_registry(&mut registry);
    save_registry(&registry)?;
    Ok(registry)
}

#[tauri::command]
pub fn set_active_workspace_root(
    path: String,
    visibility: String,
) -> Result<WorkspaceRegistry, String> {
    let visibility = normalize_visibility(&visibility);
    let mut registry = load_registry()?;
    if !registry
        .workspaces
        .iter()
        .any(|workspace| workspace.path == path && workspace.visibility == visibility)
    {
        return Err("Workspace is not registered for this visibility".to_string());
    }
    *active_slot(&mut registry.active_by_visibility, &visibility) = Some(path);
    normalize_registry(&mut registry);
    save_registry(&registry)?;
    Ok(registry)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn save_and_reload(registry: &WorkspaceRegistry) -> WorkspaceRegistry {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("workspaces.json");
        let legacy_path = dir.path().join("vaults.json");
        save_registry_at(&path, registry).unwrap();
        load_registry_at(&path, &legacy_path).unwrap()
    }

    #[test]
    fn default_workspace_registry_is_empty() {
        let registry = WorkspaceRegistry::default();
        assert!(registry.workspaces.is_empty());
        assert!(registry.active_by_visibility.private.is_none());
        assert!(registry.active_by_visibility.public.is_none());
    }

    #[test]
    fn roundtrip_preserves_workspace_data() {
        let registry = WorkspaceRegistry {
            workspaces: vec![
                WorkspaceRootEntry {
                    label: "Private".to_string(),
                    path: "/Users/yj/workspace/work".to_string(),
                    visibility: "private".to_string(),
                    external_writer: None,
                    write_policy: "direct".to_string(),
                },
                WorkspaceRootEntry {
                    label: "Public".to_string(),
                    path: "/Users/yj/workspace/public".to_string(),
                    visibility: "public".to_string(),
                    external_writer: Some("mcp-obsidian".to_string()),
                    write_policy: "delegated".to_string(),
                },
            ],
            active_by_visibility: ActiveByVisibility {
                private: Some("/Users/yj/workspace/work".to_string()),
                public: Some("/Users/yj/workspace/public".to_string()),
            },
            hidden_defaults: vec![],
        };
        let loaded = save_and_reload(&registry);
        assert_eq!(loaded.workspaces.len(), 2);
        assert_eq!(loaded.workspaces[0].visibility, "private");
        assert_eq!(loaded.workspaces[1].visibility, "public");
        assert_eq!(loaded.workspaces[1].write_policy, "delegated");
    }

    #[test]
    fn migrates_legacy_vaults_to_workspace_registry() {
        let dir = tempfile::TempDir::new().unwrap();
        let workspace_path = dir.path().join("workspaces.json");
        let legacy_path = dir.path().join("vaults.json");
        let legacy = LegacyVaultList {
            vaults: vec![
                LegacyVaultRegistryEntry {
                    label: "Work".to_string(),
                    path: "/work".to_string(),
                    external_writer: None,
                    workspace_root: Some("/work".to_string()),
                    role: Some("work".to_string()),
                },
                LegacyVaultRegistryEntry {
                    label: "Knowledge".to_string(),
                    path: "/knowledge".to_string(),
                    external_writer: Some("mcp-obsidian".to_string()),
                    workspace_root: Some("/work".to_string()),
                    role: Some("vault".to_string()),
                },
            ],
            active_vault: Some("/work".to_string()),
            hidden_defaults: vec![],
        };
        fs::write(&legacy_path, serde_json::to_string_pretty(&legacy).unwrap()).unwrap();

        let migrated = load_registry_at(&workspace_path, &legacy_path).unwrap();

        assert!(workspace_path.exists());
        assert_eq!(migrated.active_by_visibility.private.as_deref(), Some("/work"));
        assert_eq!(
            migrated.active_by_visibility.public.as_deref(),
            Some("/knowledge")
        );
        assert_eq!(migrated.workspaces[0].visibility, "private");
        assert_eq!(migrated.workspaces[1].visibility, "public");
    }

    #[test]
    fn migrates_legacy_private_only_registry() {
        let legacy = LegacyVaultList {
            vaults: vec![LegacyVaultRegistryEntry {
                label: "Plain".to_string(),
                path: "/plain".to_string(),
                external_writer: None,
                workspace_root: None,
                role: None,
            }],
            active_vault: Some("/plain".to_string()),
            hidden_defaults: vec![],
        };

        let migrated = migrate_legacy_vault_list(legacy);

        assert_eq!(migrated.workspaces[0].visibility, "private");
        assert_eq!(migrated.active_by_visibility.private.as_deref(), Some("/plain"));
        assert!(migrated.active_by_visibility.public.is_none());
    }

    #[test]
    fn delegated_policy_blocks_registered_workspace() {
        let registry = WorkspaceRegistry {
            workspaces: vec![WorkspaceRootEntry {
                label: "Public".to_string(),
                path: "/tmp/public".to_string(),
                visibility: "public".to_string(),
                external_writer: Some("mcp-obsidian".to_string()),
                write_policy: "delegated".to_string(),
            }],
            active_by_visibility: ActiveByVisibility::default(),
            hidden_defaults: vec![],
        };

        assert_eq!(
            delegated_writer_for_path(&registry, "/tmp/public").as_deref(),
            Some("mcp-obsidian")
        );
        assert!(delegated_writer_for_path(&registry, "/tmp/plain").is_none());
    }

    #[test]
    fn delegated_policy_without_named_writer_still_blocks() {
        let registry = WorkspaceRegistry {
            workspaces: vec![WorkspaceRootEntry {
                label: "Public".to_string(),
                path: "/tmp/public".to_string(),
                visibility: "public".to_string(),
                external_writer: None,
                write_policy: "delegated".to_string(),
            }],
            active_by_visibility: ActiveByVisibility::default(),
            hidden_defaults: vec![],
        };

        assert_eq!(
            delegated_writer_for_path(&registry, "/tmp/public").as_deref(),
            Some("external writer")
        );
    }
}
