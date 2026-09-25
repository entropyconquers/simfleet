import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "bun:test";

const provider = require("../src/local-build-cache.cjs") as {
  calculateFingerprintHash: (context: CacheContext) => Promise<string>;
  resolveBuildCache: (context: CacheContext, options: CacheOptions) => Promise<string | null>;
  uploadBuildCache: (context: CacheContext, options: CacheOptions) => Promise<void>;
  _testing: {
    entryDirectory: (context: CacheContext, options: CacheOptions) => string;
  };
};

type CacheContext = {
  platform: string;
  fingerprintHash: string;
  projectRoot: string;
  runOptions: { configuration: string };
  buildPath?: string;
};

type CacheOptions = { cacheDirectory: string; waitTimeoutMs?: number };

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("local Expo native build cache", () => {
  test("JS and runtime-environment changes reuse the same native fingerprint", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "fleet-fingerprint-test-"));
    temporaryRoots.push(root);
    fs.writeFileSync(path.join(root, "package.json"), '{"dependencies":{"expo":"54.0.0"}}\n');
    fs.writeFileSync(path.join(root, "app.config.js"), "module.exports={expo:{name:'Example'}};\n");
    fs.writeFileSync(path.join(root, "App.tsx"), "export default 'one';\n");
    const context = {
      platform: "ios",
      projectRoot: root,
      runOptions: { configuration: "Debug" },
      fingerprintHash: "unused",
    };

    const before = await provider.calculateFingerprintHash(context);
    fs.writeFileSync(path.join(root, "App.tsx"), "export default 'two';\n");
    fs.writeFileSync(
      path.join(root, "package.json"),
      '{"scripts":{"fleet":"bun tools/sim-fleet/server.ts"},"dependencies":{"expo":"54.0.0"}}\n',
    );
    const previousEnvironment = process.env.APP_ENVIRONMENT;
    process.env.APP_ENVIRONMENT = "staging";
    const after = await provider.calculateFingerprintHash(context);
    if (previousEnvironment === undefined) delete process.env.APP_ENVIRONMENT;
    else process.env.APP_ENVIRONMENT = previousEnvironment;

    expect(after).toBe(before);
  });

  test("dependency changes invalidate the native fingerprint", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "fleet-fingerprint-test-"));
    temporaryRoots.push(root);
    fs.writeFileSync(path.join(root, "package.json"), '{"dependencies":{"expo":"54.0.0"}}\n');
    const context = {
      platform: "ios",
      projectRoot: root,
      runOptions: { configuration: "Debug" },
      fingerprintHash: "unused",
    };

    const before = await provider.calculateFingerprintHash(context);
    fs.writeFileSync(
      path.join(root, "package.json"),
      '{"dependencies":{"expo":"54.0.0","react-native-camera":"1.0.0"}}\n',
    );
    const after = await provider.calculateFingerprintHash(context);

    expect(after).not.toBe(before);
  });

  test("debug and release shells use different native fingerprints", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "fleet-fingerprint-test-"));
    temporaryRoots.push(root);
    fs.writeFileSync(path.join(root, "package.json"), '{"dependencies":{"expo":"54.0.0"}}\n');
    const base = {
      platform: "ios",
      projectRoot: root,
      fingerprintHash: "unused",
    };

    const debug = await provider.calculateFingerprintHash({
      ...base,
      runOptions: { configuration: "Debug" },
    });
    const release = await provider.calculateFingerprintHash({
      ...base,
      runOptions: { configuration: "Release" },
    });

    expect(release).not.toBe(debug);
  });

  test("native configuration changes invalidate the fingerprint", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "fleet-fingerprint-test-"));
    temporaryRoots.push(root);
    fs.writeFileSync(path.join(root, "package.json"), '{"dependencies":{"expo":"54.0.0"}}\n');
    fs.writeFileSync(path.join(root, "app.config.js"), "module.exports={expo:{scheme:'one'}};\n");
    const context = {
      platform: "ios",
      projectRoot: root,
      runOptions: { configuration: "Debug" },
      fingerprintHash: "unused",
    };

    const before = await provider.calculateFingerprintHash(context);
    fs.writeFileSync(path.join(root, "app.config.js"), "module.exports={expo:{scheme:'two'}};\n");
    const after = await provider.calculateFingerprintHash(context);

    expect(after).not.toBe(before);
  });

  test("publishes and resolves an app bundle", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "fleet-cache-test-"));
    temporaryRoots.push(root);
    const sourceApp = path.join(root, "source", "Example.app");
    fs.mkdirSync(sourceApp, { recursive: true });
    fs.writeFileSync(path.join(sourceApp, "Example"), "binary");
    const context = {
      platform: "ios",
      fingerprintHash: "native-inputs",
      projectRoot: "/project-a",
      runOptions: { configuration: "Debug" },
    };

    await provider.uploadBuildCache({ ...context, buildPath: sourceApp }, { cacheDirectory: root });
    const hit = await provider.resolveBuildCache(context, { cacheDirectory: root });

    expect(hit).not.toBeNull();
    expect(fs.readFileSync(path.join(hit!, "Example"), "utf8")).toBe("binary");
  });

  test("a miss claims the fingerprint for one builder", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "fleet-cache-test-"));
    temporaryRoots.push(root);
    const context = {
      platform: "ios",
      fingerprintHash: "new-native-inputs",
      projectRoot: "/project-b",
      runOptions: { configuration: "Release" },
    };

    expect(
      await provider.resolveBuildCache(context, { cacheDirectory: root, waitTimeoutMs: 10 }),
    ).toBeNull();
  });

  test("cache entries are shared across runtime environments", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "fleet-cache-test-"));
    temporaryRoots.push(root);
    const context = {
      platform: "ios",
      fingerprintHash: "same-native-shell",
      projectRoot: "/project",
      runOptions: { configuration: "Debug" },
    };
    const previousEnvironment = process.env.APP_ENVIRONMENT;
    process.env.APP_ENVIRONMENT = "staging";
    const staging = provider._testing.entryDirectory(context, { cacheDirectory: root });
    process.env.APP_ENVIRONMENT = "production";
    const production = provider._testing.entryDirectory(context, { cacheDirectory: root });
    if (previousEnvironment === undefined) delete process.env.APP_ENVIRONMENT;
    else process.env.APP_ENVIRONMENT = previousEnvironment;

    expect(staging).toBe(production);
  });
});
