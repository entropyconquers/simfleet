import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { PROJECT_CONFIG } from "./config";

// Files carrying the fleet overlay on top of the base ref. The overlay is
// applied as a patch against baseRef, never as a file copy: a lane worktree
// keeps its own branch content, and a branch that predates the base must not
// be handed newer source that references modules it does not have.
const worktreeConfig = PROJECT_CONFIG.worktrees || {};
const FLEET_BASE_REF = worktreeConfig.baseRef || "origin/main";
const overlayFiles = worktreeConfig.overlayFiles || [];
const removedLegacyFleetFiles = worktreeConfig.removedFiles || [];
const sharedFleetPaths = worktreeConfig.sharedPaths || [".sim-fleet", "node_modules"];
const linkedSkills = worktreeConfig.skills || [];

function runGit(repoRoot: string, args: string[]): string {
  const result = spawnSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `git ${args[0]} failed`);
  }
  return result.stdout.trim();
}

export function validateWorktreeSlug(slug: string): string {
  const normalized = slug.trim();
  if (!/^[a-z0-9][a-z0-9-]{1,47}$/.test(normalized)) {
    throw new Error("worktree name must be 2-48 lowercase letters, digits, or hyphens");
  }
  return normalized;
}

export function fleetWorktreePath(repoRoot: string, slug: string): string {
  return path.join(
    path.dirname(repoRoot),
    `${path.basename(repoRoot)}-${validateWorktreeSlug(slug)}`,
  );
}

function createSharedLink(repoRoot: string, worktreePath: string, relativePath: string): void {
  const source = path.join(repoRoot, relativePath);
  if (!fs.existsSync(source)) return;
  const destination = path.join(worktreePath, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  try {
    const current = fs.lstatSync(destination);
    if (current.isSymbolicLink() && fs.realpathSync(destination) === fs.realpathSync(source))
      return;
    throw new Error(`${destination} already exists and is not the fleet shared link`);
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
  }
  fs.symlinkSync(source, destination);
}

function applyFleetOverlay(
  repoRoot: string,
  worktreePath: string,
  relativePath: string,
): "applied" | "unchanged" | "skipped" {
  const source = path.join(repoRoot, relativePath);
  if (!fs.existsSync(source)) throw new Error(`Fleet bootstrap source is missing: ${source}`);

  const patch = runGit(repoRoot, ["diff", FLEET_BASE_REF, "HEAD", "--", relativePath]);
  if (patch === "") return "unchanged";

  const destination = path.join(worktreePath, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });

  // Preparing an already-prepared worktree must be a no-op, never a revert.
  const alreadyApplied = spawnSync(
    "git",
    ["-C", worktreePath, "apply", "--reverse", "--check", "--whitespace=nowarn"],
    { input: `${patch}\n`, encoding: "utf8", stdio: ["pipe", "ignore", "ignore"] },
  );
  if (alreadyApplied.status === 0) return "unchanged";

  // A branch sitting exactly on the base takes the fleet file verbatim; anything
  // else is merged so the branch's own edits survive.
  const baseVersion = spawnSync(
    "git",
    ["-C", repoRoot, "show", `${FLEET_BASE_REF}:${relativePath}`],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  const current = fs.existsSync(destination) ? fs.readFileSync(destination, "utf8") : null;
  if (baseVersion.status === 0 && current !== null && current === baseVersion.stdout) {
    fs.copyFileSync(source, destination);
    fs.chmodSync(destination, fs.statSync(source).mode);
    return "applied";
  }

  const applied = spawnSync("git", ["-C", worktreePath, "apply", "--3way", "--whitespace=nowarn"], {
    input: `${patch}\n`,
    encoding: "utf8",
    stdio: ["pipe", "ignore", "pipe"],
  });
  if (applied.status === 0) return "applied";

  // The branch owns this file in a way the overlay cannot be merged into. Restore
  // exactly what was there before the attempt — never `checkout HEAD`, which
  // would throw away an overlay a previous run had already applied. A failed
  // --3way also stages a conflicted entry, so drop that first.
  spawnSync("git", ["-C", worktreePath, "reset", "-q", "--", relativePath], { stdio: "ignore" });
  if (current === null) fs.rmSync(destination, { force: true });
  else fs.writeFileSync(destination, current);
  return "skipped";
}

export function prepareFleetWorktree(repoRoot: string, worktreePath: string): string[] {
  const skipped: string[] = [];
  for (const relativePath of overlayFiles) {
    if (applyFleetOverlay(repoRoot, worktreePath, relativePath) === "skipped") {
      skipped.push(relativePath);
    }
  }
  for (const relativePath of sharedFleetPaths) {
    createSharedLink(repoRoot, worktreePath, relativePath);
  }
  for (const relativePath of removedLegacyFleetFiles) {
    fs.rmSync(path.join(worktreePath, relativePath), { force: true });
  }

  // Agents in the new worktree must see the same skills as the main checkout.
  for (const skill of linkedSkills) {
    const source = path.join(repoRoot, skill);
    if (!fs.existsSync(source)) continue;
    for (const agentDirectory of [".claude", ".codex"]) {
      const destination = path.join(worktreePath, agentDirectory, "skills", path.basename(skill));
      if (fs.existsSync(destination)) continue;
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.symlinkSync(source, destination);
    }
  }
  return skipped;
}

export function createFleetWorktree(
  repoRoot: string,
  slug: string,
  branch: string,
  startPoint = "HEAD",
): {
  path: string;
  branch: string;
  startPoint: string;
  prepared: true;
  overlaySkipped: string[];
} {
  const worktreePath = fleetWorktreePath(repoRoot, slug);
  if (fs.existsSync(worktreePath)) throw new Error(`Worktree path already exists: ${worktreePath}`);
  runGit(repoRoot, ["check-ref-format", "--branch", branch]);
  runGit(repoRoot, ["rev-parse", "--verify", `${startPoint}^{commit}`]);

  const existingBranch = spawnSync(
    "git",
    ["-C", repoRoot, "show-ref", "--verify", "--quiet", `refs/heads/${branch}`],
    { stdio: "ignore" },
  );
  if (existingBranch.status === 0) throw new Error(`Branch already exists: ${branch}`);

  runGit(repoRoot, ["worktree", "add", "-b", branch, worktreePath, startPoint]);
  const overlaySkipped = prepareFleetWorktree(repoRoot, worktreePath);
  return { path: worktreePath, branch, startPoint, prepared: true, overlaySkipped };
}
