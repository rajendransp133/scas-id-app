// The colleges the app makes cards for.  The layout, themes and geometry are
// shared; a profile only swaps the header words, the signature and whether the
// register number is printed.  See CLAUDE.md "Colleges".

export type CollegeId = "scas" | "sce";

/** A height-fitted header line under the two fitted runs, centred on G.hdr_cx. */
export interface HeaderLine {
  text: string;
  top: number;
  h: number;
  color: "black" | "blue";
  /** width cap, default G.hdr_max_w */
  maxW?: number;
}

export interface College {
  id: CollegeId;
  /** full name, for the app's own screens */
  label: string;
  /** abbreviation for the app bar and file names */
  short: string;
  /** "SUDHARSAN": ink stretched over title_box */
  name: string;
  /** line 2: ink stretched over line2_box */
  sub: string;
  lines: HeaderLine[];
  /** print a REG. NO row above DOB */
  regNo: boolean;
  assets: { logo: string; sign: string };
  /** sample workbook offered on the upload page */
  sample: string;
}

export const COLLEGES: Record<CollegeId, College> = {
  scas: {
    id: "scas",
    label: "Sudharsan College of Arts and Science",
    short: "SCAS",
    name: "SUDHARSAN",
    sub: "COLLEGE OF ARTS AND SCIENCE",
    lines: [
      { text: "PERUMANADU, PUDUKKOTTAI.", top: 191, h: 26, color: "black" },
      { text: "PH : +91 9150750972, +91 9600409700", top: 229, h: 27, color: "black" },
      { text: "scascollege.ac.in", top: 266, h: 24, color: "blue" },
    ],
    regNo: false,
    assets: { logo: "/card-assets/college_logo.png", sign: "/card-assets/principal_sign.png" },
    sample: "/sample/sample-class.xlsx",
  },
  // The approval lines sit where SCAS has its website.  The chevron's left
  // wedge rises from (0,254) to (78,300), so the long NCTE line ends by y 263
  // and the shorter TNTEU line below it stays inside x > 78.
  sce: {
    id: "sce",
    label: "Sudharsan College of Education",
    short: "SCE",
    name: "SUDHARSAN",
    sub: "COLLEGE OF EDUCATION",
    lines: [
      { text: "PERUMANADU, PUDUKKOTTAI - 622 104", top: 186, h: 22, color: "black" },
      { text: "COLLEGE CODE : 11620, PH.NO : +91 96599 93525", top: 216, h: 22, color: "black" },
      { text: "Approved by the N.C.T.E. No: F.S.R.O /NCTE /B.Ed/ APSO412/2007", top: 246, h: 17, color: "black", maxW: 620 },
      { text: "Approved by TNTEU/ affiliation /2007/3163", top: 270, h: 17, color: "black", maxW: 520 },
    ],
    regNo: true,
    assets: { logo: "/card-assets/college_logo.png", sign: "/card-assets/sce/principal_sign.png" },
    sample: "/sample/sample-education.xlsx",
  },
};

export const COLLEGE_IDS = Object.keys(COLLEGES) as CollegeId[];

export function isCollegeId(v: unknown): v is CollegeId {
  return typeof v === "string" && v in COLLEGES;
}
