use std::path::{Path, PathBuf};

use serde::Deserialize;
use serde::Serialize;
use serde_yaml::Value;
use tracing::warn;

use crate::collection_domain::CollectionSummary;
use crate::errors::ApiError;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetRecord {
    pub id: String,
    pub name: String,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

#[derive(Debug, Clone)]
pub struct PresetDomain {
    workspace_root: PathBuf,
}

impl PresetDomain {
    pub fn new(workspace_root: impl AsRef<Path>) -> Self {
        Self {
            workspace_root: workspace_root.as_ref().to_path_buf(),
        }
    }

    pub fn get(&self, id: &str) -> Result<String, ApiError> {
        read_preset_yaml(&self.workspace_root, id)
            .map_err(|msg| ApiError::not_found(msg))
    }

    pub fn list(&self, collections: &[CollectionSummary]) -> Vec<PresetRecord> {
        let hats_dir = self.workspace_root.join(".ralph/hats");

        let mut builtin = read_builtin_presets(&self.workspace_root);
        let mut directory = read_presets_from_dir(&hats_dir, "directory", true);
        let mut collection_presets: Vec<_> = collections
            .iter()
            .map(|collection| PresetRecord {
                id: collection.id.clone(),
                name: collection.name.clone(),
                source: "collection".to_string(),
                description: collection.description.clone(),
                path: None,
            })
            .collect();

        builtin.sort_by(|a, b| a.name.cmp(&b.name).then(a.id.cmp(&b.id)));
        directory.sort_by(|a, b| a.name.cmp(&b.name).then(a.id.cmp(&b.id)));
        collection_presets.sort_by(|a, b| a.name.cmp(&b.name).then(a.id.cmp(&b.id)));

        let mut presets =
            Vec::with_capacity(builtin.len() + directory.len() + collection_presets.len());
        presets.extend(builtin);
        presets.extend(directory);
        presets.extend(collection_presets);
        presets
    }
}

#[derive(Debug, Deserialize)]
struct BuiltinPresetIndexEntry {
    name: String,
    description: String,
}

fn read_builtin_presets(workspace_root: &Path) -> Vec<PresetRecord> {
    let index_path = workspace_root.join("presets").join("index.json");
    let content = match std::fs::read_to_string(&index_path) {
        Ok(content) => content,
        Err(error) => {
            warn!(path = %index_path.display(), %error, "failed reading builtin preset index");
            return read_presets_from_dir(&workspace_root.join("presets"), "builtin", false);
        }
    };

    let mut entries: Vec<BuiltinPresetIndexEntry> = match serde_json::from_str(&content) {
        Ok(entries) => entries,
        Err(error) => {
            warn!(path = %index_path.display(), %error, "failed parsing builtin preset index");
            return read_presets_from_dir(&workspace_root.join("presets"), "builtin", false);
        }
    };

    entries.sort_by(|a, b| a.name.cmp(&b.name));

    entries
        .into_iter()
        .map(|entry| PresetRecord {
            id: format!("builtin:{}", entry.name),
            name: entry.name,
            source: "builtin".to_string(),
            description: Some(entry.description),
            path: None,
        })
        .collect()
}

fn read_presets_from_dir(dir: &Path, source: &str, include_path: bool) -> Vec<PresetRecord> {
    if !dir.exists() {
        return Vec::new();
    }

    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };

    let mut files: Vec<PathBuf> = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_file())
        .filter(|path| path.extension().is_some_and(|extension| extension == "yml"))
        .collect();

    files.sort();

    files
        .into_iter()
        .filter_map(|path| {
            let file_stem = path.file_stem()?.to_str()?.to_string();
            let description = read_preset_description(&path);

            Some(PresetRecord {
                id: format!("{source}:{file_stem}"),
                name: file_stem,
                source: source.to_string(),
                description,
                path: include_path.then(|| path.display().to_string()),
            })
        })
        .collect()
}

/// Read the full YAML content for a preset by id.
///
/// Id formats:
/// - `builtin:{name}` → reads `presets/{name}.yml`
/// - `directory:{name}` → reads `.ralph/hats/{name}.yml`
/// - `collection:{id}` → not handled here (caller delegates to collection.export)
pub fn read_preset_yaml(workspace_root: &Path, id: &str) -> Result<String, String> {
    let (source, name) = id
        .split_once(':')
        .ok_or_else(|| format!("invalid preset id: {id}"))?;

    let path = match source {
        "builtin" => workspace_root.join("presets").join(format!("{name}.yml")),
        "directory" => workspace_root.join(".ralph/hats").join(format!("{name}.yml")),
        "collection" => return Err("collection presets must use collection.export".to_string()),
        _ => return Err(format!("unknown preset source: {source}")),
    };

    std::fs::read_to_string(&path)
        .map_err(|e| format!("failed to read preset '{}': {e}", path.display()))
}

fn read_preset_description(path: &Path) -> Option<String> {
    let content = std::fs::read_to_string(path).ok()?;
    let parsed: Value = match serde_yaml::from_str(&content) {
        Ok(parsed) => parsed,
        Err(error) => {
            warn!(path = %path.display(), %error, "failed parsing preset yaml");
            return None;
        }
    };

    parsed
        .as_mapping()
        .and_then(|mapping| mapping.get(Value::String("description".to_string())))
        .and_then(Value::as_str)
        .map(std::string::ToString::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn setup_workspace() -> TempDir {
        let dir = TempDir::new().unwrap();
        let presets_dir = dir.path().join("presets");
        fs::create_dir_all(&presets_dir).unwrap();
        fs::write(presets_dir.join("debug.yml"), "name: debug\nhats: {}").unwrap();

        let hats_dir = dir.path().join(".ralph/hats");
        fs::create_dir_all(&hats_dir).unwrap();
        fs::write(hats_dir.join("custom.yml"), "name: custom\nhats: {}").unwrap();

        dir
    }

    #[test]
    fn get_builtin_preset_returns_yaml() {
        let ws = setup_workspace();
        let domain = PresetDomain::new(ws.path());
        let yaml = domain.get("builtin:debug").unwrap();
        assert!(yaml.contains("name: debug"));
    }

    #[test]
    fn get_directory_preset_returns_yaml() {
        let ws = setup_workspace();
        let domain = PresetDomain::new(ws.path());
        let yaml = domain.get("directory:custom").unwrap();
        assert!(yaml.contains("name: custom"));
    }

    #[test]
    fn get_collection_preset_returns_error() {
        let ws = setup_workspace();
        let domain = PresetDomain::new(ws.path());
        let err = domain.get("collection:some-id").unwrap_err();
        assert!(err.message.contains("collection.export"));
    }

    #[test]
    fn get_missing_preset_returns_error() {
        let ws = setup_workspace();
        let domain = PresetDomain::new(ws.path());
        let err = domain.get("builtin:nonexistent").unwrap_err();
        assert!(err.message.contains("failed to read"));
    }

    #[test]
    fn get_invalid_id_returns_error() {
        let ws = setup_workspace();
        let domain = PresetDomain::new(ws.path());
        let err = domain.get("nocolon").unwrap_err();
        assert!(err.message.contains("invalid preset id"));
    }
}
