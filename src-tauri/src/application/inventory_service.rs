use crate::domain::models::{
    AddPersonnelInput, AppSnapshot, CreateInventoryItemInput, Language, PublicIssueContext,
    StockMutationInput, UpdateBackupPlanInput, UpdateInventoryItemInput,
};
use crate::infrastructure::db::{InventoryDb, MutationResult};

pub fn initialize(db: &InventoryDb) -> Result<(), String> {
    db.initialize()
}

pub fn load_snapshot(db: &InventoryDb) -> Result<AppSnapshot, String> {
    db.load_snapshot()
}

pub fn load_public_issue_context(db: &InventoryDb, item_id: &str) -> Result<PublicIssueContext, String> {
    let snapshot = db.load_snapshot()?;
    let AppSnapshot {
        items,
        personnel,
        language,
        ..
    } = snapshot;
    let item = items
        .into_iter()
        .find(|entry| entry.id == item_id)
        .ok_or_else(|| "Item not found.".to_string())?;

    Ok(PublicIssueContext {
        item,
        personnel,
        language,
    })
}

pub fn create_inventory_item(db: &InventoryDb, input: CreateInventoryItemInput) -> Result<MutationResult, String> {
    db.create_inventory_item(input)
}

pub fn update_inventory_item(db: &InventoryDb, input: UpdateInventoryItemInput) -> Result<MutationResult, String> {
    db.update_inventory_item(input)
}

pub fn receive_stock(db: &InventoryDb, input: StockMutationInput) -> Result<MutationResult, String> {
    db.receive_stock(input)
}

pub fn issue_material(db: &InventoryDb, input: StockMutationInput) -> Result<MutationResult, String> {
    db.issue_material(input)
}

pub fn issue_material_public(db: &InventoryDb, input: StockMutationInput) -> Result<PublicIssueContext, String> {
    let item_id = input.item_id.clone();
    let result = db.issue_material(input)?;
    let AppSnapshot {
        items,
        personnel,
        language,
        ..
    } = result.snapshot;
    let item = items
        .into_iter()
        .find(|entry| entry.id == item_id)
        .ok_or_else(|| "Item not found after issuing material.".to_string())?;

    Ok(PublicIssueContext {
        item,
        personnel,
        language,
    })
}

pub fn update_backup_plan(db: &InventoryDb, input: UpdateBackupPlanInput) -> Result<AppSnapshot, String> {
    db.update_backup_plan(input)
}

pub fn update_language(db: &InventoryDb, language: Language) -> Result<(), String> {
    db.update_language(language)
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
