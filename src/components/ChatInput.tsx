"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const agents = [
  { id: "symphony", name: "Symphony", description: "Full studio assistant" },
  { id: "discovery", name: "Discovery", description: "Explore if we're a fit" },
  { id: "technical", name: "Technical", description: "Deep dive capabilities" },
];

// Map tool names to friendly display names
const toolDisplayNames: Record<string, string> = {
  "services": "Checking services",
  "pricing": "Fetching pricing",
  "capabilities": "Looking up capabilities",
  "case_studies": "Finding case studies",
  "contact": "Getting contact info",
  "faq": "Searching FAQ",
  "recommend_tier": "Analyzing your needs",
};

export default function ChatInput() {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [selectedAgent, setSelectedAgent] = useState(agents[0]);
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 80)}px`;
    }
  }, [query]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, activeTools]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowAgentMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (tooltip) {
      const timer = setTimeout(() => setTooltip(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [tooltip]);

  const showTooltip = (text: string) => {
    setTooltip(text);
  };

  const handleSubmit = async () => {
    if (!query.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: query.trim(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setQuery("");
    setIsLoading(true);
    setStreamingContent("");
    setActiveTools([]);

    try {
      const res = await fetch("/app/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          agent: selectedAgent.id,
        }),
      });

      if (!res.ok) throw new Error("Failed to get response");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      let actualContent = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          fullContent += chunk;
          
          // Parse for tool markers
          const toolMatch = fullContent.match(/\[TOOL:([^\]]+)\]/g);
          if (toolMatch) {
            const tools = toolMatch.map(t => t.replace("[TOOL:", "").replace("]", ""));
            const newTools = tools.filter(t => t !== "done");
            if (tools.includes("done")) {
              setActiveTools([]);
            } else {
              setActiveTools(newTools);
            }
          }
          
          // Extract actual content (remove tool markers)
          actualContent = fullContent.replace(/\[TOOL:[^\]]+\]/g, "");
          setStreamingContent(actualContent);
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: actualContent,
        },
      ]);
      setStreamingContent("");
      setActiveTools([]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "I'm having trouble connecting right now. Please try again.",
        },
      ]);
      setStreamingContent("");
      setActiveTools([]);
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

  const hasMessages = messages.length > 0 || streamingContent;

  return (
    <div className={`chat-box ${hasMessages ? "has-messages" : ""}`}>
      {/* Messages area */}
      {hasMessages && (
        <div className="messages">
          {messages.map((msg) => (
            <div key={msg.id} className={`message ${msg.role}`}>
              <div className={`avatar ${msg.role}-avatar`}>
                {msg.role === "user" ? "Y" : "S"}
              </div>
              <div className="message-content">{msg.content}</div>
            </div>
          ))}
          
          {/* Streaming message */}
          {(streamingContent || isLoading) && (
            <div className="message assistant">
              <div className="avatar assistant-avatar">S</div>
              <div className="message-content">
                {/* Tool indicators */}
                {activeTools.length > 0 && (
                  <div className="tool-indicator">
                    <span className="tool-icon">⚡</span>
                    {activeTools.map((tool, i) => (
                      <span key={i} className="tool-name">
                        {toolDisplayNames[tool] || tool}
                        {i < activeTools.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </div>
                )}
                
                {streamingContent ? (
                  <>
                    {streamingContent}
                    <span className="cursor"></span>
                  </>
                ) : (
                  <div className="thinking">
                    <span></span><span></span><span></span>
                  </div>
                )}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input area */}
      <div className="input-area">
        <textarea
          ref={textareaRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="How can I help you today?"
          rows={1}
          disabled={isLoading}
        />
        
        <div className="input-controls">
          <div className="left-icons">
            <div className="icon-wrapper">
              {tooltip === "upload" && (
                <div className="tooltip">
                  <span>Coming soon</span>
                  <div className="tooltip-arrow"></div>
                </div>
              )}
              <button className="icon-btn" onClick={() => showTooltip("upload")}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <div className="icon-wrapper">
              {tooltip === "history" && (
                <div className="tooltip">
                  <span>Coming soon</span>
                  <div className="tooltip-arrow"></div>
                </div>
              )}
              <button className="icon-btn" onClick={() => showTooltip("history")}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/>
                  <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          </div>

          <div className="right-controls" ref={menuRef}>
            <button 
              className="agent-trigger"
              onClick={() => setShowAgentMenu(!showAgentMenu)}
            >
              {selectedAgent.name}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
            
            {showAgentMenu && (
              <div className="agent-menu">
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    className={`agent-option ${selectedAgent.id === agent.id ? "selected" : ""}`}
                    onClick={() => {
                      setSelectedAgent(agent);
                      setShowAgentMenu(false);
                    }}
                  >
                    <span className="agent-name">{agent.name}</span>
                    <span className="agent-desc">{agent.description}</span>
                    {selectedAgent.id === agent.id && (
                      <svg className="check" width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M20 6L9 17l-5-5" stroke="#6b9fff" strokeWidth="2.5" strokeLinecap="round"/>
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}

            <button 
              className="send-btn"
              onClick={handleSubmit}
              disabled={isLoading || !query.trim()}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 4L12 20M12 4L6 10M12 4L18 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .chat-box {
          width: 100%;
          max-width: 630px;
          background: #2a2a2a;
          border-radius: 16px;
          border: 1px solid #3a3a3a;
          overflow: visible;
          display: flex;
          flex-direction: column;
        }

        .messages {
          height: 180px;
          overflow-y: auto;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          border-bottom: 1px solid #3a3a3a;
        }

        .messages::-webkit-scrollbar { width: 4px; }
        .messages::-webkit-scrollbar-thumb { background: #444; border-radius: 2px; }

        .message {
          display: flex;
          gap: 10px;
          animation: fadeIn 0.2s ease;
        }

        .avatar {
          width: 22px;
          height: 22px;
          border-radius: 5px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 9px;
          font-weight: 600;
          flex-shrink: 0;
        }

        .user-avatar { background: #8b5cf6; color: #fff; }
        .assistant-avatar { background: #d4a574; color: #1a1a1a; }

        .message-content {
          flex: 1;
          font-size: 12px;
          line-height: 1.5;
          color: #e5e5e5;
          white-space: pre-wrap;
          padding-top: 2px;
          text-align: left;
        }

        .tool-indicator {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 8px;
          padding: 6px 10px;
          background: rgba(212, 165, 116, 0.15);
          border-radius: 6px;
          border-left: 2px solid #d4a574;
          animation: fadeIn 0.2s ease;
        }

        .tool-icon {
          font-size: 11px;
        }

        .tool-name {
          font-size: 11px;
          color: #d4a574;
          font-weight: 500;
        }

        .cursor {
          display: inline-block;
          width: 1.5px;
          height: 12px;
          background: #e5e5e5;
          margin-left: 1px;
          animation: blink 0.8s infinite;
          vertical-align: text-bottom;
        }

        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }

        .thinking {
          display: flex;
          gap: 3px;
          padding: 2px 0;
        }

        .thinking span {
          width: 5px;
          height: 5px;
          background: #888;
          border-radius: 50%;
          animation: pulse 1.4s ease-in-out infinite;
        }

        .thinking span:nth-child(2) { animation-delay: 0.2s; }
        .thinking span:nth-child(3) { animation-delay: 0.4s; }

        @keyframes pulse {
          0%, 60%, 100% { transform: scale(1); opacity: 0.4; }
          30% { transform: scale(1.15); opacity: 1; }
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(3px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .input-area {
          padding: 10px;
          flex-shrink: 0;
        }

        textarea {
          width: 100%;
          border: none;
          background: #3a3a3a;
          border-radius: 12px;
          padding: 10px 14px;
          font-size: 13px;
          line-height: 1.4;
          resize: none;
          outline: none;
          color: #fff;
          font-family: inherit;
          min-height: 20px;
          max-height: 80px;
        }

        textarea::placeholder { color: #888; }

        .input-controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 2px 0;
        }

        .left-icons {
          display: flex;
          gap: 2px;
        }

        .icon-wrapper {
          position: relative;
        }

        .tooltip {
          position: absolute;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%);
          margin-bottom: 8px;
          background: #fff;
          color: #1a1a1a;
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 500;
          white-space: nowrap;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          animation: tooltipIn 0.2s ease;
          z-index: 100;
        }

        .tooltip-arrow {
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          border: 6px solid transparent;
          border-top-color: #fff;
        }

        @keyframes tooltipIn {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }

        .icon-btn {
          width: 32px;
          height: 32px;
          border: none;
          background: transparent;
          color: #777;
          border-radius: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
        }

        .icon-btn:hover {
          color: #fff;
          background: #333;
        }

        .right-controls {
          display: flex;
          align-items: center;
          gap: 6px;
          position: relative;
        }

        .agent-trigger {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #3a3a3a;
          border: none;
          color: #ccc;
          font-size: 12px;
          cursor: pointer;
          padding: 8px 12px;
          border-radius: 8px;
          transition: all 0.15s;
        }

        .agent-trigger:hover {
          background: #444;
          color: #fff;
        }

        .agent-menu {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 6px;
          background: #2a2a2a;
          border: 1px solid #3a3a3a;
          border-radius: 12px;
          padding: 6px;
          min-width: 200px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
          z-index: 1000;
        }

        .agent-option {
          width: 100%;
          display: flex;
          flex-wrap: wrap;
          gap: 2px;
          padding: 10px 12px;
          background: transparent;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          position: relative;
          text-align: left;
          transition: background 0.1s;
        }

        .agent-option:hover { background: #333; }
        .agent-option.selected { background: #333; }

        .agent-name {
          font-size: 13px;
          font-weight: 500;
          color: #fff;
          width: 100%;
        }

        .agent-desc {
          font-size: 11px;
          color: #888;
          width: calc(100% - 24px);
        }

        .check {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
        }

        .send-btn {
          width: 32px;
          height: 32px;
          border: none;
          background: #d4a574;
          color: #1a1a1a;
          border-radius: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
        }

        .send-btn:hover:not(:disabled) { background: #e0b585; }
        .send-btn:disabled { opacity: 0.3; cursor: not-allowed; }

        @media (max-width: 560px) {
          .chat-box { max-width: 100%; }
          textarea { font-size: 16px; }
          .agent-trigger { padding: 6px 10px; font-size: 11px; }
        }
      `}</style>
    </div>
  );
}
