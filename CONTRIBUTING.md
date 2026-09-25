# Contributing

Thanks for helping. simfleet is a Bun + TypeScript server and CLI with a React dashboard; it drives
real simulators and emulators, so please test device-facing changes on a real Mac.

## Setup

```bash
bun install
bun run check                 # typecheck, unit tests, dashboard build
cd dashboard && bun run lint
```

Run a development server against a project (any directory with `.sim-fleet/project.json`) on a spare
port so it does not collide with your everyday fleet:

```bash
SIM_FLEET_PROJECT_ROOT=/path/to/app SIM_FLEET_UI_PORT=8791 SIM_FLEET_TRAY=0 bun bin/simfleet.ts serve
SIM_FLEET_URL=http://127.0.0.1:8791 bun --cwd dashboard run dev
```

## Layout

| Path | Contents |
| --- | --- |
| `bin/simfleet.ts` | Entry point: `serve`, `tray`, `init`, `skill install`, then the CLI |
| `src/server.ts` | HTTP/WebSocket API, lanes, jobs, auto-slim loop |
| `src/cli.ts` | CLI client for the API (adds agent identity headers) |
| `src/system.ts` | Host, iOS simulator, SimSlim, and Metro helpers |
| `src/android.ts` · `src/android-stream.ts` | avdslim/adb lifecycle and input · scrcpy H.264 bridge |
| `src/agents.ts` | Claude Code / Codex session discovery and device attribution |
| `src/native.ts` · `src/*.cjs` | Native build cache, fingerprinting, Expo build-cache provider |
| `src/worktree.ts` | Fleet-prepared worktree creation |
| `dashboard/` | Vite + React 19 + Tailwind v4 + shadcn dashboard, built into `dist/dashboard` |
| `tray/` | Swift menu-bar helper |
| `skills/simfleet/` | Agent skill shipped with the package |
| `docs/` | Documentation site (unmint / Fumadocs, static export to GitHub Pages); pages in `docs/content/docs` |

## Conventions

- Match the surrounding code; keep comments for the *why*.
- Never break the "always slim" contract: devices boot slim unless a caller explicitly asks for stock.
- API changes: update `GET /api/v1/capabilities`, `skills/simfleet/references/api.md`,
  `docs/content/docs/api-reference`, and the README.
- Dashboard changes must stay keyboard and screen-reader accessible and work in light and dark.
- Add a line to `CHANGELOG.md` under "Unreleased".

## Releasing

Bump `version` in `package.json`, move "Unreleased" notes under the new version in `CHANGELOG.md`,
commit, and push a `vX.Y.Z` tag. The release workflow runs the checks, publishes to npm (when the
`NPM_TOKEN` secret is set), and creates the GitHub release.
