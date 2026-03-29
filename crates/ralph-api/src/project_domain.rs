use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tracing::warn;
use uuid::Uuid;

use crate::errors::ApiError;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectAddParams {
    pub path: String,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRemoveParams {
    pub id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectBrowseParams {
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRecord {
    pub id: String,
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowseEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub has_ralph_yml: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct ProjectSnapshot {
    projects: Vec<ProjectRecord>,
}

pub struct ProjectRegistry {
    store_path: PathBuf,
    projects: Vec<ProjectRecord>,
}

impl ProjectRegistry {
    pub fn new(store_path: impl Into<PathBuf>) -> Self {
        let store_path = store_path.into();
        let mut registry = Self {
            store_path,
            projects: Vec::new(),
        };
        registry.load();
        registry
    }

    pub fn default_path() -> PathBuf {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_else(|_| ".".to_string());
        PathBuf::from(home).join(".ralph/projects.json")
    }

    pub fn list(&self) -> Vec<ProjectRecord> {
        self.projects.clone()
    }

    pub fn get(&self, id: &str) -> Option<&ProjectRecord> {
        self.projects.iter().find(|p| p.id == id)
    }

    pub fn add(&mut self, params: ProjectAddParams) -> Result<ProjectRecord, ApiError> {
        let dir = Path::new(&params.path);
        if !dir.is_dir() {
            return Err(ApiError::invalid_params(format!(
                "path '{}' is not a directory",
                params.path
            )));
        }

        if self.projects.iter().any(|p| p.path == params.path) {
            return Err(ApiError::conflict(format!(
                "project at '{}' is already registered",
                params.path
            )));
        }

        let name = params.name.unwrap_or_else(|| {
            dir.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unnamed")
                .to_string()
        });

        let record = ProjectRecord {
            id: Uuid::new_v4().to_string(),
            name,
            path: params.path,
        };

        self.projects.push(record.clone());
        self.persist()?;
        Ok(record)
    }

    pub fn remove(&mut self, params: ProjectRemoveParams) -> Result<(), ApiError> {
        let before = self.projects.len();
        self.projects.retain(|p| p.id != params.id);
        if self.projects.len() == before {
            return Err(ApiError::not_found(format!(
                "project '{}' not found",
                params.id
            )));
        }
        self.persist()?;
        Ok(())
    }

    pub fn browse(&self, params: ProjectBrowseParams) -> Result<Vec<BrowseEntry>, ApiError> {
        let dir = Path::new(&params.path);
        if !dir.is_dir() {
            return Err(ApiError::invalid_params(format!(
                "path '{}' is not a directory",
                params.path
            )));
        }

        let mut entries = Vec::new();
        let read_dir = fs::read_dir(dir).map_err(|e| {
            ApiError::internal(format!("failed to read directory '{}': {e}", params.path))
        })?;

        for entry in read_dir.flatten() {
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }
            let entry_path = entry.path();
            let is_directory = meta.is_dir();
            let has_ralph_yml =
                is_directory && (entry_path.join("ralph.yml").exists() || entry_path.join("ralph.yaml").exists());

            entries.push(BrowseEntry {
                name,
                path: entry_path.to_string_lossy().to_string(),
                is_directory,
                has_ralph_yml,
            });
        }

        entries.sort_by(|a, b| {
            b.is_directory
                .cmp(&a.is_directory)
                .then_with(|| a.name.cmp(&b.name))
        });

        Ok(entries)
    }

    fn load(&mut self) {
        if !self.store_path.exists() {
            return;
        }
        let content = match fs::read_to_string(&self.store_path) {
            Ok(c) => c,
            Err(e) => {
                warn!(path = %self.store_path.display(), %e, "failed reading project registry");
                return;
            }
        };
        let snapshot: ProjectSnapshot = match serde_json::from_str(&content) {
            Ok(s) => s,
            Err(e) => {
                warn!(path = %self.store_path.display(), %e, "failed parsing project registry");
                return;
            }
        };
        self.projects = snapshot.projects;
    }

    fn persist(&self) -> Result<(), ApiError> {
        if let Some(parent) = self.store_path.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                ApiError::internal(format!(
                    "failed to create project registry directory '{}': {e}",
                    parent.display()
                ))
            })?;
        }
        let snapshot = ProjectSnapshot {
            projects: self.projects.clone(),
        };
        let payload = serde_json::to_string_pretty(&snapshot)
            .map_err(|e| ApiError::internal(format!("failed to serialize projects: {e}")))?;
        fs::write(&self.store_path, payload).map_err(|e| {
            ApiError::internal(format!(
                "failed to write project registry '{}': {e}",
                self.store_path.display()
            ))
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn setup() -> (TempDir, ProjectRegistry) {
        let tmp = TempDir::new().unwrap();
        let store = tmp.path().join("projects.json");
        let registry = ProjectRegistry::new(store);
        (tmp, registry)
    }

    #[test]
    fn list_empty_returns_empty() {
        let (_tmp, registry) = setup();
        assert!(registry.list().is_empty());
    }

    #[test]
    fn add_and_list_project() {
        let (tmp, mut registry) = setup();
        let project_dir = tmp.path().join("my-project");
        fs::create_dir(&project_dir).unwrap();

        let record = registry
            .add(ProjectAddParams {
                path: project_dir.to_string_lossy().to_string(),
                name: Some("my-project".to_string()),
            })
            .unwrap();

        assert_eq!(record.name, "my-project");
        assert!(!record.id.is_empty());

        let projects = registry.list();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].name, "my-project");
    }

    #[test]
    fn add_infers_name_from_path() {
        let (tmp, mut registry) = setup();
        let project_dir = tmp.path().join("cool-repo");
        fs::create_dir(&project_dir).unwrap();

        let record = registry
            .add(ProjectAddParams {
                path: project_dir.to_string_lossy().to_string(),
                name: None,
            })
            .unwrap();

        assert_eq!(record.name, "cool-repo");
    }

    #[test]
    fn add_rejects_nonexistent_path() {
        let (_tmp, mut registry) = setup();
        let result = registry.add(ProjectAddParams {
            path: "/nonexistent/path/xyz".to_string(),
            name: None,
        });
        assert!(result.is_err());
    }

    #[test]
    fn add_rejects_duplicate_path() {
        let (tmp, mut registry) = setup();
        let project_dir = tmp.path().join("dup");
        fs::create_dir(&project_dir).unwrap();
        let path = project_dir.to_string_lossy().to_string();

        registry
            .add(ProjectAddParams {
                path: path.clone(),
                name: None,
            })
            .unwrap();

        let result = registry.add(ProjectAddParams {
            path,
            name: None,
        });
        assert!(result.is_err());
    }

    #[test]
    fn remove_project() {
        let (tmp, mut registry) = setup();
        let project_dir = tmp.path().join("removable");
        fs::create_dir(&project_dir).unwrap();

        let record = registry
            .add(ProjectAddParams {
                path: project_dir.to_string_lossy().to_string(),
                name: None,
            })
            .unwrap();

        registry
            .remove(ProjectRemoveParams { id: record.id })
            .unwrap();
        assert!(registry.list().is_empty());
    }

    #[test]
    fn remove_nonexistent_returns_error() {
        let (_tmp, mut registry) = setup();
        let result = registry.remove(ProjectRemoveParams {
            id: "nope".to_string(),
        });
        assert!(result.is_err());
    }

    #[test]
    fn persistence_survives_reload() {
        let (tmp, mut registry) = setup();
        let project_dir = tmp.path().join("persist-test");
        fs::create_dir(&project_dir).unwrap();

        registry
            .add(ProjectAddParams {
                path: project_dir.to_string_lossy().to_string(),
                name: Some("persisted".to_string()),
            })
            .unwrap();

        // Reload from same store path
        let store = tmp.path().join("projects.json");
        let reloaded = ProjectRegistry::new(store);
        let projects = reloaded.list();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].name, "persisted");
    }

    #[test]
    fn browse_lists_directories() {
        let (tmp, registry) = setup();
        let base = tmp.path().join("browse-root");
        fs::create_dir(&base).unwrap();
        fs::create_dir(base.join("subdir")).unwrap();
        fs::write(base.join("file.txt"), "hello").unwrap();

        let entries = registry
            .browse(ProjectBrowseParams {
                path: base.to_string_lossy().to_string(),
            })
            .unwrap();

        assert_eq!(entries.len(), 2);
        // Directories sort first
        assert!(entries[0].is_directory);
        assert_eq!(entries[0].name, "subdir");
        assert!(!entries[1].is_directory);
        assert_eq!(entries[1].name, "file.txt");
    }

    #[test]
    fn browse_detects_ralph_yml() {
        let (tmp, registry) = setup();
        let base = tmp.path().join("ralph-browse");
        fs::create_dir(&base).unwrap();
        let ralph_dir = base.join("has-ralph");
        fs::create_dir(&ralph_dir).unwrap();
        fs::write(ralph_dir.join("ralph.yml"), "").unwrap();

        let no_ralph_dir = base.join("no-ralph");
        fs::create_dir(&no_ralph_dir).unwrap();

        let entries = registry
            .browse(ProjectBrowseParams {
                path: base.to_string_lossy().to_string(),
            })
            .unwrap();

        let has = entries.iter().find(|e| e.name == "has-ralph").unwrap();
        assert!(has.has_ralph_yml);

        let no = entries.iter().find(|e| e.name == "no-ralph").unwrap();
        assert!(!no.has_ralph_yml);
    }

    #[test]
    fn browse_hides_dotfiles() {
        let (tmp, registry) = setup();
        let base = tmp.path().join("dotfile-test");
        fs::create_dir(&base).unwrap();
        fs::create_dir(base.join(".hidden")).unwrap();
        fs::create_dir(base.join("visible")).unwrap();

        let entries = registry
            .browse(ProjectBrowseParams {
                path: base.to_string_lossy().to_string(),
            })
            .unwrap();

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "visible");
    }

    #[test]
    fn browse_rejects_invalid_path() {
        let (_tmp, registry) = setup();
        let result = registry.browse(ProjectBrowseParams {
            path: "/nonexistent/xyz".to_string(),
        });
        assert!(result.is_err());
    }
}
