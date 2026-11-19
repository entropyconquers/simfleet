import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { envFileValues } from "../src/config";

describe("environment envFile", () => {
  test("parses the environment's envFile from the worktree", () => {
    const worktree = fs.mkdtempSync(path.join(os.tmpdir(), "sim-fleet-env-"));
    fs.writeFileSync(
      path.join(worktree, ".env.staging"),
      [
        "# comment",
        "PLAIN=value",
        "export EXPORTED=yes",
        'DOUBLE="has # hash"',
        "SINGLE='quoted'",
        "INLINE=kept # dropped",
        "EMPTY=",
        "not a variable",
      ].join("\n"),
    );
    expect(envFileValues(worktree, "staging")).toEqual({
      PLAIN: "value",
      EXPORTED: "yes",
      DOUBLE: "has # hash",
      SINGLE: "quoted",
      INLINE: "kept",
      EMPTY: "",
    });
  });

  test("returns nothing when the environment has no envFile or it is missing", () => {
    const worktree = fs.mkdtempSync(path.join(os.tmpdir(), "sim-fleet-env-"));
    expect(envFileValues(worktree, "development")).toEqual({});
    expect(envFileValues(worktree, "staging")).toEqual({});
  });
});
