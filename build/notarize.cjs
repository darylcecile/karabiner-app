// electron-builder afterSign hook: notarize the macOS .app via Apple's
// notarytool service using an App Store Connect API key. We do this in a
// custom hook (instead of electron-builder's built-in `mac.notarize`) so we
// can skip notarization gracefully when the API key secrets aren't present
// (e.g. on forks, local builds without env vars, or when MAC_SIGN=false).

const { notarize } = require('@electron/notarize');
const path = require('node:path');

/**
 * @param {{ electronPlatformName: string, appOutDir: string, packager: any }} ctx
 */
exports.default = async function notarizing(ctx) {
  if (ctx.electronPlatformName !== 'darwin') return;

  if (process.env.MAC_NOTARIZE !== 'true') {
    console.log('[notarize] MAC_NOTARIZE != true, skipping notarization');
    return;
  }

  const appleApiKey = process.env.APPLE_API_KEY;
  const appleApiKeyId = process.env.APPLE_API_KEY_ID;
  const appleApiIssuer = process.env.APPLE_API_ISSUER;

  if (!appleApiKey || !appleApiKeyId || !appleApiIssuer) {
    console.warn('[notarize] missing APPLE_API_KEY / APPLE_API_KEY_ID / APPLE_API_ISSUER, skipping');
    return;
  }

  const appName = ctx.packager.appInfo.productFilename;
  const appPath = path.join(ctx.appOutDir, `${appName}.app`);

  console.log(`[notarize] submitting ${appPath} to notarytool …`);
  const start = Date.now();
  // Note: do NOT pass `teamId` here. @electron/notarize's argument validator
  // treats the presence of `teamId` as the password-credentials flavor, which
  // then conflicts with the API-key fields and throws "Cannot use password
  // credentials, API key credentials and keychain credentials at once". The
  // team ID is already encoded in the App Store Connect API key.
  await notarize({
    tool: 'notarytool',
    appPath,
    appleApiKey,
    appleApiKeyId,
    appleApiIssuer,
  });
  console.log(`[notarize] done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
};
