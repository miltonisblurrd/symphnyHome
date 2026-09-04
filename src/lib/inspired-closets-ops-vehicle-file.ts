import type { VehicleRow } from "@/lib/inspired-closets-ops-vehicles";

export type DriverLicenseRow = {
  legal_name: string | null;
  license_number: string | null;
  state: string | null;
  class: string | null;
  issued_on: string | null;
  expires_on: string | null;
  endorsements: string | null;
  restrictions: string | null;
};

export type VehicleFile = VehicleRow & {
  plate: string | null;
  vin: string | null;
  registered_owner: string | null;
  garage_address: string | null;
  insurance_carrier: string | null;
  insurance_policy: string | null;
  insurance_agency: string | null;
  insurance_agency_phone: string | null;
  insurance_effective_on: string | null;
  declared_weight_lbs: number | null;
};

/** First truck file: Valu’s 2019 ProMaster from the scans. License is his, not the van’s. */
const VALU_PROMASTER: Partial<VehicleFile> = {
  year: 2019,
  make: "RAM",
  model: "ProMaster 2500",
  odometer: 102019,
  vin: "3C6TRVDG4KE525975",
  vin_last6: "525975",
  registered_owner: "Efficient Space Planning Company",
  garage_address: "6445 W Sunset Rd, Las Vegas, NV 89118",
  insurance_carrier: "Nutmeg Insurance Company (The Hartford)",
  insurance_policy: "53 UEC CI5154",
  insurance_agency: "AssuredPartners of Nevada LLC",
  insurance_agency_phone: "(702) 259-0250",
  insurance_effective_on: "2023-09-26",
  insurance_expires_on: "2024-09-26",
};

const VALU_LICENSE: DriverLicenseRow = {
  legal_name: "Tapavalu Tauheluhelu",
  license_number: "1608449289",
  state: "NV",
  class: "C",
  issued_on: "2026-05-13",
  expires_on: "2034-03-30",
  endorsements: "None",
  restrictions: "None",
};

function blank(value: string | number | null | undefined): boolean {
  if (value == null) return true;
  if (typeof value === "number") return value === 0;
  return String(value).trim() === "";
}

export function overlayVehicleFile(
  installerName: string,
  vehicle: VehicleFile,
  license: DriverLicenseRow | null,
): { vehicle: VehicleFile; license: DriverLicenseRow | null } {
  const isValu = installerName.trim().split(/\s+/)[0]?.toLowerCase() === "valu";
  if (!isValu) return { vehicle, license };

  const next = { ...vehicle };
  for (const [key, value] of Object.entries(VALU_PROMASTER) as Array<[keyof VehicleFile, VehicleFile[keyof VehicleFile]]>) {
    if (value == null) continue;
    if (blank(next[key] as string | number | null | undefined)) {
      (next as Record<string, unknown>)[key] = value;
    }
  }
  const nextLicense = license && !blank(license.license_number) ? license : VALU_LICENSE;
  return { vehicle: next, license: nextLicense };
}

export function fieldVehicleFile(vehicle: VehicleFile) {
  return {
    id: vehicle.id,
    label: vehicle.name?.trim() || [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" "),
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    color: vehicle.color,
    plate: vehicle.plate ?? (vehicle.plate_last4 ? `···${vehicle.plate_last4}` : null),
    plate_last4: vehicle.plate_last4,
    vin: vehicle.vin,
    odometer: vehicle.odometer,
    registered_owner: vehicle.registered_owner,
    garage_address: vehicle.garage_address,
    registration_expires_on: vehicle.registration_expires_on,
    insurance_carrier: vehicle.insurance_carrier,
    insurance_policy: vehicle.insurance_policy,
    insurance_agency: vehicle.insurance_agency,
    insurance_agency_phone: vehicle.insurance_agency_phone,
    insurance_effective_on: vehicle.insurance_effective_on,
    insurance_expires_on: vehicle.insurance_expires_on,
    declared_weight_lbs: vehicle.declared_weight_lbs,
    next_oil_due_miles: vehicle.next_oil_due_miles,
  };
}

export function fieldLicense(license: DriverLicenseRow | null) {
  if (!license) return null;
  return {
    legal_name: license.legal_name,
    license_number: license.license_number,
    state: license.state,
    class: license.class,
    issued_on: license.issued_on,
    expires_on: license.expires_on,
    endorsements: license.endorsements,
    restrictions: license.restrictions,
  };
}
