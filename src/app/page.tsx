"use client";

import ChatInput from "@/components/ChatInput";
import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="page">
      {/* Metal → vignette → glass on top (glass must sit above overlay or it disappears) */}
      <div className="background">
        <div className="background-metal background-metal-drift" aria-hidden>
          <Image
            src="/hero-liquid-metal.jpg"
            alt=""
            fill
            priority
            quality={92}
            sizes="100vw"
            style={{ objectFit: "cover" }}
          />
        </div>
        <div className="background-overlay" />
        <div className="background-grid" aria-hidden>
          {/* Native img: Next/Image can re-encode PNGs and crush faint glass/grid alpha */}
          <img
            src="/hero-glass-grid.png"
            alt=""
            decoding="async"
            fetchPriority="high"
          />
        </div>
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
          isolation: isolate;
        }

        .background-metal {
          position: absolute;
          inset: 0;
          z-index: 0;
          overflow: hidden;
          will-change: transform;
        }

        .background-metal-drift {
          animation: metalDrift 34s cubic-bezier(0.42, 0, 0.58, 1) infinite;
        }

        /* Organic loop: uneven pacing reads less “slider” than two-point alternate */
        @keyframes metalDrift {
          0%,
          100% {
            transform: scale(1.04) translate(-2.8%, -2.2%) rotate(-0.45deg);
          }
          22% {
            transform: scale(1.09) translate(1.4%, -1.1%) rotate(0.2deg);
          }
          48% {
            transform: scale(1.13) translate(2.8%, 1.9%) rotate(0.42deg);
          }
          72% {
            transform: scale(1.1) translate(-1.2%, 2.4%) rotate(-0.18deg);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .background-metal-drift {
            animation: none;
          }
        }

        .background-overlay {
          position: absolute;
          inset: 0;
          z-index: 1;
          background: linear-gradient(
            180deg,
            rgba(0, 0, 0, 0.24) 0%,
            rgba(0, 0, 0, 0.07) 45%,
            rgba(0, 0, 0, 0.34) 100%
          );
        }

        .background-grid {
          position: absolute;
          inset: 0;
          z-index: 2;
          pointer-events: none;
        }

        .background-grid :global(img) {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
          display: block;
          opacity: 1;
          /* Figma glass layers are often faint; lift until grid reads (tune down if harsh) */
          filter: contrast(1.45) brightness(1.35);
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
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 12px 24px;
          border: none;
          background: linear-gradient(180deg, #f0d2a8 0%, #e4b87a 45%, #d9a86a 100%);
          color: #141414;
          text-decoration: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          letter-spacing: 0.01em;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease,
            transform 0.15s ease;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.45),
            0 1px 2px rgba(0, 0, 0, 0.18);
        }

        .cta-button:hover {
          background: linear-gradient(180deg, #f8e0bc 0%, #ecc88e 50%, #e2bc7c 100%);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.55),
            0 2px 6px rgba(0, 0, 0, 0.15);
          transform: translateY(-1px);
        }

        .cta-button:focus-visible {
          outline: 2px solid #141414;
          outline-offset: 2px;
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
