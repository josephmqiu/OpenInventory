use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::{backup::Backup, Connection};

use crate::domain::error::AppError;

fn database_error<E: std::fmt::Display>(error: E) -> AppError {
    AppError::DatabaseError(error.to_string())
}

pub fn backup_database(source_path: &Path, target_dir: &Path) -> Result<PathBuf, AppError> {
    fs::create_dir_all(target_dir).map_err(AppError::from)?;

    let source = Connection::open(source_path).map_err(database_error)?;
    source
        .execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(database_error)?;

    let timestamp: String = source
        .query_row(
            "SELECT strftime('%Y%m%d-%H%M%S', 'now', 'localtime')",
            [],
            |row| row.get(0),
        )
        .map_err(database_error)?;
    let target_path = target_dir.join(format!("inventory-monitor-{timestamp}.db"));
    let mut destination = Connection::open(&target_path).map_err(database_error)?;
    destination
        .execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(database_error)?;

    let backup = Backup::new(&source, &mut destination).map_err(database_error)?;
    backup.step(-1).map_err(database_error)?;

    Ok(target_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::schema;
    use std::process;
    use std::time::{SystemTime, UNIX_EPOCH};

    use rusqlite::OptionalExtension;

    struct TestPaths {
        root_dir: PathBuf,
        source_path: PathBuf,
        backup_dir: PathBuf,
    }

    impl Drop for TestPaths {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root_dir);
        }
    }

    fn setup_paths() -> TestPaths {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let root_dir = std::env::temp_dir().join(format!(
            "open-inventory-backup-tests-{}-{}",
            process::id(),
            stamp
        ));
        fs::create_dir_all(&root_dir).expect("create test directory");

        TestPaths {
            source_path: root_dir.join("inventory-monitor.db"),
            backup_dir: root_dir.join("backups"),
            root_dir,
        }
    }

    fn seed_database(source_path: &Path) {
        let connection = Connection::open(source_path).expect("open source database");
        connection
            .execute_batch(schema::schema_sql())
            .expect("apply schema");
        connection
            .execute(
                "INSERT INTO app_settings (key, value) VALUES (?1, ?2)",
                ["backup.target_path", "/tmp/backups"],
            )
            .expect("seed app setting");
    }

    #[test]
    fn backup_creates_valid_sqlite_file() {
        let paths = setup_paths();
        seed_database(&paths.source_path);

        let backup_path =
            backup_database(&paths.source_path, &paths.backup_dir).expect("create backup");

        assert!(backup_path.exists());

        let connection = Connection::open(&backup_path).expect("open backup database");
        let copied_value: Option<String> = connection
            .query_row(
                "SELECT value FROM app_settings WHERE key = ?1",
                ["backup.target_path"],
                |row| row.get(0),
            )
            .optional()
            .expect("query copied setting");
        assert_eq!(copied_value.as_deref(), Some("/tmp/backups"));
    }

    #[test]
    fn backup_fails_gracefully_when_target_path_is_invalid() {
        let paths = setup_paths();
        seed_database(&paths.source_path);
        fs::write(&paths.backup_dir, "not a directory").expect("create blocking file");

        let result = backup_database(&paths.source_path, &paths.backup_dir);

        assert!(result.is_err());
    }
}
