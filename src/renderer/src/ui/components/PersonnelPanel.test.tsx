import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PersonnelMember } from "../../domain/models";
import { renderWithI18n } from "../../test/renderWithI18n";
import { PersonnelPanel } from "./PersonnelPanel";

const personnel: PersonnelMember[] = [
  { id: "p1", name: "Alice" },
  { id: "p2", name: "Bob" },
];

function renderPanel(overrides: Partial<React.ComponentProps<typeof PersonnelPanel>> = {}) {
  const props: React.ComponentProps<typeof PersonnelPanel> = {
    busy: false,
    personnel,
    onAddPersonnel: vi.fn().mockResolvedValue(undefined),
    onRemovePersonnel: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };

  renderWithI18n(<PersonnelPanel {...props} />);
  return props;
}

afterEach(cleanup);

describe("PersonnelPanel", () => {
  it("renders the personnel list", () => {
    renderPanel();

    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("Bob")).toBeTruthy();
  });

  it("shows empty state when personnel list is empty", () => {
    renderPanel({ personnel: [] });

    expect(screen.getByText("No personnel records yet.")).toBeTruthy();
    expect(screen.queryByText("Alice")).toBeNull();
  });

  it("submits new personnel when name is entered and button clicked", async () => {
    const props = renderPanel();

    const input = screen.getByPlaceholderText(/Enter name/);
    fireEvent.change(input, { target: { value: "Charlie" } });
    fireEvent.click(screen.getByText("Add Personnel"));

    await waitFor(() => {
      expect(props.onAddPersonnel).toHaveBeenCalledWith("Charlie");
    });
  });

  it("submits new personnel on Enter key", async () => {
    const props = renderPanel();

    const input = screen.getByPlaceholderText(/Enter name/);
    fireEvent.change(input, { target: { value: "Diana" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(props.onAddPersonnel).toHaveBeenCalledWith("Diana");
    });
  });

  it("trims whitespace from the name before submitting", async () => {
    const props = renderPanel();

    const input = screen.getByPlaceholderText(/Enter name/);
    fireEvent.change(input, { target: { value: "  Eve  " } });
    fireEvent.click(screen.getByText("Add Personnel"));

    await waitFor(() => {
      expect(props.onAddPersonnel).toHaveBeenCalledWith("Eve");
    });
  });

  it("disables the add button when name is empty", () => {
    renderPanel();

    const addButton = screen.getByText("Add Personnel") as HTMLButtonElement;
    expect(addButton.disabled).toBe(true);
  });

  it("disables the add button when busy", () => {
    renderPanel({ busy: true });

    const input = screen.getByPlaceholderText(/Enter name/);
    fireEvent.change(input, { target: { value: "Test" } });

    const addButton = screen.getByText("Add Personnel") as HTMLButtonElement;
    expect(addButton.disabled).toBe(true);
  });

  it("shows confirm/cancel buttons after clicking remove", () => {
    renderPanel();

    fireEvent.click(screen.getByTestId("personnel-remove-Alice"));

    expect(screen.getByTestId("personnel-confirm-Alice")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
  });

  it("calls onRemovePersonnel after confirm", async () => {
    const props = renderPanel();

    fireEvent.click(screen.getByTestId("personnel-remove-Alice"));
    fireEvent.click(screen.getByTestId("personnel-confirm-Alice"));

    await waitFor(() => {
      expect(props.onRemovePersonnel).toHaveBeenCalledWith("p1");
    });
  });

  it("cancels the removal when cancel is clicked", () => {
    const props = renderPanel();

    fireEvent.click(screen.getByTestId("personnel-remove-Bob"));
    expect(screen.getByTestId("personnel-confirm-Bob")).toBeTruthy();

    fireEvent.click(screen.getByText("Cancel"));

    // After cancel, the remove button should be visible again
    expect(screen.getByTestId("personnel-remove-Bob")).toBeTruthy();
    expect(props.onRemovePersonnel).not.toHaveBeenCalled();
  });

  it("does not show confirm for other personnel when one is clicked", () => {
    renderPanel();

    fireEvent.click(screen.getByTestId("personnel-remove-Alice"));

    // Alice should show confirm, Bob should still show remove
    expect(screen.getByTestId("personnel-confirm-Alice")).toBeTruthy();
    expect(screen.getByTestId("personnel-remove-Bob")).toBeTruthy();
  });
});
