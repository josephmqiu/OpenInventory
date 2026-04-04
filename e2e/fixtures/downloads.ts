import type { Page } from "@playwright/test";

export interface CapturedRendererDownload {
  download: string;
  text: string;
}

export async function installRendererDownloadCapture(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = globalThis as typeof globalThis & {
      __e2eRendererDownloadCapture?: {
        installed: boolean;
        blobs: Record<string, Blob>;
        last: CapturedRendererDownload | null;
      };
    };

    if (g.__e2eRendererDownloadCapture?.installed) {
      g.__e2eRendererDownloadCapture.last = null;
      g.__e2eRendererDownloadCapture.blobs = {};
      return;
    }

    const originalCreateObjectUrl = URL.createObjectURL.bind(URL);
    const originalRevokeObjectUrl = URL.revokeObjectURL.bind(URL);
    const originalClick = HTMLAnchorElement.prototype.click;

    g.__e2eRendererDownloadCapture = {
      installed: true,
      blobs: {},
      last: null,
    };

    URL.createObjectURL = ((blob: Blob) => {
      const url = originalCreateObjectUrl(blob);
      g.__e2eRendererDownloadCapture!.blobs[url] = blob;
      return url;
    }) as typeof URL.createObjectURL;

    URL.revokeObjectURL = ((url: string) => {
      if (g.__e2eRendererDownloadCapture?.blobs[url]) {
        delete g.__e2eRendererDownloadCapture.blobs[url];
        return;
      }
      originalRevokeObjectUrl(url);
    }) as typeof URL.revokeObjectURL;

    HTMLAnchorElement.prototype.click = function click() {
      const capture = g.__e2eRendererDownloadCapture;
      if (!capture) {
        originalClick.call(this);
        return;
      }

      const blob = capture.blobs[this.href];
      if (!blob) {
        originalClick.call(this);
        return;
      }

      void blob.text().then((text) => {
        capture.last = {
          download: this.download,
          text,
        };
      });
    };

  });
}

export async function readCapturedRendererDownload(
  page: Page,
): Promise<CapturedRendererDownload | null> {
  return page.evaluate(() => {
    const g = globalThis as typeof globalThis & {
      __e2eRendererDownloadCapture?: {
        last: CapturedRendererDownload | null;
      };
    };
    return g.__e2eRendererDownloadCapture?.last ?? null;
  });
}
