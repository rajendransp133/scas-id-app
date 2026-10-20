"use client";

import { useRef, useState, type ReactNode } from "react";

export function Dropzone({ accept, multiple = false, onFiles, children, compact = false }:
  { accept: string; multiple?: boolean; onFiles: (files: File[]) => void; children: ReactNode; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onFiles(multiple ? files : files.slice(0, 1));
      }}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-[1.5px] border-dashed text-center transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
        compact ? "gap-1 px-4 py-4" : "gap-1.5 px-6 py-10 sm:py-14"
      } ${over ? "border-ink bg-raised" : "border-control bg-sheet hover:border-ink hover:bg-raised"}`}
    >
      {children}
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </div>
  );
}
