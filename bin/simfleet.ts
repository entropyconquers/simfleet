#!/usr/bin/env bun
export {};
const [command, ...rest] = process.argv.slice(2);

if (command === "serve") {
  if (rest.includes("--no-tray")) process.env.SIM_FLEET_TRAY = "0";
  await import("../src/server.ts");
} else if (command === "tray") {
  const { startTray } = await import("../src/tray.ts");
  const url = process.env.SIM_FLEET_URL || "http://127.0.0.1:8790";
  const pid = startTray(url);
  console.log(JSON.stringify({ tray: "started", pid, url }));
} else if (command === "--version" || command === "version") {
  const manifest = await import("../package.json", { with: { type: "json" } });
  console.log(manifest.default.version);
} else {
  const { runCli } = await import("../src/cli.ts");
  await runCli();
}
