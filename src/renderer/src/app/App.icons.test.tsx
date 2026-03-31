import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock runtime to return "http" so the disconnect button shows
const runtimeMocks = vi.hoisted(() => ({
  detectRuntime: vi.fn().mockReturnValue("http"),
  isDevPreviewRuntime: vi.fn().mockReturnValue(true),
  readIssueRouteItemId: vi.fn().mockReturnValue(null),
}));

const gatewayMocks = vi.hoisted(() => ({
  loadAppSnapshot: vi.fn().mockResolvedValue({
    items: [],
    alerts: [],
    personnel: [],
    backupPlan: {
      targetPath: "",
      targetType: "local_folder",
      schedule: "",
      retention: "",
      lastSuccessfulBackup: "",
      nextScheduledBackup: "",
      status: "warning",
    },
    language: "en",
  }),
  readPersistedLanguage: vi.fn().mockReturnValue("en"),
  readPersistedLanAccessKey: vi.fn().mockReturnValue("test-key"),
  persistLanAccessKey: vi.fn(),
  clearLanAccessKey: vi.fn(),
  isUnauthorizedError: vi.fn().mockReturnValue(false),
  // Stub all other gateway functions so the module mock is complete
  addPersonnel: vi.fn(),
  backupNow: vi.fn(),
  batchIssueMaterial: vi.fn(),
  createInventoryItem: vi.fn(),
  issueMaterial: vi.fn(),
  issueMaterialPublic: vi.fn(),
  loadLanAccessState: vi.fn(),
  loadPublicIssueContext: vi.fn(),
  receiveStock: vi.fn(),
  regenerateLanAccessKey: vi.fn(),
  removeInventoryItem: vi.fn(),
  removePersonnel: vi.fn(),
  updateAppLanguage: vi.fn(),
  updateBackupPlan: vi.fn(),
  updateInventoryItem: vi.fn(),
  updateLanAccess: vi.fn(),
  getItemMovements: vi.fn(),
  getAuditMovements: vi.fn(),
  getAuditAnalytics: vi.fn(),
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  installUpdate: vi.fn(),
  onAutoUpdateStatus: vi.fn().mockReturnValue(() => {}),
}));

vi.mock("./runtime", () => runtimeMocks);
vi.mock("../services/inventoryGateway", () => gatewayMocks);
vi.mock("./useAutoUpdate", () => ({
  useAutoUpdate: () => ({ stage: "idle" as const }),
}));

import { App } from "./App";

// Provide a minimal localStorage stub for the theme persistence code
const store: Record<string, string> = {};
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = val; },
    removeItem: (key: string) => { delete store[key]; },
  },
  writable: true,
});

// Mock matchMedia for theme detection
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  })),
});

afterEach(() => {
  cleanup();
});

describe("Lucide React icons in App shell", () => {
  it("renders PanelLeft icon in sidebar toggle", async () => {
    render(<App />);
    const toggle = await screen.findByRole("button", { name: /collapse sidebar/i });
    expect(toggle).toBeDefined();
    // Lucide renders an <svg> element inside the button
    const svg = toggle.querySelector("svg");
    expect(svg).not.toBeNull();
  });

  it("renders LogOut icon in disconnect button", async () => {
    render(<App />);
    const disconnect = await screen.findByRole("button", { name: /disconnect/i });
    expect(disconnect).toBeDefined();
    const svg = disconnect.querySelector("svg");
    expect(svg).not.toBeNull();
  });

  it("renders SunMoon icon in theme toggle (auto mode)", async () => {
    render(<App />);
    const themeBtn = await screen.findByRole("button", { name: /auto/i });
    expect(themeBtn).toBeDefined();
    const svg = themeBtn.querySelector("svg");
    expect(svg).not.toBeNull();
  });

  it("cycles theme icons: auto → light (Sun) → dark (Moon)", async () => {
    render(<App />);

    // Start in auto mode
    const autoBtn = await screen.findByRole("button", { name: /auto/i });
    expect(autoBtn.querySelector("svg")).not.toBeNull();

    // Click to go to light mode
    fireEvent.click(autoBtn);
    const lightBtn = await screen.findByRole("button", { name: /light/i });
    expect(lightBtn.querySelector("svg")).not.toBeNull();

    // Click to go to dark mode
    fireEvent.click(lightBtn);
    const darkBtn = await screen.findByRole("button", { name: /dark/i });
    expect(darkBtn.querySelector("svg")).not.toBeNull();
  });

  it("sidebar toggle collapses and shows PanelLeft icon in collapsed state", async () => {
    render(<App />);
    const toggle = await screen.findByRole("button", { name: /collapse sidebar/i });
    fireEvent.click(toggle);

    const expandBtn = await screen.findByRole("button", { name: /expand sidebar/i });
    expect(expandBtn).toBeDefined();
    const svg = expandBtn.querySelector("svg");
    expect(svg).not.toBeNull();
  });
});
