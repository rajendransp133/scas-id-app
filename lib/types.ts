// Shared data model.  See CLAUDE.md for the rules behind each field.

export interface Student {
  name: string;
  course: string;
  year: string;
  batch: string;
  dob: string;
  contact: string;
  address: string;
  blood_group: string;
}

/** Where a student's current photo came from. */
export type PhotoSource = "assigned" | "file" | "embedded";

export interface StudentPhoto {
  blob: Blob;
  source: PhotoSource;
  /** content hash, for spotting rows that share one image */
  hash: string;
}

/** Non-destructive photo adjustments, applied at render time. */
export interface PhotoEdit {
  zoom: number;          // 1 = cover-fit the photo window
  offsetX: number;       // pan, as a fraction of the window width
  offsetY: number;       // ... and height
  rotation: number;      // degrees, clockwise
  flipH: boolean;
  fill: string;          // colour behind uncovered areas
  brightness: number;    // -1..1, 0 = as shot
  contrast: number;
  saturation: number;
  sharpen: boolean;      // unsharp mask, only when the photo is enlarged
}

export const DEFAULT_EDIT: PhotoEdit = {
  zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, flipH: false, fill: "#ffffff",
  brightness: 0, contrast: 0, saturation: 0, sharpen: false,
};

export type OutputFormat = "png" | "svg" | "both";

/** UI equivalents of the old create_id_card.py flags. */
export interface GenerateOptions {
  themes: string[];
  format: OutputFormat;
  dpi: number;
  supersample: number;
  svgRaster: number;
  /** A4 print sheets (PNG pages + PDF, and/or SVG pages) */
  sheet: boolean;
  /** the --no-sharpen default: off; per-photo edits can still turn it on */
  sharpen: boolean;
}

export const DEFAULT_OPTIONS: GenerateOptions = {
  themes: ["violet"], format: "png", dpi: 600, supersample: 4, svgRaster: 2,
  sheet: false, sharpen: false,
};
