# simfleet dashboard

The browser UI served by `simfleet serve` at `/`. Vite + React 19 + Tailwind v4 + shadcn/ui.

```bash
bun install
bun run dev      # http://localhost:5173, proxies /api (HTTP + WebSocket) to $SIM_FLEET_URL or :8790
bun run build    # outputs ../dist/dashboard, which the server serves
bun run lint
```

- `src/lib/fleet-store.ts` polls `/api/status`; `src/lib/devices.ts` normalizes simulators and emulators.
- `src/lib/ios-stream.ts` (MJPEG) and `src/lib/android-stream.ts` (H.264 via WebCodecs, touch over
  the same socket) drive `components/app/device-screen.tsx`.
