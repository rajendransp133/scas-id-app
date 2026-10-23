// A sign-in gate for a static site. The credentials ship in the bundle, so
// this only keeps casual visitors out; it is not access control.

import { useSyncExternalStore } from "react";

const USERNAME = "admin";
const PASSWORD = "admin123";
const KEY = "scas-id-card:session";

const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === USERNAME;
  } catch {
    return false;
  }
}

function write(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, USERNAME);
    else localStorage.removeItem(KEY);
  } catch {
    // private mode: the session lasts until the page is reloaded
  }
  memo = on;
  listeners.forEach((l) => l());
}

let memo: boolean | null = null;

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      memo = read();
      l();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

/** true / false in the browser; null while prerendering and hydrating. */
export function useSignedIn(): boolean | null {
  return useSyncExternalStore(
    subscribe,
    () => (memo ??= read()),
    () => null,
  );
}

export function signIn(username: string, password: string): boolean {
  const ok = username.trim().toLowerCase() === USERNAME && password === PASSWORD;
  if (ok) write(true);
  return ok;
}

export function signOut() {
  write(false);
}
