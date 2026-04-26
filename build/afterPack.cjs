// electron-builder afterPack hook: strips foreign-arch native binaries that
// can't be excluded via files patterns (since electron-builder lacks per-arch
// `files` overrides). Runs once per packaged arch.

const fs = require('node:fs');
const path = require('node:path');

/** @type {(absPath: string) => void} */
function rmrf(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
    console.log(`[afterPack] removed ${path.relative(process.cwd(), p)}`);
  } catch (e) {
    /* ignore */
  }
}

/**
 * @param {{ appOutDir: string, electronPlatformName: string, arch: number }} ctx
 *   arch: 0=ia32, 1=x64, 2=armv7l, 3=arm64, 4=universal
 */
exports.default = async function afterPack(ctx) {
  const ARCH_NAME = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64', 4: 'universal' }[ctx.arch];
  if (ctx.electronPlatformName !== 'darwin') return;
  if (ARCH_NAME !== 'arm64' && ARCH_NAME !== 'x64') return;

  // Locate the unpacked node_modules directory inside the packaged .app.
  const appName = ctx.packager.appInfo.productFilename;
  const resourcesDir = path.join(ctx.appOutDir, `${appName}.app`, 'Contents', 'Resources');
  const unpackedRoot = path.join(resourcesDir, 'app.asar.unpacked', 'node_modules');
  if (!fs.existsSync(unpackedRoot)) return;

  const foreignArch = ARCH_NAME === 'arm64' ? 'x64' : 'arm64';

  // Drop the foreign mac arch package for @github/copilot.
  rmrf(path.join(unpackedRoot, '@github', `copilot-darwin-${foreignArch}`));

  // Drop the foreign mac arch package for @img/sharp.
  rmrf(path.join(unpackedRoot, '@img', `sharp-darwin-${foreignArch}`));
  rmrf(path.join(unpackedRoot, '@img', `sharp-libvips-darwin-${foreignArch}`));

  // Drop foreign mac arch onnxruntime-node binaries (it bundles both inside
  // bin/napi-v3/darwin/<arch>/).
  const onnxDarwin = path.join(unpackedRoot, 'onnxruntime-node', 'bin', 'napi-v3', 'darwin');
  rmrf(path.join(onnxDarwin, foreignArch));
};
