import type { AIProviderDefinition } from "./ai";
import type { ExtensionPermission } from "./permissions";

export const EXTENSION_MANIFEST_VERSION = 1 as const;

export type ExtensionInstallSource =
  | {
      type: "github-tarball";
      repo: string;
      ref: string;
      tarballUrl: string;
      subpath?: string;
    }
  | {
      type: "local-path";
      path: string;
    };

export type ExtensionCommandContribution = {
  id: string;
  title: string;
  description?: string;
};

export type ExtensionToolContribution = {
  id: string;
  description: string;
};

export type ExtensionContributions = {
  aiProviders?: AIProviderDefinition[];
  commands?: ExtensionCommandContribution[];
  tools?: ExtensionToolContribution[];
};

export type ExtensionManifest = {
  manifestVersion: typeof EXTENSION_MANIFEST_VERSION;
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  repository?: string;
  entrypoint: string;
  permissions: ExtensionPermission[];
  contributes?: ExtensionContributions;
  engines?: {
    karabiner?: string;
    sdk?: string;
  };
};

export type InstalledExtension = {
  manifest: ExtensionManifest;
  installSource: ExtensionInstallSource;
  installedAt: string;
  rootDir: string;
};
