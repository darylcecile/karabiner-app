import type {
  AIProviderPermission,
  CliExecPermission,
  ExtensionPermission,
  ExtensionPermissionId,
  FilesystemReadPermission,
  FilesystemWritePermission,
  NetworkPermission,
} from "../../shared/contracts/permissions";

export class ExtensionPermissionGate {
  private readonly grantedPermissions: ExtensionPermission[];

  constructor(grantedPermissions: ExtensionPermission[]) {
    this.grantedPermissions = grantedPermissions;
  }

  has(permissionId: ExtensionPermissionId): boolean {
    return this.grantedPermissions.some(
      (permission) => permission.id === permissionId,
    );
  }

  require(permissionId: ExtensionPermissionId, context: string): void {
    if (this.has(permissionId)) {
      return;
    }
    throw new Error(
      `Permission "${permissionId}" is required for ${context}. ` +
        "The extension must request it in extension.json.",
    );
  }

  getNetworkAllowlist(): string[] {
    const networkPermission = this.grantedPermissions.find(
      (permission): permission is NetworkPermission =>
        permission.id === "network",
    );
    return networkPermission?.allowlist ?? [];
  }

  getAllowedCliCommands(): string[] {
    const cliPermission = this.grantedPermissions.find(
      (permission): permission is CliExecPermission =>
        permission.id === "cli.exec",
    );
    return cliPermission?.commands ?? [];
  }

  getFilesystemRoots(mode: "read" | "write"): string[] {
    if (mode === "read") {
      const readPermission = this.grantedPermissions.find(
        (permission): permission is FilesystemReadPermission =>
          permission.id === "filesystem.read",
      );
      return readPermission?.roots ?? [];
    }

    const writePermission = this.grantedPermissions.find(
      (permission): permission is FilesystemWritePermission =>
        permission.id === "filesystem.write",
    );
    return writePermission?.roots ?? [];
  }

  getAllowedAIProviderIds(): string[] {
    const aiProviderPermission = this.grantedPermissions.find(
      (permission): permission is AIProviderPermission =>
        permission.id === "ai.provider",
    );
    return aiProviderPermission?.providerIds ?? [];
  }
}
