import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Effect } from "effect";
import { NotificationService, NotificationServiceLive } from "../../src/main/services/NotificationService";

const electronMocks = vi.hoisted(() => {
  const instances: Array<{ options: { title: string; body: string }; show: ReturnType<typeof vi.fn> }> = [];
  const isSupported = vi.fn();

  class MockNotification {
    static isSupported = isSupported;
    options: { title: string; body: string };
    show = vi.fn();

    constructor(options: { title: string; body: string }) {
      this.options = options;
      instances.push(this);
    }
  }

  return {
    MockNotification,
    instances,
    isSupported,
  };
});

vi.mock("electron", () => ({
  Notification: electronMocks.MockNotification,
}));

function runNotification() {
  return Effect.runPromise(
    Effect.flatMap(NotificationService, (service) =>
      service.sendLowStockAlert({
        itemName: "Bolts M6",
        sku: "SKU-001",
        currentQuantity: 4,
        thresholdQuantity: 10,
      }),
    ).pipe(Effect.provide(NotificationServiceLive)),
  );
}

beforeEach(() => {
  electronMocks.instances.length = 0;
  electronMocks.isSupported.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("NotificationService", () => {
  it("shows a low-stock desktop notification when supported", async () => {
    electronMocks.isSupported.mockReturnValue(true);

    await runNotification();

    expect(electronMocks.instances).toHaveLength(1);
    expect(electronMocks.instances[0].options).toEqual({
      title: "Low inventory alert",
      body: "Bolts M6 (SKU-001) is at 4 and has reached the reorder level of 10.",
    });
    expect(electronMocks.instances[0].show).toHaveBeenCalledOnce();
  });

  it("does nothing when desktop notifications are not supported", async () => {
    electronMocks.isSupported.mockReturnValue(false);

    await runNotification();

    expect(electronMocks.instances).toHaveLength(0);
  });
});
