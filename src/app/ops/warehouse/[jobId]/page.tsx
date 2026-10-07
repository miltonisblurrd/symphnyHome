import OpsWarehouseKit from "@/components/inspired-closets/OpsWarehouseKit";

export const metadata = {
  title: "Inspired Closets OS · Kit",
};

export default async function InspiredClosetsWarehouseKitPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  return <OpsWarehouseKit jobId={jobId} />;
}
