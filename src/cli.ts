const baseUrl = process.env.SIM_FLEET_URL || "http://127.0.0.1:8790";
const args = process.argv.slice(2);

/**
 * Identifies the coding-agent session running this CLI so the fleet can show
 * which Claude Code or Codex session is driving each device.
 */
function callerIdentity(): { agent: string; sessionId: string } | null {
  const agent = process.env.SIMFLEET_AGENT;
  const sessionId = process.env.SIMFLEET_SESSION_ID;
  if (agent && sessionId) return { agent, sessionId };
  if (process.env.CLAUDE_CODE_SESSION_ID) {
    return { agent: "claude", sessionId: process.env.CLAUDE_CODE_SESSION_ID };
  }
  const codexThread = process.env.CODEX_THREAD_ID || process.env.CODEX_SESSION_ID;
  if (codexThread) return { agent: "codex", sessionId: codexThread };
  return null;
}

function identityHeaders(): Record<string, string> {
  const identity = callerIdentity();
  return identity
    ? { "x-simfleet-agent": identity.agent, "x-simfleet-session": identity.sessionId }
    : {};
}

function usage(): never {
  const help = ["help", "--help", "-h"].includes(args[0] ?? "");
  (help ? console.log : console.error)(`Usage:
  simfleet serve [--no-tray]          start the dashboard + API (127.0.0.1:8790)
  simfleet tray                       run the macOS menu-bar icon
  simfleet init                       write a starter .sim-fleet/project.json
  simfleet skill install [--claude|--codex] [--project]
                                      install the agent skill for Claude Code / Codex
  simfleet version
  simfleet status | ports | agents
  simfleet claim <deviceId> [note]    attach this agent session to a device
  simfleet release <deviceId>
  simfleet emu list
  simfleet emu <boot|slim|restore|shutdown|tune> <avd> [--window] [--cold] [--stock]
  simfleet emu ui <avd> [x y]
  simfleet emu screenshot <avd> <out.png>
  simfleet emu tap|double-tap|long-press <avd> <x> <y>
  simfleet emu swipe <avd> <startX> <startY> <endX> <endY>
  simfleet emu type <avd> <text>
  simfleet emu key <avd> <code>
  simfleet emu button <avd> <home|back|app-switcher|menu|lock|power|volume-up|volume-down>
  simfleet emu rotate <avd> <orientation>
  simfleet emu open-url <avd> <url>
  simfleet emu dev-menu <avd>
  simfleet worktree create <name> <branch> [startPoint]
  simfleet native plan <worktreePath> <debug|release> [simulatorUdid]
  simfleet native ensure <worktreePath> <udid> <debug|release>
  simfleet sim list
  simfleet sim creation-options
  simfleet sim create <name> <device-type-id> <runtime-id>
  simfleet sim <boot|slim|restore|shutdown|open> <udid>   (boot is slim; --stock opts out)
  simfleet sim ui <udid> [x y]
  simfleet sim tap <udid> <x> <y> [width height]
  simfleet sim swipe <udid> <startX> <startY> <endX> <endY> [width height]
  simfleet sim type <udid> <text>
  simfleet sim key <udid> <code> [modifier,...]
  simfleet sim button <udid> <button>
  simfleet sim rotate <udid> <orientation>
  simfleet sim open-url <udid> <url>
  simfleet sim shake <udid>
  simfleet lane list
  simfleet lane start <worktreePath> <udid> [environment] [mode] [preferredPort]
  simfleet lane <launch|stop|log> <laneId>
  simfleet lane open-url <laneId> <url-or-path>`);
  process.exit(help ? 0 : 2);
}

async function request(pathname: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(new URL(pathname, baseUrl), {
    ...init,
    headers: {
      ...identityHeaders(),
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    const message =
      typeof payload === "object" && payload && "error" in payload
        ? String((payload as { error: unknown }).error)
        : String(payload);
    throw new Error(`${response.status} ${message}`);
  }
  return payload;
}

function number(value: string | undefined, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) usage();
  return parsed;
}

async function post(pathname: string, payload?: unknown): Promise<unknown> {
  return request(pathname, {
    method: "POST",
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}

async function waitForJob(
  started: unknown,
  fallbackError: string,
  intervalMs = 1000,
): Promise<unknown> {
  const accepted = started as {
    job?: { status?: string; error?: string; result?: unknown };
    pollUrl?: string;
  };
  if (!accepted.job || !accepted.pollUrl) return started;
  let job = accepted.job;
  while (job.status === "running") {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    const current = (await request(accepted.pollUrl)) as {
      job: { status: string; error?: string; result?: unknown };
    };
    job = current.job;
  }
  if (job.status === "failed") throw new Error(job.error || fallbackError);
  return job.result ?? job;
}

async function getScreenSize(udid: string): Promise<{ width: number; height: number }> {
  const definition = (await request(`/api/v1/simulators/${udid}/definition`)) as {
    screen?: { rect?: { width?: number; height?: number } };
  };
  const width = definition.screen?.rect?.width;
  const height = definition.screen?.rect?.height;
  if (typeof width !== "number" || typeof height !== "number") {
    throw new Error(`Simulator ${udid} did not report usable screen dimensions`);
  }
  return { width, height };
}

async function main(): Promise<unknown> {
  const [domain, command, ...rest] = args;
  if (domain === "status") return request("/api/v1/status");
  if (domain === "ports") return request("/api/v1/ports");
  if (domain === "agents") return request("/api/v1/agents");
  if (domain === "claim" || domain === "release") {
    if (!command) usage();
    const identity = callerIdentity();
    if (!identity) {
      throw new Error(
        "Could not detect the calling agent session; set SIMFLEET_AGENT and SIMFLEET_SESSION_ID",
      );
    }
    return request(`/api/v1/devices/${encodeURIComponent(command)}/claim`, {
      method: domain === "claim" ? "POST" : "DELETE",
      body: JSON.stringify({ ...identity, note: rest.join(" ") || undefined }),
    });
  }

  if (domain === "emu") {
    if (command === "list") {
      const status = (await request("/api/v1/status")) as { emulators: unknown; android: unknown };
      return { android: status.android, emulators: status.emulators };
    }
    const [avd, ...emuArgs] = rest;
    if (!command || !avd) usage();
    const base = `/api/v1/emulators/${encodeURIComponent(avd)}`;
    if (["boot", "slim", "restore", "shutdown", "tune"].includes(command)) {
      return waitForJob(
        await post(`${base}/${command}`, {
          headless: !emuArgs.includes("--window"),
          cold: emuArgs.includes("--cold"),
          stock: emuArgs.includes("--stock"),
        }),
        `Emulator ${command} failed`,
        2000,
      );
    }
    if (command === "ui") {
      const query = emuArgs.length >= 2 ? `?x=${number(emuArgs[0])}&y=${number(emuArgs[1])}` : "";
      return request(`${base}/ui${query}`);
    }
    if (command === "screenshot") {
      if (!emuArgs[0]) usage();
      const response = await fetch(new URL(`${base}/screenshot`, baseUrl), {
        headers: identityHeaders(),
      });
      if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
      await Bun.write(emuArgs[0], await response.arrayBuffer());
      return { saved: emuArgs[0] };
    }
    let input: Record<string, unknown>;
    switch (command) {
      case "tap":
      case "double-tap":
      case "long-press":
        input = { kind: command, x: number(emuArgs[0]), y: number(emuArgs[1]) };
        break;
      case "swipe":
        input = {
          kind: "swipe",
          startX: number(emuArgs[0]),
          startY: number(emuArgs[1]),
          endX: number(emuArgs[2]),
          endY: number(emuArgs[3]),
        };
        break;
      case "type":
        if (!emuArgs.length) usage();
        input = { kind: "text", text: emuArgs.join(" ") };
        break;
      case "key":
        if (!emuArgs[0]) usage();
        input = { kind: "key", code: emuArgs[0] };
        break;
      case "button":
        if (!emuArgs[0]) usage();
        input = { kind: "button", button: emuArgs[0] };
        break;
      case "rotate":
        if (!emuArgs[0]) usage();
        input = { kind: "orientation", orientation: emuArgs[0] };
        break;
      case "open-url":
        if (!emuArgs[0]) usage();
        input = { kind: "open-url", url: emuArgs[0] };
        break;
      case "dev-menu":
        input = { kind: "dev-menu" };
        break;
      default:
        usage();
    }
    return post(`${base}/input`, input);
  }

  if (domain === "worktree") {
    if (command === "create") {
      const [name, branch, startPoint] = rest;
      if (!name || !branch) usage();
      return post("/api/v1/worktrees", { name, branch, startPoint });
    }
    usage();
  }

  if (domain === "native") {
    if (command === "plan") {
      const [worktreePath, mode, simulatorUdid] = rest;
      if (!worktreePath || !mode) usage();
      const query = new URLSearchParams({ worktreePath, mode });
      if (simulatorUdid) query.set("simulatorUdid", simulatorUdid);
      return request(`/api/v1/native-builds/plan?${query}`);
    }
    if (command === "ensure") {
      const [worktreePath, simulatorUdid, mode] = rest;
      if (!worktreePath || !simulatorUdid || !mode) usage();
      const started = (await post("/api/v1/native-builds/ensure", {
        worktreePath,
        simulatorUdid,
        mode,
      })) as { job?: { id?: string; status?: string; error?: string; result?: unknown } };
      const id = started.job?.id;
      if (!id) return started;
      for (;;) {
        const current = (await request(`/api/v1/native-builds/jobs/${encodeURIComponent(id)}`)) as {
          job: { status: string; error?: string; result?: unknown };
        };
        if (current.job.status === "complete") return current.job.result;
        if (current.job.status === "failed")
          throw new Error(current.job.error || "Native build failed");
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    usage();
  }

  if (domain === "lane") {
    if (command === "list") return request("/api/v1/lanes");
    if (command === "start") {
      const [worktreePath, simulatorUdid, environment = "development", mode = "debug", port] = rest;
      if (!worktreePath || !simulatorUdid) usage();
      return post("/api/v1/lanes", {
        worktreePath,
        simulatorUdid,
        environment,
        mode,
        preferredPort: port === undefined ? undefined : number(port),
      });
    }
    if (["launch", "stop"].includes(command || "") && rest[0]) {
      const started = (await post(`/api/v1/lanes/${encodeURIComponent(rest[0])}/${command}`)) as {
        job?: { status?: string; error?: string; result?: unknown };
        pollUrl?: string;
      };
      if (command !== "launch" || !started.job || !started.pollUrl) return started;
      for (;;) {
        const current = (await request(started.pollUrl)) as {
          job: { status: string; error?: string; result?: unknown };
        };
        if (current.job.status === "complete") return current.job.result;
        if (current.job.status === "failed")
          throw new Error(current.job.error || "Lane launch failed");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    if (command === "open-url" && rest[0] && rest[1]) {
      return post(`/api/v1/lanes/${encodeURIComponent(rest[0])}/open-url`, {
        url: rest.slice(1).join(" "),
      });
    }
    if (command === "log" && rest[0]) {
      return request(`/api/v1/lanes/${encodeURIComponent(rest[0])}/log`);
    }
    usage();
  }

  if (domain !== "sim" || !command) usage();
  if (command === "list") {
    const status = (await request("/api/v1/status")) as { simulators: unknown };
    return { simulators: status.simulators };
  }
  if (command === "creation-options") {
    return request("/api/v1/simulator-creation-options");
  }
  if (command === "create") {
    const [name, deviceTypeIdentifier, runtimeIdentifier] = rest;
    if (!name || !deviceTypeIdentifier || !runtimeIdentifier) usage();
    return post("/api/v1/simulators", { name, deviceTypeIdentifier, runtimeIdentifier });
  }

  const [udid, ...inputArgs] = rest;
  if (!udid) usage();
  if (["boot", "slim", "restore", "shutdown", "open"].includes(command)) {
    return waitForJob(
      await post(
        `/api/v1/simulators/${udid}/${command}`,
        command === "boot" && inputArgs.includes("--stock") ? { stock: true } : undefined,
      ),
      `Simulator ${command} failed`,
    );
  }
  if (command === "ui") {
    const query =
      inputArgs.length >= 2 ? `?x=${number(inputArgs[0])}&y=${number(inputArgs[1])}` : "";
    return request(`/api/v1/simulators/${udid}/ui${query}`);
  }

  let input: Record<string, unknown>;
  switch (command) {
    case "tap":
    case "double-tap": {
      const size =
        inputArgs[2] === undefined || inputArgs[3] === undefined
          ? await getScreenSize(udid)
          : { width: number(inputArgs[2]), height: number(inputArgs[3]) };
      input = {
        kind: command,
        x: number(inputArgs[0]),
        y: number(inputArgs[1]),
        ...size,
      };
      break;
    }
    case "swipe": {
      const size =
        inputArgs[4] === undefined || inputArgs[5] === undefined
          ? await getScreenSize(udid)
          : { width: number(inputArgs[4]), height: number(inputArgs[5]) };
      input = {
        kind: "swipe",
        startX: number(inputArgs[0]),
        startY: number(inputArgs[1]),
        endX: number(inputArgs[2]),
        endY: number(inputArgs[3]),
        ...size,
      };
      break;
    }
    case "type":
      if (!inputArgs.length) usage();
      input = { kind: "text", text: inputArgs.join(" ") };
      break;
    case "key":
      if (!inputArgs[0]) usage();
      input = {
        kind: "key",
        code: inputArgs[0],
        modifiers: inputArgs[1]?.split(",").filter(Boolean),
      };
      break;
    case "button":
      if (!inputArgs[0]) usage();
      input = { kind: "button", button: inputArgs[0] };
      break;
    case "rotate":
      if (!inputArgs[0]) usage();
      input = { kind: "orientation", orientation: inputArgs[0] };
      break;
    case "open-url":
      if (!inputArgs[0]) usage();
      input = { kind: "open-url", url: inputArgs[0] };
      break;
    case "shake":
      input = { kind: "shake" };
      break;
    default:
      usage();
  }
  return post(`/api/v1/simulators/${udid}/input`, input);
}

export async function runCli(): Promise<void> {
  try {
    const result = await main();
    console.log(typeof result === "string" ? result : JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
