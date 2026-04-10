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

export type ExtensionInlineEditorBlockContribution = {
  id: string;
  title: string;
  description?: string;
};

export type ExtensionFilePreviewHandlerContribution = {
  id: string;
  title: string;
  description?: string;
  fileExtensions: string[];
};

export type ExtensionInlineEditorBlockResult = {
  markdown: string;
};

export type ExtensionFilePreviewContentType = "text" | "markdown" | "json" | "tldraw";

export type ExtensionFilePreviewRenderResult = {
  title?: string;
  contentType?: ExtensionFilePreviewContentType;
  content: string;
};

export type ExtensionResolvedFilePreview = {
  handlerId: string;
  handlerTitle: string;
  path: string;
  title: string;
  contentType: ExtensionFilePreviewContentType;
  content: string;
};

export type OfficialExtensionSummary = {
  id: string;
  name: string;
  description?: string;
  version: string;
  installed: boolean;
};

export type OfficialExtensionReadme = OfficialExtensionSummary & {
  readme: string;
};

export type OfficialExtensionInstallPlan = {
  installToken: string;
  id: string;
  name: string;
  description?: string;
  version: string;
  permissions: ExtensionPermission[];
};

export type ExtensionContributions = {
  aiProviders?: AIProviderDefinition[];
  commands?: ExtensionCommandContribution[];
  tools?: ExtensionToolContribution[];
  inlineEditorBlocks?: ExtensionInlineEditorBlockContribution[];
  filePreviewHandlers?: ExtensionFilePreviewHandlerContribution[];
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
