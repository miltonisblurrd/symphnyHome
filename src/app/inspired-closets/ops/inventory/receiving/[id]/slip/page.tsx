import { Suspense } from "react";
import SlipClient from "./SlipClient";

export const metadata = {
  title: "Inspired Closets OS · Packing slip",
};

export default function InspiredClosetsSlipPage() {
  return (
    <Suspense fallback={<p style={{ padding: "2rem" }}>Loading slip…</p>}>
      <SlipClient />
    </Suspense>
  );
}
