// Which college the cards are for.  Chosen after sign-in, before the upload
// page, and remembered on this device (it survives "Start over": it is not
// class data).

import { useSyncExternalStore } from "react";
import { COLLEGES, isCollegeId, type College, type CollegeId } from "@/lib/card/colleges";

const KEY = "scas-id-card:college";

const listeners = new Set<() => void>();

function read(): CollegeId | null {
  try {
    const v = localStorage.getItem(KEY);
    return isCollegeId(v) ? v : null;
  } catch {
    return null;
  }
}

let memo: CollegeId | null | undefined;

function write(id: CollegeId | null) {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    // private mode: the choice lasts until the page is reloaded
  }
  memo = id;
  listeners.forEach((l) => l());
}

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

/** The chosen id, null if none yet; undefined while prerendering and hydrating. */
export function useCollegeId(): CollegeId | null | undefined {
  return useSyncExternalStore(
    subscribe,
    () => (memo === undefined ? (memo = read()) : memo),
    () => undefined,
  );
}

/** The chosen college, for screens that only render after the choice. */
export function useCollege(): College {
  return COLLEGES[useCollegeId() ?? "scas"];
}

export function setCollege(id: CollegeId) {
  write(id);
}

export function clearCollege() {
  write(null);
}
