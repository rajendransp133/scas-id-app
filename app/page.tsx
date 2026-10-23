"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dropzone } from "@/components/Dropzone";
import { StartOver } from "@/components/AppShell";
import { Button, LinkButton, Notice, Panel, TitleRow } from "@/components/ui";
import {
  BOOK_ACCEPT,
  IMAGE_ACCEPT,
  importForStore,
  readDropped,
  type DroppedFile,
} from "@/lib/browser/importFlow";
import {
  canHoldPhotos,
  openBook,
  summarizeSheets,
  type Book,
  type SheetSummary,
} from "@/lib/import";
import { useCollege } from "@/lib/browser/college";
import { ALIASES } from "@/lib/import/cells";
import { useStore } from "@/store/useStore";

export default function UploadPage() {
  const router = useRouter();
  const loadSheet = useStore((s) => s.loadSheet);
  const currentFile = useStore((s) => s.book?.fileName ?? null);
  const currentCount = useStore((s) => s.students.length);
  const college = useCollege();

  const [book, setBook] = useState<Book | null>(null);
  const [sheets, setSheets] = useState<SheetSummary[]>([]);
  const [sheet, setSheet] = useState<string>("");
  const [embedded, setEmbedded] = useState(true);
  const [files, setFiles] = useState<DroppedFile[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onBook([f]: File[]) {
    setError(null);
    setBusy("Reading workbook…");
    try {
      const b = openBook(await f.arrayBuffer(), f.name);
      const sums = await summarizeSheets(b);
      if (!sums.some((s) => s.students > 0)) {
        throw new Error(
          'No student rows found. The sheet needs a column of names (a header containing "name", or recognisable data).',
        );
      }
      setBook(b);
      setSheets(sums);
      setSheet((sums.find((s) => s.students > 0) ?? sums[0]).name);
      setEmbedded(canHoldPhotos(b.kind));
    } catch (e) {
      setBook(null);
      setSheets([]);
      setError(e instanceof Error ? e.message : `Could not read ${f.name}.`);
    } finally {
      setBusy(null);
    }
  }

  async function onPhotos(list: File[]) {
    const images = list.filter((f) => /\.(jpe?g|png|webp)$/i.test(f.name));
    const read = await readDropped(images);
    setFiles((prev) => {
      const byName = new Map(prev.map((p) => [p.name.toLowerCase(), p]));
      for (const r of read) byName.set(r.name.toLowerCase(), r);
      return [...byName.values()];
    });
  }

  async function onContinue() {
    if (!book) return;
    setBusy("Matching photos…");
    try {
      const { students, photos } = await importForStore(
        book,
        sheet,
        embedded,
        wantFiles ? files : [],
      );
      loadSheet(book, sheet, students, photos);
      router.push("/review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
      setBusy(null);
    }
  }

  function clearBook() {
    setBook(null);
    setSheets([]);
    setSheet("");
    setFiles([]);
    setError(null);
  }

  const chosen = sheets.find((s) => s.name === sheet);
  const photosPossible = book ? canHoldPhotos(book.kind) : true;
  // photo files only apply when they're asked for: embedded photos off, or a file type without pictures
  const wantFiles = !photosPossible || !embedded;
  const total = sheets.reduce((n, s) => n + s.students, 0);

  return (
    <div className="grid gap-x-12 gap-y-8 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-6">
        <TitleRow
          title="Upload a class workbook"
          sub="One row per student. Photos can sit in the workbook or come as image files."
          actions={
            book ? (
              <Button
                variant="primary"
                disabled={!chosen?.students || Boolean(busy)}
                onClick={onContinue}
              >
                Continue with {chosen?.students ?? 0} students
              </Button>
            ) : currentFile ? (
              <LinkButton href="/review" variant="primary">
                Review {currentCount} students
              </LinkButton>
            ) : null
          }
        />

        {currentFile && !book && (
          <Notice>
            {currentFile} is loaded with {currentCount} students.{" "}
            <Link
              href="/review"
              className="font-medium underline underline-offset-2"
            >
              Continue reviewing
            </Link>
            {" or "}
            <StartOver />
          </Notice>
        )}

        {book ? (
          <div className="flex items-center gap-3 rounded-lg border border-line px-4 py-3">
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="shrink-0 text-muted"
              aria-hidden
            >
              <path d="M5 2.75h6.5L15.25 6.5v10.75H5z" />
              <path d="M11.5 2.75V6.5h3.75M7.5 10.5h5M7.5 13.5h5" />
            </svg>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{book.fileName}</p>
              <p className="num text-sm text-muted">
                {sheets.length} sheet{sheets.length === 1 ? "" : "s"} · {total}{" "}
                students
              </p>
            </div>
            <button
              type="button"
              onClick={clearBook}
              aria-label={`Remove ${book.fileName}`}
              title="Remove"
              className="grid h-8 w-8 shrink-0 place-items-center pointer-coarse:h-10 pointer-coarse:w-10 rounded-md text-muted transition-colors hover:bg-active hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M3 3l8 8M11 3l-8 8" />
              </svg>
            </button>
          </div>
        ) : (
          <Dropzone accept={BOOK_ACCEPT} onFiles={onBook}>
            <span className="text-base font-semibold">
              Drop the workbook here
            </span>
            <span className="text-sm text-muted">
              An .xlsx, .xlsm, .xls or .csv file, or{" "}
              <span className="pointer-coarse:hidden">click</span>
              <span className="hidden pointer-coarse:inline">tap</span> to
              choose one
            </span>
          </Dropzone>
        )}

        {busy && <Notice>{busy}</Notice>}
        {error && <Notice tone="warn">{error}</Notice>}

        {book && (
          <>
            <Panel title="Sheet">
              <div className="flex flex-col gap-2">
                {sheets.map((s) => (
                  <label
                    key={s.name}
                    className={`flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md border px-3 py-2.5 text-sm transition-colors ${
                      s.name === sheet
                        ? "border-ink bg-raised"
                        : "border-line hover:bg-raised"
                    } ${s.students ? "" : "cursor-not-allowed text-muted"}`}
                  >
                    <input
                      type="radio"
                      name="sheet"
                      checked={s.name === sheet}
                      disabled={!s.students}
                      onChange={() => setSheet(s.name)}
                    />
                    <span className="min-w-0 font-medium">{s.name}</span>
                    <span className="num basis-full pl-7 text-muted sm:ml-auto sm:basis-auto sm:pl-0">
                      {s.students ? `${s.students} students` : "no students"}
                      {photosPossible && s.students
                        ? ` · ${s.photos} photos`
                        : ""}
                    </span>
                  </label>
                ))}
              </div>
              {sheets.filter((s) => s.students > 0).length > 1 && (
                <p className="mt-3 text-sm text-warning">
                  More than one sheet holds students, so the class may be split
                  across them. Load each one in turn.
                </p>
              )}
            </Panel>

            <Panel title="Photos">
              <div className="flex flex-col gap-4">
                {photosPossible ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={embedded}
                      onChange={(e) => setEmbedded(e.target.checked)}
                    />
                    Use the photos embedded in the workbook
                  </label>
                ) : (
                  <Notice tone="warn">
                    {book.kind === "xls"
                      ? "Legacy .xls files can't be read for pictures. Add photo files below, or assign them per student on the next step."
                      : "A CSV has no pictures. Add photo files below, or assign them per student on the next step."}
                  </Notice>
                )}
                {wantFiles && (
                  <Dropzone
                    accept={IMAGE_ACCEPT}
                    multiple
                    onFiles={onPhotos}
                    compact
                  >
                    <span className="text-sm font-medium">
                      Add photo files (optional)
                    </span>
                    <span className="text-sm text-muted">
                      Named after the student, or as given in a PHOTO column.
                    </span>
                  </Dropzone>
                )}
                {wantFiles && files.length > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="num">
                      {files.length} photo file{files.length === 1 ? "" : "s"}{" "}
                      added
                    </span>
                    <Button variant="ghost" onClick={() => setFiles([])}>
                      Clear
                    </Button>
                  </div>
                )}
              </div>
            </Panel>
          </>
        )}
      </div>

      <aside className="flex flex-col gap-8 xl:pt-1">
        <section>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Columns it reads</h2>
            <a
              href={college.sample}
              download={college.sample.split("/").pop()}
              className="inline-flex h-8 shrink-0 items-center rounded-md pointer-coarse:h-10 border border-control bg-sheet px-3 text-sm font-medium transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Download sample
            </a>
          </div>
          <p className="mt-1 text-sm text-muted">
            Header names are matched loosely, in any order. Without a header
            row, columns are recognised by what they hold.
          </p>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {FIELDS.filter(([f]) => f !== "reg_no" || college.regNo).map(([field, label]) => (
                <tr key={field} className="border-t border-rule align-top">
                  <th
                    scope="row"
                    className="w-28 py-2 pr-3 text-left font-medium"
                  >
                    {label}
                  </th>
                  <td className="py-2 text-muted">
                    {ALIASES[field].slice(0, 3).join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </aside>
    </div>
  );
}

const FIELDS = [
  ["name", "Name"],
  ["course", "Course"],
  ["reg_no", "Register no."],
  ["year", "Year"],
  ["batch", "Batch"],
  ["dob", "Date of birth"],
  ["contact", "Contact"],
  ["address", "Address"],
  ["blood_group", "Blood group"],
  ["photo", "Photo"],
] as const;
