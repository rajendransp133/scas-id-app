"use client";

import { useEffect, useRef } from "react";
import { tracePath } from "@/lib/card/canvasBackend";
import { G, WINDOW_BOX } from "@/lib/card/geometry";
import { windowPath } from "@/lib/card/layout";
import { drawPhoto, type Ctx2D, type Img } from "@/lib/photo/applyEdit";
import type { PhotoEdit } from "@/lib/types";

const WIN_W = G.photo_w;
const WIN_H = G.photo_h;

/** Guide lines, as fractions of the window height (no face detection here). */
const GUIDES = [
  { at: 0.10, label: "crown" },
  { at: 0.43, label: "eyes" },
  { at: 0.80, label: "chin" },
];

/**
 * The editing surface: the photo through the card's real window shape, with
 * the rest of the photo dimmed around it.  Drag pans, wheel / pinch zooms.
 */
export function PhotoStage({ img, edit, onChange, guides, picking, onPick, width = 460, height = 560 }:
  { img: Img; edit: PhotoEdit; onChange: (e: PhotoEdit) => void; guides: boolean;
    picking: boolean; onPick: (hex: string) => void; width?: number; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const k = Math.min((width * 0.72) / WIN_W, (height * 0.72) / WIN_H);     // css px per card unit
  const editRef = useRef(edit);
  const onChangeRef = useRef(onChange);
  useEffect(() => { editRef.current = edit; onChangeRef.current = onChange; });

  // paint
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.round(width * dpr);
    el.height = Math.round(height * dpr);
    const ctx = el.getContext("2d") as Ctx2D;
    const raf = requestAnimationFrame(() => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#eceef2";
      ctx.fillRect(0, 0, el.width, el.height);
      // card units -> device px, window centred
      ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (width / 2 - k * G.photo_cx), dpr * (height / 2 - k * G.photo_cy));
      const fast = { ...edit, sharpen: false };
      ctx.save();
      ctx.globalAlpha = 0.3;
      drawPhoto(ctx, img, WINDOW_BOX, fast);
      ctx.restore();
      ctx.save();
      tracePath(ctx, windowPath());
      ctx.clip();
      drawPhoto(ctx, img, WINDOW_BOX, fast);
      ctx.restore();
      tracePath(ctx, windowPath());
      ctx.strokeStyle = "#f27002";
      ctx.lineWidth = G.photo_stroke;
      ctx.stroke();
      if (guides) {
        const [x0, y0, x1] = WINDOW_BOX;
        ctx.save();
        ctx.strokeStyle = "rgba(14,165,233,0.9)";
        ctx.fillStyle = "rgba(14,165,233,1)";
        ctx.lineWidth = 1 / k;
        ctx.setLineDash([6 / k, 4 / k]);
        ctx.font = `${11 / k}px system-ui, sans-serif`;
        for (const g of GUIDES) {
          const y = y0 + g.at * WIN_H;
          ctx.beginPath();
          ctx.moveTo(x0 - 18, y);
          ctx.lineTo(x1 + 18, y);
          ctx.stroke();
          ctx.fillText(g.label, x1 + 22, y + 4 / k);
        }
        ctx.beginPath();
        ctx.moveTo(G.photo_cx, y0 - 10);
        ctx.lineTo(G.photo_cx, y0 + WIN_H + 10);
        ctx.stroke();
        ctx.restore();
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [img, edit, guides, k, width, height]);

  // pointer + wheel interaction
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let start: { edit: PhotoEdit; x: number; y: number; dist: number } | null = null;

    const dist = () => {
      const [a, b] = [...pointers.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    const centroid = () => {
      const v = [...pointers.values()];
      return { x: v.reduce((s, p) => s + p.x, 0) / v.length, y: v.reduce((s, p) => s + p.y, 0) / v.length };
    };
    const restart = () => {
      const c = centroid();
      start = pointers.size ? { edit: editRef.current, x: c.x, y: c.y, dist: dist() } : null;
    };

    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      restart();
    };
    const move = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId) || !start) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const c = centroid();
      const next = { ...start.edit,
        offsetX: start.edit.offsetX + (c.x - start.x) / k / WIN_W,
        offsetY: start.edit.offsetY + (c.y - start.y) / k / WIN_H };
      if (pointers.size === 2 && start.dist > 0) next.zoom = clampZoom(start.edit.zoom * (dist() / start.dist));
      onChangeRef.current(next);
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      restart();
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const cur = editRef.current;
      onChangeRef.current({ ...cur, zoom: clampZoom(cur.zoom * Math.exp(-e.deltaY * 0.0015)) });
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [k]);

  return (
    <canvas
      ref={ref}
      style={{ width, height, touchAction: "none" }}
      className={`rounded-lg ${picking ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`}
      onClickCapture={(e) => {
        if (!picking || !ref.current) return;
        e.stopPropagation();
        const r = ref.current.getBoundingClientRect();
        const dpr = ref.current.width / r.width;
        const px = ref.current.getContext("2d")!.getImageData(
          Math.round((e.clientX - r.left) * dpr), Math.round((e.clientY - r.top) * dpr), 1, 1).data;
        onPick("#" + [px[0], px[1], px[2]].map((v) => v.toString(16).padStart(2, "0")).join(""));
      }}
      aria-label="Photo editing area: drag to move, scroll or pinch to zoom"
    />
  );
}

export const clampZoom = (z: number) => Math.min(6, Math.max(0.3, z));
