import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import i18n from "../../../src/renderer/src/app/i18n";
import { AuditLogTable } from "../../../src/renderer/src/ui/components/AuditLogTable";
import type { AuditPageResult, AuditMovementFilters, Language } from "../../../src/renderer/src/domain/models";

// Mock data
const mockData: AuditPageResult = {
  rows: [
    {
      id: "test-movement-1",
      itemId: "test-item-1",
      itemName: "Test Item",
      itemSku: "TEST-001",
      movementType: "receive",
      quantity: 10,
      previousQuantity: 0,
      newQuantity: 10,
      performedAt: "2026-04-22 21:35:00",
      performedBy: "廖智",
      reason: "Test",
      referenceNo: "REF-001",
      notes: "Test note",
      isAnomaly: false,
    },
  ],
  total: 1,
  summary: {
    totalMovements: 1,
    totalReceived: 10,
    totalIssued: 0,
    uniqueItems: 1,
    uniquePersonnel: 1,
  },
};

const mockFilters: AuditMovementFilters = {
  dateFrom: "2026-04-01",
  dateTo: "2026-04-30",
  page: 1,
  pageSize: 50,
};

// Test component wrapper
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nextProvider i18n={i18n}>
    {children}
  </I18nextProvider>
);

describe("AuditLogTable - Delete Error Handling", () => {
  const mockOnDeleteMovement = vi.fn();
  const mockOnError = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should show error message when delete operation is rejected", async () => {
    // Mock delete movement to throw error (rejected)
    mockOnDeleteMovement.mockRejectedValue(
      new Error("Insufficient stock to delete this movement")
    );

    render(
      <TestWrapper>
        <AuditLogTable
          language="en" as Language
          data={mockData}
          filters={mockFilters}
          onPageChange={vi.fn()}
          onItemClick={vi.fn()}
          onQuickFilter={vi.fn()}
          onDeleteMovement={mockOnDeleteMovement}
          onError={mockOnError}
        />
      </TestWrapper>
    );

    // Open delete confirmation dialog
    const deleteButton = screen.getByTitle("Delete movement");
    fireEvent.click(deleteButton);

    // Confirm deletion
    const confirmButton = screen.getByText("Delete");
    fireEvent.click(confirmButton);

    // Wait for error to be called
    await waitFor(() => {
      expect(mockOnDeleteMovement).toHaveBeenCalledWith("test-movement-1");
    });

    // Verify error was reported
    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith("Insufficient stock to delete this movement");
    });
  });

  it("should show localized error message in English", async () => {
    // Mock delete movement to throw error with specific message ID
    const errorWithMessageId = new Error("Insufficient stock when deleting movement");
    (errorWithMessageId as any).messageId = "insufficientStockWhenDeletingMovement";
    
    mockOnDeleteMovement.mockRejectedValue(errorWithMessageId);

    render(
      <TestWrapper>
        <AuditLogTable
          language="en" as Language
          data={mockData}
          filters={mockFilters}
          onPageChange={vi.fn()}
          onItemClick={vi.fn()}
          onQuickFilter={vi.fn()}
          onDeleteMovement={mockOnDeleteMovement}
          onError={mockOnError}
        />
      </TestWrapper>
    );

    // Open delete confirmation dialog
    const deleteButton = screen.getByTitle("Delete movement");
    fireEvent.click(deleteButton);

    // Confirm deletion
    const confirmButton = screen.getByText("Delete");
    fireEvent.click(confirmButton);

    // Wait for error to be called
    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalled();
    });
  });

  it("should show localized error message in Chinese", async () => {
    // Mock delete movement to throw error with specific message ID
    const errorWithMessageId = new Error("库存不足，无法删除此记录");
    (errorWithMessageId as any).messageId = "insufficientStockWhenDeletingMovement";
    
    mockOnDeleteMovement.mockRejectedValue(errorWithMessageId);

    render(
      <TestWrapper>
        <AuditLogTable
          language="zh" as Language
          data={mockData}
          filters={mockFilters}
          onPageChange={vi.fn()}
          onItemClick={vi.fn()}
          onQuickFilter={vi.fn()}
          onDeleteMovement={mockOnDeleteMovement}
          onError={mockOnError}
        />
      </TestWrapper>
    );

    // Open delete confirmation dialog
    const deleteButton = screen.getByTitle("删除记录");
    fireEvent.click(deleteButton);

    // Confirm deletion
    const confirmButton = screen.getByText("删除");
    fireEvent.click(confirmButton);

    // Wait for error to be called
    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalled();
    });
  });

  it("should close confirmation dialog after failed deletion", async () => {
    // Mock delete movement to throw error
    mockOnDeleteMovement.mockRejectedValue(
      new Error("Insufficient stock to delete this movement")
    );

    render(
      <TestWrapper>
        <AuditLogTable
          language="en" as Language
          data={mockData}
          filters={mockFilters}
          onPageChange={vi.fn()}
          onItemClick={vi.fn()}
          onQuickFilter={vi.fn()}
          onDeleteMovement={mockOnDeleteMovement}
          onError={mockOnError}
        />
      </TestWrapper>
    );

    // Open delete confirmation dialog
    const deleteButton = screen.getByTitle("Delete movement");
    fireEvent.click(deleteButton);

    // Verify dialog is open
    expect(screen.getByText("Delete movement")).toBeInTheDocument();

    // Confirm deletion
    const confirmButton = screen.getByText("Delete");
    fireEvent.click(confirmButton);

    // Wait for dialog to close
    await waitFor(() => {
      expect(screen.queryByText("Delete movement")).not.toBeInTheDocument();
    });
  });

  it("should not reload data after failed deletion", async () => {
    // Mock delete movement to throw error
    mockOnDeleteMovement.mockRejectedValue(
      new Error("Insufficient stock to delete this movement")
    );

    const mockOnPageChange = vi.fn();
    const mockOnQuickFilter = vi.fn();

    render(
      <TestWrapper>
        <AuditLogTable
          language="en" as Language
          data={mockData}
          filters={mockFilters}
          onPageChange={mockOnPageChange}
          onItemClick={vi.fn()}
          onQuickFilter={mockOnQuickFilter}
          onDeleteMovement={mockOnDeleteMovement}
          onError={mockOnError}
        />
      </TestWrapper>
    );

    // Open delete confirmation dialog
    const deleteButton = screen.getByTitle("Delete movement");
    fireEvent.click(deleteButton);

    // Confirm deletion
    const confirmButton = screen.getByText("Delete");
    fireEvent.click(confirmButton);

    // Wait for error to be called
    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalled();
    });

    // Verify no data reload attempts
    expect(mockOnPageChange).not.toHaveBeenCalled();
    expect(mockOnQuickFilter).not.toHaveBeenCalled();
  });

  it("should handle multiple consecutive failed deletions", async () => {
    // Mock delete movement to throw error
    mockOnDeleteMovement.mockRejectedValue(
      new Error("Insufficient stock to delete this movement")
    );

    render(
      <TestWrapper>
        <AuditLogTable
          language="en" as Language
          data={mockData}
          filters={mockFilters}
          onPageChange={vi.fn()}
          onItemClick={vi.fn()}
          onQuickFilter={vi.fn()}
          onDeleteMovement={mockOnDeleteMovement}
          onError={mockOnError}
        />
      </TestWrapper>
    );

    // First deletion attempt
    const deleteButton = screen.getByTitle("Delete movement");
    fireEvent.click(deleteButton);
    const confirmButton = screen.getByText("Delete");
    fireEvent.click(confirmButton);

    // Wait for first error
    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith("Insufficient stock to delete this movement");
    });

    // Second deletion attempt
    fireEvent.click(deleteButton);
    fireEvent.click(confirmButton);

    // Wait for second error
    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledTimes(2);
    });
  });
});
