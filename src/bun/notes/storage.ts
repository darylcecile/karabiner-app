import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, sep } from "node:path";
import { Utils } from "electrobun/bun";
import type {
  ImageAsset,
  NoteDocument,
  NoteSummary,
  WorkspaceTextFile,
  WorkspaceItem,
} from "../../shared/contracts/notes";
import { getDatabase, initializeDataLayer } from "../data/client";
import {
  assertReadableTextFile,
  deriveWorkspaceItemTitle,
  getWorkspaceItemKind,
  MARKDOWN_EXTENSION,
} from "./storage-utils";

const WORKSPACE_STATE_FILE = join(Utils.paths.userData, "workspace-state.json");
const MAX_RECENT_WORKSPACES = 10;
const MAX_TEXT_FILE_BYTES = 1024 * 1024;

type WorkspaceState = {
  lastOpenedFolder: string | null;
  recentFolders: string[];
};

let workspaceRoot: string | null = null;

export function getWorkspaceRoot(): string | null {
  return workspaceRoot;
}

export async function restoreWorkspaceRoot(): Promise<string | null> {
  if (workspaceRoot) {
    return workspaceRoot;
  }

  const state = await readWorkspaceState();
  const candidates = [
    ...(state.lastOpenedFolder ? [state.lastOpenedFolder] : []),
    ...state.recentFolders,
  ];
  for (const candidate of candidates) {
    if (await isExistingDirectory(candidate)) {
      workspaceRoot = candidate;
      return workspaceRoot;
    }
  }

  return null;
}

export async function setWorkspaceRoot(path: string): Promise<string> {
  const normalizedPath = path.trim();
  if (normalizedPath.length === 0) {
    throw new Error("Workspace folder path cannot be empty.");
  }
  await mkdir(normalizedPath, { recursive: true });
  workspaceRoot = normalizedPath;
  await persistWorkspaceRoot(normalizedPath);
  return workspaceRoot;
}

export async function listNotes(): Promise<NoteSummary[]> {
  const notesRoot = await ensureNotesRoot();
  const markdownPaths = await collectMarkdownFiles(notesRoot);
  const notes: NoteSummary[] = [];

  for (const filePath of markdownPaths) {
    const markdown = await readFile(filePath, "utf8");
    const fileStats = await stat(filePath);
    const pathFromRoot = normalizeSlashes(relative(notesRoot, filePath));
    const id = pathFromRoot.slice(0, -MARKDOWN_EXTENSION.length);
    notes.push({
      id,
      path: pathFromRoot,
      title: deriveTitle(markdown, basename(filePath, MARKDOWN_EXTENSION)),
      updatedAt: fileStats.mtime.toISOString(),
    });
  }

  return notes.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function listWorkspaceItems(): Promise<WorkspaceItem[]> {
  const notesRoot = await ensureNotesRoot();
  const files = await collectWorkspaceFiles(notesRoot);
  const items: WorkspaceItem[] = [];

  for (const filePath of files) {
    const pathFromRoot = normalizeSlashes(relative(notesRoot, filePath));
    const kind = getWorkspaceItemKind(filePath);

    if (kind === "note") {
      items.push({
        kind,
        id: pathFromRoot.slice(0, -MARKDOWN_EXTENSION.length),
        path: pathFromRoot,
        title: deriveWorkspaceItemTitle(filePath),
      });
      continue;
    }

    if (kind === "image") {
      items.push({
        kind,
        id: pathFromRoot,
        path: pathFromRoot,
        title: deriveWorkspaceItemTitle(filePath),
      });
      continue;
    }

    items.push({
      kind,
      id: pathFromRoot,
      path: pathFromRoot,
      title: deriveWorkspaceItemTitle(filePath),
    });
  }

  return items.sort((left, right) => left.path.localeCompare(right.path));
}

export async function readNote(id: string): Promise<NoteDocument> {
  const notesRoot = await ensureNotesRoot();
  const safeId = sanitizeNoteId(id);
  const notePath = join(notesRoot, `${safeId}${MARKDOWN_EXTENSION}`);
  const markdown = await readFile(notePath, "utf8");
  const fileStats = await stat(notePath);
  const pathFromRoot = normalizeSlashes(relative(notesRoot, notePath));
  const note: NoteDocument = {
    id: safeId,
    path: pathFromRoot,
    title: deriveTitle(markdown, basename(notePath, MARKDOWN_EXTENSION)),
    markdown,
    updatedAt: fileStats.mtime.toISOString(),
  };

  await upsertNoteRecord(note);
  return note;
}

export async function readImageAsset(path: string): Promise<ImageAsset> {
  const notesRoot = await ensureNotesRoot();
  const safePath = sanitizeRelativePath(path);
  const imagePath = join(notesRoot, safePath);
  if (getWorkspaceItemKind(imagePath) !== "image") {
    throw new Error("Unsupported image format.");
  }

  const bytes = await readFile(imagePath);
  const extension = extname(imagePath).toLowerCase();
  const mimeType = getMimeTypeForExtension(extension);
  const base64 = Buffer.from(bytes).toString("base64");

  return {
    path: safePath,
    title: deriveWorkspaceItemTitle(imagePath),
    mimeType,
    dataUrl: `data:${mimeType};base64,${base64}`,
  };
}

export async function readWorkspaceTextFile(path: string): Promise<WorkspaceTextFile> {
  const notesRoot = await ensureNotesRoot();
  const safePath = sanitizeRelativePath(path);
  const filePath = join(notesRoot, safePath);
  const bytes = await readFile(filePath);
  assertReadableTextFile(bytes, MAX_TEXT_FILE_BYTES);
  const content = bytes.toString("utf8");
  const fileStats = await stat(filePath);
  return {
    path: safePath,
    title: deriveWorkspaceItemTitle(filePath),
    content,
    updatedAt: fileStats.mtime.toISOString(),
  };
}

export async function saveWorkspaceTextFile(params: {
  path: string;
  content: string;
}): Promise<WorkspaceTextFile> {
  const notesRoot = await ensureNotesRoot();
  const safePath = sanitizeRelativePath(params.path);
  const filePath = join(notesRoot, safePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, params.content, "utf8");
  const fileStats = await stat(filePath);
  return {
    path: safePath,
    title: deriveWorkspaceItemTitle(filePath),
    content: params.content,
    updatedAt: fileStats.mtime.toISOString(),
  };
}

export async function saveNote(params: {
  id?: string;
  title: string;
  markdown: string;
}): Promise<NoteDocument> {
  const notesRoot = await ensureNotesRoot();
  const normalizedTitle = params.title.trim();
  const initialId = params.id
    ? sanitizeNoteId(params.id)
    : slugify(normalizedTitle || "untitled-note");
  const noteId = await ensureAvailableNoteId(notesRoot, initialId, Boolean(params.id));
  const notePath = join(notesRoot, `${noteId}${MARKDOWN_EXTENSION}`);

  await mkdir(dirname(notePath), { recursive: true });
  await writeFile(notePath, params.markdown, "utf8");

  const fileStats = await stat(notePath);
  const pathFromRoot = normalizeSlashes(relative(notesRoot, notePath));
  const note: NoteDocument = {
    id: noteId,
    path: pathFromRoot,
    title: normalizedTitle || deriveTitle(params.markdown, basename(notePath, ".md")),
    markdown: params.markdown,
    updatedAt: fileStats.mtime.toISOString(),
  };

  await upsertNoteRecord(note);
  return note;
}

async function upsertNoteRecord(note: NoteDocument): Promise<void> {
  await initializeDataLayer();
  const db = getDatabase();
  await db.query(
    `
      INSERT INTO notes (id, path, title, content_markdown, updated_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE
      SET path = EXCLUDED.path,
          title = EXCLUDED.title,
          content_markdown = EXCLUDED.content_markdown,
          updated_at = CURRENT_TIMESTAMP
    `,
    [note.id, note.path, note.title, note.markdown],
  );
}

async function ensureNotesRoot(): Promise<string> {
  if (workspaceRoot) {
    return workspaceRoot;
  }

  throw new Error("No workspace folder selected.");
}

async function collectMarkdownFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      const nestedFiles = await collectMarkdownFiles(fullPath);
      files.push(...nestedFiles);
      continue;
    }
    if (entry.isFile() && extname(entry.name).toLowerCase() === MARKDOWN_EXTENSION) {
      files.push(fullPath);
    }
  }
  return files;
}

async function collectWorkspaceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectWorkspaceFiles(fullPath)));
      continue;
    }
    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function sanitizeNoteId(value: string): string {
  const normalized = normalizeSlashes(value).replace(/^\/+|\/+$/g, "");
  if (normalized.length === 0 || normalized.includes("..")) {
    throw new Error("Invalid note id.");
  }
  return normalized;
}

function sanitizeRelativePath(value: string): string {
  const normalized = normalizeSlashes(value).replace(/^\/+|\/+$/g, "");
  if (normalized.length === 0 || normalized.includes("..")) {
    throw new Error("Invalid path.");
  }
  return normalized;
}

async function ensureAvailableNoteId(
  notesRoot: string,
  noteId: string,
  hasStableId: boolean,
): Promise<string> {
  if (hasStableId) {
    return noteId;
  }

  const candidatePath = join(notesRoot, `${noteId}${MARKDOWN_EXTENSION}`);
  try {
    await stat(candidatePath);
    return `${noteId}-${Date.now()}`;
  } catch (error: unknown) {
    if (isFileNotFoundError(error)) {
      return noteId;
    }
    throw error;
  }
}

function deriveTitle(markdown: string, fallback: string): string {
  const lines = markdown.split("\n");
  const heading = lines.find((line) => line.trim().startsWith("# "));
  if (heading) {
    return heading.replace(/^#\s+/, "").trim();
  }

  const firstContentLine = lines.find((line) => line.trim().length > 0);
  if (firstContentLine) {
    return firstContentLine.trim().slice(0, 120);
  }

  return fallback;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-/]+|[-/]+$/g, "")
    .slice(0, 80);
}

function normalizeSlashes(value: string): string {
  return value.split(sep).join("/");
}

function getMimeTypeForExtension(extension: string): string {
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".gif") return "image/gif";
  if (extension === ".webp") return "image/webp";
  if (extension === ".bmp") return "image/bmp";
  if (extension === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function isFileNotFoundError(error: unknown): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "ENOENT"
  );
}

async function persistWorkspaceRoot(path: string): Promise<void> {
  const currentState = await readWorkspaceState();
  const dedupedRecentFolders = [
    path,
    ...currentState.recentFolders.filter((value) => value !== path),
  ].slice(0, MAX_RECENT_WORKSPACES);

  await writeWorkspaceState({
    lastOpenedFolder: path,
    recentFolders: dedupedRecentFolders,
  });
}

async function readWorkspaceState(): Promise<WorkspaceState> {
  try {
    const raw = await readFile(WORKSPACE_STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<WorkspaceState>;
    const recentFolders = Array.isArray(parsed.recentFolders)
      ? parsed.recentFolders.filter((value): value is string => typeof value === "string")
      : [];
    const lastOpenedFolder =
      typeof parsed.lastOpenedFolder === "string" ? parsed.lastOpenedFolder : null;
    return { lastOpenedFolder, recentFolders };
  } catch (error: unknown) {
    if (isFileNotFoundError(error)) {
      return { lastOpenedFolder: null, recentFolders: [] };
    }
    throw error;
  }
}

async function writeWorkspaceState(state: WorkspaceState): Promise<void> {
  await mkdir(Utils.paths.userData, { recursive: true });
  await writeFile(WORKSPACE_STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

async function isExistingDirectory(path: string): Promise<boolean> {
  try {
    const metadata = await stat(path);
    return metadata.isDirectory();
  } catch (error: unknown) {
    if (isFileNotFoundError(error)) {
      return false;
    }
    throw error;
  }
}
