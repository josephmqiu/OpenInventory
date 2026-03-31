use rusqlite::{params, Connection, Transaction};

use crate::domain::error::{AppError, AppResult};

struct Migration {
    version: i64,
    apply: fn(&Transaction<'_>) -> AppResult<()>,
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        apply: baseline_migration,
    },
    Migration {
        version: 2,
        apply: drop_dead_columns,
    },
];

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

/// Migration 2: Remove dead columns that were dropped from schema.sql but still
/// exist in databases created before the cleanup. SQLite does not support DROP COLUMN
/// before version 3.35.0, so we recreate the affected tables.
fn drop_dead_columns(transaction: &Transaction<'_>) -> AppResult<()> {
    // Check if inventory_items still has the old min_quantity column.
    // If it doesn't, this database was created after the cleanup and we can skip.
    let has_dead_columns: bool = transaction
        .query_row(
            "SELECT COUNT(*) > 0 FROM pragma_table_info('inventory_items') WHERE name = 'min_quantity'",
            [],
            |row| row.get(0),
        )
        .map_err(database_error)?;

    if !has_dead_columns {
        return Ok(());
    }

    // Recreate inventory_items without dead columns (min_quantity, description, cost_per_unit)
    transaction
        .execute_batch(
            r#"
            CREATE TABLE inventory_items_new (
                id TEXT PRIMARY KEY,
                sku TEXT NOT NULL UNIQUE,
                barcode TEXT,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                location_id TEXT,
                supplier_id TEXT,
                unit_of_measure TEXT NOT NULL,
                reorder_quantity INTEGER NOT NULL,
                current_quantity INTEGER NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(location_id) REFERENCES locations(id),
                FOREIGN KEY(supplier_id) REFERENCES suppliers(id)
            );

            INSERT INTO inventory_items_new
                SELECT id, sku, barcode, name, category, location_id, supplier_id,
                       unit_of_measure, reorder_quantity, current_quantity, status,
                       created_at, updated_at
                FROM inventory_items;

            DROP TABLE inventory_items;
            ALTER TABLE inventory_items_new RENAME TO inventory_items;

            CREATE INDEX IF NOT EXISTS idx_inventory_items_name ON inventory_items(name);
            CREATE INDEX IF NOT EXISTS idx_inventory_items_current_quantity ON inventory_items(current_quantity);
            "#,
        )
        .map_err(database_error)?;

    // Recreate suppliers without dead columns (contact_name, phone, email)
    let has_supplier_dead_columns: bool = transaction
        .query_row(
            "SELECT COUNT(*) > 0 FROM pragma_table_info('suppliers') WHERE name = 'contact_name'",
            [],
            |row| row.get(0),
        )
        .map_err(database_error)?;

    if has_supplier_dead_columns {
        transaction
            .execute_batch(
                r#"
                CREATE TABLE suppliers_new (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                INSERT INTO suppliers_new SELECT id, name, created_at, updated_at FROM suppliers;

                DROP TABLE suppliers;
                ALTER TABLE suppliers_new RENAME TO suppliers;
                "#,
            )
            .map_err(database_error)?;
    }

    // Recreate low_stock_alerts without dead columns (acknowledged_by, acknowledged_at)
    let has_alert_dead_columns: bool = transaction
        .query_row(
            "SELECT COUNT(*) > 0 FROM pragma_table_info('low_stock_alerts') WHERE name = 'acknowledged_by'",
            [],
            |row| row.get(0),
        )
        .map_err(database_error)?;

    if has_alert_dead_columns {
        transaction
            .execute_batch(
                r#"
                CREATE TABLE low_stock_alerts_new (
                    id TEXT PRIMARY KEY,
                    item_id TEXT NOT NULL,
                    threshold_quantity INTEGER NOT NULL,
                    quantity_at_trigger INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    triggered_at TEXT NOT NULL,
                    resolved_at TEXT,
                    channel_summary TEXT,
                    FOREIGN KEY(item_id) REFERENCES inventory_items(id)
                );

                INSERT INTO low_stock_alerts_new
                    SELECT id, item_id, threshold_quantity, quantity_at_trigger,
                           status, triggered_at, resolved_at, channel_summary
                    FROM low_stock_alerts;

                DROP TABLE low_stock_alerts;
                ALTER TABLE low_stock_alerts_new RENAME TO low_stock_alerts;

                CREATE INDEX IF NOT EXISTS idx_low_stock_alerts_item_status ON low_stock_alerts(item_id, status);
                "#,
            )
            .map_err(database_error)?;
    }

    // Drop audit_logs if it exists
    transaction
        .execute_batch("DROP TABLE IF EXISTS audit_logs;")
        .map_err(database_error)?;

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
        assert_eq!(applied_version, 2);
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
        assert_eq!(applied_count, 2);
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
        assert_eq!(current_version(&connection).expect("read applied version"), 2);
    }
}
