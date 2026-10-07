import type { Metadata } from "next";
import SiteLeadForm from "@/components/inspired-closets/SiteLeadForm";

export const metadata: Metadata = {
  title: "Request A Free In-Home Consultation | Inspired Closets Las Vegas",
  robots: { index: false, follow: false },
};

export default function ConsultationFormPage() {
  return (
    <SiteLeadForm
      formType="consultation_request"
      title="Let's Get Started with a Free Design Consultation"
    />
  );
}
