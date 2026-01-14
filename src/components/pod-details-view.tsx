import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Copy, RotateCw, X, Check } from "lucide-react";
import { ResourceItem } from "../lib/api";
import { describePod, startPodLogsStream } from "../lib/api";
import { listen } from "@tauri-apps/api/event";
import { PodMetrics } from "./pod-metrics";

interface PodDetailsViewProps {
  pod: ResourceItem;
  onBack: () => void;
}

export function PodDetailsView({ pod, onBack }: PodDetailsViewProps) {
  const [activeTab, setActiveTab] = useState<"logs" | "describe" | "metrics">("logs");
  const [logs, setLogs] = useState<string>("");
  const [describe, setDescribe] = useState<string>("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  // Extract pod info
  const podName = pod.name || "";
  const namespace = pod.namespace || "default";
  const status = pod.status || "Unknown";
  const node = pod.node || "Unknown";
  const ip = pod.ip || "Unknown";

  // Fetch describe data
  useEffect(() => {
    if (activeTab === "describe") {
      describePod(namespace, podName)
        .then((podData) => {
          setDescribe(JSON.stringify(podData, null, 2));
          setLoading(false);
        })
        .catch((err) => {
          setDescribe(`Error fetching pod details: ${err}`);
          setLoading(false);
        });
    }
  }, [activeTab, namespace, podName]);

  // Setup logs streaming
  useEffect(() => {
    if (activeTab !== "logs" || !podName || !namespace) return;

    setLoading(true);
    setLogs("");

    // Start streaming logs
    const eventName = `pod-logs://${namespace}/${podName}`;
    let unlistenFn: (() => void) | null = null;

    const setupStream = async () => {
      try {
        // Start the stream
        await startPodLogsStream(namespace, podName);

        // Listen for log events
        const unlisten = await listen<{ logs?: string; error?: string; append?: boolean }>(
          eventName,
          (event) => {
            const payload = event.payload;
            if (payload.error) {
              setLogs((prev) => prev + `\n[ERROR] ${payload.error}\n`);
              setLoading(false);
            } else if (payload.logs) {
              setLogs((prev) => {
                if (payload.append) {
                  return prev + payload.logs;
                }
                return payload.logs || "";
              });
              setLoading(false);
            }
          }
        );
        unlistenFn = unlisten;
      } catch (err) {
        setLogs(`Error starting log stream: ${err}`);
        setLoading(false);
      }
    };

    setupStream();

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [activeTab, namespace, podName]);

  // Auto-scroll logs
  useEffect(() => {
    if (autoScroll && logsEndRef.current && logsContainerRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  // Handle Esc key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onBack();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack]);

  const handleCopyLogs = async () => {
    try {
      await navigator.clipboard.writeText(logs);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy logs", err);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="h-full w-full flex flex-col bg-background"
    >
      {/* Header */}
      <div className="border-b border-slate-800 p-4 bg-surface/50">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-3 py-1.5 rounded border border-slate-800 hover:border-accent hover:bg-muted/40 transition text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back (Esc)
          </button>
          <div className="flex items-center gap-2">
            {activeTab === "logs" && (
              <>
                <button
                  onClick={handleCopyLogs}
                  className="flex items-center gap-2 px-3 py-1.5 rounded border border-slate-800 hover:border-accent hover:bg-muted/40 transition text-sm"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy
                    </>
                  )}
                </button>
                <label className="flex items-center gap-2 px-3 py-1.5 rounded border border-slate-800 hover:border-accent hover:bg-muted/40 transition text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoScroll}
                    onChange={(e) => setAutoScroll(e.target.checked)}
                    className="w-4 h-4"
                  />
                  Auto-scroll
                </label>
              </>
            )}
          </div>
        </div>

        {/* Pod Info */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
          <div>
            <div className="text-slate-400 text-xs mb-1">Name</div>
            <div className="text-slate-100 font-mono">{podName}</div>
          </div>
          <div>
            <div className="text-slate-400 text-xs mb-1">Namespace</div>
            <div className="text-slate-100 font-mono">{namespace}</div>
          </div>
          <div>
            <div className="text-slate-400 text-xs mb-1">Status</div>
            <div className="text-slate-100">{status}</div>
          </div>
          <div>
            <div className="text-slate-400 text-xs mb-1">Node</div>
            <div className="text-slate-100 font-mono">{node}</div>
          </div>
          <div>
            <div className="text-slate-400 text-xs mb-1">IP</div>
            <div className="text-slate-100 font-mono">{ip}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800">
        <button
          onClick={() => setActiveTab("logs")}
          className={`px-4 py-2 text-sm transition ${
            activeTab === "logs"
              ? "border-b-2 border-accent text-accent"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Logs
        </button>
        <button
          onClick={() => setActiveTab("describe")}
          className={`px-4 py-2 text-sm transition ${
            activeTab === "describe"
              ? "border-b-2 border-accent text-accent"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Describe
        </button>
        <button
          onClick={() => setActiveTab("metrics")}
          className={`px-4 py-2 text-sm transition ${
            activeTab === "metrics"
              ? "border-b-2 border-accent text-accent"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Metrics
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {activeTab === "logs" ? (
            <motion.div
              key="logs"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full overflow-auto bg-black/40 border border-slate-800 rounded-lg m-4"
            >
              <div
                ref={logsContainerRef}
                className="p-4 font-mono text-xs leading-relaxed text-green-400"
              >
                <pre className="whitespace-pre-wrap">
                  {loading && logs === "" ? "Loading logs..." : logs || "No logs available"}
                </pre>
                <div ref={logsEndRef} />
              </div>
            </motion.div>
          ) : activeTab === "describe" ? (
            <motion.div
              key="describe"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full overflow-auto bg-surface/30 border border-slate-800 rounded-lg m-4"
            >
              <div className="p-4 font-mono text-xs leading-relaxed text-slate-200">
                <pre className="whitespace-pre-wrap">
                  {loading ? "Loading pod details..." : describe || "No details available"}
                </pre>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="metrics"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full overflow-hidden"
            >
              <PodMetrics namespace={namespace} podName={podName} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

