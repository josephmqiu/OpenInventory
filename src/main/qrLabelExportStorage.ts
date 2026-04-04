import { promises as fs } from "fs";
import path from "path";
import type { QrLabelExportPayload } from "../shared/types";
import { makeUniqueQrLabelFileName, normalizeQrLabelFileName } from "../shared/qrLabelExport";
import { IoError, ValidationError, validationError } from "./domain/errors";

function decodePngDataUrl(pngDataUrl: string): Buffer {
  const match = pngDataUrl.match(/^data:image\/png;base64,(.+)$/s);
  if (!match) {
    throw validationError("invalidQrPngPayload");
  }

  try {
    return Buffer.from(match[1], "base64");
  } catch {
    throw validationError("invalidQrPngPayload");
  }
}

function ensurePngExtension(filePath: string): string {
  return filePath.toLowerCase().endsWith(".png")
    ? filePath
    : `${filePath}.png`;
}

export async function writeQrLabelFile(
  filePath: string,
  label: QrLabelExportPayload,
): Promise<string> {
  const outputPath = ensurePngExtension(filePath);

  try {
    await fs.writeFile(outputPath, decodePngDataUrl(label.pngDataUrl));
    return outputPath;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    throw new IoError({
      messageId: "exportQrLabelFailed",
      debugMessage: `Unable to export QR label: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

export async function writeQrLabelFiles(
  directoryPath: string,
  labels: QrLabelExportPayload[],
): Promise<string[]> {
  try {
    const existingEntries = await fs.readdir(directoryPath, { withFileTypes: true });
    const usedNames = new Set(
      existingEntries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name.toLowerCase()),
    );
    const savedPaths: string[] = [];

    for (const label of labels) {
      const fileName = makeUniqueQrLabelFileName(
        normalizeQrLabelFileName(label.suggestedFileName),
        usedNames,
      );
      const outputPath = path.join(directoryPath, fileName);
      await fs.writeFile(outputPath, decodePngDataUrl(label.pngDataUrl));
      usedNames.add(fileName.toLowerCase());
      savedPaths.push(outputPath);
    }

    return savedPaths;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    throw new IoError({
      messageId: "exportSelectedQrsFailed",
      debugMessage: `Unable to export QR labels: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
