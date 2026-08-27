import { INFLUENCER_TYPES } from "@/lib/inspired-closets-ops-leads";

export const ACCOUNT_KINDS = [
  { id: "customer", label: "Customer" },
  { id: "partner", label: "Partner" },
] as const;

export type IcAccountKind = (typeof ACCOUNT_KINDS)[number]["id"];

export const PARTNER_TYPES = INFLUENCER_TYPES;

export type IcAccount = {
  id: string;
  name: string;
  kind: string;
  partner_type: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
};

export function accountKindLabel(id: string): string {
  return ACCOUNT_KINDS.find((k) => k.id === id)?.label ?? id;
}

export function partnerTypeLabel(id: string | null | undefined): string {
  if (!id) return "";
  return PARTNER_TYPES.find((t) => t.id === id)?.label ?? id.replace(/_/g, " ");
}

export function isPartnerAccount(account: { kind?: string | null } | null | undefined): boolean {
  return account?.kind === "partner";
}

export function matchPartnerAccount(
  name: string,
  accounts: IcAccount[],
): IcAccount | undefined {
  const needle = name.trim().toLowerCase();
  if (!needle) return undefined;
  const partners = accounts.filter((a) => a.kind === "partner");
  return (
    partners.find((a) => a.name.trim().toLowerCase() === needle) ??
    partners.find((a) => a.name.toLowerCase().includes(needle))
  );
}

export function isMissingRelationError(message: string | null | undefined): boolean {
  if (!message) return false;
  return /relation .* does not exist|could not find the table|schema cache|column/i.test(message);
}
