/** Small warehouse-test truck. Numbers are 9-digit Stow-style so phone OCR can read them. */
export const DEMO_NOTICE = "80129999";
export const DEMO_SHIP_DATE = "08/21/2026";
export const DEMO_VENDOR = "stow";
export const DEMO_SO = "1161999";

export type DemoSlipItem = {
  item_number: string;
  so_number: string;
  cust_ref: string;
  job_name: string;
  project_number: string;
  description: string;
  qty: number;
  container_id: string;
  source_page: number;
};

export const DEMO_SLIP_ITEMS: DemoSlipItem[] = [
  {
    item_number: "900111001",
    so_number: DEMO_SO,
    cust_ref: "DEMO_Wright_082126",
    job_name: "DEMO Wright",
    project_number: "082126",
    description: "DF 5.9x26.5x20.9 MP",
    qty: 2,
    container_id: "7000000048807",
    source_page: 1,
  },
  {
    item_number: "900111002",
    so_number: DEMO_SO,
    cust_ref: "DEMO_Wright_082126",
    job_name: "DEMO Wright",
    project_number: "082126",
    description: "SH 14x29.9x3/4 FIX AP",
    qty: 1,
    container_id: "7000000048807",
    source_page: 1,
  },
  {
    item_number: "900111003",
    so_number: DEMO_SO,
    cust_ref: "DEMO_Wright_082126",
    job_name: "DEMO Wright",
    project_number: "082126",
    description: "DB 20.3x25.9x1/4 MP",
    qty: 1,
    container_id: "7000000048807",
    source_page: 1,
  },
  {
    item_number: "900222001",
    so_number: DEMO_SO,
    cust_ref: "DEMO_Fox_082126",
    job_name: "DEMO Fox",
    project_number: "082126",
    description: "VT 16x18.4x3/4 RH WH",
    qty: 1,
    container_id: "7000000048806",
    source_page: 1,
  },
  {
    item_number: "900222002",
    so_number: DEMO_SO,
    cust_ref: "DEMO_Fox_082126",
    job_name: "DEMO Fox",
    project_number: "082126",
    description: "DF 5.9x26.5x20.9 MP",
    qty: 1,
    container_id: "7000000048806",
    source_page: 1,
  },
  {
    item_number: "900222003",
    so_number: DEMO_SO,
    cust_ref: "DEMO_Fox_082126",
    job_name: "DEMO Fox",
    project_number: "082126",
    description: "SH 14x14x3/4 ADJ AP",
    qty: 2,
    container_id: "7000000048806",
    source_page: 1,
  },
];

export function demoPartsFromSlip() {
  const seen = new Map<string, DemoSlipItem>();
  for (const item of DEMO_SLIP_ITEMS) {
    if (!seen.has(item.item_number)) seen.set(item.item_number, item);
  }
  return [...seen.values()].map((item) => ({
    sku: item.item_number,
    name: item.description,
    barcode: item.item_number,
    category: "panel",
    vendor: "Stow",
    qty: 0,
    notes: "DEMO receiving kit — safe to delete after testing.",
  }));
}
