import { redirect } from "next/navigation";

export const metadata = {
  title: "Inspired Closets OS · Install Workers",
};

export default function InspiredClosetsOpsCrewPage() {
  redirect("/inspired-closets/ops/installers");
}
