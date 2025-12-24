export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 24px",
      }}
    >
      <h1
        style={{
          fontSize: "clamp(2rem, 5vw, 3.5rem)",
          fontWeight: 600,
          textAlign: "center",
          maxWidth: "650px",
          lineHeight: 1.1,
          marginBottom: "24px",
        }}
      >
        automation + AI studio that orchestrates systems
      </h1>
      <p
        style={{
          fontSize: "1.125rem",
          textAlign: "center",
          maxWidth: "650px",
          lineHeight: 1.6,
          opacity: 0.8,
        }}
      >
        Symphony Studio helps businesses turn disconnected tools and manual work
        into a coordinated, intelligent system through automation and AI
        orchestration.
      </p>
    </main>
  );
}
