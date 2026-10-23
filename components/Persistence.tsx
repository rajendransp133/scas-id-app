"use client";

import { useEffect, useState, type ReactNode } from "react";
import { clearSession, loadBook, loadSession, saveBook, saveSession } from "@/lib/browser/persist";
import { openBook } from "@/lib/import";
import { DEFAULT_OPTIONS } from "@/lib/types";
import { useStore } from "@/store/useStore";

/**
 * Restores the last session on load, then saves on every change (debounced).
 * Children render only once restoring has finished, so pages never flash
 * "no class loaded" on a refresh.
 */
export function Persistence({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let unsub = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      const [session, saved] = await Promise.all([loadSession(), loadBook()]);
      if (session?.version === 1 && session.students.length && !useStore.getState().students.length) {
        let book = null;
        try { book = saved ? openBook(saved.data, saved.fileName) : null; } catch { book = null; }
        useStore.setState({
          book, sheetName: session.sheetName, students: session.students.map((st) => ({ ...st, reg_no: st.reg_no ?? "" })), photos: session.photos,
          edits: session.edits, options: { ...DEFAULT_OPTIONS, ...session.options }, selected: session.selected,
        });
      }
      setReady(true);

      let lastBook = useStore.getState().book;
      unsub = useStore.subscribe((s) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (!s.students.length) { void clearSession(); lastBook = null; return; }
          if (s.book && s.book !== lastBook) {
            lastBook = s.book;
            void saveBook({ fileName: s.book.fileName, data: s.book.data });
          }
          void saveSession({
            version: 1, sheetName: s.sheetName, students: s.students, photos: s.photos,
            edits: s.edits, options: s.options, selected: s.selected,
          });
        }, 400);
      });
    })();
    return () => { unsub(); clearTimeout(timer); };
  }, []);

  return ready ? <>{children}</> : null;
}
