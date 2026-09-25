import { createStore } from "./store";

/**
 * One stable polite live region for status changes that are not tied to a
 * control (result counts, stream state). Toasts use their own region.
 */
export const announcer = createStore<{ message: string; nonce: number }>({ message: "", nonce: 0 });

let clearTimer = 0;
export function announce(message: string) {
  announcer.set((current) => ({ message, nonce: current.nonce + 1 }));
  clearTimeout(clearTimer);
  clearTimer = window.setTimeout(() => announcer.set({ message: "" }), 6000);
}
