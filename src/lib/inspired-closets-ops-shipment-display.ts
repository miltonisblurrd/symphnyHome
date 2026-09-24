/** Display / grouping helpers for receiving Details — no Node-only imports. */

export function isPlausibleJobLabel(name: string | null | undefined): boolean {
  const value = (name ?? "").replace(/\s+/g, " ").trim();
  if (!value || value === "Unassigned") return false;
  if (value.length > 40) return false;
  if (value.split(/\s+/).length > 6) return false;
  if (
    /\b(due to|tariff|prices may|purchase order|trade polic|supply chain|quote or)\b/i.test(
      value,
    )
  ) {
    return false;
  }
  return true;
}

export function isClientJobLabel(name: string | null | undefined): boolean {
  if (!isPlausibleJobLabel(name)) return false;
  return !/^(stock|unassigned|harbor|shop|wurth|hafele|häfele|richelieu)$/i.test(
    (name ?? "").trim(),
  );
}

export function isUsableNotice(value: string | null | undefined): boolean {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return false;
  if (text.length > 48) return false;
  if (
    /\b(due to|tariff|prices may|purchase order currently|supply chain|quote or|we do appreciate)\b/i.test(
      text,
    )
  ) {
    return false;
  }
  return true;
}

export function isShippingChargeLine(item: {
  item_number?: string | null;
  description?: string | null;
}): boolean {
  const sku = (item.item_number ?? "").trim().toUpperCase();
  const desc = (item.description ?? "").toLowerCase();
  if (sku === "SHIPPING" || sku === "FREIGHT") return true;
  if (sku === "SH" && (desc.length === 0 || /shipping|freight|handling/.test(desc))) return true;
  return /estimated shipping|shipping charges|shipping & handling|shipping and handling/.test(
    desc,
  );
}

export function isWeakIdentity(notice: string, filename?: string | null): boolean {
  const value = notice.replace(/\s+/g, " ").trim().toLowerCase();
  if (!value) return true;
  if (/^(stock|wurth|hafele|häfele|richelieu|stow|harbor)$/i.test(value)) return true;
  const base = String(filename ?? "")
    .replace(/^.*[\\/]/, "")
    .replace(/\.[^.]+$/, "")
    .toLowerCase();
  if (!base) return false;
  const first = base.split(/[-_=\s]/).find(Boolean) ?? "";
  return value === base || value === first;
}

export function shipmentVendorLabel(input: {
  vendor?: string | null;
  source_filename?: string | null;
}): string {
  const vendor = (input.vendor ?? "").toLowerCase();
  const file = input.source_filename ?? "";
  if (vendor === "hafele") return "Häfele";
  if (vendor === "richelieu") return "Richelieu";
  if (vendor === "trulite") return "Trulite";
  if (vendor === "wurth") return "Würth";
  if (/hardware\s*resources|\bhr[-_]/i.test(file)) return "Hardware Resources";
  if (vendor === "other") return "3rd party";
  return "Stow";
}

export function shipmentIdentity(input: {
  notice?: string | null;
  source_filename?: string | null;
  so_numbers?: string[];
  job_names?: string[];
  order_name?: string | null;
  po_number?: string | null;
}): string {
  const sos = [...new Set((input.so_numbers ?? []).map((value) => value.trim()).filter(Boolean))];
  const jobs = [
    ...new Set((input.job_names ?? []).map((value) => value.trim()).filter(isClientJobLabel)),
  ];
  const notice = (input.notice ?? "").replace(/\s+/g, " ").trim();
  const orderName = (input.order_name ?? "").trim();
  if (orderName && isUsableNotice(orderName)) return orderName;
  if (isUsableNotice(notice) && !isWeakIdentity(notice, input.source_filename)) return notice;
  if (jobs.length) return jobs.join(" / ");
  const po = (input.po_number ?? "").trim();
  if (po && isUsableNotice(po) && !/^stock$/i.test(po)) return po;
  if (sos[0]) return sos[0]!;
  if (isUsableNotice(notice)) return notice;
  const file = String(input.source_filename ?? "")
    .replace(/^.*[\\/]/, "")
    .replace(/\.[^.]+$/, "");
  return file || "Shipment";
}

export function formatShipDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export type ShipmentPdf = { label: string; url: string; path: string | null };

export function shipmentPdfs(ship: {
  source_filename?: string | null;
  public_url?: string | null;
  storage_path?: string | null;
  parse_quality?: Record<string, unknown> | null;
}): ShipmentPdf[] {
  const out: ShipmentPdf[] = [];
  const seen = new Set<string>();
  const quality = ship.parse_quality ?? {};
  const lists = Array.isArray(quality.packing_lists) ? quality.packing_lists : [];
  const keyOf = (path: string | null, url: string | null) => path || url || "";
  if (ship.public_url || ship.storage_path) {
    const key = keyOf(ship.storage_path ?? null, ship.public_url ?? null);
    out.push({
      label: ship.source_filename || "Packing slip",
      url: ship.public_url || "",
      path: ship.storage_path ?? null,
    });
    if (key) seen.add(key);
  }
  for (const row of lists) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const url = typeof rec.public_url === "string" ? rec.public_url : "";
    const path = typeof rec.storage_path === "string" ? rec.storage_path : null;
    const key = keyOf(path, url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      label: typeof rec.source_filename === "string" ? rec.source_filename : "Packing slip",
      url,
      path,
    });
  }
  return out;
}

export function shipmentFactRows(input: {
  notice?: string | null;
  source_filename?: string | null;
  shipDate: string | null;
  facts: ReturnType<typeof shipmentHeaderFacts>;
  soNumbers: string[];
  jobNames: string[];
  isStock: boolean;
}): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  const jobs = [...new Set(input.jobNames.map((value) => value.trim()).filter(isClientJobLabel))];
  const name = input.facts.order_name || (jobs.length ? jobs.join(" / ") : null);
  if (name) rows.push({ label: "Name", value: name });

  const notice = (input.notice ?? "").replace(/\s+/g, " ").trim();
  const order = input.facts.order_number;
  const so =
    input.facts.so_number ||
    input.soNumbers.find((value) => {
      const next = value.trim();
      return next && next !== order;
    }) ||
    null;
  if (
    isUsableNotice(notice) &&
    !isWeakIdentity(notice, input.source_filename) &&
    notice !== name &&
    notice !== so &&
    notice !== order
  ) {
    rows.push({ label: "Notice", value: notice });
  }
  if (so && so !== name) rows.push({ label: "SO", value: so });
  if (order && order !== so && order !== name) rows.push({ label: "Order", value: order });
  if (input.facts.reference && input.facts.reference !== order && input.facts.reference !== so) {
    rows.push({ label: "Ref", value: input.facts.reference });
  }
  if (input.facts.po) rows.push({ label: "PO", value: input.facts.po });
  if (input.shipDate) rows.push({ label: "Ship date", value: input.shipDate });
  if (input.facts.order_total) rows.push({ label: "Total", value: formatMoney(input.facts.order_total) });
  if (input.facts.weight_lbs) {
    const weight = Number.isInteger(input.facts.weight_lbs)
      ? String(input.facts.weight_lbs)
      : String(input.facts.weight_lbs);
    rows.push({ label: "Weight", value: `${weight} lbs` });
  }
  if (input.facts.ship_from) rows.push({ label: "Ship from", value: input.facts.ship_from });
  if (input.isStock) rows.push({ label: "Type", value: "Stock" });
  return rows;
}

export type ExistingRowFlag = {
  job_id: string;
  job_name: string;
  shipment_id: string;
  label: string;
};

export function existingRowFlags(quality: unknown): ExistingRowFlag[] {
  const record =
    quality && typeof quality === "object" && !Array.isArray(quality)
      ? (quality as Record<string, unknown>)
      : {};
  const rows = Array.isArray(record.existing_rows) ? record.existing_rows : [];
  const flags: ExistingRowFlag[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const flag = row as Record<string, unknown>;
    const jobId = typeof flag.job_id === "string" ? flag.job_id : "";
    const shipmentId = typeof flag.shipment_id === "string" ? flag.shipment_id : "";
    if (!jobId || !shipmentId) continue;
    flags.push({
      job_id: jobId,
      job_name: typeof flag.job_name === "string" && flag.job_name.trim() ? flag.job_name.trim() : "Client",
      shipment_id: shipmentId,
      label: typeof flag.label === "string" && flag.label.trim() ? flag.label.trim() : "Existing row",
    });
  }
  return flags;
}

export function overlapSummary(flags: ExistingRowFlag[]): string {
  const names = [...new Set(flags.map((flag) => flag.job_name))];
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} already has a row`;
  if (names.length === 2) return `${names[0]} and ${names[1]} already have a row`;
  return `${names[0]}, ${names[1]}, and ${names.length - 2} more already have a row`;
}

export function shipmentHeaderFacts(quality: Record<string, unknown> | null | undefined): {
  order_name: string | null;
  po: string | null;
  order_number: string | null;
  so_number: string | null;
  reference: string | null;
  order_total: number | null;
  weight_lbs: number | null;
  ship_from: string | null;
} {
  const q = quality ?? {};
  const num = (value: unknown): number | null => {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const text = (value: unknown): string | null => {
    const s = typeof value === "string" ? value.trim() : "";
    return s || null;
  };
  return {
    order_name: text(q.order_name),
    po: text(q.po_number),
    order_number: text(q.order_number),
    so_number: text(q.so_number),
    reference: text(q.reference),
    order_total: num(q.order_total),
    weight_lbs: num(q.weight_lbs),
    ship_from: text(q.ship_from),
  };
}
