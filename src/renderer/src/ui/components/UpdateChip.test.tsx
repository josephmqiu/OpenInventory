import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "../../test/renderWithI18n";
import { UpdateChip } from "./UpdateChip";

afterEach(cleanup);

describe("UpdateChip", () => {
  it("renders the ready label and restart action", () => {
    renderWithI18n(<UpdateChip onRestart={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText("Update ready")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Restart" })).toBeTruthy();
  });

  it("calls onRestart when Restart is clicked", () => {
    const onRestart = vi.fn();
    renderWithI18n(<UpdateChip onRestart={onRestart} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it("calls onDismiss when the dismiss button is clicked", () => {
    const onDismiss = vi.fn();
    renderWithI18n(<UpdateChip onRestart={vi.fn()} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss until next launch" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
