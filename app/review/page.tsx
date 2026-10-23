"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { CardPreview } from "@/components/CardPreview";
import { Thumb } from "@/components/Thumb";
import {
  Button,
  LinkButton,
  NoClass,
  Notice,
  TitleRow,
  inputCls,
} from "@/components/ui";
import { decodePhoto } from "@/lib/browser/canvas";
import { useCollege } from "@/lib/browser/college";
import { IMAGE_ACCEPT, photoFromFile } from "@/lib/browser/importFlow";
import { THEME_NAMES } from "@/lib/card/themes";
import { coverageFromHashes } from "@/lib/import/coverage";
import { canHoldPhotos } from "@/lib/import";
import type { Student } from "@/lib/types";
import { effectiveEdit, useStore } from "@/store/useStore";

type Col = { key: keyof Student; label: string; w: string };

const BASE_COLS: Col[] = [
  { key: "name", label: "Name", w: "min-w-44" },
  { key: "course", label: "Course", w: "min-w-52" },
  { key: "year", label: "Year", w: "min-w-20" },
  { key: "batch", label: "Batch", w: "min-w-24" },
  { key: "dob", label: "DOB", w: "min-w-24" },
  { key: "contact", label: "Contact", w: "min-w-28" },
  { key: "blood_group", label: "Blood", w: "min-w-16" },
  { key: "address", label: "Address", w: "min-w-72" },
];

/** With the register number, for colleges that print it (or sheets that have it). */
const COLS_REG: Col[] = [
  ...BASE_COLS.slice(0, 2),
  { key: "reg_no", label: "Reg. no", w: "min-w-32" },
  ...BASE_COLS.slice(2),
];

// Row, photo and name stay in view while the other fields scroll sideways.
// The 1px hard "shadow" is the column's rule: a border doesn't travel with a sticky cell.
// prettier-ignore
const STICKY_NAME = "sticky left-[104px] z-[1] shadow-[1px_0_0_var(--color-rule)]"; // taste-skill-ignore
const cellBg = (on: boolean) =>
  on ? "bg-active" : "bg-sheet group-hover:bg-raised";

type View = "student" | "table";
type Filter = "all" | "missing";

export default function ReviewPage() {
  const { book, sheetName, students, photos, edits, selected, options } =
    useStore();
  const { select, updateStudent, setPhoto, setOptions } = useStore.getState();
  const college = useCollege();
  const cols = college.regNo || students.some((s) => s.reg_no) ? COLS_REG : BASE_COLS;
  const replaceInput = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const [view, setView] = useState<View>("student");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const cov = useMemo(
    () => coverageFromHashes(photos.map((p) => p?.hash ?? null)),
    [photos],
  );
  const dupOf = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const g of cov.duplicates)
      for (const i of g)
        m.set(
          i,
          g.filter((j) => j !== i),
        );
    return m;
  }, [cov]);

  if (!students.length) return <NoClass title="Review students" />;

  const theme = options.themes[0] ?? "classic";
  const cur = Math.min(selected, students.length - 1);
  const st = students[cur];
  const q = query.trim().toLowerCase();
  const rows = students
    .map((_, i) => i)
    .filter((i) => filter === "all" || !photos[i])
    .filter((i) => !q || students[i].name.toLowerCase().includes(q));
  const names = (idx: number[]) => idx.map((i) => students[i].name).join(", ");
  const noPictures = book && !canHoldPhotos(book.kind);
  const marks = (i: number) => (
    <>
      {dupOf.has(i) && (
        <span
          className="absolute -right-1 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-sheet bg-warning"
          title="Shared image"
        />
      )}
      {edits[i] && (
        <span
          className="absolute -bottom-0.5 -right-1 h-2.5 w-2.5 rounded-full border-2 border-sheet bg-ink"
          title="Edited"
        />
      )}
    </>
  );
  const openStudent = (i: number) => {
    select(i);
    setView("student");
  };
  // below lg the list and the details stack, so a tap jumps down to the details
  const stacked = () => window.matchMedia("(max-width: 1023px)").matches;
  const pick = (i: number) => {
    select(i);
    if (stacked())
      detailRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  const toList = () =>
    listRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  const prevNext = (
    <>
      <Button
        variant="ghost"
        disabled={cur === 0}
        onClick={() => select(cur - 1)}
      >
        Previous
      </Button>
      <Button
        variant="ghost"
        disabled={cur >= students.length - 1}
        onClick={() => select(cur + 1)}
      >
        Next
      </Button>
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <TitleRow
        title={sheetName ?? "Review students"}
        sub={
          cov.missing.length === 0 ? (
            <>
              All <span className="num">{cov.total}</span> students have a
              photo. Pick a student to check their card and fix any detail.
            </>
          ) : (
            <>
              <span className="num font-medium text-warning">
                {cov.missing.length} of {cov.total}
              </span>{" "}
              have no photo, so their cards print an empty window.
              {noPictures
                ? " This file type can't hold pictures; add them per student."
                : ""}
            </>
          )
        }
        actions={
          <>
            <Segmented
              label="View"
              value={view}
              onChange={setView}
              options={[
                ["student", "One by one"],
                ["table", "Table"],
              ]}
            />
            <LinkButton href="/generate" variant="primary">
              Generate cards
            </LinkButton>
          </>
        }
      />

      {(cov.missing.length > 0 || cov.duplicates.length > 0) && (
        <div className="flex flex-col gap-2">
          {cov.missing.length > 0 && (
            <Notice tone="warn">
              No photo: {names(cov.missing.slice(0, 6))}
              {cov.missing.length > 6
                ? ` and ${cov.missing.length - 6} more`
                : ""}
              .{" "}
              <button
                className="font-medium underline underline-offset-2"
                onClick={() =>
                  setFilter((f) => (f === "missing" ? "all" : "missing"))
                }
              >
                {filter === "missing" ? "Show everyone" : "Show only these"}
              </button>
            </Notice>
          )}
          {cov.duplicates.map((g) => (
            <Notice key={g.join()} tone="warn">
              Same image on {g.length} rows: {names(g)}. Excel stores a
              repeated picture once, so check it belongs to each.
            </Notice>
          ))}
        </div>
      )}

      {view === "student" ? (
        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <StudentList
            boxRef={listRef}
            rows={rows}
            selected={cur}
            onSelect={select}
            onPick={pick}
            students={students}
            photos={photos}
            marks={marks}
            query={query}
            setQuery={setQuery}
            filter={filter}
            setFilter={setFilter}
            missing={cov.missing.length}
          />

          <section
            ref={detailRef}
            aria-label={`Details for ${st.name || "unnamed student"}`}
            className="flex min-w-0 scroll-mt-16 flex-col gap-5 rounded-lg border border-line p-4 sm:p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold">
                  {st.name || "Unnamed"}
                </h2>
                <p className="num text-sm text-muted">
                  Row {cur + 1} of {students.length}
                </p>
              </div>
              <div className="flex items-center gap-1 max-lg:hidden">
                {prevNext}
              </div>
              <Button variant="ghost" onClick={toList} className="lg:hidden">
                ↑ All students
              </Button>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
              <div className="grid content-start gap-4 sm:grid-cols-2">
                {cols.map((c) => (
                  <label
                    key={c.key}
                    className={`flex flex-col gap-1.5 text-sm ${
                      c.key === "name" ||
                      c.key === "course" ||
                      c.key === "address"
                        ? "sm:col-span-2"
                        : ""
                    }`}
                  >
                    <span className="font-medium">
                      {c.key === "blood_group"
                        ? "Blood group"
                        : c.key === "reg_no"
                          ? "Register number"
                        : c.key === "dob"
                          ? "Date of birth"
                          : c.label}
                    </span>
                    {c.key === "address" ? (
                      <textarea
                        rows={3}
                        value={st.address}
                        onChange={(e) =>
                          updateStudent(cur, { address: e.target.value })
                        }
                        className="resize-y rounded-md border border-control bg-sheet px-2.5 py-1.5 text-base text-ink focus:border-ink focus:outline-none sm:text-sm"
                      />
                    ) : (
                      <input
                        value={st[c.key]}
                        onChange={(e) =>
                          updateStudent(cur, { [c.key]: e.target.value })
                        }
                        className={`${inputCls} w-full`}
                      />
                    )}
                  </label>
                ))}
              </div>

              <div className="flex flex-col items-center gap-3 -order-1 xl:order-none">
                <CardPreview
                  student={st}
                  photo={photos[cur]}
                  edit={effectiveEdit(edits, cur, options)}
                  theme={theme}
                  width={240}
                />
                <div className="flex flex-wrap justify-center gap-2">
                  {photos[cur] ? (
                    <LinkButton href={`/editor?i=${cur}`}>Edit photo</LinkButton>
                  ) : (
                    <Button disabled title="Add a photo first">
                      Edit photo
                    </Button>
                  )}
                  <Button onClick={() => replaceInput.current?.click()}>
                    {photos[cur] ? "Replace" : "Add photo"}
                  </Button>
                  {photos[cur] && (
                    <Button variant="danger" onClick={() => setPhoto(cur, null)}>
                      Remove
                    </Button>
                  )}
                </div>
                <label className="flex items-center gap-2 text-sm text-muted">
                  Theme
                  <select
                    value={theme}
                    onChange={(e) => setOptions({ themes: [e.target.value] })}
                    className={inputCls}
                    aria-label="Preview theme"
                  >
                    {THEME_NAMES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {/* phones: Previous / Next stay under the thumb while editing */}
            <div className="sticky bottom-[calc(4rem+var(--safe-b))] -mx-4 -mb-4 grid grid-cols-2 gap-2 rounded-b-lg border-t border-line bg-sheet px-4 py-2 sm:-mx-5 sm:-mb-5 sm:px-5 lg:hidden">
              {prevNext}
            </div>
          </section>
        </div>
      ) : (
        <StudentTable
          rows={rows}
          cols={cols}
          selected={cur}
          students={students}
          photos={photos}
          marks={marks}
          onSelect={select}
          onOpen={openStudent}
          onEdit={updateStudent}
        />
      )}

      <input
        ref={replaceInput}
        type="file"
        accept={IMAGE_ACCEPT}
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            await decodePhoto(f);
          } catch {
            alert(`${f.name} can't be read by this browser. Use a JPEG or PNG.`);
            return;
          }
          setPhoto(cur, await photoFromFile(f, "assigned"));
        }}
      />
    </div>
  );
}

type Photos = ReturnType<typeof useStore.getState>["photos"];

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md bg-raised p-0.5">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`h-7 flex-1 whitespace-nowrap rounded-[5px] px-2.5 text-sm transition-colors pointer-coarse:h-10 focus-visible:outline-2 focus-visible:outline-ink ${
            value === v
              ? "bg-sheet font-medium ring-1 ring-line"
              : "text-muted hover:text-ink"
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** Every student as one line: photo, name, course. Click, or ↑ ↓ to move. */
function StudentList({
  boxRef,
  rows,
  selected,
  onSelect,
  onPick,
  students,
  photos,
  marks,
  query,
  setQuery,
  filter,
  setFilter,
  missing,
}: {
  boxRef: RefObject<HTMLDivElement | null>;
  rows: number[];
  selected: number;
  onSelect: (i: number) => void;
  /** a click or tap, as opposed to arrow keys */
  onPick: (i: number) => void;
  students: Student[];
  photos: Photos;
  marks: (i: number) => ReactNode;
  query: string;
  setQuery: (q: string) => void;
  filter: Filter;
  setFilter: (f: Filter) => void;
  missing: number;
}) {
  const items = useRef(new Map<number, HTMLButtonElement>());

  // keep the selected student in view when Previous/Next move past the edge
  useEffect(() => {
    items.current.get(selected)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const onKey = (e: KeyboardEvent) => {
    const at = rows.indexOf(selected);
    const to =
      e.key === "ArrowDown" ? rows[at + 1] : e.key === "ArrowUp" ? rows[at - 1] : undefined;
    if (to === undefined) return;
    e.preventDefault();
    onSelect(to);
    items.current.get(to)?.focus();
  };

  return (
    <div
      ref={boxRef}
      className="flex min-w-0 scroll-mt-16 flex-col gap-3 lg:sticky lg:top-6 lg:self-start"
    >
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${students.length} students`}
        aria-label="Search students"
        className={`${inputCls} w-full`}
      />
      {missing > 0 && (
        <Segmented
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            ["all", `All ${students.length}`],
            ["missing", `No photo ${missing}`],
          ]}
        />
      )}
      <ul
        aria-label="Students"
        onKeyDown={onKey}
        className="flex max-h-72 flex-col overflow-y-auto rounded-lg border border-line p-1 lg:max-h-[calc(100vh-15rem)]"
      >
        {rows.map((i) => {
          const on = i === selected;
          return (
            <li key={i}>
              <button
                ref={(el) => {
                  if (el) items.current.set(i, el);
                  else items.current.delete(i);
                }}
                type="button"
                aria-current={on || undefined}
                tabIndex={on ? 0 : -1}
                onClick={() => onPick(i)}
                className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ink ${
                  on ? "bg-active" : "hover:bg-raised"
                }`}
              >
                <span className="num w-6 shrink-0 text-right text-xs text-muted">
                  {i + 1}
                </span>
                <span className="relative shrink-0">
                  <Thumb blob={photos[i]?.blob} on={on} className="h-[35px] w-[30px]" />
                  {marks(i)}
                </span>
                <span className="min-w-0">
                  <span className={`block truncate text-sm ${on ? "font-semibold" : "font-medium"}`}>
                    {students[i].name || "Unnamed"}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {photos[i] ? students[i].course || "No course" : "No photo"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="px-2 py-6 text-center text-sm text-muted">No student matches.</li>
        )}
      </ul>
    </div>
  );
}

/** The whole class at once. Fields scroll sideways; the buttons do it without a trackpad. */
function StudentTable({
  rows,
  cols,
  selected,
  students,
  photos,
  marks,
  onSelect,
  onOpen,
  onEdit,
}: {
  rows: number[];
  cols: Col[];
  selected: number;
  students: Student[];
  photos: Photos;
  marks: (i: number) => ReactNode;
  onSelect: (i: number) => void;
  onOpen: (i: number) => void;
  onEdit: (i: number, patch: Partial<Student>) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: true, right: true });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const update = () =>
      setEdge({
        left: el.scrollLeft <= 1,
        right: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
      });
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  const by = (dir: 1 | -1) =>
    box.current?.scrollBy({ left: dir * box.current.clientWidth * 0.6, behavior: "smooth" });
  const fits = edge.left && edge.right;

  return (
    <div className="flex flex-col gap-2">
      {!fits && (
        <div className="flex items-center justify-end gap-2 text-sm text-muted">
          <span className="hidden sm:inline">Shift + mouse wheel also scrolls sideways</span>
          <Button disabled={edge.left} onClick={() => by(-1)} aria-label="Scroll table left">
            ← Left
          </Button>
          <Button disabled={edge.right} onClick={() => by(1)} aria-label="Scroll table right">
            Right →
          </Button>
        </div>
      )}
      <div ref={box} className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-sheet text-left text-xs text-muted">
            <tr className="border-b border-line">
              <th className="sticky left-0 z-10 h-9 w-12 min-w-12 bg-sheet px-3 text-right font-normal">
                Row
              </th>
              <th className="sticky left-12 z-10 w-14 min-w-14 bg-sheet px-2 font-normal">
                Photo
              </th>
              {cols.map((c, k) => (
                <th
                  key={c.key}
                  className={`px-2 font-normal ${c.w} ${k === 0 ? STICKY_NAME + " bg-sheet" : ""}`}
                >
                  {c.label}
                </th>
              ))}
              <th className="px-2 font-normal">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr
                key={i}
                onClick={() => onSelect(i)}
                className={`group border-t border-rule first:border-t-0 ${i === selected ? "bg-active" : "hover:bg-raised"}`}
              >
                <td className={`num sticky left-0 px-3 text-right text-muted ${cellBg(i === selected)}`}>
                  {i + 1}
                </td>
                <td className={`sticky left-12 px-2 py-1.5 ${cellBg(i === selected)}`}>
                  <div className="relative w-9">
                    <Thumb blob={photos[i]?.blob} on={i === selected} />
                    {marks(i)}
                  </div>
                </td>
                {cols.map((c, k) => (
                  <td
                    key={c.key}
                    className={`px-1 ${k === 0 ? `${STICKY_NAME} ${cellBg(i === selected)}` : ""}`}
                  >
                    <input
                      value={students[i][c.key]}
                      onFocus={() => onSelect(i)}
                      onChange={(e) => onEdit(i, { [c.key]: e.target.value })}
                      className={`h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-base text-ink sm:text-sm hover:border-line focus:border-ink focus:bg-sheet focus:outline-none ${c.w}`}
                      aria-label={`${c.label} for row ${i + 1}`}
                    />
                  </td>
                ))}
                <td className="px-2">
                  <Button variant="ghost" onClick={() => onOpen(i)}>
                    Open
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
