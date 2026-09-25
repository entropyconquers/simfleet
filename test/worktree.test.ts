import { describe, expect, test } from "bun:test";
import path from "node:path";
import { fleetWorktreePath, validateWorktreeSlug } from "../src/worktree";

describe("fleet worktree preparation", () => {
  test("derives a sibling path from a safe agent-owned name", () => {
    expect(fleetWorktreePath("/tmp/project/mobile", "agent-e2e-a")).toBe(
      path.join("/tmp/project", "mobile-agent-e2e-a"),
    );
  });

  test("rejects names that could escape or alias a broad directory", () => {
    for (const name of ["../outside", "/tmp/outside", "A", "has space", "a/b"]) {
      expect(() => validateWorktreeSlug(name)).toThrow();
    }
  });
});
