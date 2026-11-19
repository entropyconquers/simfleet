import { describe, expect, test } from "bun:test";
import { laneWorktreeAgents, requestAgent, type AgentSession } from "../src/agents";
import type { FleetSession } from "../src/state";

const session = (sessionId: string, cwd: string): AgentSession => ({
  kind: "claude",
  sessionId,
  title: sessionId,
  cwd,
  status: null,
  pid: null,
  startedAt: null,
  updatedAt: null,
});

const lane = (simulatorUdid: string, worktreePath: string): FleetSession => ({
  id: `lane-${simulatorUdid}`,
  branch: "main",
  worktreePath,
  simulatorUdid,
  environment: "development",
  mode: "debug",
  bundleId: "com.example",
  port: 8100,
  metroPid: null,
  logPath: "/tmp/lane.log",
  startedAt: new Date(0).toISOString(),
});

describe("lane worktree attribution", () => {
  const sessions = [session("a", "/repo"), session("b", "/repo/sub"), session("c", "/elsewhere")];

  test("guesses sessions working inside an unclaimed lane's worktree", () => {
    const agents = laneWorktreeAgents([lane("D1", "/repo")], sessions, new Set());
    expect(agents.map(([device, agent]) => [device, agent.sessionId, agent.via])).toEqual([
      ["D1", "a", "lane-worktree"],
      ["D1", "b", "lane-worktree"],
    ]);
  });

  test("skips devices that a session already claimed or touched", () => {
    const lanes = [lane("D1", "/repo"), lane("D2", "/repo")];
    const agents = laneWorktreeAgents(lanes, sessions, new Set(["D1"]));
    expect(agents.map(([device]) => device)).toEqual(["D2", "D2"]);
  });
});

describe("request identity", () => {
  test("reads a well-formed agent identity from request headers", () => {
    const headers = (entries: Record<string, string>) => new Headers(entries);
    expect(
      requestAgent(headers({ "x-simfleet-agent": "claude", "x-simfleet-session": "s1" })),
    ).toEqual({ agent: "claude", sessionId: "s1" });
    expect(requestAgent(headers({ "x-simfleet-agent": "claude" }))).toBeNull();
    expect(
      requestAgent(headers({ "x-simfleet-agent": "bad agent", "x-simfleet-session": "s1" })),
    ).toBeNull();
  });
});
