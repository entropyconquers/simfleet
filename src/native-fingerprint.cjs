const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const DEFAULT_ROOT_FILES = [
  "app.config.js",
  "app.json",
  "package.json",
  "bun.lock",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "react-native.config.js",
  "google-services.json",
  ".sim-fleet/project.json",
];
const DEFAULT_SOURCE_DIRECTORIES = ["plugins", "patches", "firebase"];
const PROJECT_CONFIG_FILE = ".sim-fleet/project.json";

function readProjectConfig(projectRoot) {
  try {
    return JSON.parse(fs.readFileSync(path.join(projectRoot, PROJECT_CONFIG_FILE), "utf8"));
  } catch {
    return null;
  }
}

// Inputs are declared by the project so the package carries no app-specific
// paths (for example, a vendored native SDK checked into the repository).
function fingerprintInputs(projectRoot) {
  const declared = readProjectConfig(projectRoot)?.nativeFingerprint || {};
  return {
    rootFiles: declared.rootFiles || DEFAULT_ROOT_FILES,
    sourceDirectories: declared.sourceDirectories || DEFAULT_SOURCE_DIRECTORIES,
    localNativeDirectories: declared.localNativeDirectories || [],
    localNativeFiles: declared.localNativeFiles || [],
  };
}

function xcodeIdentity() {
  try {
    return execFileSync("xcodebuild", ["-version"], { encoding: "utf8" }).trim();
  } catch {
    return "xcode-unknown";
  }
}

function trackedPlatformFiles(projectRoot, platform) {
  const directory = platform === "ios" ? "ios" : "android";
  try {
    return execFileSync("git", ["-C", projectRoot, "ls-files", directory], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

function walkFiles(root, relativeDirectory) {
  const absoluteDirectory = path.join(root, relativeDirectory);
  if (!fs.existsSync(absoluteDirectory)) return [];
  const files = [];
  const visit = (absolute, relative) => {
    const stat = fs.statSync(absolute);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(absolute).sort()) {
        if (["build", "Pods", ".gradle", ".cxx", "node_modules"].includes(entry)) continue;
        visit(path.join(absolute, entry), path.join(relative, entry));
      }
    } else if (stat.isFile()) {
      files.push(relative);
    }
  };
  visit(absoluteDirectory, relativeDirectory);
  return files;
}

function nativeInputFiles(projectRoot, platform) {
  const inputs = fingerprintInputs(projectRoot);
  const candidates = [
    ...inputs.rootFiles,
    ...inputs.localNativeFiles,
    ...inputs.sourceDirectories.flatMap((directory) => walkFiles(projectRoot, directory)),
    ...inputs.localNativeDirectories.flatMap((directory) => walkFiles(projectRoot, directory)),
    ...trackedPlatformFiles(projectRoot, platform),
  ];
  return [...new Set(candidates)]
    .filter((relative) => fs.existsSync(path.join(projectRoot, relative)))
    .sort();
}

function nativeInputContents(projectRoot, relative) {
  const absolute = path.join(projectRoot, relative);
  if (relative === PROJECT_CONFIG_FILE) {
    // Only the native identity contract shapes the binary; orchestration
    // settings (ports, Metro env, worktree overlay) must not bust the cache.
    const config = JSON.parse(fs.readFileSync(absolute, "utf8"));
    return Buffer.from(
      JSON.stringify({
        projectName: config.projectName,
        nativeAuth: config.nativeAuth,
        nativeShells: config.nativeShells,
      })
    );
  }
  if (relative !== "package.json") return fs.readFileSync(absolute);
  const manifest = JSON.parse(fs.readFileSync(absolute, "utf8"));
  // Package-manager scripts and descriptive metadata cannot affect the native
  // shell. Dependency declarations can, so keep every dependency section and
  // the Expo package configuration while allowing fleet scripts to differ.
  return Buffer.from(
    JSON.stringify({
      name: manifest.name,
      version: manifest.version,
      dependencies: manifest.dependencies,
      devDependencies: manifest.devDependencies,
      peerDependencies: manifest.peerDependencies,
      optionalDependencies: manifest.optionalDependencies,
      expo: manifest.expo,
    })
  );
}

function calculateNativeFingerprint({ projectRoot, platform, runOptions = {} }) {
  const hash = crypto.createHash("sha256");
  const configuration = runOptions.configuration || runOptions.variant || "Debug";
  hash.update(`sim-fleet-native-v1\0${platform}\0${configuration}\0${process.arch}\0${xcodeIdentity()}\0`);
  for (const relative of nativeInputFiles(projectRoot, platform)) {
    hash.update(relative.replaceAll(path.sep, "/"));
    hash.update("\0");
    hash.update(nativeInputContents(projectRoot, relative));
    hash.update("\0");
  }
  return hash.digest("hex");
}

module.exports = { calculateNativeFingerprint, nativeInputFiles, readProjectConfig };
