import { describe, expect, it } from "vitest";
import { i18nResources } from "./i18nResources";

function collectKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [prefix];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) =>
    collectKeys(nested, prefix ? `${prefix}.${key}` : key),
  );
}

describe("i18n resources", () => {
  it("keeps English and Chinese namespaces in parity", () => {
    const enKeys = collectKeys(i18nResources.en).sort();
    const zhKeys = collectKeys(i18nResources["zh-CN"]).sort();

    expect(zhKeys).toEqual(enKeys);
  });
});

