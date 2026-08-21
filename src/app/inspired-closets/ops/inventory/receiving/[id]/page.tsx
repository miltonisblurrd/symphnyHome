import OpsShipmentDetail from "@/components/inspired-closets/OpsShipmentDetail";

export const metadata = {
  title: "Inspired Closets OS · Shipment",
};

export default async function InspiredClosetsShipmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OpsShipmentDetail shipmentId={id} />;
}
