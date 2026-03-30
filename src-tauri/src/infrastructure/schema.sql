PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    contact_name TEXT,
    phone TEXT,
    email TEXT,
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
    description TEXT,
    category TEXT NOT NULL,
    location_id TEXT,
    supplier_id TEXT,
    unit_of_measure TEXT NOT NULL,
    min_quantity INTEGER NOT NULL,
    reorder_quantity INTEGER NOT NULL,
    current_quantity INTEGER NOT NULL,
    cost_per_unit REAL,
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
    acknowledged_by TEXT,
    acknowledged_at TEXT,
    resolved_at TEXT,
    channel_summary TEXT,
    FOREIGN KEY(item_id) REFERENCES inventory_items(id)
);

CREATE TABLE IF NOT EXISTS refill_orders (
    id TEXT PRIMARY KEY,
    order_no TEXT NOT NULL UNIQUE,
    supplier_id TEXT NOT NULL,
    order_date TEXT NOT NULL,
    expected_delivery_date TEXT,
    received_date TEXT,
    status TEXT NOT NULL,
    total_amount REAL NOT NULL,
    notes TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(supplier_id) REFERENCES suppliers(id)
);

CREATE TABLE IF NOT EXISTS refill_order_lines (
    id TEXT PRIMARY KEY,
    refill_order_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    ordered_quantity INTEGER NOT NULL,
    received_quantity INTEGER NOT NULL DEFAULT 0,
    unit_cost REAL NOT NULL,
    line_total REAL NOT NULL,
    FOREIGN KEY(refill_order_id) REFERENCES refill_orders(id),
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

CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    actor TEXT,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    payload_json TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_name ON inventory_items(name);
CREATE INDEX IF NOT EXISTS idx_inventory_items_current_quantity ON inventory_items(current_quantity);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_item_date ON inventory_movements(item_id, performed_at);
CREATE INDEX IF NOT EXISTS idx_low_stock_alerts_item_status ON low_stock_alerts(item_id, status);
CREATE INDEX IF NOT EXISTS idx_refill_orders_supplier_date ON refill_orders(supplier_id, order_date);
CREATE INDEX IF NOT EXISTS idx_refill_order_lines_order_item ON refill_order_lines(refill_order_id, item_id);
CREATE INDEX IF NOT EXISTS idx_personnel_name ON personnel(name);
