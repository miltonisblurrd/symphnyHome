import type { Metadata } from "next";
import SiteLeadForm from "@/components/inspired-closets/SiteLeadForm";

export const metadata: Metadata = {
  title: "View Our Ideas Brochure | Inspired Closets Las Vegas",
  robots: { index: false, follow: false },
};

export default function BrochureFormPage() {
  return (
    <SiteLeadForm
      formType="brochure_download"
      title="View Our Ideas Brochure"
      intro="View a digital version of our Ideas Brochure. Fill out this simple form to display the Ideas Brochure!"
    />
  );
}
