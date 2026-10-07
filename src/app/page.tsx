import type { Metadata } from "next";
import { Suspense } from "react";
import LoginForm from "@/components/inspired-closets/LoginForm";

export const metadata: Metadata = {
  title: { absolute: "Inspired Closets" },
  description: "Sign in to Inspired Closets.",
  robots: { index: false, follow: false },
};

export default function Home() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100dvh" }} />}>
      <LoginForm />
    </Suspense>
  );
}
