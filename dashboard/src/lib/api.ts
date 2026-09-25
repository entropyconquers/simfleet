import type { AndroidDefinition, IosDefinition, Job, Platform, Status } from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Thrown when the fleet server itself cannot be reached (network failure). */
export class OfflineError extends Error {}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      ...init,
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers || {}),
      },
    });
  } catch (error) {
    throw new OfflineError(error instanceof Error ? error.message : "Network error");
  }
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `${response.status} ${response.statusText}`;
    throw new ApiError(message, response.status);
  }
  return data as T;
}

export const api = {
  status: () => request<Status>("/api/v1/status"),
  agents: () =>
    request<{
      sessions: Status["agentSessions"];
      devices: Array<{ platform: Platform; deviceId: string; name: string; state: string }>;
    }>("/api/v1/agents"),
  definition: (platform: Platform, id: string) =>
    platform === "ios"
      ? request<IosDefinition>(`/api/v1/simulators/${encodeURIComponent(id)}/definition`)
      : request<AndroidDefinition>(`/api/v1/emulators/${encodeURIComponent(id)}/definition`),
  input: (platform: Platform, id: string, payload: Record<string, unknown>) =>
    request<{ ok: true }>(
      `/api/v1/${platform === "ios" ? "simulators" : "emulators"}/${encodeURIComponent(id)}/input`,
      { method: "POST", body: JSON.stringify(payload) },
    ),
  lifecycle: (platform: Platform, id: string, action: string, options?: Record<string, unknown>) =>
    request<{ job: Job; pollUrl: string }>(
      `/api/v1/${platform === "ios" ? "simulators" : "emulators"}/${encodeURIComponent(id)}/${action}`,
      { method: "POST", body: JSON.stringify(options ?? {}) },
    ),
  job: (pollUrl: string) => request<{ job: Job }>(pollUrl),
  startLane: (payload: {
    worktreePath: string;
    simulatorUdid: string;
    environment: string;
    mode: string;
  }) => request<{ session: unknown }>("/api/v1/lanes", { method: "POST", body: JSON.stringify(payload) }),
  laneAction: (id: string, action: "launch" | "stop") =>
    request<Record<string, unknown> & { job?: Job; pollUrl?: string }>(
      `/api/v1/lanes/${encodeURIComponent(id)}/${action}`,
      { method: "POST" },
    ),
  laneOpenUrl: (id: string, url: string) =>
    request<{ opened: string }>(`/api/v1/lanes/${encodeURIComponent(id)}/open-url`, {
      method: "POST",
      body: JSON.stringify({ url }),
    }),
  laneLog: async (id: string, maxCharacters = 40000): Promise<string> => {
    let response: Response;
    try {
      response = await fetch(
        `/api/v1/lanes/${encodeURIComponent(id)}/log?maxCharacters=${maxCharacters}`,
        { cache: "no-store" },
      );
    } catch (error) {
      throw new OfflineError(error instanceof Error ? error.message : "Network error");
    }
    if (!response.ok) throw new ApiError(`Could not read log (${response.status})`, response.status);
    return response.text();
  },
  releaseClaim: (deviceId: string, agent: string, sessionId: string) =>
    request<{ released: boolean }>(`/api/v1/devices/${encodeURIComponent(deviceId)}/claim`, {
      method: "DELETE",
      body: JSON.stringify({ agent, sessionId }),
    }),
};

/** Resolves when the job completes; rejects with the job's error when it fails. */
export async function waitForJob(pollUrl: string, intervalMs = 1500, signal?: AbortSignal): Promise<Job> {
  for (;;) {
    const { job } = await api.job(pollUrl);
    if (job.status === "complete") return job;
    if (job.status === "failed") throw new ApiError(job.error || "The operation failed", 500);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, intervalMs);
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      });
    });
  }
}

export function screenshotUrl(platform: Platform, id: string): string {
  return `/api/v1/${platform === "ios" ? "simulators" : "emulators"}/${encodeURIComponent(id)}/screenshot`;
}

export function streamUrl(udid: string): string {
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${location.host}/api/v1/simulators/${encodeURIComponent(udid)}/stream?format=mjpeg&version=v2`;
}
