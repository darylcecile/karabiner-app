export const KARABINER_SDK_MODULE_SPECIFIER = "@karabiner/sdk";

export const KARABINER_SDK_MODULE_SOURCE = `
export const SDK_API_VERSION = 1;

export function registerExtension(setup) {
  return {
    apiVersion: SDK_API_VERSION,
    setup,
  };
}
`;
