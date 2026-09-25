import { useSyncExternalStore } from "react";

export function useMedia(query: string): boolean {
  const media = window.matchMedia(query);
  return useSyncExternalStore(
    (listener) => {
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    },
    () => media.matches,
    () => false,
  );
}

export function useReducedMotion(): boolean {
  return useMedia("(prefers-reduced-motion: reduce)");
}
