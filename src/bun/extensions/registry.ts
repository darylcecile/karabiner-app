import type { InstalledExtension } from "../../shared/contracts/extensions";

export class ExtensionRegistry {
  private readonly installedExtensions = new Map<string, InstalledExtension>();

  register(extension: InstalledExtension): void {
    this.installedExtensions.set(extension.manifest.id, extension);
  }

  remove(extensionId: string): void {
    this.installedExtensions.delete(extensionId);
  }

  getById(extensionId: string): InstalledExtension | undefined {
    return this.installedExtensions.get(extensionId);
  }

  list(): InstalledExtension[] {
    return [...this.installedExtensions.values()].sort((left, right) =>
      left.manifest.id.localeCompare(right.manifest.id),
    );
  }
}
