/**
 * Ship dates on vendor slips: Stow, Häfele, Richelieu, 3rd party.
 * The column is mandatory — normalize every printed format, then fall back
 * to the filename, then the upload day so the list is never blank.
 */

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

const SHIP_LABEL =
  /(?:requested\s+)?(?:ship(?:ping|ped)?|delivery|deliver|deliv\.?|versand|liefer(?:datum|termin)?|date\s+(?:d['’]exp[eé]dition|de\s+livraison)|invoice|packing|pack|order)\s*(?:date|on|datum)?/i;

function yearFromTwoDigits(yy: string): string {
  const year = Number(yy);
  return String(year >= 70 ? 1900 + year : 2000 + year);
}

function isoIfValid(year: string, month: string, day: string): string | null {
  const mm = Number(month);
  const dd = Number(day);
  const yyyy = Number(year);
  if (!yyyy || yyyy < 2000 || yyyy > 2100) return null;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function fromMonthName(monthRaw: string, day: string, year: string): string | null {
  const month = MONTHS[monthRaw.slice(0, 3).toLowerCase()];
  return month ? isoIfValid(year, month, day) : null;
}

/** Accept every date style that shows up on a packing slip or Frank's filename. */
export function normalizeShipDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value
    .replace(/\s+/g, " ")
    .replace(/^[^\dA-Za-z]+|[^\dA-Za-z]+$/g, "")
    .trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return isoIfValid(raw.slice(0, 4), raw.slice(5, 7), raw.slice(8, 10));

  const ymdSlash = raw.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
  if (ymdSlash) return isoIfValid(ymdSlash[1]!, ymdSlash[2]!, ymdSlash[3]!);

  const ymdCompact = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (ymdCompact) return isoIfValid(ymdCompact[1]!, ymdCompact[2]!, ymdCompact[3]!);

  const slash = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (slash) {
    const year = slash[3]!.length === 2 ? yearFromTwoDigits(slash[3]!) : slash[3]!;
    const first = Number(slash[1]);
    const second = Number(slash[2]);
    if (first > 12 && second <= 12) return isoIfValid(year, slash[2]!, slash[1]!);
    return isoIfValid(year, slash[1]!, slash[2]!);
  }

  const euro = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
  if (euro) {
    const year = euro[3]!.length === 2 ? yearFromTwoDigits(euro[3]!) : euro[3]!;
    return isoIfValid(year, euro[2]!, euro[1]!);
  }

  const compact = raw.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (compact) return isoIfValid(yearFromTwoDigits(compact[3]!), compact[1]!, compact[2]!);

  const monthFirst = raw.match(
    /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/i,
  );
  if (monthFirst) return fromMonthName(monthFirst[1]!, monthFirst[2]!, monthFirst[3]!);

  const dayFirst = raw.match(
    /^(\d{1,2})[.\s\-]+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?[\s,\-]+(\d{4})$/i,
  );
  if (dayFirst) return fromMonthName(dayFirst[2]!, dayFirst[1]!, dayFirst[3]!);

  return null;
}

export function shipDateFromFilename(filename: string | null | undefined): string | null {
  const base = String(filename ?? "")
    .replace(/^.*[\\/]/, "")
    .replace(/\.[^.]+$/, "");
  const six = base.match(/(?:^|[-_\s])(\d{6})(?:$|[-_\s])/);
  if (six) return normalizeShipDate(six[1]);
  const eight = base.match(/(?:^|[-_\s])(\d{8})(?:$|[-_\s])/);
  if (eight) return normalizeShipDate(eight[1]);
  const slashed = base.match(/(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/);
  return slashed ? normalizeShipDate(slashed[1]) : null;
}

type DatedHit = { iso: string; index: number; labeled: boolean };

function collectDates(text: string): DatedHit[] {
  const hits: DatedHit[] = [];
  const patterns = [
    /\b\d{4}-\d{2}-\d{2}\b/g,
    /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g,
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b/gi,
    /\b\d{1,2}[.\s\-]+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?[\s,\-]+\d{4}\b/gi,
    /\b20\d{2}\d{2}\d{2}\b/g,
  ];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      const iso = normalizeShipDate(match[0]);
      if (!iso) continue;
      const before = text.slice(Math.max(0, match.index - 48), match.index);
      hits.push({
        iso,
        index: match.index,
        labeled: SHIP_LABEL.test(before) || /:\s*$/.test(before),
      });
    }
  }
  return hits;
}

/** Pull a ship / delivery date from printed slip text, any vendor. */
export function shipDateFromSlipText(text: string | null | undefined): string | null {
  if (!text) return null;
  const compact = text.replace(/\u00a0/g, " ");
  const labeled = [
    /(?:requested\s+)?ship(?:ping|ped)?\s+date[:\s]+([^\n]{4,28})/i,
    /(?:delivery|deliver|deliv\.?)\s+date[:\s]+([^\n]{4,28})/i,
    /shipped\s+on[:\s]+([^\n]{4,28})/i,
    /liefer(?:datum|termin)[:\s]+([^\n]{4,28})/i,
    /versanddatum[:\s]+([^\n]{4,28})/i,
    /date\s+d['’]exp[eé]dition[:\s]+([^\n]{4,28})/i,
    /date\s+de\s+livraison[:\s]+([^\n]{4,28})/i,
    /invoice\s+date[:\s]+([^\n]{4,28})/i,
    /packing\s+date[:\s]+([^\n]{4,28})/i,
    /order\s+date[:\s]+([^\n]{4,28})/i,
  ];
  for (const pattern of labeled) {
    const match = compact.match(pattern);
    if (!match) continue;
    const iso = normalizeShipDate(match[1]) || shipDateFromSlipText(match[1] ?? "");
    if (iso) return iso;
    const inner = collectDates(match[1] ?? "");
    if (inner[0]) return inner[0].iso;
  }

  const hits = collectDates(compact);
  const labeledHit = hits.find((hit) => hit.labeled);
  if (labeledHit) return labeledHit.iso;

  const header = hits.filter((hit) => hit.index < 1800);
  if (header[0]) return header[0].iso;
  return hits[0]?.iso ?? null;
}

export function resolveShipDate(input: {
  parsed?: string | null;
  text?: string | null;
  filename?: string | null;
  uploadedAt?: string | null;
}): string | null {
  return (
    normalizeShipDate(input.parsed) ||
    shipDateFromSlipText(input.text) ||
    shipDateFromFilename(input.filename) ||
    (input.uploadedAt ? input.uploadedAt.slice(0, 10) : null)
  );
}

export function inferredShipmentShipDate(ship: {
  ship_date?: string | null;
  source_filename?: string | null;
  created_at?: string | null;
  parse_quality?: unknown;
}): string | null {
  if (ship.ship_date) return normalizeShipDate(ship.ship_date);
  const fromFile = shipDateFromFilename(ship.source_filename);
  if (fromFile) return fromFile;
  const quality =
    ship.parse_quality && typeof ship.parse_quality === "object"
      ? (ship.parse_quality as { packing_lists?: Array<{ source_filename?: string | null }> })
      : null;
  for (const list of quality?.packing_lists ?? []) {
    const iso = shipDateFromFilename(list.source_filename);
    if (iso) return iso;
  }
  return ship.created_at ? ship.created_at.slice(0, 10) : null;
}
