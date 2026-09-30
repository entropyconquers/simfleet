import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { projectLocation } from "../src/config";

const temporary = fs.realpathSync(
  fs.mkdtempSync(path.join(os.tmpdir(), "simfleet-config-")),
);
afterAll(() => fs.rmSync(temporary, { recursive: true, force: true }));

function git(cwd: string, ...args: string[]) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
}

function repositoryWithProjectIn(appDirectory: string) {
  const main = path.join(
    temporary,
    `main-${appDirectory.replaceAll("/", "-") || "root"}`,
  );
  fs.mkdirSync(path.join(main, appDirectory, ".sim-fleet"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(main, appDirectory, ".sim-fleet", "project.json"),
    "{}\n",
  );
  git(main, "init", "-q");
  git(main, "add", ".");
  git(
    main,
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@t",
    "commit",
    "-qm",
    "init",
  );
  const worktree = `${main}-feature`;
  git(main, "worktree", "add", "-q", "-b", "feature", worktree);
  return { main, worktree };
}

describe("project location", () => {
  test("an app at the checkout root runs from the root of each worktree", () => {
    const { main, worktree } = repositoryWithProjectIn("");
    expect(projectLocation(worktree)).toEqual({
      projectRoot: main,
      repoRoot: main,
      appDirectory: "",
    });
  });

  test("an app in a monorepo subdirectory runs from that subdirectory of each worktree", () => {
    const { main, worktree } = repositoryWithProjectIn("apps/mobile");
    expect(projectLocation(path.join(worktree, "apps/mobile"))).toEqual({
      projectRoot: path.join(main, "apps/mobile"),
      repoRoot: main,
      appDirectory: "apps/mobile",
    });
  });
});
