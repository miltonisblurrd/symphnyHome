import type { Metadata } from "next";
import { Suspense } from "react";
import InspiredClosetsAccessForm from "./InspiredClosetsAccessForm";

export const metadata: Metadata = {
  title: "Inspired Closets · Private preview",
  robots: { index: false, follow: false },
};

export default function InspiredClosetsAccessPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100dvh" }} />}>
      <InspiredClosetsAccessForm />
    </Suspense>
  );
}
