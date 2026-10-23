"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CardPreview } from "@/components/CardPreview";
import {
  Button,
  Field,
  NoClass,
  Notice,
  Panel,
  TitleRow,
  inputCls,
} from "@/components/ui";
import { useCollege } from "@/lib/browser/college";
import {
  download,
  renderSingle,
  startJob,
  type Running,
} from "@/lib/browser/generate";
import { CARD_H, CARD_W, MM_PER_UNIT } from "@/lib/card/geometry";
import { THEME_NAMES } from "@/lib/card/themes";
import { PER_PAGE, type GenStudent, type Progress } from "@/lib/generate/job";
import type { OutputFormat } from "@/lib/types";
import { effectiveEdit, useStore } from "@/store/useStore";

const DPI_PRESETS = [
  { dpi: 300, label: "300" },
  { dpi: 600, label: "600" },
  { dpi: 1200, label: "1200" },
];

const FORMATS: { value: OutputFormat; label: string; hint: string }[] = [
  { value: "png", label: "PNG", hint: "Print-ready bitmaps" },
  {
    value: "svg",
    label: "CorelDRAW (SVG)",
    hint: "Editable curves and live text",
  },
  { value: "both", label: "Both", hint: "PNG and SVG side by side" },
];

const mm = (u: number) => (u * MM_PER_UNIT).toFixed(1);

export default function GeneratePage() {
  const { book, sheetName, students, photos, edits, options, selected } =
    useStore();
  const setOptions = useStore.getState().setOptions;
  const college = useCollege();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<{
    name: string;
    files: string[];
    blob: Blob;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = useRef<Running | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const chosenTheme = options.themes[0];

  // phones show the themes as one sideways strip: bring the chosen one into view
  useEffect(() => {
    const el = strip.current;
    const on = el?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!el || !on || el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft = on.offsetLeft - (el.clientWidth - on.offsetWidth) / 2;
  }, [chosenTheme]);

  const jobStudents = useMemo<GenStudent[]>(
    () =>
      students.map((student, i) => ({
        student,
        photo: photos[i]?.blob ?? null,
        edit: effectiveEdit(edits, i, options),
      })),
    [students, photos, edits, options],
  );

  if (!students.length) return <NoClass title="Generate cards" />;

  // one theme per export; an older session may still hold several
  const theme = options.themes[0] ?? "violet";
  const o = { ...options, themes: [theme] };
  const wantPng = o.format !== "svg";
  const wantSvg = o.format !== "png";
  const withPhoto = photos.filter(Boolean).length;
  const px = {
    w: Math.round((CARD_W * o.dpi) / 300),
    h: Math.round((CARD_H * o.dpi) / 300),
  };
  const base =
    `${(book?.fileName ?? "cards").replace(/\.[^.]+$/, "")}${sheetName ? "_" + sheetName : ""}`.replace(
      /[^\w.-]+/g,
      "_",
    );
  const busy = progress !== null;
  const sample = students[Math.min(selected, students.length - 1)];
  const cards = students.length * (o.format === "both" ? 2 : 1);
  const sheets = Math.ceil(students.length / PER_PAGE);

  const progressBar = progress && (
    <div className="flex flex-col gap-1.5">
      <div className="h-2 overflow-hidden rounded-full bg-raised">
        <div
          className="h-full rounded-full bg-ink transition-[width]"
          style={{
            width: `${(100 * progress.done) / Math.max(1, progress.total)}%`,
          }}
        />
      </div>
      <div className="flex justify-between gap-3 text-sm text-muted">
        <span className="truncate">{progress.label}</span>
        <span className="num whitespace-nowrap">
          {progress.done} of {progress.total}
        </span>
      </div>
    </div>
  );

  function run() {
    setError(null);
    setResult(null);
    setProgress({ done: 0, total: 1, label: "Starting…" });
    const job = startJob(
      { students: jobStudents, options: o, zipName: base, college: college.id },
      setProgress,
    );
    running.current = job;
    job.promise
      .then(
        (r) => {
          const name = `${base}_cards.zip`;
          setResult({ name, files: r.files, blob: r.zip });
          download(name, r.zip);
        },
        (e: Error) => {
          if (e.message !== "cancelled") setError(e.message);
        },
      )
      .finally(() => {
        setProgress(null);
        running.current = null;
      });
  }

  async function single() {
    setError(null);
    try {
      for (const f of await renderSingle(jobStudents[selected], o, theme, college.id))
        download(f.name, f.blob);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rendering failed");
    }
  }

  return (
    <div className="grid gap-6 pb-16 xl:grid-cols-[minmax(0,1fr)_320px] xl:pb-0">
      <div className="flex min-w-0 flex-col gap-6">
        <TitleRow
          title="Generate cards"
          sub={
            <>
              Cards for <span className="num">{students.length}</span> students
              of {sheetName ?? "this class"}, in one ZIP.
            </>
          }
        />

        <Panel title="Theme">
          <div
            ref={strip}
            role="radiogroup"
            aria-label="Theme"
            className="relative -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-0 sm:pb-0 2xl:grid-cols-7"
          >
            {THEME_NAMES.map((t) => {
              const on = t === theme;
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setOptions({ themes: [t] })}
                  className={`flex w-[104px] shrink-0 snap-start flex-col items-center gap-1.5 rounded-lg border-2 p-2 text-sm sm:w-auto transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${on ? "border-accent bg-raised" : "border-transparent hover:bg-raised"}`}
                >
                  <CardPreview
                    student={sample}
                    photo={photos[selected]}
                    edit={effectiveEdit(edits, selected, o)}
                    theme={t}
                    width={84}
                    supersample={1}
                    className="pointer-events-none"
                  />
                  <span className={on ? "font-semibold" : "text-muted"}>
                    {t}
                  </span>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel title="Output">
          <div className="flex flex-col gap-5">
            <div className="grid gap-2 sm:grid-cols-3">
              {FORMATS.map((f) => (
                <label
                  key={f.value}
                  className={`flex cursor-pointer flex-col gap-0.5 rounded-md border px-3 py-2.5 text-sm transition-colors ${o.format === f.value ? "border-ink bg-raised" : "border-line hover:bg-raised"}`}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <input
                      type="radio"
                      name="format"
                      checked={o.format === f.value}
                      onChange={() => setOptions({ format: f.value })}
                    />
                    {f.label}
                  </span>
                  <span className="pl-5 text-muted">{f.hint}</span>
                </label>
              ))}
            </div>

            {wantPng && (
              <div className="grid gap-5 md:grid-cols-2">
                <Field
                  group
                  label="Resolution"
                  hint={
                    <span className="num">
                      {px.w} × {px.h} px per card
                    </span>
                  }
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex rounded-md bg-raised p-0.5">
                      {DPI_PRESETS.map((p) => (
                        <button
                          key={p.dpi}
                          type="button"
                          aria-pressed={o.dpi === p.dpi}
                          onClick={() => setOptions({ dpi: p.dpi })}
                          className={`h-7 rounded-[5px] px-2.5 text-sm transition-colors pointer-coarse:h-10 focus-visible:outline-2 focus-visible:outline-ink ${o.dpi === p.dpi ? "bg-sheet font-medium ring-1 ring-line" : "text-muted hover:text-ink"}`}
                        >
                          <span className="num">{p.label}</span>
                        </button>
                      ))}
                    </div>
                    <label className="flex items-center gap-1.5 text-muted">
                      <input
                        type="number"
                        min={72}
                        max={2400}
                        step={1}
                        value={o.dpi}
                        aria-label="Custom DPI"
                        onChange={(e) =>
                          setOptions({
                            dpi: Math.max(
                              72,
                              Math.min(2400, Number(e.target.value) || 300),
                            ),
                          })
                        }
                        className={`${inputCls} num w-20`}
                      />
                      dpi
                    </label>
                  </div>
                </Field>
                <Field
                  label="Edge smoothing"
                  hint="4 is print quality, 1 is a fast draft."
                >
                  <select
                    value={o.supersample}
                    onChange={(e) =>
                      setOptions({ supersample: Number(e.target.value) })
                    }
                    className={inputCls}
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n}×
                        {n === 4 ? " (recommended)" : n === 1 ? " (draft)" : ""}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}

            {wantSvg && (
              <div className="flex flex-col gap-3">
                <Field label="Bitmap resolution inside the SVG">
                  <select
                    value={o.svgRaster}
                    onChange={(e) =>
                      setOptions({ svgRaster: Number(e.target.value) })
                    }
                    className={`${inputCls} w-56`}
                  >
                    {[1, 2, 4].map((n) => (
                      <option key={n} value={n}>
                        {n * 300} dpi{n === 2 ? " (default)" : ""}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}

            <label className="flex flex-wrap items-center gap-x-2 text-sm">
              <input
                type="checkbox"
                checked={o.sharpen}
                onChange={(e) => setOptions({ sharpen: e.target.checked })}
              />
              Sharpen photos that have to be enlarged
            </label>
          </div>
        </Panel>

        {wantPng && (
          <Panel title="Print sheet">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={o.sheet}
                onChange={(e) => setOptions({ sheet: e.target.checked })}
              />
              <span>
                Also make A4 print sheets
                <span className="block text-muted">
                  Landscape, <span className="num">{PER_PAGE}</span> cards per
                  page at actual size, ready to cut, with a PDF to print from.
                </span>
              </span>
            </label>
          </Panel>
        )}
      </div>

      <aside className="flex flex-col gap-4 xl:sticky xl:top-6 xl:self-start">
        <section className="rounded-lg border border-line p-5">
          <h2 className="text-sm font-medium text-muted">You will get</h2>
          <p className="mt-1 text-[28px] leading-9">
            <span className="num">{cards}</span> card{cards === 1 ? "" : "s"}
          </p>
          <p className="text-sm text-muted">
            {o.sheet && wantPng ? (
              <>
                plus <span className="num">{sheets}</span> A4 sheet
                {sheets === 1 ? "" : "s"}
                {" and a PDF"},{" "}
              </>
            ) : (
              ""
            )}
            in one ZIP
          </p>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-rule pt-4 text-sm">
            <dt className="text-muted">With a photo</dt>
            <dd className="num text-right">
              {withPhoto < students.length ? (
                <span className="text-warning">
                  {withPhoto} of {students.length}
                </span>
              ) : (
                `${withPhoto} of ${students.length}`
              )}
            </dd>
            <dt className="text-muted">Card size</dt>
            <dd className="num text-right">
              {mm(CARD_W)} × {mm(CARD_H)} mm
            </dd>
            {wantPng && (
              <>
                <dt className="text-muted">Bitmap</dt>
                <dd className="num text-right">
                  {px.w} × {px.h} px
                </dd>
              </>
            )}
            {wantPng && (
              <>
                <dt className="text-muted">Resolution</dt>
                <dd className="num text-right">{o.dpi} dpi</dd>
              </>
            )}
            <dt className="text-muted">Theme</dt>
            <dd className="text-right">{theme}</dd>
          </dl>
        </section>

        {/* below xl the progress and the Generate button live in the bottom bar */}
        {progress ? (
          <section
            className="flex flex-col gap-2 rounded-lg border border-line p-5 max-xl:hidden"
            aria-live="polite"
          >
            <h2 className="text-sm font-medium">Rendering</h2>
            {progressBar}
            <Button variant="danger" onClick={() => running.current?.cancel()}>
              Cancel
            </Button>
          </section>
        ) : (
          <div className="flex flex-col gap-2">
            <Button
              variant="primary"
              className="h-10 max-xl:hidden"
              onClick={run}
              disabled={busy}
            >
              Generate {students.length} cards (ZIP)
            </Button>
            <Button onClick={single}>
              <span className="truncate">Download only {sample.name}</span>
            </Button>
          </div>
        )}

        {error && <Notice tone="warn">{error}</Notice>}
        {result && (
          <Notice tone="ok">
            <div className="flex flex-col gap-1">
              <span>
                <span className="num">{result.files.length}</span> files in{" "}
                <span className="font-medium">{result.name}</span>.
              </span>
              <button
                className="self-start font-medium underline underline-offset-2"
                onClick={() => download(result.name, result.blob)}
              >
                Download again
              </button>
            </div>
          </Notice>
        )}
      </aside>

      {/* phones and tablets: Generate stays in reach above the step bar */}
      <div
        className="fixed inset-x-0 bottom-[calc(4rem+var(--safe-b))] z-10 flex items-center gap-3 border-t border-line bg-sheet px-4 py-2.5 lg:bottom-2 lg:left-[236px] lg:right-2 lg:rounded-b-[16px] lg:px-6 xl:hidden"
        aria-live="polite"
      >
        {progress ? (
          <>
            <div className="min-w-0 flex-1">{progressBar}</div>
            <Button variant="danger" onClick={() => running.current?.cancel()}>
              Cancel
            </Button>
          </>
        ) : (
          <Button variant="primary" className="h-10 flex-1" onClick={run}>
            Generate {students.length} cards (ZIP)
          </Button>
        )}
      </div>
    </div>
  );
}
