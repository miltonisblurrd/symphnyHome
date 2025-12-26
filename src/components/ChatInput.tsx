"use client";

import { useState, useRef, useEffect } from "react";

interface ChatInputProps {
  onResponse?: (response: string) => void;
}

export default function ChatInput({ onResponse }: ChatInputProps) {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const responseRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [query]);

  // Scroll response into view
  useEffect(() => {
    if (response && responseRef.current) {
      responseRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [response]);

  const handleSubmit = async () => {
    if (!query.trim() || isLoading) return;

    setIsLoading(true);
    setResponse(null);

    try {
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });

      const data = await res.json();

      if (data.success && data.response) {
        setResponse(data.response);
        setIsExpanded(true);
        onResponse?.(data.response);
      } else {
        setResponse("I couldn't process that request. Please try rephrasing your question.");
      }
    } catch {
      setResponse("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const placeholderQuestions = [
    "What services do you offer?",
    "How much does automation cost?",
    "Can you show me case studies?",
    "Which tier is right for me?",
  ];

  return (
    <div className="chat-container">
      {/* Input Section */}
      <div className={`chat-input-wrapper ${isExpanded ? "expanded" : ""}`}>
        <button className="chat-prefix" onClick={handleSubmit} disabled={isLoading}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 1V15M1 8H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
        
        <textarea
          ref={textareaRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsExpanded(true)}
          placeholder="How do I use AI to answer and book my calls?"
          className="chat-input"
          rows={1}
          disabled={isLoading}
        />

        <button 
          className="chat-submit" 
          onClick={handleSubmit}
          disabled={isLoading || !query.trim()}
        >
          {isLoading ? (
            <div className="loading-spinner" />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path 
                d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      </div>

      {/* Quick Questions */}
      {!response && !isLoading && (
        <div className="quick-questions">
          {placeholderQuestions.map((q, i) => (
            <button
              key={i}
              className="quick-question"
              onClick={() => {
                setQuery(q);
                setIsExpanded(true);
              }}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Response Section */}
      {response && (
        <div ref={responseRef} className="chat-response">
          <div className="response-content">
            {response.split("\n").map((line, i) => {
              if (line.startsWith("**") && line.endsWith("**")) {
                return <h3 key={i} className="response-heading">{line.replace(/\*\*/g, "")}</h3>;
              }
              if (line.startsWith("• **")) {
                const [title, ...rest] = line.replace("• **", "").split("**:");
                return (
                  <div key={i} className="response-item">
                    <strong>{title}</strong>: {rest.join("")}
                  </div>
                );
              }
              if (line.startsWith("•")) {
                return <div key={i} className="response-item">{line}</div>;
              }
              if (line.trim()) {
                return <p key={i}>{line}</p>;
              }
              return null;
            })}
          </div>
          
          <button 
            className="ask-another"
            onClick={() => {
              setResponse(null);
              setQuery("");
              textareaRef.current?.focus();
            }}
          >
            Ask another question
          </button>
        </div>
      )}

      <style jsx>{`
        .chat-container {
          width: 100%;
          max-width: 650px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .chat-input-wrapper {
          display: flex;
          align-items: center;
          gap: 12px;
          background: rgba(255, 255, 255, 0.95);
          border-radius: 16px;
          padding: 16px 20px;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
          transition: all 0.3s ease;
        }

        .chat-input-wrapper:focus-within {
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.16);
        }

        .chat-prefix {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border: none;
          background: transparent;
          color: #666;
          cursor: pointer;
          transition: color 0.2s;
          flex-shrink: 0;
        }

        .chat-prefix:hover {
          color: #000;
        }

        .chat-input {
          flex: 1;
          border: none;
          background: transparent;
          font-size: 16px;
          line-height: 1.5;
          resize: none;
          outline: none;
          color: #1a1a1a;
          font-family: inherit;
          min-height: 24px;
        }

        .chat-input::placeholder {
          color: #888;
        }

        .chat-submit {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border: none;
          background: transparent;
          color: #666;
          cursor: pointer;
          transition: all 0.2s;
          border-radius: 8px;
          flex-shrink: 0;
        }

        .chat-submit:hover:not(:disabled) {
          color: #000;
          background: rgba(0, 0, 0, 0.05);
        }

        .chat-submit:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .loading-spinner {
          width: 20px;
          height: 20px;
          border: 2px solid #ddd;
          border-top-color: #666;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .quick-questions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: center;
        }

        .quick-question {
          padding: 8px 14px;
          background: rgba(255, 255, 255, 0.15);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 20px;
          color: rgba(255, 255, 255, 0.8);
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
          backdrop-filter: blur(4px);
        }

        .quick-question:hover {
          background: rgba(255, 255, 255, 0.25);
          color: #fff;
        }

        .chat-response {
          background: rgba(255, 255, 255, 0.95);
          border-radius: 16px;
          padding: 24px;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
          animation: fadeIn 0.4s ease;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .response-content {
          color: #1a1a1a;
          line-height: 1.6;
        }

        .response-heading {
          font-size: 15px;
          font-weight: 600;
          margin: 16px 0 8px;
          color: #000;
        }

        .response-heading:first-child {
          margin-top: 0;
        }

        .response-item {
          padding: 4px 0;
          padding-left: 16px;
          position: relative;
          font-size: 14px;
        }

        .response-item::before {
          content: "";
          position: absolute;
          left: 0;
          top: 12px;
          width: 6px;
          height: 6px;
          background: #666;
          border-radius: 50%;
        }

        .response-content p {
          margin: 8px 0;
          font-size: 14px;
        }

        .ask-another {
          margin-top: 20px;
          padding: 10px 20px;
          background: #1a1a1a;
          color: #fff;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .ask-another:hover {
          background: #333;
        }

        @media (max-width: 600px) {
          .chat-input-wrapper {
            padding: 12px 16px;
          }

          .chat-input {
            font-size: 15px;
          }

          .quick-questions {
            gap: 6px;
          }

          .quick-question {
            font-size: 12px;
            padding: 6px 12px;
          }
        }
      `}</style>
    </div>
  );
}

