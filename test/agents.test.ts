import { describe, expect, test } from "bun:test";
import { laneAgents, requestAgent, type AgentSession } from "../src/agents";
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

const lane = (worktreePath: string, startedBy?: FleetSession["startedBy"]): FleetSession => ({
  id: "lane",
  branch: "main",
  worktreePath,
  simulatorUdid: "UDID",
  environment: "development",
  mode: "debug",
  bundleId: "com.example",
  port: 8100,
  metroPid: null,
  logPath: "/tmp/lane.log",
  startedAt: new Date(0).toISOString(),
  ...(startedBy ? { startedBy } : {}),
});

describe("lane attribution", () => {
  const sessions = [session("a", "/repo"), session("b", "/repo"), session("c", "/elsewhere")];

  test("credits only the session that started the lane", () => {
    const agents = laneAgents(lane("/repo", { agent: "claude", sessionId: "a" }), sessions);
    expect(agents.map((agent) => [agent.sessionId, agent.via])).toEqual([["a", "lane-owner"]]);
  });

  test("credits the starter even when the worktree is outside its directory", () => {
    const agents = laneAgents(lane("/worktrees/x", { agent: "claude", sessionId: "c" }), sessions);
    expect(agents.map((agent) => agent.sessionId)).toEqual(["c"]);
  });

  test("credits nobody once the starting session is gone", () => {
    expect(laneAgents(lane("/repo", { agent: "claude", sessionId: "gone" }), sessions)).toEqual([]);
  });

  test("falls back to the worktree match for lanes with no recorded starter", () => {
    const agents = laneAgents(lane("/repo"), sessions);
    expect(agents.map((agent) => [agent.sessionId, agent.via])).toEqual([
      ["a", "lane-worktree"],
      ["b", "lane-worktree"],
    ]);
  });

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
