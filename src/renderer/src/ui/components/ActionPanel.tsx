import { useEffect, useMemo, useRef, useState } from "react";
import { formatNumber } from "../../app/formatters";
import { localizeCategory, localizeUnit } from "../../app/i18n";
import { useTT } from "../hooks/useTT";
import type {
  ActionKind,
  CreateInventoryItemInput,
  InventoryItem,
  Language,
  PersonnelMember,
  StockMutationInput,
  UpdateInventoryItemInput,
} from "../../domain/models";

interface ActionPanelProps {
  action: ActionKind | null;
  activeItemId: string;
  busy: boolean;
  language: Language;
  items: InventoryItem[];
  personnel: PersonnelMember[];
  onClose: () => void;
  onCreateItem: (input: CreateInventoryItemInput) => Promise<void>;
  onUpdateItem: (input: UpdateInventoryItemInput) => Promise<void>;
  onReceiveStock: (input: StockMutationInput) => Promise<void>;
  onIssueMaterial: (input: StockMutationInput) => Promise<void>;
  onRemoveItem: (itemId: string) => Promise<void>;
  onError: (message: string) => void;
  onNavigateToPersonnel?: () => void;
}

const NEW_CATEGORY_VALUE = "__new__";
const NEW_UNIT_VALUE = "__new_unit__";

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function FieldLabel({ label, required, optionalText }: { label: string; required?: boolean; optionalText?: string }) {
  return (
    <span>
      {label}
      {required ? <strong className="field-indicator field-indicator--required"> *</strong> : null}
      {optionalText ? <em className="field-indicator field-indicator--optional"> ({optionalText})</em> : null}
    </span>
  );
}

const ACTION_TITLE_FALLBACKS: Record<Exclude<ActionKind, null>, string> = {
  createItem: "Create Inventory Item",
  modifyItem: "Modify Inventory Item",
  receiveStock: "Receive Stock",
  issueMaterial: "Issue Material",
  removeItem: "Remove Inventory Item",
};

const ACTION_HINT_FALLBACKS: Record<Exclude<ActionKind, null>, string> = {
  createItem: "Register a new inventory record with on-hand quantity and reorder thresholds.",
  modifyItem: "Update item master data without changing the on-hand quantity.",
  receiveStock: "Add materials into inventory and refresh the current quantity immediately.",
  issueMaterial: "Remove materials from inventory and evaluate low-stock alerts.",
  removeItem: "Remove an item and its related operational records from the inventory database.",
};

export function ActionPanel({
  action,
  activeItemId,
  busy,
  language,
  items,
  personnel,
  onClose,
  onCreateItem,
  onUpdateItem,
  onReceiveStock,
  onIssueMaterial,
  onRemoveItem,
  onError,
  onNavigateToPersonnel,
}: ActionPanelProps) {
  const tt = useTT();

  const [itemForm, setItemForm] = useState<CreateInventoryItemInput>({
    sku: "",
    name: "",
    category: "",
    location: "",
    unit: "",
    supplier: "",
    reorderQuantity: 0,
    initialQuantity: 0,
  });
  const [categoryMode, setCategoryMode] = useState<string>(NEW_CATEGORY_VALUE);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [unitMode, setUnitMode] = useState<string>(NEW_UNIT_VALUE);
  const [newUnitName, setNewUnitName] = useState("");
  const [stockForm, setStockForm] = useState<StockMutationInput>({
    itemId: "",
    quantity: 0,
    reason: "",
    performedBy: "",
  });
  const [removeItemId, setRemoveItemId] = useState("");

  const categoryOptions = useMemo(() => {
    const existing = items.map((item) => item.category.trim()).filter((value) => value.length > 0);
    return Array.from(new Set(existing)).sort((left, right) => left.localeCompare(right));
  }, [items]);

  const unitOptions = useMemo(() => {
    const existing = items.map((item) => item.unit.trim()).filter((v) => v.length > 0);
    return Array.from(new Set(existing)).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const selectedManagedItem = useMemo(() => items.find((item) => item.id === activeItemId) ?? null, [activeItemId, items]);
  const selectedStockItem = useMemo(() => items.find((item) => item.id === stockForm.itemId) ?? null, [items, stockForm.itemId]);
  const selectedRemoveItem = useMemo(() => items.find((item) => item.id === removeItemId) ?? null, [items, removeItemId]);

  // Keep refs to polling-refreshed data so the form-reset effect can read the latest values
  // without re-triggering on every background snapshot refresh.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const personnelRef = useRef(personnel);
  personnelRef.current = personnel;
  const categoryOptionsRef = useRef(categoryOptions);
  categoryOptionsRef.current = categoryOptions;
  const unitOptionsRef = useRef(unitOptions);
  unitOptionsRef.current = unitOptions;

  useEffect(() => {
    const currentItems = itemsRef.current;
    const currentPersonnel = personnelRef.current;
    const currentCategoryOptions = categoryOptionsRef.current;
    const currentUnitOptions = unitOptionsRef.current;
    const firstCategory = currentCategoryOptions[0] ?? "";
    const firstUnit = currentUnitOptions[0] ?? "";
    const preferredItemId = activeItemId || currentItems[0]?.id || "";
    const preferredPersonnel = currentPersonnel[0]?.name ?? "";
    const managedItem = currentItems.find((item) => item.id === activeItemId) ?? null;
    const initialCategory = managedItem?.category ?? firstCategory;
    const nextCategoryMode = currentCategoryOptions.includes(initialCategory) ? initialCategory : NEW_CATEGORY_VALUE;
    const initialUnit = managedItem?.unit ?? firstUnit;
    const nextUnitMode = currentUnitOptions.includes(initialUnit) ? initialUnit : NEW_UNIT_VALUE;

    setCategoryMode(nextCategoryMode);
    setNewCategoryName(nextCategoryMode === NEW_CATEGORY_VALUE ? initialCategory : "");
    setUnitMode(nextUnitMode);
    setNewUnitName(nextUnitMode === NEW_UNIT_VALUE ? initialUnit : "");
    setStockForm({ itemId: preferredItemId, quantity: 0, reason: "", performedBy: preferredPersonnel });
    setRemoveItemId(preferredItemId);
    setItemForm(
      managedItem
        ? {
            sku: managedItem.sku,
            name: managedItem.name,
            category: managedItem.category,
            location: managedItem.location,
            unit: managedItem.unit,
            supplier: managedItem.supplier,
            reorderQuantity: managedItem.reorderQuantity,
            initialQuantity: managedItem.currentQuantity,
          }
        : {
            sku: "",
            name: "",
            category: firstCategory,
            location: "",
            unit: firstUnit,
            supplier: "",
            reorderQuantity: 0,
            initialQuantity: 0,
          },
    );
  }, [action, activeItemId, items, personnel]);

  if (!action) {
    return null;
  }

  const requiresExistingItems = action === "modifyItem" || action === "receiveStock" || action === "issueMaterial" || action === "removeItem";
  const requiresPersonnel = action === "receiveStock" || action === "issueMaterial";
  const hasItems = items.length > 0;
  const hasPersonnel = personnel.length > 0;

  const handleCategoryChange = (value: string) => {
    setCategoryMode(value);
    if (value === NEW_CATEGORY_VALUE) {
      setItemForm({ ...itemForm, category: "" });
      return;
    }
    setNewCategoryName("");
    setItemForm({ ...itemForm, category: value });
  };

  const handleUnitChange = (value: string) => {
    setUnitMode(value);
    if (value === NEW_UNIT_VALUE) {
      setItemForm({ ...itemForm, unit: "" });
      return;
    }
    setNewUnitName("");
    setItemForm({ ...itemForm, unit: value });
  };

  const handleSubmit = async () => {
    try {
      if (action === "createItem" || action === "modifyItem") {
        const categoryValue = categoryMode === NEW_CATEGORY_VALUE ? newCategoryName.trim() : itemForm.category.trim();
        const unitValue = unitMode === NEW_UNIT_VALUE ? newUnitName.trim() : itemForm.unit.trim();
        if (
          !itemForm.name.trim() ||
          !categoryValue ||
          !itemForm.location.trim() ||
          !unitValue ||
          itemForm.reorderQuantity < 0 ||
          (action === "createItem" && itemForm.initialQuantity < 0)
        ) {
          throw new Error(tt("formValidationError", "Check the required fields and quantity values."));
        }

        if (action === "createItem") {
          await onCreateItem({
            ...itemForm,
            category: categoryValue,
            unit: unitValue,
          });
          return;
        }

        if (!selectedManagedItem) {
          throw new Error(tt("formValidationError", "Check the required fields and quantity values."));
        }

        await onUpdateItem({
          itemId: selectedManagedItem.id,
          sku: itemForm.sku,
          name: itemForm.name,
          category: categoryValue,
          location: itemForm.location,
          unit: unitValue,
          supplier: itemForm.supplier,
          reorderQuantity: itemForm.reorderQuantity,
        });
        return;
      }

      if (!hasItems) {
        throw new Error(tt("noInventoryItems", "No inventory records yet."));
      }

      if (requiresPersonnel && !hasPersonnel) {
        throw new Error(tt("personnelRequiredHint", "Add at least one personnel record before receiving or issuing stock."));
      }

      if (action === "receiveStock") {
        if (!stockForm.itemId || stockForm.quantity <= 0 || !stockForm.performedBy) {
          throw new Error(tt("formValidationError", "Check the required fields and quantity values."));
        }
        await onReceiveStock(stockForm);
        return;
      }

      if (action === "issueMaterial") {
        if (!stockForm.itemId || stockForm.quantity <= 0 || !stockForm.performedBy) {
          throw new Error(tt("formValidationError", "Check the required fields and quantity values."));
        }
        await onIssueMaterial(stockForm);
        return;
      }

      if (!removeItemId) {
        throw new Error(tt("formValidationError", "Check the required fields and quantity values."));
      }
      await onRemoveItem(removeItemId);
    } catch (error) {
      onError(toErrorMessage(error, tt("formValidationError", "Check the required fields and quantity values.")));
    }
  };

  const submitDisabled = busy || (requiresPersonnel && !hasPersonnel);
  const itemFormMode = action === "createItem" || action === "modifyItem";

  return (
    <section className="panel action-panel">
      <div className="panel__header">
        <div>
          <h2>{tt(`actionPanelTitle.${action}`, ACTION_TITLE_FALLBACKS[action])}</h2>
          <p>{tt(`actionPanelHint.${action}`, ACTION_HINT_FALLBACKS[action])}</p>
        </div>
        <button className="button-secondary" onClick={onClose} type="button">
          {tt("cancel", "Cancel")}
        </button>
      </div>

      {requiresExistingItems && !hasItems ? (
        <div className="empty-state">
          <h3>{tt("noInventoryItems", "No inventory records yet.")}</h3>
          <p>{tt("noInventoryItemsHint", "Create the first item to start tracking on-hand quantity and low-stock rules.")}</p>
        </div>
      ) : (
        <>
          {itemFormMode && (
            <div className="form-grid">
              <label>
                <FieldLabel label={tt("sku", "SKU")} optionalText={tt("autoGeneratedIfBlank", "Auto-generated if blank")} />
                <input disabled={busy} placeholder={tt("autoGeneratedIfBlank", "Auto-generated if blank")} value={itemForm.sku} onChange={(event) => setItemForm({ ...itemForm, sku: event.target.value })} />
              </label>
              <label>
                <FieldLabel label={tt("itemName", "Item Name")} required />
                <input disabled={busy} required value={itemForm.name} onChange={(event) => setItemForm({ ...itemForm, name: event.target.value })} onKeyDown={(e) => { if (e.key === "Enter" && !busy) { e.preventDefault(); void handleSubmit(); } }} />
              </label>
              <div className="category-group">
                {categoryOptions.length > 0 ? (
                  <>
                    <label>
                      <FieldLabel label={tt("category", "Category")} required />
                      <select disabled={busy} required value={categoryMode} onChange={(event) => handleCategoryChange(event.target.value)}>
                        {categoryOptions.map((category) => (
                          <option key={category} value={category}>
                            {localizeCategory(category, language)}
                          </option>
                        ))}
                        <option value={NEW_CATEGORY_VALUE}>{tt("addNewCategory", "Add New Category")}</option>
                      </select>
                    </label>
                    {categoryMode === NEW_CATEGORY_VALUE && (
                      <label>
                        <FieldLabel label={tt("newCategoryName", "New Category Name")} required />
                        <input disabled={busy} required value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} />
                      </label>
                    )}
                  </>
                ) : (
                  <label>
                    <FieldLabel label={tt("category", "Category")} required />
                    <input disabled={busy} required value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} />
                  </label>
                )}
              </div>
              <label>
                <FieldLabel label={tt("location", "Location")} required />
                <input disabled={busy} required value={itemForm.location} onChange={(event) => setItemForm({ ...itemForm, location: event.target.value })} onKeyDown={(e) => { if (e.key === "Enter" && !busy) { e.preventDefault(); void handleSubmit(); } }} />
              </label>
              <div className="unit-group">
                {unitOptions.length > 0 ? (
                  <>
                    <label>
                      <FieldLabel label={tt("unit", "Unit")} required />
                      <select disabled={busy} required value={unitMode} onChange={(event) => handleUnitChange(event.target.value)}>
                        {unitOptions.map((u) => (
                          <option key={u} value={u}>
                            {localizeUnit(u, language)}
                          </option>
                        ))}
                        <option value={NEW_UNIT_VALUE}>{tt("addNewUnit", "Add New Unit")}</option>
                      </select>
                    </label>
                    {unitMode === NEW_UNIT_VALUE && (
                      <label>
                        <FieldLabel label={tt("newUnitName", "New Unit Name")} required />
                        <input disabled={busy} required value={newUnitName} onChange={(event) => setNewUnitName(event.target.value)} />
                      </label>
                    )}
                  </>
                ) : (
                  <label>
                    <FieldLabel label={tt("unit", "Unit")} required />
                    <input disabled={busy} required value={newUnitName} onChange={(event) => setNewUnitName(event.target.value)} />
                  </label>
                )}
              </div>
              <label>
                <FieldLabel label={tt("supplier", "Supplier")} optionalText={tt("optionalField", "Optional")} />
                <input disabled={busy} value={itemForm.supplier} onChange={(event) => setItemForm({ ...itemForm, supplier: event.target.value })} />
              </label>
              <label>
                <FieldLabel label={tt("reorderLevel", "Reorder Level")} required />
                <input disabled={busy} required inputMode="numeric" pattern="[0-9]*" type="text" value={itemForm.reorderQuantity} onChange={(event) => {
                  const value = event.target.value;
                  const numValue = value === "" ? 0 : Number(value);
                  if (!isNaN(numValue)) {
                    setItemForm({ ...itemForm, reorderQuantity: numValue });
                  }
                }} onKeyDown={(e) => { if (e.key === "Enter" && !busy) { e.preventDefault(); void handleSubmit(); } }} />
              </label>
              {action === "createItem" ? (
                <label>
                  <FieldLabel label={tt("initialQuantity", "Initial Quantity")} required />
                  <input disabled={busy} required inputMode="numeric" pattern="[0-9]*" type="text" value={itemForm.initialQuantity} onChange={(event) => {
                    const value = event.target.value;
                    const numValue = value === "" ? 0 : Number(value);
                    if (!isNaN(numValue)) {
                      setItemForm({ ...itemForm, initialQuantity: numValue });
                    }
                  }} onKeyDown={(e) => { if (e.key === "Enter" && !busy) { e.preventDefault(); void handleSubmit(); } }} />
                </label>
              ) : selectedManagedItem ? (
                <div className="form-summary">
                  <strong>{selectedManagedItem.name}</strong>
                  <span>
                    {tt("currentQuantity", "Current Quantity")}: {formatNumber(selectedManagedItem.currentQuantity, language)} {localizeUnit(selectedManagedItem.unit, language)}
                  </span>
                  <span>{tt("currentQuantityManagedHint", "Current quantity is managed through Receive Stock and Issue Material, not through item editing.")}</span>
                </div>
              ) : null}
            </div>
          )}

          {(action === "receiveStock" || action === "issueMaterial") && (
            <div className="form-grid">
              {!hasPersonnel && (
                <div className="form-summary form-summary--warning">
                  <strong>{tt("personnel", "Personnel")}</strong>
                  <span>{tt("personnelRequiredHint", "Add at least one personnel record before receiving or issuing stock.")}</span>
                  {onNavigateToPersonnel && (
                    <button className="button-secondary button-inline" onClick={onNavigateToPersonnel} type="button" style={{ marginTop: 8 }}>
                      {tt("goToPersonnel", "Go to Settings \u2192 Personnel")}
                    </button>
                  )}
                </div>
              )}
              <label>
                <FieldLabel label={tt("selectItem", "Select Item")} required />
                <select disabled={busy} value={stockForm.itemId} onChange={(event) => setStockForm({ ...stockForm, itemId: event.target.value })}>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.sku} - {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <FieldLabel label={tt("quantity", "Quantity")} required />
                <input disabled={busy} inputMode="numeric" pattern="[0-9]*" type="text" value={stockForm.quantity} onChange={(event) => {
                  const value = event.target.value;
                  const numValue = value === "" ? 0 : Number(value);
                  if (!isNaN(numValue)) {
                    setStockForm({ ...stockForm, quantity: numValue });
                  }
                }} onKeyDown={(e) => { if (e.key === "Enter" && !busy) { e.preventDefault(); void handleSubmit(); } }} />
              </label>
              <label>
                <FieldLabel label={tt("reason", "Reason")} />
                <input disabled={busy} value={stockForm.reason} onChange={(event) => setStockForm({ ...stockForm, reason: event.target.value })} onKeyDown={(e) => { if (e.key === "Enter" && !busy) { e.preventDefault(); void handleSubmit(); } }} />
              </label>
              <label>
                <FieldLabel label={tt("performedBy", "Performed By")} required />
                <select disabled={busy} value={stockForm.performedBy} onChange={(event) => setStockForm({ ...stockForm, performedBy: event.target.value })}>
                  <option value="">{tt("selectPersonnel", "Select Personnel")}</option>
                  {personnel.map((member) => (
                    <option key={member.id} value={member.name}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
              {selectedStockItem && (
                <div className="form-summary">
                  <strong>{selectedStockItem.name}</strong>
                  <span>
                    {tt("currentQuantity", "Current Quantity")}: {formatNumber(selectedStockItem.currentQuantity, language)} {localizeUnit(selectedStockItem.unit, language)}
                  </span>
                  <span>
                    {tt("reorderLevel", "Reorder Level")}: {formatNumber(selectedStockItem.reorderQuantity, language)}
                  </span>
                </div>
              )}
            </div>
          )}

          {action === "removeItem" && (
            <div className="form-grid">
              <label>
                <FieldLabel label={tt("selectItemToRemove", "Select Item To Remove")} required />
                <select disabled={busy} value={removeItemId} onChange={(event) => setRemoveItemId(event.target.value)}>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.sku} - {item.name}
                    </option>
                  ))}
                </select>
              </label>
              {selectedRemoveItem && (
                <div className="form-summary form-summary--danger">
                  <strong>{selectedRemoveItem.name}</strong>
                  <span>
                    {tt("currentQuantity", "Current Quantity")}: {formatNumber(selectedRemoveItem.currentQuantity, language)} {localizeUnit(selectedRemoveItem.unit, language)}
                  </span>
                  <span>
                    {tt("reorderLevel", "Reorder Level")}: {formatNumber(selectedRemoveItem.reorderQuantity, language)}
                  </span>
                  <span>{tt("deleteItemWarning", "This permanently removes the item from inventory management.")}</span>
                  <span>{tt("deleteItemImpact", "Related stock movements and alerts for this item will also be removed.")}</span>
                </div>
              )}
            </div>
          )}

          <div className="action-panel__footer">
            <button
              className={action === "removeItem" ? "button-danger" : undefined}
              data-testid="action-submit"
              onClick={() => void handleSubmit()}
              disabled={submitDisabled}
              type="button"
            >
              {busy
                ? `${tt("save", "Save")}...`
                : action === "removeItem"
                  ? tt("removeItem", "Remove Item")
                  : action === "modifyItem"
                    ? tt("modifyItem", "Modify Item")
                    : tt("save", "Save")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
