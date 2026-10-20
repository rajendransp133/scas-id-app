// Session persistence in IndexedDB, so a refresh keeps the class, its photos
// and edits.  Everything stays in this browser.  Failures (private mode,
// quota) are swallowed: the app works without persistence.

import type { GenerateOptions, PhotoEdit, Student, StudentPhoto } from "@/lib/types";

const DB = "scas-id-cards";
const STORE = "session";

export interface SessionBook { fileName: string; data: Uint8Array }

export interface Session {
  version: 1;
  sheetName: string | null;
  students: Student[];
  photos: (StudentPhoto | null)[];
  edits: Record<number, PhotoEdit>;
  options: GenerateOptions;
  selected: number;
}

let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const safe = async <T>(p: () => Promise<T>): Promise<T | null> => {
  try {
    return typeof indexedDB === "undefined" ? null : await p();
  } catch {
    return null;
  }
};

export const loadSession = () => safe(async () => (await tx<Session>("readonly", (s) => s.get("session"))) ?? null);
export const loadBook = () => safe(async () => (await tx<SessionBook>("readonly", (s) => s.get("book"))) ?? null);
export const saveSession = (v: Session) => safe(() => tx("readwrite", (s) => { s.put(v, "session"); }));
export const saveBook = (v: SessionBook) => safe(() => tx("readwrite", (s) => { s.put(v, "book"); }));
export const clearSession = () => safe(() => tx("readwrite", (s) => { s.clear(); }));
