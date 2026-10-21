import { expect, test } from "bun:test";
import path from "node:path";

// Separate processes keep scrcpy discovery/version caching and fake tool paths
// isolated from the other tests and from each other.
for (const version of ["3.3.4", "4.0", "4.1"]) {
  test(`streams scrcpy ${version} video to viewers`, async () => {
    const child = Bun.spawn([process.execPath, path.join(import.meta.dir, "support/android-stream.ts"), version], {
      env: { ...process.env, SIM_FLEET_PROJECT_ROOT: path.join(import.meta.dir, "fixture") },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect({ exitCode, stdout, stderr }).toEqual({ exitCode: 0, stdout: "", stderr: "" });
  });
}
