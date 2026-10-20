"use client";

import { create } from "zustand";
import type { Book } from "@/lib/import";
import {
  DEFAULT_EDIT,
  DEFAULT_OPTIONS,
  type GenerateOptions,
  type PhotoEdit,
  type Student,
  type StudentPhoto,
} from "@/lib/types";

interface State {
  book: Book | null;
  sheetName: string | null;
  students: Student[];
  /** photos[i] belongs to students[i] */
  photos: (StudentPhoto | null)[];
  edits: Record<number, PhotoEdit>;
  selected: number;
  options: GenerateOptions;

  loadSheet: (book: Book, sheetName: string, students: Student[], photos: (StudentPhoto | null)[]) => void;
  select: (i: number) => void;
  updateStudent: (i: number, patch: Partial<Student>) => void;
  setPhoto: (i: number, photo: StudentPhoto | null) => void;
  setEdit: (i: number, edit: PhotoEdit | null) => void;
  setOptions: (patch: Partial<GenerateOptions>) => void;
  reset: () => void;
}

/** The edit a card renders with: the user's, or the defaults with the global
 *  sharpening choice. */
export function effectiveEdit(edits: Record<number, PhotoEdit>, i: number, options: GenerateOptions): PhotoEdit {
  return edits[i] ?? { ...DEFAULT_EDIT, sharpen: options.sharpen };
}

const empty = { book: null, sheetName: null, students: [], photos: [], edits: {}, selected: 0 };

export const useStore = create<State>()((set) => ({
  ...empty,
  options: DEFAULT_OPTIONS,

  loadSheet: (book, sheetName, students, photos) =>
    set({ book, sheetName, students, photos, edits: {}, selected: 0 }),
  select: (i) => set((s) => ({ selected: Math.max(0, Math.min(s.students.length - 1, i)) })),
  updateStudent: (i, patch) =>
    set((s) => ({ students: s.students.map((st, j) => (j === i ? { ...st, ...patch } : st)) })),
  setPhoto: (i, photo) =>
    set((s) => {
      const photos = s.photos.slice();
      photos[i] = photo;
      const edits = { ...s.edits };
      delete edits[i];                  // an edit belongs to the photo it was made on
      return { photos, edits };
    }),
  setEdit: (i, edit) =>
    set((s) => {
      const edits = { ...s.edits };
      if (edit) edits[i] = edit;
      else delete edits[i];
      return { edits };
    }),
  setOptions: (patch) => set((s) => ({ options: { ...s.options, ...patch } })),
  reset: () => set({ ...empty }),
}));
