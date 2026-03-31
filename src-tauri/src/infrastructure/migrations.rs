use rusqlite::{params, Connection, Transaction};

use crate::domain::error::{AppError, AppResult};

struct Migration {
    version: i64,
    apply: fn(&Transaction<'_>) -> AppResult<()>,
}

const MIGRATIONS: &[Migration] = &[Migration {
    version: 1,
    apply: baseline_migration,
}];

fn database_error<E: std::fmt::Display>(error: E) -> AppError {
    AppError::DatabaseError(error.to_string())
}

pub fn run_pending_migrations(connection: &mut Connection) -> AppResult<()> {
    ensure_migrations_table(connection)?;
    let current_version = current_version(connection)?;

    for migration in MIGRATIONS
        .iter()
        .filter(|migration| migration.version > current_version)
    {
        let transaction = connection.transaction().map_err(database_error)?;
        (migration.apply)(&transaction)?;
        transaction
            .execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, datetime('now', 'localtime'))",
                params![migration.version],
            )
            .map_err(database_error)?;
        transaction.commit().map_err(database_error)?;
    }

    Ok(())
}

fn ensure_migrations_table(connection: &Connection) -> AppResult<()> {
    connection
        .execute(
            r#"
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL
            )
            "#,
            [],
        )
        .map_err(database_error)?;
    Ok(())
}

fn current_version(connection: &Connection) -> AppResult<i64> {
    connection
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )
        .map_err(database_error)
}

fn baseline_migration(_transaction: &Transaction<'_>) -> AppResult<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::schema;
    use rusqlite::OptionalExtension;
    use std::fs;
    use std::path::PathBuf;
    use std::process;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestDb {
        root_dir: PathBuf,
        db_path: PathBuf,
    }

    impl TestDb {
        fn connection(&self) -> Connection {
            let connection = Connection::open(&self.db_path).expect("open test database");
            connection
                .execute_batch("PRAGMA foreign_keys = ON;")
                .expect("enable foreign keys");
            connection
        }
    }

    impl Drop for TestDb {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root_dir);
        }
    }

    fn setup_test_db() -> TestDb {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let root_dir = std::env::temp_dir().join(format!(
            "open-inventory-migrations-tests-{}-{}",
            process::id(),
            stamp
        ));
        fs::create_dir_all(&root_dir).expect("create test directory");

        TestDb {
            db_path: root_dir.join("inventory-monitor.db"),
            root_dir,
        }
    }

    fn bootstrap_schema(connection: &Connection) {
        connection
            .execute_batch(schema::schema_sql())
            .expect("apply schema");
    }

    #[test]
    fn migrations_run_on_fresh_database() {
        let test_db = setup_test_db();
        let mut connection = test_db.connection();
        bootstrap_schema(&connection);

        run_pending_migrations(&mut connection).expect("run migrations");

        let applied_version = current_version(&connection).expect("read version");
        assert_eq!(applied_version, 1);
    }

    #[test]
    fn migrations_skip_already_applied_versions() {
        let test_db = setup_test_db();
        let mut connection = test_db.connection();
        bootstrap_schema(&connection);

        run_pending_migrations(&mut connection).expect("run migrations first time");
        run_pending_migrations(&mut connection).expect("run migrations second time");

        let applied_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| row.get(0))
            .expect("count migrations");
        assert_eq!(applied_count, 1);
    }

    #[test]
    fn migration_version_tracking_defaults_to_zero_until_applied() {
        let test_db = setup_test_db();
        let mut connection = test_db.connection();
        bootstrap_schema(&connection);

        ensure_migrations_table(&connection).expect("create migrations table");
        assert_eq!(current_version(&connection).expect("read empty version"), 0);

        run_pending_migrations(&mut connection).expect("run migrations");

        let applied_at: Option<String> = connection
            .query_row(
                "SELECT applied_at FROM schema_migrations WHERE version = 1",
                [],
                |row| row.get(0),
            )
            .optional()
            .expect("query applied row");
        assert!(applied_at.is_some());
        assert_eq!(current_version(&connection).expect("read applied version"), 1);
    }
}
