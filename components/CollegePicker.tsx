"use client";

import { useSyncExternalStore } from "react";
import { setCollege } from "@/lib/browser/college";
import { COLLEGE_IDS, COLLEGES, type CollegeId } from "@/lib/card/colleges";
import type { Student } from "@/lib/types";
import { useStore } from "@/store/useStore";
import { Mark } from "./Mark";
import { CardPreview } from "./CardPreview";

// Asked once after sign-in, before the upload page: whose cards these are.
// Each choice is that college's real card, drawn by the card renderer in the
// current theme, so the header, signature and rows can be compared directly.

/** A made-up student, only to fill the sample cards. */
const SAMPLE: Record<CollegeId, Student> = {
  scas: {
    name: "S.KAVIYA",
    course: "B.Sc., COMPUTER SCIENCE",
    year: "",
    batch: "2025 - 2028",
    dob: "14.06.2007",
    contact: "9876543210",
    address: "12/4, NORTH STREET, KEERANUR, PUDUKKOTTAI - 622502",
    blood_group: "B+",
    reg_no: "",
  },
  sce: {
    name: "S.KAVIYA",
    course: "B.Ed., ENGLISH",
    year: "",
    batch: "2025 - 2027",
    dob: "14.06.2003",
    contact: "9876543210",
    address: "12/4, NORTH STREET, KEERANUR, PUDUKKOTTAI - 622502",
    blood_group: "B+",
    reg_no: "2513021045",
  },
};

/** What sets each card apart, in words. */

const WIDE = "(min-width: 640px)";
function useWide(): boolean {
  return useSyncExternalStore(
    (l) => {
      const m = window.matchMedia(WIDE);
      m.addEventListener("change", l);
      return () => m.removeEventListener("change", l);
    },
    () => window.matchMedia(WIDE).matches,
    () => true,
  );
}

const textBtn =
  "flex h-8 items-center text-sm font-medium hover:underline pointer-coarse:h-11 focus-visible:outline-2 focus-visible:outline-ink";

export function CollegePicker({
  current,
  onDone,
  onCancel,
  onSignOut,
}: {
  current?: CollegeId | null;
  onDone?: () => void;
  onCancel?: () => void;
  onSignOut?: () => void;
}) {
  const theme = useStore((s) => s.options.themes[0] ?? "classic");
  const thumb = useWide() ? 200 : 112;

  return (
    <div className="flex min-h-dvh flex-col bg-frame">
      {/* one column, capped and centred; the bar shares its left edge */}
      <header className="mx-auto flex h-12 w-full max-w-[1088px] items-center gap-2.5 px-4 sm:px-6">
        <Mark />
        <span className="text-sm font-semibold">Sudharsan ID cards</span>
      </header>

      <main className="mx-auto flex w-full max-w-[1088px] flex-1 items-start px-4 pb-10 pt-6 sm:items-center sm:px-6 sm:pt-0">
        <div className="w-full">
          <h1 className="text-xl font-semibold leading-7 tracking-[-0.01em] sm:text-[22px]">
            Which college are these cards for?
          </h1>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {COLLEGE_IDS.map((id) => {
              const c = COLLEGES[id];
              const on = id === current;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setCollege(id);
                    onDone?.();
                  }}
                  aria-pressed={on}
                  className={`flex flex-col items-center gap-4 rounded-lg border bg-sheet p-4 text-left transition-colors hover:bg-raised active:bg-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:gap-5 sm:p-5 ${on ? "border-ink" : "border-line hover:border-control"}`}
                >
                  <CardPreview
                    student={SAMPLE[id]}
                    photo={null}
                    theme={theme}
                    college={c}
                    width={thumb}
                    className="pointer-events-none"
                  />
                  <span className="flex min-w-0 flex-col gap-3">
                    <span className="text-base font-semibold leading-snug text-ink">
                      {c.label}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {(onCancel || onSignOut) && (
            <div className="mt-6 flex gap-5">
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className={`${textBtn} text-ink`}
                >
                  Cancel
                </button>
              )}
              {onSignOut && (
                <button
                  type="button"
                  onClick={onSignOut}
                  className={`${textBtn} text-muted hover:text-ink`}
                >
                  Sign out
                </button>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
