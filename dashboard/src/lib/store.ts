import { useSyncExternalStore } from "react";

/** A tiny external store so tiles can subscribe to slices without re-rendering the wall. */
export function createStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  const get = () => state;
  const set = (patch: Partial<T> | ((current: T) => Partial<T>)) => {
    const next = typeof patch === "function" ? patch(state) : patch;
    let changed = false;
    for (const key in next) {
      if (!Object.is(state[key], next[key])) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    state = { ...state, ...next };
    listeners.forEach((listener) => listener());
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  function use<S>(selector: (state: T) => S): S {
    return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
  }
  return { get, set, subscribe, use };
}
