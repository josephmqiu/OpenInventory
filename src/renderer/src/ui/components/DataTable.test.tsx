import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "../../test/renderWithI18n";
import { DataTable, type ColumnDef, type SortState } from "./DataTable";

interface TestRow {
  id: string;
  name: string;
  value: number;
}

const rows: TestRow[] = [
  { id: "1", name: "Alpha", value: 10 },
  { id: "2", name: "Beta", value: 20 },
  { id: "3", name: "Gamma", value: 30 },
];

const columns: ColumnDef<TestRow>[] = [
  { key: "name", header: "Name", width: "60%", render: (r) => r.name },
  { key: "value", header: "Value", width: "40%", className: "cell-mono", render: (r) => r.value },
];

afterEach(cleanup);

describe("DataTable", () => {
  it("renders columns and rows", () => {
    renderWithI18n(
      <DataTable columns={columns} data={rows} rowKey={(r) => r.id} />,
    );

    expect(screen.getByText("Name")).toBeTruthy();
    expect(screen.getByText("Value")).toBeTruthy();
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
    expect(screen.getByText("Gamma")).toBeTruthy();
    expect(screen.getByText("10")).toBeTruthy();
  });

  it("renders empty state when data is empty", () => {
    renderWithI18n(
      <DataTable
        columns={columns}
        data={[]}
        rowKey={(r) => r.id}
        emptyTitle="No items found"
        emptyHint="Add some items to get started."
      />,
    );

    expect(screen.getByText("No items found")).toBeTruthy();
    expect(screen.getByText("Add some items to get started.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("renders loading state", () => {
    renderWithI18n(
      <DataTable
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        loading
        loadingMessage="Fetching data..."
      />,
    );

    expect(screen.getByText("Fetching data...")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("applies custom cell renderer", () => {
    const customColumns: ColumnDef<TestRow>[] = [
      {
        key: "name",
        header: "Name",
        render: (r) => <strong data-testid="strong-name">{r.name}</strong>,
      },
    ];

    renderWithI18n(
      <DataTable columns={customColumns} data={rows} rowKey={(r) => r.id} />,
    );

    const strongElements = screen.getAllByTestId("strong-name");
    expect(strongElements).toHaveLength(3);
    expect(strongElements[0].textContent).toBe("Alpha");
  });

  it("calls onRowClick when row is clicked", () => {
    const onRowClick = vi.fn();

    renderWithI18n(
      <DataTable
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        onRowClick={onRowClick}
      />,
    );

    fireEvent.click(screen.getByText("Beta"));
    expect(onRowClick).toHaveBeenCalledWith(rows[1]);
  });

  it("applies rowClassName callback", () => {
    const { container } = renderWithI18n(
      <DataTable
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        rowClassName={(r) => (r.value > 15 ? "row-highlight" : "")}
      />,
    );

    const trs = container.querySelectorAll("tbody tr");
    expect(trs[0].className).toBe("");
    expect(trs[1].className).toBe("row-highlight");
    expect(trs[2].className).toBe("row-highlight");
  });

  it("renders selection checkboxes", () => {
    const onToggle = vi.fn();
    const onToggleAll = vi.fn();

    renderWithI18n(
      <DataTable
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        selection={{
          selectedIds: ["1"],
          onToggle,
          onToggleAll,
          getId: (r) => r.id,
          allSelected: false,
        }}
      />,
    );

    const checkboxes = screen.getAllByRole("checkbox");
    // 1 header checkbox + 3 row checkboxes
    expect(checkboxes).toHaveLength(4);

    // First row should be checked
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(true);
    // Second row should not be checked
    expect((checkboxes[2] as HTMLInputElement).checked).toBe(false);
  });

  it("calls selection.onToggle when row checkbox is clicked", () => {
    const onToggle = vi.fn();
    const onToggleAll = vi.fn();

    renderWithI18n(
      <DataTable
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        selection={{
          selectedIds: [],
          onToggle,
          onToggleAll,
          getId: (r) => r.id,
          allSelected: false,
        }}
      />,
    );

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[2]); // Click second row checkbox
    expect(onToggle).toHaveBeenCalledWith("2");
  });

  it("calls selection.onToggleAll when header checkbox is clicked", () => {
    const onToggle = vi.fn();
    const onToggleAll = vi.fn();

    renderWithI18n(
      <DataTable
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        selection={{
          selectedIds: [],
          onToggle,
          onToggleAll,
          getId: (r) => r.id,
          allSelected: false,
        }}
      />,
    );

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]); // Header checkbox
    expect(onToggleAll).toHaveBeenCalled();
  });

  it("checkbox click does not trigger onRowClick", () => {
    const onRowClick = vi.fn();
    const onToggle = vi.fn();

    renderWithI18n(
      <DataTable
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        onRowClick={onRowClick}
        selection={{
          selectedIds: [],
          onToggle,
          onToggleAll: vi.fn(),
          getId: (r) => r.id,
          allSelected: false,
        }}
      />,
    );

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]); // Click first row checkbox
    expect(onToggle).toHaveBeenCalled();
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("applies column className to td elements", () => {
    const { container } = renderWithI18n(
      <DataTable columns={columns} data={rows} rowKey={(r) => r.id} />,
    );

    const valueCells = container.querySelectorAll("td.cell-mono");
    expect(valueCells).toHaveLength(3);
  });

  it("renders colgroup with widths", () => {
    const { container } = renderWithI18n(
      <DataTable columns={columns} data={rows} rowKey={(r) => r.id} />,
    );

    const cols = container.querySelectorAll("colgroup col");
    expect(cols).toHaveLength(2);
    expect((cols[0] as HTMLElement).style.width).toBe("60%");
    expect((cols[1] as HTMLElement).style.width).toBe("40%");
  });

  it("does not render table when data is empty and emptyTitle is provided", () => {
    renderWithI18n(
      <DataTable
        columns={columns}
        data={[]}
        rowKey={(r) => r.id}
        emptyTitle="Nothing here"
      />,
    );

    expect(screen.queryByRole("table")).toBeNull();
  });

  it("renders empty table when data is empty and no emptyTitle", () => {
    const { container } = renderWithI18n(
      <DataTable columns={columns} data={[]} rowKey={(r) => r.id} />,
    );

    // Should render the table structure with no rows
    expect(container.querySelector("table")).toBeTruthy();
    expect(container.querySelectorAll("tbody tr")).toHaveLength(0);
  });
});

describe("DataTable sorting", () => {
  const sortableColumns: ColumnDef<TestRow>[] = [
    { key: "name", header: "Name", sortable: true, sortKey: "name", render: (r) => r.name },
    { key: "value", header: "Value", sortable: true, sortKey: "value", render: (r) => r.value },
    { key: "id", header: "ID", render: (r) => r.id },
  ];

  it("renders sortable column headers as buttons", () => {
    renderWithI18n(
      <DataTable
        columns={sortableColumns}
        data={rows}
        rowKey={(r) => r.id}
        sortState={null}
        onSortChange={vi.fn()}
      />,
    );

    const nameHeader = screen.getByRole("columnheader", { name: /Name/i });
    expect(nameHeader.querySelector("button")).toBeTruthy();
    expect(nameHeader.classList.contains("th-sortable")).toBe(true);

    // Non-sortable column should not have a button
    const idHeader = screen.getByRole("columnheader", { name: /ID/i });
    expect(idHeader.querySelector("button")).toBeNull();
  });

  it("shows correct sort indicator for ascending", () => {
    const { container } = renderWithI18n(
      <DataTable
        columns={sortableColumns}
        data={rows}
        rowKey={(r) => r.id}
        sortState={{ key: "name", dir: "asc" }}
        onSortChange={vi.fn()}
      />,
    );

    const nameHeader = container.querySelector("th.th-sortable");
    expect(nameHeader?.getAttribute("aria-sort")).toBe("ascending");
    expect(nameHeader?.querySelector(".sort-indicator--active")?.textContent).toBe("▲");
  });

  it("shows correct sort indicator for descending", () => {
    const { container } = renderWithI18n(
      <DataTable
        columns={sortableColumns}
        data={rows}
        rowKey={(r) => r.id}
        sortState={{ key: "name", dir: "desc" }}
        onSortChange={vi.fn()}
      />,
    );

    const nameHeader = container.querySelector("th.th-sortable");
    expect(nameHeader?.getAttribute("aria-sort")).toBe("descending");
    expect(nameHeader?.querySelector(".sort-indicator--active")?.textContent).toBe("▼");
  });

  it("shows neutral indicator for unsorted columns", () => {
    const { container } = renderWithI18n(
      <DataTable
        columns={sortableColumns}
        data={rows}
        rowKey={(r) => r.id}
        sortState={{ key: "value", dir: "asc" }}
        onSortChange={vi.fn()}
      />,
    );

    // Name column is not the active sort
    const headers = container.querySelectorAll("th.th-sortable");
    const nameHeader = headers[0];
    expect(nameHeader.getAttribute("aria-sort")).toBe("none");
    expect(nameHeader.querySelector(".sort-indicator--active")).toBeNull();
  });

  it("calls onSortChange with asc when clicking unsorted column", () => {
    const onSortChange = vi.fn();
    renderWithI18n(
      <DataTable
        columns={sortableColumns}
        data={rows}
        rowKey={(r) => r.id}
        sortState={null}
        onSortChange={onSortChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Name/i }));
    expect(onSortChange).toHaveBeenCalledWith({ key: "name", dir: "asc" });
  });

  it("toggles asc to desc when clicking same column", () => {
    const onSortChange = vi.fn();
    renderWithI18n(
      <DataTable
        columns={sortableColumns}
        data={rows}
        rowKey={(r) => r.id}
        sortState={{ key: "name", dir: "asc" }}
        onSortChange={onSortChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Name/i }));
    expect(onSortChange).toHaveBeenCalledWith({ key: "name", dir: "desc" });
  });

  it("clears sort when clicking desc column (full cycle)", () => {
    const onSortChange = vi.fn();
    renderWithI18n(
      <DataTable
        columns={sortableColumns}
        data={rows}
        rowKey={(r) => r.id}
        sortState={{ key: "name", dir: "desc" }}
        onSortChange={onSortChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Name/i }));
    expect(onSortChange).toHaveBeenCalledWith(null);
  });

  it("switches to new column when clicking different column", () => {
    const onSortChange = vi.fn();
    renderWithI18n(
      <DataTable
        columns={sortableColumns}
        data={rows}
        rowKey={(r) => r.id}
        sortState={{ key: "name", dir: "asc" }}
        onSortChange={onSortChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Value/i }));
    expect(onSortChange).toHaveBeenCalledWith({ key: "value", dir: "asc" });
  });

  it("renders as before when no sort props are provided (backwards compat)", () => {
    renderWithI18n(
      <DataTable columns={sortableColumns} data={rows} rowKey={(r) => r.id} />,
    );

    // Sortable columns should NOT render as buttons when onSortChange is missing
    const headers = document.querySelectorAll("th");
    headers.forEach((h) => {
      expect(h.classList.contains("th-sortable")).toBe(false);
    });
  });

  it("sort header click does not trigger onRowClick", () => {
    const onRowClick = vi.fn();
    const onSortChange = vi.fn();
    renderWithI18n(
      <DataTable
        columns={sortableColumns}
        data={rows}
        rowKey={(r) => r.id}
        onRowClick={onRowClick}
        sortState={null}
        onSortChange={onSortChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Name/i }));
    expect(onSortChange).toHaveBeenCalled();
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("sort and selection checkboxes don't interfere", () => {
    const onSortChange = vi.fn();
    const onToggle = vi.fn();

    renderWithI18n(
      <DataTable
        columns={sortableColumns}
        data={rows}
        rowKey={(r) => r.id}
        sortState={null}
        onSortChange={onSortChange}
        selection={{
          selectedIds: [],
          onToggle,
          onToggleAll: vi.fn(),
          getId: (r) => r.id,
          allSelected: false,
        }}
      />,
    );

    // Click sort header
    fireEvent.click(screen.getByRole("button", { name: /Name/i }));
    expect(onSortChange).toHaveBeenCalled();
    expect(onToggle).not.toHaveBeenCalled();

    // Click checkbox
    onSortChange.mockClear();
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]);
    expect(onToggle).toHaveBeenCalled();
    expect(onSortChange).not.toHaveBeenCalled();
  });
});
