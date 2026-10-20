"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { CardPreview } from "@/components/CardPreview";
import { PhotoStage, clampZoom } from "@/components/PhotoStage";
import {
  Button,
  NoClass,
  Notice,
  Panel,
  Slider,
  TitleRow,
} from "@/components/ui";
import { decodePhoto } from "@/lib/browser/canvas";
import { BASE_DPI, WINDOW_BOX } from "@/lib/card/geometry";
import { upscaleFactor, type Img } from "@/lib/photo/applyEdit";
import { DEFAULT_EDIT, type PhotoEdit } from "@/lib/types";
import { effectiveEdit, useStore } from "@/store/useStore";

export default function EditorPage() {
  return (
    <Suspense fallback={null}>
      <Editor />
    </Suspense>
  );
}

const pct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;

function Editor() {
  const params = useSearchParams();
  const router = useRouter();
  const { students, photos, edits, options, selected } = useStore();
  const { setEdit, select } = useStore.getState();
  const i = Math.min(
    Math.max(0, Number(params.get("i") ?? selected) || 0),
    Math.max(0, students.length - 1),
  );
  const photo = photos[i];
  const edit = effectiveEdit(edits, i, options);

  const [img, setImg] = useState<{ blob: Blob; img: Img } | null>(null);
  const [guides, setGuides] = useState(true);
  const [before, setBefore] = useState(false);
  const [picking, setPicking] = useState(false);
  const [broken, setBroken] = useState<Blob | null>(null);
  // the stage fills its column, up to 460 px wide; on a phone it is also kept
  // under 60% of the screen height so the controls start on the first screen
  const stageBox = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 460, h: 560, phone: false });
  useEffect(() => {
    const el = stageBox.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.min(460, Math.floor(e.contentRect.width));
      const phone = window.innerWidth < 1024;
      const full = Math.round((w * 560) / 460);
      const h = phone
        ? Math.min(full, Math.round(window.innerHeight * 0.6))
        : full;
      // same values keep the same object, or this effect would re-render forever
      setStage((s) =>
        s.w === w && s.h === h && s.phone === phone ? s : { w, h, phone },
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  });
  const stageW = stage.w;

  useEffect(() => {
    if (!photo) return;
    let live = true;
    decodePhoto(photo.blob).then(
      (d) => {
        if (live) setImg({ blob: photo.blob, img: d });
      },
      () => {
        if (live) setBroken(photo.blob);
      },
    );
    return () => {
      live = false;
    };
  }, [photo]);
  useEffect(() => {
    select(i);
  }, [i, select]);

  const withPhotos = useMemo(
    () => photos.map((p, j) => (p ? j : -1)).filter((j) => j >= 0),
    [photos],
  );

  if (!students.length) return <NoClass title="Photo editor" />;
  const st = students[i];
  if (!photo) {
    return (
      <div className="flex flex-col gap-6">
        <TitleRow title={st.name} sub="This student has no photo yet." />
        <Notice tone="warn">
          <Link
            href="/review"
            className="font-medium underline underline-offset-2"
          >
            Add one on the review page
          </Link>
          , then come back to frame it.
        </Notice>
      </div>
    );
  }

  if (broken === photo.blob) {
    return (
      <div className="flex flex-col gap-6">
        <TitleRow
          title={st.name}
          sub="This photo can't be read by this browser."
        />
        <Notice tone="warn">
          It may be HEIC, TIFF or damaged.{" "}
          <Link
            href="/review"
            className="font-medium underline underline-offset-2"
          >
            Replace it on the review page
          </Link>{" "}
          with a JPEG or PNG.
        </Notice>
      </div>
    );
  }
  const source = img?.blob === photo.blob ? img.img : null;
  const set = (patch: Partial<PhotoEdit>) => setEdit(i, { ...edit, ...patch });
  const quarter = Math.round(edit.rotation / 90) * 90;
  const fine = edit.rotation - quarter;
  const go = (j: number) => router.replace(`/editor?i=${j}`);
  const pos = withPhotos.indexOf(i);
  const up = source
    ? upscaleFactor(source, WINDOW_BOX, edit, options.dpi / BASE_DPI)
    : 0;
  const stageH = stage.h;

  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.05 : 0.005;
    const map: Record<string, () => void> = {
      ArrowLeft: () => set({ offsetX: edit.offsetX - step }),
      ArrowRight: () => set({ offsetX: edit.offsetX + step }),
      ArrowUp: () => set({ offsetY: edit.offsetY - step }),
      ArrowDown: () => set({ offsetY: edit.offsetY + step }),
      "+": () => set({ zoom: clampZoom(edit.zoom * 1.05) }),
      "=": () => set({ zoom: clampZoom(edit.zoom * 1.05) }),
      "-": () => set({ zoom: clampZoom(edit.zoom / 1.05) }),
      "[": () => set({ rotation: edit.rotation - 0.5 }),
      "]": () => set({ rotation: edit.rotation + 0.5 }),
    };
    if (map[e.key]) {
      e.preventDefault();
      map[e.key]();
    }
  };

  async function eyedrop() {
    const ED = (
      window as unknown as {
        EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> };
      }
    ).EyeDropper;
    if (ED) {
      try {
        set({ fill: (await new ED().open()).sRGBHex });
      } catch {
        /* cancelled */
      }
    } else {
      setPicking(true);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <TitleRow
        title={st.name}
        sub={
          <>
            Photo{" "}
            <span className="num">
              {pos + 1} of {withPhotos.length}
            </span>
            {source && (
              <>
                {" "}
                · source{" "}
                <span className="num">
                  {source.width} × {source.height}
                </span>{" "}
                px
              </>
            )}
            {edits[i] ? " · adjusted" : " · as shot"}
          </>
        }
        actions={
          <>
            <Button
              variant="ghost"
              disabled={pos <= 0}
              onClick={() => go(withPhotos[pos - 1])}
            >
              Previous
            </Button>
            <Button
              variant="ghost"
              disabled={pos >= withPhotos.length - 1}
              onClick={() => go(withPhotos[pos + 1])}
            >
              Next
            </Button>
            <Button variant="primary" onClick={() => router.push("/review")}>
              Done
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,460px)_minmax(0,1fr)_220px]">
        <div ref={stageBox} className="order-1 flex min-w-0 flex-col gap-3">
          <div
            tabIndex={0}
            onKeyDown={onKey}
            className="self-start rounded-lg focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            aria-label="Photo editor. Arrow keys move, + and - zoom, [ and ] straighten."
          >
            {source ? (
              <PhotoStage
                img={source}
                edit={before ? DEFAULT_EDIT : edit}
                onChange={(e) => !before && setEdit(i, e)}
                guides={guides}
                picking={picking}
                width={stageW}
                height={stageH}
                onPick={(hex) => {
                  set({ fill: hex });
                  setPicking(false);
                }}
              />
            ) : (
              <div
                style={{ width: stageW, height: stageH }}
                className="rounded-lg bg-raised"
              />
            )}
          </div>
          {source && up > 2 && (
            <Notice tone="warn">
              The source is{" "}
              <span className="num">
                {source.width} × {source.height}
              </span>{" "}
              px, enlarged <span className="num">{up.toFixed(1)}×</span> at{" "}
              {options.dpi} dpi, so it will print soft. A larger original is the
              only real fix.
            </Notice>
          )}
        </div>

        <div className="order-3 flex min-w-0 flex-col gap-6 lg:order-2">
          <Panel title="Frame">
            <div className="flex flex-col gap-4">
              <Slider
                label="Zoom"
                min={0.3}
                max={4}
                value={edit.zoom}
                onChange={(v) => set({ zoom: v })}
                format={(v) => `×${v.toFixed(2)}`}
              />
              <Slider
                label="Straighten"
                min={-15}
                max={15}
                step={0.1}
                value={Number(fine.toFixed(1))}
                onChange={(v) => set({ rotation: quarter + v })}
                format={(v) => `${v.toFixed(1)}°`}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => set({ rotation: edit.rotation - 90 })}
                  aria-label="Rotate left 90°"
                >
                  ⟲ 90°
                </Button>
                <Button
                  onClick={() => set({ rotation: edit.rotation + 90 })}
                  aria-label="Rotate right 90°"
                >
                  ⟳ 90°
                </Button>
                <Button
                  onClick={() => set({ flipH: !edit.flipH })}
                  aria-pressed={edit.flipH}
                  className={edit.flipH ? "bg-active" : ""}
                >
                  Flip
                </Button>
                <Button onClick={() => set({ offsetX: 0, offsetY: 0 })}>
                  Centre
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="whitespace-nowrap">Background fill</span>
                <input
                  type="color"
                  value={edit.fill}
                  onChange={(e) => set({ fill: e.target.value })}
                  className="h-8 w-10 cursor-pointer rounded-md border border-control bg-sheet p-0.5 pointer-coarse:h-10 pointer-coarse:w-12"
                  aria-label="Fill colour"
                />
                <Button variant="ghost" onClick={eyedrop}>
                  {picking ? "Click the photo" : "Pick from photo"}
                </Button>
              </div>
              <p className="text-xs text-muted">
                The fill shows where zooming out or rotating uncovers the
                window.
              </p>
            </div>
          </Panel>

          <Panel title="Adjust">
            <div className="flex flex-col gap-4">
              <Slider
                label="Brightness"
                min={-0.5}
                max={0.5}
                value={edit.brightness}
                onChange={(v) => set({ brightness: v })}
                format={pct}
              />
              <Slider
                label="Contrast"
                min={-0.5}
                max={0.5}
                value={edit.contrast}
                onChange={(v) => set({ contrast: v })}
                format={pct}
              />
              <Slider
                label="Saturation"
                min={-0.5}
                max={0.5}
                value={edit.saturation}
                onChange={(v) => set({ saturation: v })}
                format={pct}
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={edit.sharpen}
                  onChange={(e) => set({ sharpen: e.target.checked })}
                />
                Sharpen when enlarged
              </label>
              <p className="text-xs text-muted">
                Left at zero, the photo prints exactly as shot. Double-click a
                slider to reset it.
              </p>
            </div>
          </Panel>

          <div className="flex flex-wrap items-center gap-2">
            <label className="mr-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={guides}
                onChange={(e) => setGuides(e.target.checked)}
              />
              Guides
            </label>
            <Button
              className="touch-none select-none"
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={() => setBefore(true)}
              onPointerUp={() => setBefore(false)}
              onPointerLeave={() => setBefore(false)}
            >
              Hold to see original
            </Button>
            <Button variant="danger" onClick={() => setEdit(i, null)}>
              Reset
            </Button>
          </div>
        </div>

        {/* phones: right under the stage, small, so the result is seen while framing */}
        <div className="order-2 flex flex-col items-start gap-2 lg:order-3 lg:col-span-2 xl:col-span-1">
          <h2 className="text-sm font-medium">On the card</h2>
          <CardPreview
            student={st}
            photo={photo}
            edit={edit}
            theme={options.themes[0] ?? "classic"}
            width={stage.phone ? 150 : 220}
            supersample={1}
          />
        </div>
      </div>
    </div>
  );
}
