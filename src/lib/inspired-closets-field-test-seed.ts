import { getSupabaseAdmin } from "@/db/client";

export const FIELD_TEST_PHONE = "0000000000";
export const FIELD_TEST_MARK = "FIELD-TEST";

export const FIELD_TEST_UPDATES = [
  {
    id: "proxy-update-gavin",
    title: "Warehouse closes at 11 on Saturday",
    body: "Frank is out at noon. Pull hardware Friday if you have a Saturday go-back. Call Craig if you’re stuck.",
    author_name: "Gavin",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
  },
  {
    id: "proxy-update-craig",
    title: "New Blum hinges on the trucks",
    body: "Starting Monday the walk-in kits have the new Blum 110s. Don’t mix old and new on the same run. Extra boxes are on Van 2.",
    author_name: "Craig",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString(),
  },
];

type StaffRow = {
  id: string;
  name: string;
  role: string;
  phone: string | null;
  title: string | null;
  active: boolean;
};

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(n: number, base = new Date()): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  d.setHours(12, 0, 0, 0);
  return d;
}

function mondayOf(d = new Date()): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(12, 0, 0, 0);
  return date;
}

function atHour(day: Date, hour: number, minute: number): string {
  const d = new Date(day);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export function isFieldTestInstaller(row: { phone?: string | null; name?: string | null }): boolean {
  return row.phone === FIELD_TEST_PHONE || row.name === "Field Test";
}

async function findOrCreateClient(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  input: { name: string; phone: string; address: string },
) {
  const { data: existing } = await supabase
    .from("ic_clients")
    .select("id")
    .eq("phone", input.phone)
    .is("deleted_at", null)
    .limit(1);
  if (existing?.[0]) return existing[0].id;
  const { data: created, error } = await supabase
    .from("ic_clients")
    .insert({
      name: input.name,
      phone: input.phone,
      address: input.address,
      notes: FIELD_TEST_MARK,
    })
    .select("id")
    .single();
  if (error || !created) throw new Error(error?.message ?? "Could not create test client.");
  return created.id;
}

async function findOrCreateJob(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  input: Record<string, unknown> & { studio_ref: string },
) {
  const { data: existing } = await supabase
    .from("ic_jobs")
    .select("id")
    .eq("studio_ref", input.studio_ref)
    .eq("community_ref", FIELD_TEST_MARK)
    .is("deleted_at", null)
    .limit(1);
  if (existing?.[0]) {
    const { studio_ref, ...rest } = input;
    void studio_ref;
    await supabase
      .from("ic_jobs")
      .update({ ...rest, updated_at: new Date().toISOString() })
      .eq("id", existing[0].id);
    return existing[0].id;
  }
  const { data: created, error } = await supabase
    .from("ic_jobs")
    .insert({ ...input, community_ref: FIELD_TEST_MARK })
    .select("id")
    .single();
  if (error || !created) throw new Error(error?.message ?? "Could not create test job.");
  return created.id;
}

export async function ensureFieldTestWorld(): Promise<StaffRow> {
  const supabase = getSupabaseAdmin();
  const hiredAt = "2024-03-18";

  const { data: existingRows } = await supabase
    .from("ic_staff")
    .select("id, name, role, phone, title, active")
    .eq("role", "installer")
    .eq("active", true)
    .is("deleted_at", null)
    .or(`phone.eq.${FIELD_TEST_PHONE},name.eq.Field Test`)
    .limit(1);

  let installer = existingRows?.[0] ?? null;
  if (!installer) {
    const { data: created, error } = await supabase
      .from("ic_staff")
      .insert({
        name: "Alex Rivera",
        role: "installer",
        phone: FIELD_TEST_PHONE,
        title: "Lead installer",
        hired_at: hiredAt,
        active: true,
      })
      .select("id, name, role, phone, title, active")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Could not create the test installer.");
    installer = created;
  } else if (installer.name !== "Alex Rivera" || installer.phone !== FIELD_TEST_PHONE) {
    await supabase
      .from("ic_staff")
      .update({
        name: "Alex Rivera",
        phone: FIELD_TEST_PHONE,
        title: "Lead installer",
        hired_at: hiredAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", installer.id);
    installer = { ...installer, name: "Alex Rivera", phone: FIELD_TEST_PHONE, title: "Lead installer" };
  }

  const { data: helpers } = await supabase
    .from("ic_staff")
    .select("id, name")
    .eq("role", "installer")
    .eq("active", true)
    .is("deleted_at", null)
    .neq("id", installer.id)
    .limit(1);
  const helperId = helpers?.[0]?.id ?? null;
  const helperName = helpers?.[0]?.name ?? "Diego";

  const today = new Date();
  const monday = mondayOf(today);
  const vasquezId = await findOrCreateClient(supabase, {
    name: "Elena Vasquez",
    phone: "7025550142",
    address: "3128 Palomino Ln, Henderson, NV 89074",
  });
  const hillId = await findOrCreateClient(supabase, {
    name: "Marcus Hill",
    phone: "7025550188",
    address: "8712 Azure Vista Dr, Las Vegas, NV 89144",
  });
  const shahId = await findOrCreateClient(supabase, {
    name: "Priya Shah",
    phone: "7025550164",
    address: "145 Canyon Ridge Ct, Henderson, NV 89012",
  });

  const vasquezJob = await findOrCreateJob(supabase, {
    studio_ref: "FT-VASQUEZ",
    client_id: vasquezId,
    installer_id: installer.id,
    stage: "install_scheduled",
    job_kind: "new_install",
    install_date: ymd(today),
    sold_date: ymd(addDays(-18)),
    visit_window: "8–10a",
    crew_size: 2,
    estimated_install_days: 1,
    contract_cents: 1285000,
    deposit_cents: 642500,
    notes: "Walk-in + pantry. Extra rod on the left wall. Garage code 4419. HOA wants vans on the left side of the driveway.",
    field_notes: "Hardware staged in the garage. Customer will be home after 9.",
    site_ready_notes: "Site ready — Des confirmed Tuesday.",
  });
  const hillJob = await findOrCreateJob(supabase, {
    studio_ref: "FT-HILL",
    client_id: hillId,
    installer_id: installer.id,
    stage: "install_scheduled",
    job_kind: "go_back",
    install_date: ymd(addDays(1)),
    sold_date: ymd(addDays(-40)),
    visit_window: "10–12",
    crew_size: 1,
    estimated_install_days: 1,
    contract_cents: 0,
    notes: "Go-back: missing shelf pins + one door out of square. Take the extra Blum 110s.",
    field_notes: "Need 12 pins and the touch-up kit.",
    risk_flag: true,
  });
  await findOrCreateJob(supabase, {
    studio_ref: "FT-SHAH",
    client_id: shahId,
    installer_id: installer.id,
    stage: "install_complete",
    job_kind: "new_install",
    install_date: ymd(monday),
    completed_date: ymd(monday),
    sold_date: ymd(addDays(-24)),
    visit_window: "8–10a",
    crew_size: 2,
    estimated_install_days: 1,
    contract_cents: 942000,
    notes: "Mudroom + hall. Finished Monday. Customer signed off.",
    field_notes: "Left extra shelf on the top. Photos uploaded.",
  });

  const fridayLast = addDays(-((today.getDay() + 2) % 7 || 7));
  const daysUntilFriday = (5 - today.getDay() + 7) % 7 || 7;
  const fridayNext = addDays(daysUntilFriday);
  await supabase.from("ic_staff_pay").upsert(
    {
      staff_id: installer.id,
      classification: "w2",
      last_pay_cents: 184750,
      last_pay_date: ymd(fridayLast),
      next_pay_date: ymd(fridayNext),
      bank_last4: "4412",
      routing_last4: "1210",
      bank_status: "on_file",
      home_address: "2210 Desert Inn Rd, Las Vegas, NV 89109",
      emergency_name: "Ana Ruiz",
      emergency_phone: "7025550190",
      emergency_relation: "Sister",
      truck_label: "Van 2 · white box",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "staff_id" },
  );

  const { data: existingNotices } = await supabase
    .from("ic_field_notices")
    .select("id")
    .eq("installer_id", installer.id)
    .limit(1);
  if (!existingNotices?.length) {
    await supabase.from("ic_field_notices").insert([
      {
        installer_id: installer.id,
        kind: "pto",
        title: "PTO approved",
        body: "Sep 18–19 is on the calendar. You won’t be booked those days.",
        created_at: new Date(Date.now() - 1000 * 60 * 50).toISOString(),
      },
      {
        installer_id: installer.id,
        kind: "crew",
        title: `${helperName} is on the Vasquez job`,
        body: `Office approved ${helperName} for Elena Vasquez tomorrow’s window if you run long.`,
        related_id: vasquezJob,
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
      },
      {
        installer_id: installer.id,
        kind: "pay",
        title: "Deposit details are with Lulu",
        body: "Account last 4 4412. She has it in QuickBooks.",
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
        read_at: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
      },
    ]);
  }

  const { data: existingOff } = await supabase
    .from("ic_time_off")
    .select("id")
    .eq("installer_id", installer.id)
    .limit(1);
  if (!existingOff?.length) {
    await supabase.from("ic_time_off").insert([
      {
        installer_id: installer.id,
        kind: "pto",
        start_date: "2026-09-18",
        end_date: "2026-09-19",
        note: "Family in town",
        status: "approved",
        decided_at: new Date().toISOString(),
      },
      {
        installer_id: installer.id,
        kind: "sick",
        start_date: ymd(addDays(10)),
        end_date: ymd(addDays(10)),
        note: "Dentist — afternoon only if we can split it",
        status: "requested",
      },
    ]);
  }

  const { data: existingClocks } = await supabase
    .from("ic_time_entries")
    .select("id")
    .eq("installer_id", installer.id)
    .eq("note", FIELD_TEST_MARK)
    .limit(1);
  if (!existingClocks?.length) {
    const clockDays = [0, 1, 2, 3]
      .map((offset) => addDays(offset, monday))
      .filter((day) => ymd(day) < ymd(today));
    const jobIds = [vasquezJob, hillJob];
    if (clockDays.length) {
      await supabase.from("ic_time_entries").insert(
        clockDays.map((day, index) => ({
          job_id: jobIds[index % jobIds.length],
          installer_id: installer.id,
          clock_in_at: atHour(day, 7, 48 + index),
          clock_out_at: atHour(day, 15, 30 + index * 12),
          note: FIELD_TEST_MARK,
        })),
      );
    }
  }

  if (helperId) {
    const { data: crew } = await supabase
      .from("ic_job_crew")
      .select("id")
      .eq("job_id", vasquezJob)
      .eq("installer_id", helperId)
      .limit(1);
    if (!crew?.length) {
      await supabase.from("ic_job_crew").insert({
        job_id: vasquezJob,
        installer_id: helperId,
        status: "approved",
        requested_by: installer.id,
        decided_at: new Date().toISOString(),
      });
    }
  }

  const { data: existingIssue } = await supabase
    .from("ic_field_issues")
    .select("id")
    .eq("job_id", hillJob)
    .limit(1);
  if (!existingIssue?.length) {
    await supabase.from("ic_field_issues").insert({
      job_id: hillJob,
      installer_id: installer.id,
      issue_type: "missing_part",
      description: "Short 12 shelf pins and one 18\" door is out of square. Flagged for Craig.",
      status: "open",
    });
  }

  const { data: docs } = await supabase
    .from("ic_staff_documents")
    .select("id")
    .eq("staff_id", installer.id)
    .limit(1);
  if (!docs?.length) {
    await supabase.from("ic_staff_documents").insert({
      staff_id: installer.id,
      kind: "w2",
      title: "W-2 · 2025",
      public_url: null,
    });
  }

  return installer;
}
