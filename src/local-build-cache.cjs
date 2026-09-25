const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { calculateNativeFingerprint, readProjectConfig } = require("./native-fingerprint.cjs");

const CACHES_ROOT = path.join(os.homedir(), "Library", "Caches");
const DEFAULT_CACHE_DIRECTORY = path.join(CACHES_ROOT, "Sim Fleet", "native");

// Each project keeps its artifacts under its own cache directory so two apps
// never share a fingerprint namespace.
function projectCacheDirectory(projectRoot) {
  const config = projectRoot ? readProjectConfig(projectRoot) : null;
  if (!config) return DEFAULT_CACHE_DIRECTORY;
  const name = config.cacheDirectoryName || `${config.projectName} Sim Fleet`;
  return path.join(CACHES_ROOT, name, "native");
}

function safeSegment(value) {
  return String(value || "default")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(0, 80);
}

function xcodeIdentity() {
  try {
    return execFileSync("xcodebuild", ["-version"], { encoding: "utf8" }).trim();
  } catch {
    return "xcode-unknown";
  }
}

function entryDirectory(context, options = {}) {
  const root = options.cacheDirectory
    ? path.resolve(options.cacheDirectory.replace(/^~(?=$|\/)/, os.homedir()))
    : projectCacheDirectory(context.projectRoot);
  const configuration = context.runOptions?.configuration || "Debug";
  const toolchain = crypto
    .createHash("sha1")
    .update(`${process.arch}\n${xcodeIdentity()}`)
    .digest("hex")
    .slice(0, 12);
  return path.join(
    root,
    safeSegment(context.platform),
    safeSegment(configuration),
    toolchain,
    safeSegment(context.fingerprintHash)
  );
}

async function calculateFingerprintHash(context) {
  return calculateNativeFingerprint(context);
}

function cachedApp(entry) {
  try {
    const metadata = JSON.parse(fs.readFileSync(path.join(entry, "artifact.json"), "utf8"));
    const appPath = path.join(entry, metadata.appDirectory);
    return appPath.endsWith(".app") && fs.statSync(appPath).isDirectory() ? appPath : null;
  } catch {
    return null;
  }
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function claimOrWait(entry, waitTimeoutMs) {
  fs.mkdirSync(entry, { recursive: true });
  const lockPath = path.join(entry, "build.lock");
  const deadline = Date.now() + waitTimeoutMs;
  for (;;) {
    const hit = cachedApp(entry);
    if (hit) return hit;
    try {
      const handle = fs.openSync(lockPath, "wx");
      fs.writeFileSync(handle, `${JSON.stringify({ pid: process.pid, startedAt: Date.now() })}\n`);
      fs.closeSync(handle);
      return null;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }

    let ownerPid = 0;
    try {
      ownerPid = Number(JSON.parse(fs.readFileSync(lockPath, "utf8")).pid);
    } catch {
      // A partially written or stale lock is treated as abandoned.
    }
    if (!ownerPid || !processAlive(ownerPid)) {
      fs.rmSync(lockPath, { force: true });
      continue;
    }
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for native build cache owner PID ${ownerPid}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function resolveBuildCache(context, options = {}) {
  return claimOrWait(entryDirectory(context, options), options.waitTimeoutMs || 15 * 60 * 1000);
}

async function uploadBuildCache(context, options = {}) {
  const entry = entryDirectory(context, options);
  const lockPath = path.join(entry, "build.lock");
  const appName = path.basename(context.buildPath);
  if (!appName.endsWith(".app") || !fs.statSync(context.buildPath).isDirectory()) {
    throw new Error(`Expected an iOS simulator .app bundle, received ${context.buildPath}`);
  }

  fs.mkdirSync(entry, { recursive: true });
  const temporaryPath = path.join(entry, `${appName}.uploading-${process.pid}`);
  const finalPath = path.join(entry, appName);
  try {
    fs.rmSync(temporaryPath, { recursive: true, force: true });
    fs.cpSync(context.buildPath, temporaryPath, { recursive: true });
    fs.rmSync(finalPath, { recursive: true, force: true });
    fs.renameSync(temporaryPath, finalPath);
    fs.writeFileSync(
      path.join(entry, "artifact.json"),
      `${JSON.stringify(
        {
          appDirectory: appName,
          createdAt: new Date().toISOString(),
          sourceProject: context.projectRoot,
        },
        null,
        2
      )}\n`
    );
  } finally {
    fs.rmSync(temporaryPath, { recursive: true, force: true });
    fs.rmSync(lockPath, { force: true });
  }
}

function releaseBuildCache(context, options = {}) {
  const lockPath = path.join(entryDirectory(context, options), "build.lock");
  try {
    const owner = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    if (Number(owner.pid) === process.pid) fs.rmSync(lockPath, { force: true });
  } catch {
    // Missing and malformed locks are already effectively released.
  }
}

module.exports = {
  calculateFingerprintHash,
  resolveBuildCache,
  uploadBuildCache,
  releaseBuildCache,
  _testing: {
    DEFAULT_CACHE_DIRECTORY,
    cachedApp,
    entryDirectory,
    calculateNativeFingerprint,
  },
};
