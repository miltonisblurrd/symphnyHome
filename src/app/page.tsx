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
          src="/app/backgroundSymphny.jpg"
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
            src="/app/symphnyNavLogo.svg"
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
          Your Business, <em>Orchestrated</em>.
        </h1>
        
        <p className="subheadline">
          We design and operate coordinated systems that connect your tools,
          automate workflows, and reduce operational friction.
        </p>

        <p className="chat-label">Ask Us Anything About Using AI for Your Business</p>

        <ChatInput />

        <p className="chat-note">
          This assistant uses live tool calls to query our data — no hallucinations.
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
          font-size: 63px;
          font-weight: 400;
          color: #fff;
          line-height: 1.15;
          margin: 0 0 6px;
          letter-spacing: -0.02em;
        }

        .headline em {
          font-style: italic;
          font-weight: 300;
        }

        .subheadline {
          font-size: 22px;
          color: rgba(255, 255, 255, 0.85);
          max-width: 700px;
          line-height: 1.5;
          margin: 0 0 47px;
        }

        .chat-label {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.6);
          margin: 0 0 16px;
          letter-spacing: 0.02em;
        }

        .chat-note {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.35);
          margin: 12px 0 0;
          letter-spacing: 0.01em;
        }

        @media (max-width: 768px) {
          .header {
            padding: 20px 24px;
          }

          .hero {
            padding: 32px 20px 60px;
          }

          .subheadline {
            margin-bottom: 40px;
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
            font-size: 2rem;
          }
        }
      `}</style>
    </main>
  );
}
