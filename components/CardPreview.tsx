"use client";

import { useEffect, useRef } from "react";
import { decodePhoto, ensureFonts, getMeasure, loadCardAssets, makeCanvas } from "@/lib/browser/canvas";
import { useCollege } from "@/lib/browser/college";
import type { College } from "@/lib/card/colleges";
import { CARD_W } from "@/lib/card/geometry";
import { renderCardCanvas } from "@/lib/card/render";
import { THEMES } from "@/lib/card/themes";
import type { PhotoEdit, Student, StudentPhoto } from "@/lib/types";

/** A card rendered by the real canvas backend, at screen resolution. */
export function CardPreview({ student, photo, edit, theme, width = 340, supersample = 2, className = "", college: forCollege }:
  { student: Student; photo: StudentPhoto | null | undefined; edit?: PhotoEdit; theme: string;
    width?: number; supersample?: number; className?: string;
    /** default: the chosen college */
    college?: College }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const chosen = useCollege();
  const college = forCollege ?? chosen;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureFonts();
      const assets = await loadCardAssets(college.id);
      const img = photo ? await decodePhoto(photo.blob).catch(() => null) : null;
      const el = ref.current;
      if (cancelled || !el) return;
      const px = Math.round(width * (window.devicePixelRatio || 1));
      const dpi = (px / CARD_W) * 300;
      const c = renderCardCanvas(makeCanvas, { student, palette: THEMES[theme] ?? THEMES.classic, photo: img, edit, college },
                                 getMeasure(), assets, dpi, supersample);
      el.width = c.width;
      el.height = c.height;
      el.getContext("2d")?.drawImage(c as unknown as CanvasImageSource, 0, 0);
    })();
    return () => { cancelled = true; };
  }, [student, photo, edit, theme, width, supersample, college]);

  return (
    <canvas
      ref={ref}
      style={{ width, aspectRatio: "719 / 1144" }}
      className={`rounded-md bg-white ring-1 ring-line ${className}`}
      aria-label={`ID card preview for ${student.name}`}
    />
  );
}
