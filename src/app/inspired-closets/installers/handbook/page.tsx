export const metadata = {
  title: "Inspired Closets OS · Safety handbook",
};

export default function InstallersHandbookPage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "#efe9e5",
        color: "#111",
        fontFamily: "Lato, system-ui, sans-serif",
        padding: "1.5rem 1.15rem 3rem",
        maxWidth: "36rem",
        margin: "0 auto",
      }}
    >
      <p style={{ margin: 0, fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#821f2d" }}>
        Inspired Closets OS · Installers
      </p>
      <h1 style={{ margin: "0.4rem 0 0", fontSize: "1.6rem" }}>Safety handbook</h1>
      <p style={{ color: "rgba(0,0,0,0.6)", lineHeight: 1.5 }}>
        Placeholder for the live handbook. Lulu and Gavin can replace this with the official PDF later.
        Installers open it from Me → Documents.
      </p>
      <section style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.1)", borderRadius: "1rem", padding: "1rem" }}>
        <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.05rem" }}>On every job</h2>
        <ul style={{ margin: 0, paddingLeft: "1.1rem", lineHeight: 1.55, color: "rgba(0,0,0,0.75)" }}>
          <li>Clock in when you arrive. Clock out when you leave.</li>
          <li>Photos before, during, after.</li>
          <li>Flag site-not-ready or damage before you force the install.</li>
          <li>No one works a job they aren’t assigned to.</li>
        </ul>
      </section>
    </main>
  );
}
