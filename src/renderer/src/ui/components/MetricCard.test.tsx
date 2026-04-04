import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "../../test/renderWithI18n";
import { MetricCard } from "./MetricCard";

afterEach(cleanup);

describe("MetricCard", () => {
  it("renders label and value", () => {
    renderWithI18n(<MetricCard label="Total Items" value={42} />);

    expect(screen.getByText("Total Items")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
  });

  it("renders string values", () => {
    renderWithI18n(<MetricCard label="Received" value="120 units" />);

    expect(screen.getByText("Received")).toBeTruthy();
    expect(screen.getByText("120 units")).toBeTruthy();
  });

  it("applies tone class", () => {
    const { container } = renderWithI18n(
      <MetricCard label="Low Stock" value={3} tone="warning" />,
    );

    const card = container.querySelector(".metric-card");
    expect(card?.className).toContain("metric-card--warning");
  });

  it("applies danger tone class", () => {
    const { container } = renderWithI18n(
      <MetricCard label="Out of Stock" value={1} tone="danger" />,
    );

    const card = container.querySelector(".metric-card");
    expect(card?.className).toContain("metric-card--danger");
  });

  it("applies default tone class when tone is omitted", () => {
    const { container } = renderWithI18n(
      <MetricCard label="Total" value={10} />,
    );

    const card = container.querySelector(".metric-card");
    expect(card?.className).toContain("metric-card--default");
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    renderWithI18n(<MetricCard label="Total Items" value={5} onClick={onClick} />);

    fireEvent.click(screen.getByText("Total Items"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("has role=button and is focusable when onClick is provided", () => {
    const onClick = vi.fn();
    const { container } = renderWithI18n(
      <MetricCard label="Total Items" value={5} onClick={onClick} />,
    );

    const card = container.querySelector(".metric-card");
    expect(card?.getAttribute("role")).toBe("button");
    expect(card?.getAttribute("tabindex")).toBe("0");
    expect(card?.className).toContain("metric-card--clickable");
  });

  it("does not have role=button when onClick is absent", () => {
    const { container } = renderWithI18n(
      <MetricCard label="Total Items" value={5} />,
    );

    const card = container.querySelector(".metric-card");
    expect(card?.getAttribute("role")).toBeNull();
    expect(card?.getAttribute("tabindex")).toBeNull();
    expect(card?.className).not.toContain("metric-card--clickable");
  });

  it("triggers onClick on Enter key", () => {
    const onClick = vi.fn();
    const { container } = renderWithI18n(
      <MetricCard label="Total Items" value={5} onClick={onClick} />,
    );

    const card = container.querySelector(".metric-card")!;
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("triggers onClick on Space key", () => {
    const onClick = vi.fn();
    const { container } = renderWithI18n(
      <MetricCard label="Total Items" value={5} onClick={onClick} />,
    );

    const card = container.querySelector(".metric-card")!;
    fireEvent.keyDown(card, { key: " " });
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not trigger onClick on other keys", () => {
    const onClick = vi.fn();
    const { container } = renderWithI18n(
      <MetricCard label="Total Items" value={5} onClick={onClick} />,
    );

    const card = container.querySelector(".metric-card")!;
    fireEvent.keyDown(card, { key: "Tab" });
    expect(onClick).not.toHaveBeenCalled();
  });

  it("has aria-label matching the label when clickable", () => {
    const { container } = renderWithI18n(
      <MetricCard label="Low Stock" value={3} onClick={vi.fn()} />,
    );

    const card = container.querySelector(".metric-card");
    expect(card?.getAttribute("aria-label")).toBe("Low Stock");
  });
});
