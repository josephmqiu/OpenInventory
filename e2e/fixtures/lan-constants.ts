/**
 * Single source of truth for the LAN E2E ports and access keys.
 *
 * These were previously hand-synced in two places — `e2e/scripts/generate-seeds.ts`
 * (which writes them into each seeded DB so the app boots its LAN server on the
 * right port/key) and the individual specs (which fetch against that port/key).
 * A drift between the two surfaces as a confusing 401/connection-refused. Import
 * from here on both sides instead.
 *
 * Ports are unique PER SCENARIO so concurrent Playwright projects never collide,
 * regardless of worker count. `RESILIENCE_CONFLICT_PORT` is the odd one out: it is
 * NOT a seeded LAN port — lan-resilience binds it from the test to simulate an
 * occupied port — so it must stay distinct from every seeded port above.
 */
export const LAN_SCENARIOS = {
  "lan-access": { port: 19877, accessKey: "e2e-lan-access-key-2026" },
  "no-personnel-lan": { port: 19878, accessKey: "e2e-no-personnel-key-2026" },
  "lan-mobile": { port: 19879, accessKey: "e2e-mobile-access-key-2026" },
  "lan-qr": { port: 19880, accessKey: "e2e-qr-access-key-2026" },
  "lan-warning": { port: 19881, accessKey: "e2e-lan-warning-key-2026" },
} as const satisfies Record<string, { port: number; accessKey: string }>;

export type LanScenario = keyof typeof LAN_SCENARIOS;

/** Port lan-resilience binds itself to verify the occupied-port error state.
 *  Kept separate from the seeded ports so it can never clash with a real server. */
export const RESILIENCE_CONFLICT_PORT = 19883;

export function lanBaseUrl(scenario: LanScenario): string {
  return `http://127.0.0.1:${LAN_SCENARIOS[scenario].port}`;
}
