export type NoteSummary = {
  id: string;
  path: string;
  title: string;
  updatedAt: string;
};

export type NoteDocument = NoteSummary & {
  markdown: string;
};

export type WorkspaceItemKind = "note" | "image" | "file";

export type WorkspaceItem = {
  kind: WorkspaceItemKind;
  id: string;
  path: string;
  title: string;
};

export type ImageAsset = {
  path: string;
  title: string;
  mimeType: string;
  dataUrl: string;
};
