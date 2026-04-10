export const EXTENSION_PERMISSION_IDS = [
  "notes.read",
  "notes.write",
  "filesystem.read",
  "filesystem.write",
  "network",
  "ai.provider",
  "cli.exec",
] as const;

export type ExtensionPermissionId = (typeof EXTENSION_PERMISSION_IDS)[number];

type BasePermission<T extends ExtensionPermissionId> = {
  id: T;
  reason: string;
};

export type NotesReadPermission = BasePermission<"notes.read">;
export type NotesWritePermission = BasePermission<"notes.write">;
export type FilesystemReadPermission = BasePermission<"filesystem.read"> & {
  roots: string[];
};
export type FilesystemWritePermission = BasePermission<"filesystem.write"> & {
  roots: string[];
};
export type NetworkPermission = BasePermission<"network"> & {
  allowlist: string[];
};
export type AIProviderPermission = BasePermission<"ai.provider"> & {
  providerIds: string[];
};
export type CliExecPermission = BasePermission<"cli.exec"> & {
  commands: string[];
};

export type ExtensionPermission =
  | NotesReadPermission
  | NotesWritePermission
  | FilesystemReadPermission
  | FilesystemWritePermission
  | NetworkPermission
  | AIProviderPermission
  | CliExecPermission;
