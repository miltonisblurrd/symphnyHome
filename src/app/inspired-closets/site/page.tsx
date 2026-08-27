import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/components/inspired-closets/site-forms.module.css";

export const metadata: Metadata = {
  title: "Inspired Closets Las Vegas · Website forms",
  robots: { index: false, follow: false },
};

export default function InspiredClosetsSiteIndexPage() {
  return (
    <>
      <div className={styles.hero}>
        <h1>Las Vegas website forms</h1>
        <p>
          Same fields as inspiredclosets.com. Submit one, then open Leads — Des should have a name,
          phone, email, and zip to call.
        </p>
      </div>
      <div className={styles.picker}>
        <Link href="/inspired-closets/site/consultation">
          <strong>Free design consultation</strong>
          <span>Name, email, phone, zip, rooms of interest, comments.</span>
        </Link>
        <Link href="/inspired-closets/site/brochure">
          <strong>Ideas brochure</strong>
          <span>Name, email, phone, zip — then a stand-in brochure.</span>
        </Link>
      </div>
    </>
  );
}
