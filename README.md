# simfleet

Run many React Native worktrees in parallel on slimmed **iOS simulators** and **Android emulators**,
with one browser dashboard, one agent-friendly API/CLI, leased Metro ports, a single-flight native
build cache, and a macOS menu-bar icon that shows which Claude Code or Codex session is driving
each device.

- **iOS**: [SimSlim](https://github.com/MobAI-App/simslim) trims CoreSimulator services
  (~3.8 GB → ~1.3 GB per booted simulator); [Baguette](https://github.com/tddworks/baguette) streams
  frames and injects input.
- **Android**: [avdslim](https://github.com/kdbhalala/avdslim) boots AVDs with `-lowram`, host GPU, and
  2 GB of guest RAM (`SIM_FLEET_ANDROID_RAM_MB`), disables ~45 background packages, and verifies the
  slim state. The dashboard streams live H.264 through [scrcpy](https://github.com/Genymobile/scrcpy)'s
  device server (WebCodecs in the browser) and sends touch down/move/up on the same socket, falling
  back to screenshot polling when scrcpy is not installed.
- **Agents**: every CLI call from a Claude Code or Codex session is attributed to the device it
  touches; sessions can also claim devices explicitly.

## Install

```bash
bun add -g simfleet            # or: bunx simfleet <command>
```

Requires macOS and Bun ≥ 1.1. Optional host tools:

```bash
brew install mobai-app/tap/simslim baguette watchman                                   # iOS
brew tap kdbhalala/avdslim https://github.com/kdbhalala/avdslim.git && brew install avdslim scrcpy   # Android
```

Android also needs the SDK platform-tools and emulator (`ANDROID_HOME`, or `~/Library/Android/sdk`).
To use the native build cache, also add it to the app (`bun add -d simfleet`) and set
`experiments.buildCacheProvider.plugin` to `require.resolve("simfleet/build-cache")` in `app.config.js`.

## Use

```bash
simfleet serve                 # dashboard + API on http://127.0.0.1:8790 and the menu-bar icon
simfleet status | ports | agents
simfleet sim boot <udid>       # iOS, slimmed and verified
simfleet emu boot <avd>        # Android, headless, slimmed and verified
simfleet lane start <worktree> <udid-or-avd> [environment] [debug|release]
simfleet lane launch <lane-id>
simfleet claim <udid-or-avd> "reviewing checkout flow"
```

Run `simfleet` with no arguments for every command. `GET /api/v1/capabilities` describes the HTTP
contract for other programs.

The menu-bar icon starts with `simfleet serve` (disable it with `--no-tray` or `SIM_FLEET_TRAY=0`), or on
its own with `simfleet tray`. Left-click opens the dashboard in the default browser; right-click lists
running devices and the agent sessions attached to each. The helper is compiled from
`tray/SimFleetTray.swift` with `swiftc` on first use and cached under `~/Library/Caches/simfleet`.

## Always slim

Every device is slim unless someone explicitly asks for stock. `sim boot` and `emu boot` apply and
verify the slim profile, and the server auto-slims devices booted any other way (Xcode, Android
Studio, argent, `simctl`) every 15 seconds:

- **Android**: any running emulator without avdslim state is slimmed in place (no reboot).
- **iOS**: SimSlim needs a reboot, so a simulator is auto-slimmed only within its first 4 minutes of
  uptime. An older unslimmed simulator is reported as `needs-reboot` in `status.autoSlim` rather than
  being interrupted mid-test.

Opt out per device with `simfleet sim boot <udid> --stock`, `simfleet emu boot <avd> --stock`, or
`restore`; `slim` clears the opt-out. Disable auto-slim entirely with `SIM_FLEET_AUTO_SLIM=0` or
`"autoSlim": false` in the project config.

## Project configuration

simfleet runs against the nearest directory with `.sim-fleet/project.json`, resolving linked Git
worktrees to their main checkout. Override it with `SIM_FLEET_PROJECT_ROOT`.

```jsonc
{
  "schemaVersion": 1,
  "projectName": "my-app",
  "nativeShells": {
    "debug":   { "appName": "My App Dev", "bundleId": "com.example.app.dev", "scheme": "myapp-dev" },
    "release": { "appName": "My App",     "bundleId": "com.example.app",     "scheme": "myapp",
                 "androidPackage": "com.example.app" }          // optional; defaults to bundleId
  },
  "environments": {                                             // non-overlapping Metro port ranges
    "development": { "envFile": ".env.development", "portRange": [8100, 8199] },
    "staging":     { "portRange": [8200, 8299] },
    "preprod":     { "portRange": [8300, 8399] },
    "production":  { "portRange": [8400, 8499] }
  },
  // Everything below is optional.
  "nativeAuth": { "provider": "privy", "allowedAppIdentifiers": ["com.example.app.dev"] },
  "simslimProfile": ".simslim/profile.json",
  "stateDirectoryName": "My App Sim Fleet",                     // ~/Library/Application Support/<name>
  "cacheDirectoryName": "My App Sim Fleet",                     // ~/Library/Caches/<name>/native
  "appProcessNames": ["MyApp"],
  "metro": {                                                    // {environment} {mode} {port} templates
    "env": { "APP_ENV": "{environment}" },
    "modeEnv": { "debug": { "APP_VARIANT": "dev" }, "release": { "APP_VARIANT": "prod" } }
  },
  "release": { "entryFile": "index.ts" },
  "nativeFingerprint": { "localNativeDirectories": ["vendor/sdk/ios"], "localNativeFiles": [] },
  "worktrees": {
    "baseRef": "origin/main",
    "overlayFiles": ["metro.config.js"],
    "sharedPaths": [".sim-fleet", "node_modules"],
    "skills": [".codex/skills/sim-fleet-control"]
  },
  "android": { "avdslimArgs": ["--keep=com.google.android.apps.maps"] }
}
```

Only `projectName`, `nativeAuth`, and `nativeShells` feed the native fingerprint, so changing ports,
Metro env, or worktree settings never invalidates cached native builds.

## Identity model

Bundle identifiers are stable native identities, never worktree identities. Isolation comes from one
device and one leased Metro port per lane. Environments are selected in JavaScript, so switching
staging/production never forces a native build. Android lanes are debug-only and reach Metro through
`adb reverse`.

## Development

```bash
bun install
bun test
bun run typecheck
bun run build:dashboard        # builds dashboard/ into dist/dashboard, served at /
```
