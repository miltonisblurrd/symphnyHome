import { redirect } from "next/navigation";

export const metadata = {
  title: "Inspired Closets OS · Projects",
};

export default async function InspiredClosetsOpsJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const query = await searchParams;
  const suffix = query.id ? `?id=${encodeURIComponent(query.id)}` : "";
  redirect(`/inspired-closets/ops/projects${suffix}`);
}
