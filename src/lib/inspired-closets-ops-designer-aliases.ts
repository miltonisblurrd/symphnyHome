/** Craig's sheet uses full names. ic_staff uses short tabs. */
export const DESIGNER_ALIASES: Record<string, string> = {
  REBEKAH: "REB",
  REB: "REB",
  YVONNE: "YVON",
  YVON: "YVON",
  CISSY: "CISS",
  CISS: "CISS",
  SANDY: "SAND",
  SAND: "SAND",
  SUMMER: "SUMM",
  SUMM: "SUMM",
  MONICA: "MONI",
  MONI: "MONI",
  TANIA: "TANIA",
  CRAIG: "CRAIG",
  GAVIN: "GAVIN",
  JERISSA: "JERISSA",
  NAVI: "NAVI",
  CATHRINE: "CATHRINE",
  CATHERINE: "CATHRINE",
};

export function designerKey(name: string | null | undefined): string {
  return DESIGNER_ALIASES[String(name ?? "").trim().toUpperCase()] ?? String(name ?? "").trim().toUpperCase();
}

const DESIGNER_LABELS: Record<string, string> = {
  REB: "REBEKAH",
  YVON: "YVONNE",
  CISS: "CISSY",
  SAND: "SANDY",
  SUMM: "SUMMER",
  MONI: "MONICA",
};

export function designerLabel(name: string | null | undefined): string {
  const key = designerKey(name);
  return DESIGNER_LABELS[key] ?? key;
}

export const DESIGNER_SHEET_ORDER = [
  "REB",
  "YVON",
  "CISS",
  "SAND",
  "SUMM",
  "TANIA",
  "MONI",
  "CRAIG",
  "GAVIN",
  "JERISSA",
  "NAVI",
];

export function clientKey(name: string | null | undefined): string {
  const raw = String(name ?? "")
    .toUpperCase()
    .replace(/\bA\s*\/\s*O\b/g, " ")
    .replace(/\bADD[\s-]?ON\b/g, " ")
    .replace(/[^A-Z0-9# ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = raw.split(" ").filter(Boolean);
  const last = parts[parts.length - 1] ?? raw;
  return last.replace(/[^A-Z0-9#]/g, "");
}
