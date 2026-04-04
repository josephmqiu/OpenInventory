export interface LanSnapshot {
  items: Array<{
    id: string;
    name: string;
    currentQuantity: number;
  }>;
  personnel: Array<{
    id: string;
    name: string;
  }>;
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForLanReady(
  baseUrl: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const intervalMs = opts.intervalMs ?? 250;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.status < 500) {
        return;
      }
      lastError = new Error(`LAN health check returned ${response.status}.`);
    } catch (error) {
      lastError = error;
    }

    await delay(intervalMs);
  }

  throw new Error(
    `LAN server at ${baseUrl} did not become ready within ${timeoutMs}ms.${lastError ? ` Last error: ${String(lastError)}` : ""}`,
  );
}

export async function fetchLanSnapshot(
  baseUrl: string,
  accessKey: string,
): Promise<LanSnapshot> {
  await waitForLanReady(baseUrl);
  const response = await fetch(`${baseUrl}/api/snapshot`, {
    headers: { "x-inventory-key": accessKey },
  });

  if (!response.ok) {
    throw new Error(`Unable to load LAN snapshot (${response.status}).`);
  }

  return response.json() as Promise<LanSnapshot>;
}

export async function getLanItemIdByName(
  baseUrl: string,
  accessKey: string,
  itemName: string,
): Promise<string> {
  const snapshot = await fetchLanSnapshot(baseUrl, accessKey);
  const item = snapshot.items.find((entry) => entry.name === itemName);
  if (!item) {
    throw new Error(`LAN snapshot does not contain item "${itemName}".`);
  }
  return item.id;
}
