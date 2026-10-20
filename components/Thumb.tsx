"use client";

import { useEffect, useState } from "react";

/** A blob's object URL for the lifetime of the component. */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    queueMicrotask(() => setUrl(u));
    return () => { URL.revokeObjectURL(u); setUrl(null); };
  }, [blob]);
  return blob ? url : null;
}

/** A photo as it will sit on the card: in the window shape, ringed in the window orange when `on`. */
export function Thumb({ blob, on = false, className = "h-[42px] w-9" }: { blob: Blob | null | undefined; on?: boolean; className?: string }) {
  const url = useObjectUrl(blob);
  if (!blob) {
    return (
      <div className={`${className} window-shape flex items-center justify-center border-[1.5px] border-dashed border-negative bg-negative-bg`}
           title="No photo"><span className="sr-only">No photo</span></div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- blob URLs, nothing to optimise
  return url ? <img src={url} alt="" className={`${className} window-shape object-cover ${on ? "ring-2 ring-window" : "ring-1 ring-control"}`} /> : <div className={className} />;
}
