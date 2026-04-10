import { basename, extname } from "node:path";
import type { WorkspaceItemKind } from "../../shared/contracts/notes";

export const MARKDOWN_EXTENSION = ".md";
const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".svg",
]);

export function getWorkspaceItemKind(filePath: string): WorkspaceItemKind {
  const extension = extname(filePath).toLowerCase();
  if (extension === MARKDOWN_EXTENSION) {
    return "note";
  }
  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }
  return "file";
}

export function assertReadableTextFile(bytes: Uint8Array, maxBytes: number): void {
  if (bytes.length > maxBytes) {
    throw new Error(`Text file exceeds ${maxBytes} bytes and cannot be opened in the editor.`);
  }
  if (bytes.indexOf(0) >= 0) {
    throw new Error("This file appears to be binary and cannot be opened in the text editor.");
  }
}

export function deriveWorkspaceItemTitle(filePath: string): string {
  const extension = extname(filePath);
  return basename(filePath, extension);
}
