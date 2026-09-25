import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const traySource = path.resolve(import.meta.dir, "../tray/SimFleetTray.swift");

/**
 * Compiles the menu-bar helper once per source revision into the user cache.
 * Shipping Swift source instead of a binary keeps the npm package universal
 * and avoids distributing an unsigned executable.
 */
export function ensureTrayBinary(): string {
  if (process.platform !== "darwin")
    throw new Error("The menu-bar icon is only available on macOS");
  const source = fs.readFileSync(traySource);
  const revision = crypto.createHash("sha256").update(source).digest("hex").slice(0, 16);
  const directory = path.join(os.homedir(), "Library", "Caches", "simfleet", "tray", revision);
  const binary = path.join(directory, "SimFleetTray");
  if (fs.existsSync(binary)) return binary;
  fs.mkdirSync(directory, { recursive: true });
  const result = Bun.spawnSync(["xcrun", "swiftc", "-O", "-o", binary, traySource], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw new Error(`Could not compile the menu-bar icon:\n${result.stderr.toString().trim()}`);
  }
  return binary;
}

/** Starts the menu-bar icon; with an owner PID it exits when that process does. */
export function startTray(dashboardUrl: string, ownerPid?: number): number | null {
  const binary = ensureTrayBinary();
  const args = [dashboardUrl.endsWith("/") ? dashboardUrl : `${dashboardUrl}/`];
  if (ownerPid) args.push(String(ownerPid));
  const child = spawn(binary, args, { detached: true, stdio: "ignore" });
  child.unref();
  return child.pid ?? null;
}
