"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Trash2, Send, StopCircle } from "lucide-react";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface Props {
  initialMessages: ChatMessage[];
  sessionId: string;
}

// Quick suggestion chips shown when chat is empty
const SUGGESTIONS = [
  { label: "📦 Inventory summary", text: "Give me an inventory summary" },
  { label: "⚠️ Low stock items", text: "Show me low stock products" },
  { label: "💰 Top value products", text: "List top 10 products by value" },
  { label: "🔢 Product count", text: "How many products do I have?" },
];

export default function AIChatClient({ initialMessages, sessionId }: Props) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    setInputValue("");
    setError(null);

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text.trim(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);

    try {
      abortRef.current = new AbortController();

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), sessionId }),
        signal: abortRef.current.signal,
      });

      if (res.status === 429) {
        const body = await res.json().catch(() => ({}));
        const resetsAt = body.resetsAt
          ? ` Resets at: ${new Date(body.resetsAt).toLocaleTimeString()}`
          : "";
        setError(`Rate limit exceeded.${resetsAt}`);
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "AI service temporarily unavailable. Please try again.");
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        return;
      }

      const data = await res.json();
      const responseText = data.text ?? "";
      setMessages((prev) =>
        prev.map((m) => m.id === assistantId ? { ...m, content: responseText } : m)
      );
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        return;
      }
      console.error("[AI Chat]", err);
      setError("AI service temporarily unavailable. Please try again.");
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isLoading, sessionId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await sendMessage(inputValue);
  }

  function handleStop() {
    abortRef.current?.abort();
    setIsLoading(false);
  }

  function handleClear() {
    setMessages([]);
    setError(null);
    inputRef.current?.focus();
  }

  const isEmpty = messages.length === 0;

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%", minHeight: 0,
      background: "var(--bg-base)",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 16px",
        borderBottom: "1px solid var(--border-dim)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>🤖</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)" }}>StockFlow AI</div>
            <div style={{ fontSize: 10, color: "var(--text-3)" }}>Inventory assistant · English & Mongolian</div>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleClear}
            title="Clear chat"
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "none", border: "1px solid var(--border-dim)",
              borderRadius: 6, cursor: "pointer",
              color: "var(--text-3)", fontSize: 11, padding: "4px 8px",
              transition: "all 0.12s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.color = "var(--red)";
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,68,68,0.3)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.color = "var(--text-3)";
              (e.currentTarget as HTMLElement).style.borderColor = "var(--border-dim)";
            }}
          >
            <Trash2 size={11} />
            Clear
          </button>
        )}
      </div>

      {/* Message list */}
      <div
        role="log"
        aria-label="Chat messages"
        aria-live="polite"
        style={{
          flex: 1, overflowY: "auto", padding: "16px",
          display: "flex", flexDirection: "column", gap: "12px",
        }}
      >
        {/* Empty state + suggestions */}
        {isEmpty && (
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: "20px", paddingTop: "40px",
          }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "40px", marginBottom: 8 }}>🤖</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", marginBottom: 4 }}>
                How can I help?
              </div>
              <div style={{ fontSize: 12, color: "var(--text-3)", maxWidth: 280 }}>
                Ask me about your inventory, add or update products, check stock levels, and more.
              </div>
            </div>
            {/* Suggestion chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", maxWidth: 400 }}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.text}
                  onClick={() => sendMessage(s.text)}
                  style={{
                    padding: "7px 12px", borderRadius: 20,
                    background: "var(--bg-raised)",
                    border: "1px solid var(--border-dim)",
                    color: "var(--text-2)", fontSize: 12, cursor: "pointer",
                    transition: "all 0.12s",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.background = "var(--accent-dim)";
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--accent-mid)";
                    (e.currentTarget as HTMLElement).style.color = "var(--accent)";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = "var(--bg-raised)";
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--border-dim)";
                    (e.currentTarget as HTMLElement).style.color = "var(--text-2)";
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isStreaming={isLoading && msg.role === "assistant" && msg === messages[messages.length - 1] && msg.content === ""}
          />
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          style={{
            margin: "0 16px 8px", padding: "8px 12px",
            borderRadius: "var(--r-sm)",
            background: "rgba(255,68,68,0.08)",
            border: "1px solid rgba(255,68,68,0.2)",
            color: "var(--red)", fontSize: 12,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}
        >
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)", fontSize: 14, padding: "0 4px" }}
          >×</button>
        </div>
      )}

      {/* Input form */}
      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex", gap: 8, padding: "12px 16px",
          borderTop: "1px solid var(--border-dim)",
          background: "var(--bg-surface)", flexShrink: 0,
        }}
      >
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendMessage(inputValue);
            }
          }}
          placeholder="Ask about your inventory..."
          disabled={isLoading}
          aria-label="Chat message input"
          className="input-field"
          style={{ flex: 1 }}
          autoComplete="off"
        />
        {isLoading ? (
          <button
            type="button"
            onClick={handleStop}
            className="btn-ghost"
            aria-label="Stop"
            style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, color: "var(--red)" }}
          >
            <StopCircle size={14} /> Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!inputValue.trim()}
            className="btn-accent"
            aria-label="Send message"
            style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5 }}
          >
            <Send size={13} /> Send
          </button>
        )}
      </form>
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message, isStreaming }: { message: ChatMessage; isStreaming?: boolean }) {
  const isUser = message.role === "user";
  return (
    <div style={{
      display: "flex",
      flexDirection: isUser ? "row-reverse" : "row",
      alignItems: "flex-start", gap: 8,
    }}>
      {/* Avatar */}
      <div style={{
        width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 9, fontWeight: 700,
        background: isUser ? "var(--accent)" : "var(--bg-raised)",
        color: isUser ? "#000" : "var(--text-2)",
        border: isUser ? "none" : "1px solid var(--border-dim)",
      }}>
        {isUser ? "You" : "AI"}
      </div>

      {/* Bubble */}
      <div style={{
        maxWidth: "72%",
        padding: "10px 14px",
        borderRadius: isUser ? "12px 4px 12px 12px" : "4px 12px 12px 12px",
        background: isUser ? "var(--accent)" : "var(--bg-raised)",
        color: isUser ? "#000" : "var(--text-1)",
        fontSize: 13, lineHeight: 1.6,
        border: isUser ? "none" : "1px solid var(--border-dim)",
      }}>
        {isStreaming ? (
          <TypingDots />
        ) : message.content ? (
          <MarkdownText text={message.content} isUser={isUser} />
        ) : null}
      </div>
    </div>
  );
}

// ─── Simple Markdown Renderer ─────────────────────────────────────────────────
// Handles: **bold**, `code`, bullet lists (- item), numbered lists, line breaks

function MarkdownText({ text, isUser }: { text: string; isUser: boolean }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    // eslint-disable-next-line security/detect-object-injection
    const line = lines[i];

    // Bullet list item
    if (/^[-*•]\s/.test(line)) {
      const listItems: string[] = [];
      // eslint-disable-next-line security/detect-object-injection
      while (i < lines.length && /^[-*•]\s/.test(lines[i])) {
        // eslint-disable-next-line security/detect-object-injection
        listItems.push(lines[i].replace(/^[-*•]\s/, ""));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} style={{ margin: "4px 0", paddingLeft: 16, listStyle: "disc" }}>
          {listItems.map((item, j) => (
            <li key={j} style={{ marginBottom: 2 }}><InlineMarkdown text={item} /></li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      const listItems: string[] = [];
      // eslint-disable-next-line security/detect-object-injection
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        // eslint-disable-next-line security/detect-object-injection
        listItems.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} style={{ margin: "4px 0", paddingLeft: 16 }}>
          {listItems.map((item, j) => (
            <li key={j} style={{ marginBottom: 2 }}><InlineMarkdown text={item} /></li>
          ))}
        </ol>
      );
      continue;
    }

    // Empty line → spacer
    if (line.trim() === "") {
      elements.push(<div key={`sp-${i}`} style={{ height: 6 }} />);
      i++;
      continue;
    }

    // Normal paragraph line
    elements.push(
      <div key={`p-${i}`} style={{ marginBottom: 1 }}>
        <InlineMarkdown text={line} />
      </div>
    );
    i++;
  }

  return <div style={{ color: isUser ? "#000" : "var(--text-1)" }}>{elements}</div>;
}

// Handles inline: **bold**, *italic*, `code`, emoji passthrough
function InlineMarkdown({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  // Split on **bold**, *italic*, `code`
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(<strong key={match.index}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*")) {
      parts.push(<em key={match.index}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("`")) {
      parts.push(
        <code key={match.index} style={{
          fontFamily: "var(--font-mono)", fontSize: "0.9em",
          background: "rgba(255,255,255,0.08)", padding: "1px 5px",
          borderRadius: 3,
        }}>
          {token.slice(1, -1)}
        </code>
      );
    }
    last = match.index + token.length;
  }

  if (last < text.length) {
    parts.push(text.slice(last));
  }

  return <>{parts}</>;
}

// ─── Typing Dots ──────────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <span aria-label="AI is typing" style={{ display: "flex", gap: 3, alignItems: "center", height: 18 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 5, height: 5, borderRadius: "50%",
            background: "var(--text-3)",
            animation: `typing-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes typing-dot {
          0%, 60%, 100% { opacity: 0.3; transform: scale(1); }
          30% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </span>
  );
}
