import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Database } from "bun:sqlite";
import {
  loadState,
  updateState,
  type DeviceAttachment,
  type DevicePlatform,
  type FleetSession,
} from "./state";
import { isProcessRunning } from "./system";

/**
 * Discovers live coding-agent sessions (Claude Code and Codex) and attributes
 * them to devices. Attribution comes from three signals, strongest first:
 * an explicit claim, a recent CLI/API request carrying the agent's session
 * headers ("touch"), and a lane whose worktree is the agent's working directory.
 */

export type AgentKind = "claude" | "codex";

export type AgentSession = {
  kind: AgentKind;
  sessionId: string;
  title: string;
  cwd: string;
  status: string | null;
  pid: number | null;
  startedAt: string | null;
  updatedAt: string | null;
};

export type DeviceAgent = AgentSession & {
  via: "claim" | "touch" | "lane-worktree";
  lastSeenAt: string | null;
  note?: string;
};

export const AGENT_HEADER = "x-simfleet-agent";
export const SESSION_HEADER = "x-simfleet-session";

const TOUCH_TTL_MS = 30 * 60 * 1000;
const CODEX_ACTIVE_WINDOW_MS = 30 * 60 * 1000;

function isoFromMs(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value).toISOString() : null;
}

function claudeSessions(): AgentSession[] {
  const directory = path.join(os.homedir(), ".claude", "sessions");
  let files: string[] = [];
  try {
    files = fs.readdirSync(directory).filter((file) => file.endsWith(".json"));
  } catch {
    return [];
  }
  const sessions: AgentSession[] = [];
  for (const file of files) {
    try {
      const entry = JSON.parse(fs.readFileSync(path.join(directory, file), "utf8")) as {
        pid?: number;
        sessionId?: string;
        cwd?: string;
        name?: string;
        status?: string;
        startedAt?: number;
        updatedAt?: number;
      };
      // The registry keeps files for exited sessions; only live PIDs count.
      if (!entry.pid || !entry.sessionId || !entry.cwd || !isProcessRunning(entry.pid)) continue;
      sessions.push({
        kind: "claude",
        sessionId: entry.sessionId,
        title: entry.name || path.basename(entry.cwd),
        cwd: entry.cwd,
        status: entry.status || null,
        pid: entry.pid,
        startedAt: isoFromMs(entry.startedAt),
        updatedAt: isoFromMs(entry.updatedAt),
      });
    } catch {
      // A registry file being rewritten is skipped until the next poll.
    }
  }
  return sessions;
}

function codexSessions(): AgentSession[] {
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  let databases: string[] = [];
  try {
    databases = fs
      .readdirSync(codexHome)
      .filter((file) => /^state_\d+\.sqlite$/.test(file))
      .sort((left, right) => Number(right.match(/\d+/)![0]) - Number(left.match(/\d+/)![0]));
  } catch {
    return [];
  }
  if (!databases.length) return [];
  let database: Database | null = null;
  try {
    database = new Database(path.join(codexHome, databases[0]), { readonly: true });
    const since = Date.now() - CODEX_ACTIVE_WINDOW_MS;
    // Codex desktop threads share one app-server process, so recency is the
    // only liveness signal available for them.
    const rows = database
      .query(
        `SELECT id, cwd, title, name, created_at_ms, updated_at_ms
           FROM threads
          WHERE archived = 0 AND updated_at_ms >= ?
          ORDER BY updated_at_ms DESC
          LIMIT 50`,
      )
      .all(since) as Array<{
      id: string;
      cwd: string;
      title: string;
      name: string | null;
      created_at_ms: number | null;
      updated_at_ms: number | null;
    }>;
    return rows.map((row) => ({
      kind: "codex" as const,
      sessionId: row.id,
      title: row.name || row.title || path.basename(row.cwd),
      cwd: row.cwd,
      status: "recent",
      pid: null,
      startedAt: isoFromMs(row.created_at_ms),
      updatedAt: isoFromMs(row.updated_at_ms),
    }));
  } catch {
    return [];
  } finally {
    database?.close();
  }
}

export function getAgentSessions(): AgentSession[] {
  return [...claudeSessions(), ...codexSessions()];
}

function within(directory: string, candidate: string): boolean {
  const relative = path.relative(directory, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function attachmentAlive(attachment: DeviceAttachment, sessions: AgentSession[]): boolean {
  const session = sessions.find(
    (candidate) =>
      candidate.kind === attachment.agent && candidate.sessionId === attachment.sessionId,
  );
  if (attachment.agent === "claude" && !session) return false;
  if (attachment.source === "claim") return true;
  return Date.now() - Date.parse(attachment.lastSeenAt) < TOUCH_TTL_MS;
}

export function recordAttachment(input: {
  deviceId: string;
  platform: DevicePlatform;
  agent: string;
  sessionId: string;
  source: "claim" | "touch";
  note?: string;
}): DeviceAttachment {
  const now = new Date().toISOString();
  let recorded!: DeviceAttachment;
  updateState((state) => {
    const attachments = state.attachments || [];
    const existing = attachments.find(
      (attachment) =>
        attachment.deviceId === input.deviceId &&
        attachment.agent === input.agent &&
        attachment.sessionId === input.sessionId,
    );
    if (existing) {
      existing.lastSeenAt = now;
      // A touch never downgrades an explicit claim.
      if (input.source === "claim") existing.source = "claim";
      if (input.note !== undefined) existing.note = input.note;
      recorded = existing;
    } else {
      recorded = { ...input, firstSeenAt: now, lastSeenAt: now };
      attachments.push(recorded);
    }
    state.attachments = attachments;
  });
  return recorded;
}

export function releaseAttachment(deviceId: string, agent: string, sessionId: string): boolean {
  let removed = false;
  updateState((state) => {
    const before = state.attachments?.length || 0;
    state.attachments = (state.attachments || []).filter(
      (attachment) =>
        !(
          attachment.deviceId === deviceId &&
          attachment.agent === agent &&
          attachment.sessionId === sessionId
        ),
    );
    removed = state.attachments.length !== before;
  });
  return removed;
}

/** Returns agents attached to each device id and prunes expired attachments. */
export function attributeAgents(
  deviceIds: string[],
  lanes: FleetSession[],
  sessions = getAgentSessions(),
): Map<string, DeviceAgent[]> {
  const state = loadState();
  const live = (state.attachments || []).filter((attachment) =>
    attachmentAlive(attachment, sessions),
  );
  if (live.length !== (state.attachments || []).length) {
    updateState((current) => {
      current.attachments = (current.attachments || []).filter((attachment) =>
        attachmentAlive(attachment, sessions),
      );
    });
  }

  const byDevice = new Map<string, DeviceAgent[]>();
  const add = (deviceId: string, agent: DeviceAgent) => {
    const list = byDevice.get(deviceId) || [];
    if (
      !list.some(
        (existing) => existing.kind === agent.kind && existing.sessionId === agent.sessionId,
      )
    ) {
      list.push(agent);
      byDevice.set(deviceId, list);
    }
  };

  for (const attachment of live) {
    if (!deviceIds.includes(attachment.deviceId)) continue;
    const session = sessions.find(
      (candidate) =>
        candidate.kind === attachment.agent && candidate.sessionId === attachment.sessionId,
    );
    add(attachment.deviceId, {
      ...(session || {
        kind: attachment.agent as AgentKind,
        sessionId: attachment.sessionId,
        title: attachment.note || attachment.sessionId.slice(0, 8),
        cwd: "",
        status: null,
        pid: null,
        startedAt: null,
        updatedAt: null,
      }),
      via: attachment.source,
      lastSeenAt: attachment.lastSeenAt,
      note: attachment.note,
    });
  }

  for (const lane of lanes) {
    for (const session of sessions) {
      if (!within(lane.worktreePath, session.cwd)) continue;
      add(lane.simulatorUdid, { ...session, via: "lane-worktree", lastSeenAt: session.updatedAt });
    }
  }
  return byDevice;
}
