import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-[#2c2e31] active:bg-black disabled:bg-control disabled:text-muted",
  secondary: "border border-control bg-sheet text-ink hover:bg-raised active:bg-active disabled:text-muted disabled:hover:bg-sheet",
  ghost: "text-ink hover:bg-raised active:bg-active disabled:text-muted disabled:hover:bg-transparent",
  danger: "border border-control bg-sheet text-negative hover:bg-negative-bg active:bg-negative-bg",
};

export function Button({ variant = "secondary", className = "", ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex h-8 items-center pointer-coarse:h-10 justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed ${VARIANT[variant]} ${className}`}
      {...rest}
    />
  );
}

/** A link that looks like a button (never a <button> inside an <a>). */
export function LinkButton({ href, variant = "secondary", className = "", children }:
  { href: string; variant?: Variant; className?: string; children: ReactNode }) {
  return (
    <Link href={href}
          className={`inline-flex h-8 items-center pointer-coarse:h-10 justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${VARIANT[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export function Panel({ title, children, className = "", actions }:
  { title?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={`rounded-lg border border-line bg-sheet p-4 sm:p-5 ${className}`}>
      {(title || actions) && (
        <header className="mb-4 flex min-h-8 items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{title}</h2>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

/** The screen's title row: a noun, one line about the data, and real actions only. */
export function TitleRow({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold sm:text-[22px] leading-7 tracking-[-0.01em]">{title}</h1>
        {sub && <p className="mt-1 text-[15px] leading-[22px] text-muted">{sub}</p>}
      </div>
      {/* on a phone the actions take the full row, each button sharing it */}
      {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto max-sm:*:flex-1">{actions}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "ok"; children: ReactNode }) {
  const c = tone === "warn" ? "border-warning-line bg-warning-bg text-warning"
    : tone === "ok" ? "border-transparent bg-positive-bg text-positive-ink"
    : "border-transparent bg-raised text-ink";
  return <div className={`rounded-lg border px-4 py-2.5 text-sm ${c}`}>{children}</div>;
}

/** What a step shows before a class is loaded: its frame, its title, and the way forward. */
export function NoClass({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-6">
      <TitleRow title={title} sub="No class is loaded in this browser yet." />
      <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-control px-5 py-6">
        <p>Upload the class workbook first. The students, their photos and your edits are kept in this browser until you start over.</p>
        <LinkButton href="/" variant="primary">Upload a workbook</LinkButton>
      </div>
    </div>
  );
}

/** A labelled control.  `group` is for several controls (e.g. a row of
 *  buttons), which must not sit inside a <label>. */
export function Field({ label, hint, children, group = false }:
  { label: string; hint?: ReactNode; children: ReactNode; group?: boolean }) {
  const inner = (
    <>
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </>
  );
  return group
    ? <div role="group" aria-label={label} className="flex flex-col gap-2 text-sm">{inner}</div>
    : <label className="flex flex-col gap-2 text-sm">{inner}</label>;
}

export function Slider({ label, value, min, max, step = 0.01, onChange, format }:
  { label: string; value: number; min: number; max: number; step?: number;
    onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="num text-muted">{format ? format(value) : value}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value}
             onChange={(e) => onChange(Number(e.target.value))}
             onDoubleClick={() => onChange(min < 0 && max > 0 ? 0 : min)} />
    </label>
  );
}

export const inputCls =
  // 16px text below sm, or iOS zooms the page when the field is focused
  "h-8 rounded-md border border-control bg-sheet px-2.5 text-base text-ink sm:text-sm pointer-coarse:h-10 focus:border-ink focus:outline-none";
