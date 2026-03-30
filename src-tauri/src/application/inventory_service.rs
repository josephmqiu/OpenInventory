use crate::domain::models::{
    AddPersonnelInput, AppSnapshot, CreateInventoryItemInput, CreateRefillOrderInput,
    StockMutationInput,
};
use crate::infrastructure::db::{InventoryDb, MutationResult};

pub fn initialize(db: &InventoryDb) -> Result<(), String> {
    db.initialize()
}

pub fn load_snapshot(db: &InventoryDb) -> Result<AppSnapshot, String> {
    db.load_snapshot()
}

pub fn create_inventory_item(db: &InventoryDb, input: CreateInventoryItemInput) -> Result<MutationResult, String> {
    db.create_inventory_item(input)
}

pub fn receive_stock(db: &InventoryDb, input: StockMutationInput) -> Result<MutationResult, String> {
    db.receive_stock(input)
}

pub fn issue_material(db: &InventoryDb, input: StockMutationInput) -> Result<MutationResult, String> {
    db.issue_material(input)
}

pub fn create_refill_order(db: &InventoryDb, input: CreateRefillOrderInput) -> Result<AppSnapshot, String> {
    db.create_refill_order(input)
}

pub fn remove_inventory_item(db: &InventoryDb, item_id: String) -> Result<AppSnapshot, String> {
    db.remove_inventory_item(item_id)
}

pub fn add_personnel(db: &InventoryDb, input: AddPersonnelInput) -> Result<AppSnapshot, String> {
    db.add_personnel(input)
}

pub fn remove_personnel(db: &InventoryDb, personnel_id: String) -> Result<AppSnapshot, String> {
    db.remove_personnel(personnel_id)
}
