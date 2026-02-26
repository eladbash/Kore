import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  Send,
  Copy,
  Loader2,
  Settings2,
  Trash2,
  Wrench,
  Activity,
  AlertTriangle,
  ArrowUpCircle,
  Bell,
  LayoutList,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { useToast } from "./toast";
import { AISettings } from "./ai-settings";
import type { AIConfig } from "./ai-settings";
import { aiChat } from "@/lib/api";
import type { ChatMessage } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────

interface AIChatStreamPayload {
  type: "chunk" | "done" | "error" | "status";
  content?: string;
  message?: string;
}

interface DisplayMessage {
  role: "user" | "assistant";
  content: string;
}

interface AIChatViewProps {
  namespace?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function loadAIConfig(): AIConfig {
  try {
    const stored = localStorage.getItem("kore-ai-config");
    if (stored) return JSON.parse(stored) as AIConfig;
  } catch {
    // ignore
  }
  return { provider: "openai", model: "gpt-4o" };
}

let sessionCounter = 0;
function nextSessionId(): string {
  sessionCounter += 1;
  return `chat-${Date.now()}-${sessionCounter}`;
}

// ── Suggestions ─────────────────────────────────────────────────────────

const suggestions = [
  {
    label: "Cluster health",
    prompt: "Give me an overview of the cluster health. Are there any issues?",
    icon: Activity,
  },
  {
    label: "Failing pods",
    prompt: "What pods are currently failing or in an error state? Why are they failing?",
    icon: AlertTriangle,
  },
  {
    label: "High restarts",
    prompt: "Which pods have the most restarts? What's causing them?",
    icon: ArrowUpCircle,
  },
  {
    label: "Recent warnings",
    prompt: "Show me recent warning events in the cluster and explain what they mean.",
    icon: Bell,
  },
  {
    label: "Resource overview",
    prompt: "Give me an overview of all deployments and their status.",
    icon: LayoutList,
  },
];

// ── Component ────────────────────────────────────────────────────────────

export function AIChatView({ namespace }: AIChatViewProps) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [aiConfig, setAiConfig] = useState<AIConfig>(() => loadAIConfig());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const toast = useToast();

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, toolStatus]);

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 200);
  }, []);

  // Cleanup listener on unmount
  useEffect(() => {
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

      const userMsg: DisplayMessage = { role: "user", content: text.trim() };
      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);
      setInput("");
      setIsStreaming(true);
      setToolStatus(null);

      const sessionId = nextSessionId();

      // Cleanup previous listener
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }

      // Set up event listener before calling backend
      try {
        const eventName = `ai-chat://${sessionId}`;
        const unlisten = await listen<AIChatStreamPayload>(eventName, (event) => {
          const payload = event.payload;

          if (payload.type === "chunk" && payload.content) {
            setToolStatus(null);
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === "assistant") {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...last,
                  content: last.content + payload.content,
                };
                return updated;
              }
              return [...prev, { role: "assistant", content: payload.content! }];
            });
          } else if (payload.type === "status" && payload.message) {
            setToolStatus(payload.message);
          } else if (payload.type === "done") {
            setIsStreaming(false);
            setToolStatus(null);
          } else if (payload.type === "error") {
            setIsStreaming(false);
            setToolStatus(null);
            const errorMsg = payload.message || "An unknown error occurred.";
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === "assistant") {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...last,
                  content: last.content + `\n\n**Error:** ${errorMsg}`,
                };
                return updated;
              }
              return [...prev, { role: "assistant", content: `**Error:** ${errorMsg}` }];
            });
          }
        });
        unlistenRef.current = unlisten;
      } catch (err) {
        console.error("Failed to set up AI chat listener", err);
        setIsStreaming(false);
        return;
      }

      // Build the message history for the backend
      const chatMessages: ChatMessage[] = updatedMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      try {
        await aiChat(aiConfig, {
          messages: chatMessages,
          session_id: sessionId,
          namespace: namespace === "*" ? undefined : namespace,
        });
      } catch (err) {
        setIsStreaming(false);
        setToolStatus(null);
        const errMsg = err instanceof Error ? err.message : String(err);
        setMessages((prev) => [...prev, { role: "assistant", content: `**Error:** ${errMsg}` }]);
      }
    },
    [isStreaming, messages, aiConfig, namespace],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast("Copied to clipboard", "success");
    } catch {
      toast("Failed to copy", "error");
    }
  };

  const handleClear = () => {
    setMessages([]);
    setToolStatus(null);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full w-full flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-surface/50 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center">
            <Bot className="w-4.5 h-4.5 text-accent" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-100">Kore AI</h1>
            <p className="text-[10px] text-slate-500">Cluster assistant with live data</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleClear}
            disabled={messages.length === 0}
            className={cn(
              "p-1.5 rounded-md transition",
              messages.length > 0
                ? "text-slate-400 hover:text-red-400 hover:bg-muted/50"
                : "text-slate-700 cursor-not-allowed",
            )}
            title="Clear chat"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowSettings((v) => !v)}
            className={cn(
              "p-1.5 rounded-md hover:bg-muted/50 transition",
              showSettings ? "text-accent" : "text-slate-400 hover:text-slate-200",
            )}
            title="AI settings"
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Settings */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-slate-800/50 bg-background/50"
          >
            <div className="px-6 py-4">
              <AISettings config={aiConfig} onConfigChange={setAiConfig} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6">
          {/* Empty state */}
          {messages.length === 0 && !isStreaming && (
            <div className="flex flex-col items-center justify-center pt-16 pb-8">
              <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-5">
                <Bot className="w-8 h-8 text-accent/60" />
              </div>
              <h2 className="text-lg font-semibold text-slate-100 mb-1.5">
                What can I help you with?
              </h2>
              <p className="text-sm text-slate-500 mb-8 text-center max-w-md">
                Ask anything about your cluster. I'll query live data to give you accurate answers.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 w-full max-w-lg">
                {suggestions.map((s) => {
                  const Icon = s.icon;
                  return (
                    <button
                      key={s.label}
                      onClick={() => sendMessage(s.prompt)}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-800 bg-surface/60 text-xs text-slate-300 hover:border-accent/50 hover:text-accent hover:bg-accent/5 transition text-left"
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span>{s.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="space-y-5">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}
              >
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-4 h-4 text-accent" />
                  </div>
                )}

                <div
                  className={cn(
                    "relative group max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed",
                    msg.role === "user"
                      ? "bg-accent/15 text-slate-100 rounded-br-sm"
                      : "bg-surface border border-slate-800/50 text-slate-200 rounded-bl-sm",
                  )}
                >
                  {msg.role === "user" ? (
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  ) : (
                    <div className="ai-markdown">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  )}

                  {msg.role === "assistant" && (
                    <button
                      onClick={() => handleCopy(msg.content)}
                      className="absolute -top-2 -right-2 p-1 rounded bg-surface border border-slate-700 opacity-0 group-hover:opacity-100 transition-opacity hover:border-accent/50"
                      title="Copy"
                    >
                      <Copy className="w-3 h-3 text-slate-400" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Tool status indicator */}
            {toolStatus && (
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-accent/5 border border-accent/20 text-xs text-accent">
                <Wrench className="w-3.5 h-3.5 shrink-0" />
                <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                <span>{toolStatus}</span>
              </div>
            )}

            {/* Streaming indicator */}
            {isStreaming && !toolStatus && messages[messages.length - 1]?.role === "assistant" && (
              <div className="flex items-center gap-2 text-xs text-slate-500 pl-10">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                <span>Generating...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-slate-800 bg-surface/50 px-6 py-4 shrink-0">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="flex items-end gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isStreaming ? "Waiting for response..." : "Ask about your cluster..."}
              disabled={isStreaming}
              rows={1}
              className={cn(
                "flex-1 px-4 py-2.5 rounded-xl bg-background border border-slate-800 text-sm text-slate-100 placeholder-slate-600",
                "focus:outline-none focus:border-accent/50 transition resize-none",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
              style={{ minHeight: "42px", maxHeight: "120px" }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = Math.min(target.scrollHeight, 120) + "px";
              }}
            />
            <button
              type="submit"
              disabled={isStreaming || !input.trim()}
              className={cn(
                "p-2.5 rounded-xl transition shrink-0",
                input.trim() && !isStreaming
                  ? "bg-accent/20 text-accent hover:bg-accent/30 border border-accent/50"
                  : "bg-muted/30 text-slate-600 border border-slate-800 cursor-not-allowed",
              )}
              title="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="mt-2 text-[10px] text-slate-600 text-center">
            Enter to send, Shift+Enter for newline. AI queries live cluster data.
          </p>
        </form>
      </div>
    </motion.div>
  );
}
