export function bytes(value: number | null | undefined): string {
  if (!value || !Number.isFinite(value) || value <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let index = 0;
  let amount = value;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return `${amount < 10 && index > 0 ? amount.toFixed(1) : Math.round(amount)} ${units[index]}`;
}

export function percent(value: number): string {
  return `${Math.round(value)}%`;
}

/** "iOS 26 5" / "iOS-18-2" → "iOS 26.5" */
export function runtimeLabel(runtime: string): string {
  const match = runtime.match(/^([A-Za-z]+)[ .-]?(\d+)(?:[ .-](\d+))?/);
  if (!match) return runtime;
  return `${match[1]} ${match[2]}${match[3] ? `.${match[3]}` : ""}`;
}

export function shortPath(path: string, home = "~"): string {
  return path.replace(/^\/Users\/[^/]+/, home);
}

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "—";
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}

export function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

export function plural(count: number, noun: string, pluralNoun = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : pluralNoun}`;
}
