"use client";

import ChatInput from "@/components/ChatInput";
import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="page">
      {/* Background */}
      <div className="background">
        <Image
          src="/backgroundSymphny.jpg"
          alt=""
          fill
          priority
          quality={90}
          style={{ objectFit: "cover" }}
        />
        <div className="background-overlay" />
      </div>

      {/* Header */}
      <header className="header">
        <div className="logo">
          <Image
            src="/symphnyNavLogo.svg"
            alt="Symphony"
            width={160}
            height={40}
            priority
          />
        </div>
        <Link href="https://symphonystudio.io/enterprise" className="cta-button">
          Give Us a Call
        </Link>
      </header>

      {/* Hero Content */}
      <section className="hero">
        <h1 className="headline">
          <span className="headline-line">
            <span className="headline-inter">Orchestrating </span>
            <span className="headline-mono">Data</span>
          </span>
          <span className="headline-line">
            <span className="headline-inter">& </span>
            <span className="headline-mono">Systems</span>
            <span className="headline-inter">, with </span>
            <span className="headline-mono">AI</span>
          </span>
        </h1>
        
        <p className="subheadline">
          We conduct AI, tools, and workflows so your business performs as one.
        </p>

        <ChatInput />

        <p className="chat-note">
          Tools read our live studio data — not guesses. Same implementation as our MCP server:{" "}
          <code className="chat-note-code">/api/mcp/http</code> (Streamable HTTP) or{" "}
          <code className="chat-note-code">npm run mcp:stdio</code>.
        </p>
      </section>

      <style jsx>{`
        .page {
          min-height: 100vh;
          position: relative;
          display: flex;
          flex-direction: column;
        }

        .background {
          position: fixed;
          inset: 0;
          z-index: -1;
        }

        .background-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            180deg,
            rgba(0, 0, 0, 0.3) 0%,
            rgba(0, 0, 0, 0.1) 50%,
            rgba(0, 0, 0, 0.4) 100%
          );
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 24px 48px;
          position: relative;
          z-index: 10;
        }

        .logo {
          display: flex;
          align-items: center;
        }

        .cta-button {
          padding: 12px 24px;
          background: #1a1a1a;
          color: #fff;
          text-decoration: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s ease;
        }

        .cta-button:hover {
          background: #333;
          transform: translateY(-1px);
        }

        .hero {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 24px 80px;
          text-align: center;
        }

        .headline {
          font-size: 68px;
          font-weight: 400;
          color: #fff;
          line-height: 1.12;
          margin: 0 0 6px;
          letter-spacing: -0.02em;
        }

        .headline-line {
          display: block;
        }

        .headline-inter {
          font-family: var(--font-inter), system-ui, sans-serif;
          font-weight: 500;
          font-style: normal;
        }

        .headline-mono {
          font-family: var(--font-ibm-plex-mono), ui-monospace, monospace;
          font-style: italic;
          font-weight: 300;
        }

        .subheadline {
          font-size: 23px;
          color: rgba(255, 255, 255, 0.85);
          max-width: none;
          width: 100%;
          line-height: 1.45;
          margin: 0 0 37px;
        }

        .chat-note {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.35);
          margin: 12px 0 0;
          letter-spacing: 0.01em;
          max-width: 520px;
          line-height: 1.45;
        }

        .chat-note-code {
          font-size: 10px;
          color: rgba(255, 255, 255, 0.55);
          background: rgba(255, 255, 255, 0.08);
          padding: 1px 5px;
          border-radius: 4px;
        }

        @media (max-width: 768px) {
          .header {
            padding: 20px 24px;
          }

          .hero {
            padding: 32px 20px 60px;
          }

          .subheadline {
            margin-bottom: 30px;
          }
        }

        @media (max-width: 480px) {
          .header {
            padding: 16px 20px;
          }

          .cta-button {
            padding: 10px 18px;
            font-size: 13px;
          }

          .headline {
            font-size: 2.125rem;
          }
        }
      `}</style>
    </main>
  );
}
