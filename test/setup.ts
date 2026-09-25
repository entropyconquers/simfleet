import path from "node:path";

// Every module resolves its project at import time; tests use a fixture project.
process.env.SIM_FLEET_PROJECT_ROOT ||= path.join(import.meta.dir, "fixture");
