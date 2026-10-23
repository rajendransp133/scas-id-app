"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { signOut, useSignedIn } from "@/lib/browser/auth";
import { clearCollege, useCollege, useCollegeId } from "@/lib/browser/college";
import { useStore } from "@/store/useStore";
import { CollegePicker } from "./CollegePicker";
import { Login } from "./Login";
import { Mark } from "./Mark";
import { Persistence } from "./Persistence";

// Grid: sidebar 228 + sheet (fluid, inset 8 from the right and bottom) = window.
// Below lg the frame folds: a 48px top bar, the sheet as the screen, and the
// four steps in a bottom bar.

function useSteps() {
  const loaded = useStore((s) => s.students.length);
  const fileName = useStore((s) => s.book?.fileName ?? null);
  const missing = useStore((s) => s.photos.filter((p) => !p).length);
  const edited = useStore((s) => Object.keys(s.edits).length);
  const output = useStore((s) => {
    const o = s.options;
    return `${o.themes[0]} · ${o.format === "svg" ? "SVG" : o.format === "both" ? "PNG + SVG" : `PNG ${o.dpi} dpi`}`;
  });
  return [
    {
      href: "/",
      label: "Upload",
      short: "Upload",
      status: fileName ?? "No workbook yet",
      warn: false,
    },
    {
      href: "/review",
      label: "Review",
      short: "Review",
      status: missing ? `${missing} without a photo` : `${loaded} students`,
      warn: missing > 0,
    },
    {
      href: "/editor",
      label: "Photo editor",
      short: "Photos",
      status: edited
        ? `${edited} photo${edited === 1 ? "" : "s"} adjusted`
        : "No adjustments yet",
      warn: false,
    },
    {
      href: "/generate",
      label: "Generate",
      short: "Generate",
      status: output,
      warn: false,
    },
  ].map((s, i) => ({ ...s, disabled: i > 0 && !loaded }));
}

export function StartOver({ className = "" }: { className?: string }) {
  const fileName = useStore((s) => s.book?.fileName ?? "this class");
  const count = useStore((s) => s.students.length);
  if (!count) return null;
  return (
    <button
      type="button"
      className={`text-sm font-medium text-negative hover:underline focus-visible:outline-2 focus-visible:outline-ink ${className}`}
      onClick={() => {
        if (
          confirm(
            `Clear ${fileName} (${count} students), its photos and every adjustment from this browser?`,
          )
        ) {
          useStore.getState().reset();
        }
      }}
    >
      Start over
    </button>
  );
}

/** Signing out also forgets the college, so the next person is asked again. */
function leave() {
  clearCollege();
  signOut();
}

function SignOut({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      className={`text-sm font-medium text-muted hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-ink ${className}`}
      onClick={leave}
    >
      Sign out
    </button>
  );
}

/** Nothing renders until the sign-in state and the college are known (both
 *  live in localStorage).  After sign-in the college is asked for first. */
export function AppShell({ children }: { children: ReactNode }) {
  const signedIn = useSignedIn();
  const college = useCollegeId();
  const [picking, setPicking] = useState(false);
  if (signedIn === null || college === undefined) return <div className="min-h-dvh bg-frame" />;
  if (!signedIn) return <Login />;
  if (!college) return <CollegePicker onSignOut={leave} />;
  if (picking) {
    return <CollegePicker current={college} onDone={() => setPicking(false)} onCancel={() => setPicking(false)} />;
  }
  return <Shell onChangeCollege={() => setPicking(true)}>{children}</Shell>;
}

function ChangeCollege({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      className={`text-sm font-medium text-muted hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-ink ${className}`}
      onClick={onClick}
    >
      Change college
    </button>
  );
}

function Shell({ children, onChangeCollege }: { children: ReactNode; onChangeCollege: () => void }) {
  const college = useCollege();
  const path = usePathname();
  const steps = useSteps();
  const fileName = useStore((s) => s.book?.fileName ?? null);
  const sheetName = useStore((s) => s.sheetName);
  const count = useStore((s) => s.students.length);
  const isActive = (href: string) =>
    href === "/" ? path === "/" : path.startsWith(href);

  return (
    <div className="min-h-dvh bg-frame">
      {/* sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-[228px] flex-col px-3 pb-4 lg:flex">
        <Link href="/" className="flex h-12 items-center gap-2.5 px-2">
          <Mark />
          <span className="leading-4">
            <span className="block text-sm font-semibold">{college.short} ID cards</span>
            <span className="block text-xs text-muted">{college.label}</span>
          </span>
        </Link>
        <nav aria-label="Steps" className="mt-6 flex flex-col gap-0.5">
          {steps.map((s) => {
            const body = (
              <>
                <span className="block text-sm font-medium">{s.label}</span>
                <span
                  className={`block truncate text-xs ${s.warn ? "text-warning" : "text-muted"}`}
                >
                  {s.disabled ? "After the upload" : s.status}
                </span>
              </>
            );
            return s.disabled ? (
              <span
                key={s.href}
                aria-disabled="true"
                className="rounded-md px-3 py-1.5 text-muted"
              >
                {body}
              </span>
            ) : (
              <Link
                key={s.href}
                href={s.href}
                aria-current={isActive(s.href) ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 transition-colors ${isActive(s.href) ? "bg-active" : "hover:bg-raised"}`}
              >
                {body}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col items-start gap-2 px-3">
          <StartOver className="mt-3" />
          <ChangeCollege onClick={onChangeCollege} />
          <SignOut />
        </div>
      </aside>

      {/* top bar */}
      <header className="sticky top-0 z-20 flex h-12 items-center gap-3 bg-frame px-4 lg:static lg:ml-[228px] lg:px-2">
        <Link href="/" className="flex h-10 items-center gap-2 lg:hidden">
          <Mark size={22} />
          <span className="text-sm font-semibold">{college.short} ID cards</span>
        </Link>
        <div className="ml-auto flex min-w-0 items-center gap-2 text-sm lg:ml-0">
          {fileName ? (
            <>
              <span className="hidden truncate text-muted sm:inline">
                {fileName}
              </span>
              <span aria-hidden="true" className="hidden text-muted sm:inline">
                /
              </span>
              <span className="truncate font-medium">{sheetName}</span>
              <span className="num hidden whitespace-nowrap text-muted min-[360px]:inline">
                · {count} students
              </span>
            </>
          ) : (
            <span className="text-muted">No class loaded</span>
          )}
        </div>
        <ChangeCollege onClick={onChangeCollege} className="flex h-10 flex-none items-center lg:hidden" />
        <SignOut className="flex h-10 flex-none items-center lg:hidden" />
      </header>

      {/* the sheet */}
      <main className="min-h-[calc(100dvh-48px)] bg-sheet px-4 pb-[calc(6rem+var(--safe-b))] pt-6 lg:mb-2 lg:ml-[228px] lg:mr-2 lg:min-h-[calc(100dvh-56px)] lg:rounded-[16px] lg:border lg:border-line lg:p-6">
        <Persistence>{children}</Persistence>
      </main>

      {/* phone and tablet: the steps as a bottom bar */}
      <nav
        aria-label="Steps"
        className="fixed inset-x-0 bottom-0 z-20 grid h-[calc(4rem+var(--safe-b))] grid-cols-4 gap-1 border-t border-line bg-frame px-2 pt-2 pb-[calc(0.5rem+var(--safe-b))] lg:hidden"
      >
        {steps.map((s) =>
          s.disabled ? (
            <span
              key={s.href}
              aria-disabled="true"
              className="flex items-center justify-center rounded-md text-sm text-muted"
            >
              {s.short}
            </span>
          ) : (
            <Link
              key={s.href}
              href={s.href}
              aria-current={isActive(s.href) ? "page" : undefined}
              className={`flex flex-col items-center justify-center rounded-md text-sm font-medium ${isActive(s.href) ? "bg-active" : ""}`}
            >
              {s.short}
              {s.warn && (
                <span className="num text-xs font-normal text-warning">
                  {s.status.split(" ")[0]} missing
                </span>
              )}
            </Link>
          ),
        )}
      </nav>
    </div>
  );
}
