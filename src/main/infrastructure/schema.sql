-- Pragmas are set by configureSqlitePragmas() in sqlite-pragmas.ts.

CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS locations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory_items (
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

CREATE TABLE IF NOT EXISTS inventory_movements (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    movement_type TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    previous_quantity INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL,
    reason TEXT,
    reference_no TEXT,
    notes TEXT,
    performed_by TEXT,
    performed_at TEXT NOT NULL,
    FOREIGN KEY(item_id) REFERENCES inventory_items(id)
);

CREATE TABLE IF NOT EXISTS low_stock_alerts (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    threshold_quantity INTEGER NOT NULL,
    quantity_at_trigger INTEGER NOT NULL,
    status TEXT NOT NULL,
    triggered_at TEXT NOT NULL,
    resolved_at TEXT,
    FOREIGN KEY(item_id) REFERENCES inventory_items(id)
);

CREATE TABLE IF NOT EXISTS personnel (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_name ON inventory_items(name);
CREATE INDEX IF NOT EXISTS idx_inventory_items_current_quantity ON inventory_items(current_quantity);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_item_date ON inventory_movements(item_id, performed_at);
CREATE INDEX IF NOT EXISTS idx_low_stock_alerts_item_status ON low_stock_alerts(item_id, status);
CREATE INDEX IF NOT EXISTS idx_personnel_name ON personnel(name);
