"use client";

import ChatInput from "@/components/ChatInput";
import DynamicGlassGrid from "@/components/DynamicGlassGrid";
import SiteFooter from "@/components/site/SiteFooter";
import SiteHeader from "@/components/site/SiteHeader";
import { brand } from "@/data/studio-data";
import Image from "next/image";

export default function Home() {
  return (
    <main className="page">
      {/* Metal → frost (backdrop blur) → grid lines → vignette; hero UI sits above .background */}
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
        <div className="background-frost" aria-hidden />
        <DynamicGlassGrid />
        <div className="background-shimmer background-shimmer-drift" aria-hidden />
        <div className="background-overlay" aria-hidden />
      </div>

      <SiteHeader variant="dark" />

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
          {brand.heroSubhead}
        </p>

        <ChatInput />

        <p className="chat-note">
          Answers draw from live studio data—the same source as our orchestration layer. Technical
          access:{" "}
          <code className="chat-note-code">/api/mcp/http</code> (Streamable HTTP) or{" "}
          <code className="chat-note-code">npm run mcp:stdio</code>.
        </p>
      </section>

      <SiteFooter />

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

          .background-shimmer-drift {
            animation: none;
          }
        }

        /* Frosted glass: light blur + subtle white tint */
        .background-frost {
          position: absolute;
          inset: 0;
          z-index: 1;
          pointer-events: none;
          background: rgba(255, 255, 255, 0.038);
          backdrop-filter: blur(5px) saturate(1.1);
          -webkit-backdrop-filter: blur(5px) saturate(1.1);
        }

        /* Diagonal glass streak + soft top-left glow (Figma shimmer) */
        .background-shimmer {
          position: absolute;
          inset: -8%;
          z-index: 3;
          pointer-events: none;
          mix-blend-mode: soft-light;
          opacity: 0.72;
          background:
            linear-gradient(
              118deg,
              transparent 40%,
              rgba(170, 195, 255, 0.12) 43.8%,
              rgba(255, 255, 255, 0.55) 45.2%,
              rgba(255, 252, 240, 0.75) 45.8%,
              rgba(255, 255, 255, 0.35) 46.4%,
              rgba(180, 210, 255, 0.1) 47.5%,
              transparent 51%
            ),
            radial-gradient(
              ellipse 70% 55% at 10% 6%,
              rgba(255, 225, 185, 0.22) 0%,
              transparent 58%
            ),
            linear-gradient(
              180deg,
              transparent 58%,
              rgba(255, 255, 255, 0.07) 64%,
              transparent 72%
            );
        }

        .background-shimmer-drift {
          animation: shimmerDrift 28s ease-in-out infinite;
        }

        @keyframes shimmerDrift {
          0%,
          100% {
            transform: translate(-0.6%, 0.2%) rotate(-0.15deg);
            opacity: 0.68;
          }
          50% {
            transform: translate(0.8%, -0.4%) rotate(0.12deg);
            opacity: 0.82;
          }
        }

        .background-overlay {
          position: absolute;
          inset: 0;
          z-index: 4;
          pointer-events: none;
          background:
            linear-gradient(90deg, transparent 72%, rgba(0, 0, 0, 0.55) 100%),
            linear-gradient(
              180deg,
              rgba(0, 0, 0, 0.52) 0%,
              rgba(0, 0, 0, 0.24) 45%,
              rgba(0, 0, 0, 0.62) 100%
            );
        }

        @media (max-width: 768px) {
          .background-frost {
            backdrop-filter: blur(3.5px) saturate(1.08);
            -webkit-backdrop-filter: blur(3.5px) saturate(1.08);
          }
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
          font-size: 19px;
          color: rgba(255, 255, 255, 0.85);
          max-width: 720px;
          width: 100%;
          margin: 0 auto 32px;
          padding: 0;
          line-height: 1.32;
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
          .hero {
            padding: 32px 20px 60px;
          }

          .subheadline {
            font-size: 17px;
            max-width: 100%;
            margin-bottom: 30px;
          }
        }

        @media (max-width: 480px) {
          .headline {
            font-size: 2.125rem;
          }
        }
      `}</style>
    </main>
  );
}
