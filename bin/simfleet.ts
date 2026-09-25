#!/usr/bin/env bun
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [command, ...rest] = process.argv.slice(2);
const packageRoot = path.resolve(import.meta.dir, "..");

/** Copies the bundled agent skill into Claude Code and/or Codex skill folders. */
function installSkill(flags: string[]): void {
  const source = path.join(packageRoot, "skills", "simfleet");
  const base = flags.includes("--project") ? process.cwd() : os.homedir();
  const onlyClaude = flags.includes("--claude");
  const onlyCodex = flags.includes("--codex");
  const targets = [
    ...(onlyCodex ? [] : [path.join(base, ".claude", "skills", "simfleet")]),
    ...(onlyClaude ? [] : [path.join(base, ".codex", "skills", "simfleet")]),
  ];
  for (const target of targets) {
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, { recursive: true });
    console.log(`Installed simfleet skill → ${target}`);
  }
}

/** Writes a starter `.sim-fleet/project.json` from the app's package.json. */
function initProject(): void {
  const target = path.join(process.cwd(), ".sim-fleet", "project.json");
  if (fs.existsSync(target)) {
    console.error(`${target} already exists`);
    process.exit(1);
  }
  let name = path.basename(process.cwd());
  try {
    name = JSON.parse(fs.readFileSync("package.json", "utf8")).name || name;
  } catch {
    // No package.json; use the directory name.
  }
  const slug = name.replace(/^@[^/]+\//, "").replace(/[^a-z0-9]+/gi, "").toLowerCase() || "app";
  const config = {
    schemaVersion: 1,
    projectName: name,
    nativeShells: {
      debug: { appName: `${name} Dev`, bundleId: `com.example.${slug}.dev`, scheme: `${slug}-dev` },
      release: { appName: name, bundleId: `com.example.${slug}`, scheme: slug },
    },
    environments: {
      development: { envFile: ".env.development", portRange: [8100, 8199] },
      staging: { portRange: [8200, 8299] },
      preprod: { portRange: [8300, 8399] },
      production: { portRange: [8400, 8499] },
    },
  };
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`Wrote ${target}. Set the real bundle IDs and schemes, then run \`simfleet serve\`.`);
}

if (command === "serve") {
  if (rest.includes("--no-tray")) process.env.SIM_FLEET_TRAY = "0";
  await import("../src/server.ts");
} else if (command === "tray") {
  const { startTray } = await import("../src/tray.ts");
  const url = process.env.SIM_FLEET_URL || "http://127.0.0.1:8790";
  const pid = startTray(url);
  console.log(JSON.stringify({ tray: "started", pid, url }));
} else if (command === "--version" || command === "-v" || command === "version") {
  const manifest = await import("../package.json", { with: { type: "json" } });
  console.log(manifest.default.version);
} else if (command === "skill" && rest[0] === "install") {
  installSkill(rest.slice(1));
} else if (command === "init") {
  initProject();
} else {
  const { runCli } = await import("../src/cli.ts");
  await runCli();
}
