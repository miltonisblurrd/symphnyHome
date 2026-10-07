import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "2rem" }}>
      <div>
        <h1 style={{ marginBottom: "0.5rem" }}>That page is not here.</h1>
        <Link href="/">Back to sign in</Link>
      </div>
    </main>
  );
}
