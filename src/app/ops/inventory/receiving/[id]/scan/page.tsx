import OpsReceiveScan from "@/components/inspired-closets/OpsReceiveScan";

export const metadata = {
  title: "Inspired Closets OS · Scan",
};

export default async function InspiredClosetsScanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OpsReceiveScan shipmentId={id} />;
}
