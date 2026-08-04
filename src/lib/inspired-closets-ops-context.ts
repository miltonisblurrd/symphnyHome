/**
 * Cubby ops context helpers — payroll workbook is the live source of truth.
 * Kept as a thin re-export so existing imports keep working.
 */
export {
  filterDefaultSyncTabs,
  buildCubbyWorkbookContext as buildCubbyOperationsContext,
  DEFAULT_RED_2026_TABS,
} from "@/lib/inspired-closets-payroll-workbook";
