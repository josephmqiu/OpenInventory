import { afterEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { writeQrLabelFile, writeQrLabelFiles } from "../../src/main/qrLabelExportStorage";
import { ValidationError } from "../../src/main/domain/errors";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { force: true, recursive: true });
  }
});

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-qr-export-"));
  tempDirs.push(dir);
  return dir;
}

// Minimal valid 1x1 white pixel PNG (67 bytes), base64-encoded
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;

describe("decodePngDataUrl (via writeQrLabelFile)", () => {
  it("converts a valid data:image/png;base64 string to a PNG file", async () => {
    const tempDir = makeTempDir();
    const filePath = path.join(tempDir, "test-label.png");

    const outputPath = await writeQrLabelFile(filePath, {
      suggestedFileName: "test-label.png",
      pngDataUrl: TINY_PNG_DATA_URL,
    });

    expect(fs.existsSync(outputPath)).toBe(true);
    const written = fs.readFileSync(outputPath);
    // PNG magic bytes: 0x89 P N G
    expect(written[0]).toBe(0x89);
    expect(written[1]).toBe(0x50); // P
    expect(written[2]).toBe(0x4e); // N
    expect(written[3]).toBe(0x47); // G
  });

  it("rejects a non-PNG data URL", async () => {
    const tempDir = makeTempDir();
    const filePath = path.join(tempDir, "test.png");

    await expect(
      writeQrLabelFile(filePath, {
        suggestedFileName: "test.png",
        pngDataUrl: "data:image/jpeg;base64,/9j/4AAQ",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects an empty data URL string", async () => {
    const tempDir = makeTempDir();
    const filePath = path.join(tempDir, "test.png");

    await expect(
      writeQrLabelFile(filePath, {
        suggestedFileName: "test.png",
        pngDataUrl: "",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects a plain string that is not a data URL", async () => {
    const tempDir = makeTempDir();
    const filePath = path.join(tempDir, "test.png");

    await expect(
      writeQrLabelFile(filePath, {
        suggestedFileName: "test.png",
        pngDataUrl: "just some random text",
      }),
    ).rejects.toThrow(ValidationError);
  });
});

describe("writeQrLabelFile", () => {
  it("writes a PNG file to disk at the given path", async () => {
    const tempDir = makeTempDir();
    const filePath = path.join(tempDir, "output.png");

    const outputPath = await writeQrLabelFile(filePath, {
      suggestedFileName: "output.png",
      pngDataUrl: TINY_PNG_DATA_URL,
    });

    expect(outputPath).toBe(filePath);
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(fs.readFileSync(outputPath).length).toBeGreaterThan(0);
  });

  it("appends .png extension if missing", async () => {
    const tempDir = makeTempDir();
    const filePath = path.join(tempDir, "no-extension");

    const outputPath = await writeQrLabelFile(filePath, {
      suggestedFileName: "no-extension",
      pngDataUrl: TINY_PNG_DATA_URL,
    });

    expect(outputPath).toBe(`${filePath}.png`);
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  it("does not double .png when extension is already present", async () => {
    const tempDir = makeTempDir();
    const filePath = path.join(tempDir, "label.png");

    const outputPath = await writeQrLabelFile(filePath, {
      suggestedFileName: "label.png",
      pngDataUrl: TINY_PNG_DATA_URL,
    });

    expect(outputPath).toBe(filePath);
    expect(outputPath).not.toMatch(/\.png\.png$/);
  });
});

describe("writeQrLabelFiles", () => {
  it("writes multiple label files to a directory", async () => {
    const tempDir = makeTempDir();

    const savedPaths = await writeQrLabelFiles(tempDir, [
      { suggestedFileName: "label-a.png", pngDataUrl: TINY_PNG_DATA_URL },
      { suggestedFileName: "label-b.png", pngDataUrl: TINY_PNG_DATA_URL },
    ]);

    expect(savedPaths).toHaveLength(2);
    for (const p of savedPaths) {
      expect(fs.existsSync(p)).toBe(true);
    }
  });

  it("deduplicates filenames with numeric suffixes", async () => {
    const tempDir = makeTempDir();

    const savedPaths = await writeQrLabelFiles(tempDir, [
      { suggestedFileName: "same-name.png", pngDataUrl: TINY_PNG_DATA_URL },
      { suggestedFileName: "same-name.png", pngDataUrl: TINY_PNG_DATA_URL },
      { suggestedFileName: "same-name.png", pngDataUrl: TINY_PNG_DATA_URL },
    ]);

    expect(savedPaths).toHaveLength(3);

    // All paths should be unique
    const uniquePaths = new Set(savedPaths);
    expect(uniquePaths.size).toBe(3);

    // The second and third should have numeric suffixes
    const fileNames = savedPaths.map((p) => path.basename(p));
    expect(fileNames[0]).toBe("same-name.png");
    expect(fileNames[1]).toBe("same-name (2).png");
    expect(fileNames[2]).toBe("same-name (3).png");
  });

  it("deduplicates against existing files in the directory", async () => {
    const tempDir = makeTempDir();

    // Pre-create a file that will collide
    fs.writeFileSync(path.join(tempDir, "existing.png"), "placeholder");

    const savedPaths = await writeQrLabelFiles(tempDir, [
      { suggestedFileName: "existing.png", pngDataUrl: TINY_PNG_DATA_URL },
    ]);

    expect(savedPaths).toHaveLength(1);
    expect(path.basename(savedPaths[0])).toBe("existing (2).png");
  });

  it("handles an empty labels array", async () => {
    const tempDir = makeTempDir();

    const savedPaths = await writeQrLabelFiles(tempDir, []);

    expect(savedPaths).toEqual([]);
  });

  it("rejects batch with invalid data URL in any label", async () => {
    const tempDir = makeTempDir();

    await expect(
      writeQrLabelFiles(tempDir, [
        { suggestedFileName: "good.png", pngDataUrl: TINY_PNG_DATA_URL },
        { suggestedFileName: "bad.png", pngDataUrl: "not-a-data-url" },
      ]),
    ).rejects.toThrow(ValidationError);
  });
});
