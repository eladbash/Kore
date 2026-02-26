import { useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  FileQuestion,
  ShieldX,
  Wifi,
  WifiOff,
  RefreshCw,
  ChevronRight,
  Terminal,
} from "lucide-react";
import type { ConnectionStatus } from "@/lib/types";

interface ConnectionSetupProps {
  status: ConnectionStatus;
  onRetry: (context?: string) => Promise<ConnectionStatus>;
}

interface ErrorInfo {
  icon: React.ReactNode;
  title: string;
  description: string;
  steps: string[];
}

function getErrorInfo(status: ConnectionStatus): ErrorInfo {
  const kind = status.error_kind ?? "unknown";

  switch (kind) {
    case "no_kubeconfig":
      return {
        icon: <FileQuestion className="w-8 h-8" />,
        title: "No Kubeconfig Found",
        description: `Kore couldn't find a kubeconfig file${status.kubeconfig_path ? ` at ${status.kubeconfig_path}` : ""}.`,
        steps: [
          "Ensure you have a Kubernetes cluster configured",
          "Check that ~/.kube/config exists and is readable",
          "Or set the KUBECONFIG environment variable to your config path",
          "If using a cloud provider, run the appropriate auth command (e.g. aws eks update-kubeconfig, gcloud container clusters get-credentials, az aks get-credentials)",
        ],
      };
    case "auth_failed":
      return {
        icon: <ShieldX className="w-8 h-8" />,
        title: "Authentication Failed",
        description: "Kore connected to the cluster but your credentials were rejected.",
        steps: [
          "Your token or certificate may have expired",
          "Run kubectl get pods to verify your credentials work",
          "If using a cloud provider, re-authenticate (e.g. aws sso login, gcloud auth login)",
          "Check that your kubeconfig user entry has valid credentials",
        ],
      };
    case "cluster_unreachable":
      return {
        icon: <WifiOff className="w-8 h-8" />,
        title: "Cluster Unreachable",
        description: "Kore found your kubeconfig but couldn't connect to the cluster.",
        steps: [
          "Check that your cluster is running and accessible",
          "If using a VPN, ensure it's connected",
          "Verify the cluster endpoint in your kubeconfig is correct",
          "Try running kubectl cluster-info to test connectivity",
        ],
      };
    default:
      return {
        icon: <AlertTriangle className="w-8 h-8" />,
        title: "Connection Error",
        description: status.error ?? "An unexpected error occurred while connecting.",
        steps: [
          "Check your kubeconfig file for syntax errors",
          "Try running kubectl get pods to test your configuration",
          "Restart Kore after fixing the issue",
        ],
      };
  }
}

export function ConnectionSetup({ status, onRetry }: ConnectionSetupProps) {
  const [retrying, setRetrying] = useState(false);
  const [selectedContext, setSelectedContext] = useState<string | null>(null);
  const errorInfo = getErrorInfo(status);
  const hasContexts = status.contexts_available.length > 0;

  const handleRetry = async (context?: string) => {
    setRetrying(true);
    try {
      await onRetry(context);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="h-screen w-screen bg-background flex items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-lg w-full"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
              <Wifi className="w-5 h-5 text-accent" />
            </div>
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Kore</h1>
          </div>
          <p className="text-sm text-slate-500">Kubernetes IDE</p>
        </div>

        {/* Error Card */}
        <div className="glass rounded-xl border border-slate-800 p-6 mb-6">
          <div className="flex items-start gap-4 mb-5">
            <div className="text-amber-400 mt-0.5 shrink-0">{errorInfo.icon}</div>
            <div>
              <h2 className="text-lg font-semibold text-slate-100 mb-1">{errorInfo.title}</h2>
              <p className="text-sm text-slate-400 leading-relaxed">{errorInfo.description}</p>
            </div>
          </div>

          {/* Raw error (collapsed) */}
          {status.error && (
            <details className="mb-5 group">
              <summary className="text-xs text-slate-600 cursor-pointer hover:text-slate-400 transition select-none">
                Show technical details
              </summary>
              <pre className="mt-2 text-xs text-slate-500 bg-background/60 rounded-lg p-3 overflow-x-auto font-mono whitespace-pre-wrap break-all">
                {status.error}
              </pre>
            </details>
          )}

          {/* Steps */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              How to fix
            </h3>
            {errorInfo.steps.map((step, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[10px] font-bold text-slate-400">{i + 1}</span>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">{step}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Context Picker (if kubeconfig was readable but connection failed) */}
        {hasContexts && (
          <div className="glass rounded-xl border border-slate-800 p-5 mb-6">
            <h3 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-slate-500" />
              Try a different context
            </h3>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {status.contexts_available.map((ctx) => {
                const isCurrent = ctx === status.current_context;
                const isSelected = ctx === selectedContext;
                return (
                  <button
                    key={ctx}
                    onClick={() => setSelectedContext(isSelected ? null : ctx)}
                    disabled={retrying}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition ${
                      isSelected
                        ? "bg-accent/15 border border-accent/40 text-accent"
                        : isCurrent
                          ? "bg-slate-800/60 border border-slate-700 text-slate-400"
                          : "bg-surface/40 border border-transparent hover:border-slate-700 text-slate-300 hover:text-slate-100"
                    }`}
                  >
                    <div
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${isSelected ? "bg-accent" : isCurrent ? "bg-amber-400" : "bg-slate-600"}`}
                    />
                    <span className="font-mono truncate">{ctx}</span>
                    {isCurrent && (
                      <span className="text-[10px] text-slate-600 ml-auto shrink-0">current</span>
                    )}
                    {isSelected && <ChevronRight className="w-3.5 h-3.5 ml-auto shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => handleRetry(selectedContext ?? undefined)}
            disabled={retrying}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent/20 hover:bg-accent/30 border border-accent/40 text-accent font-medium text-sm transition disabled:opacity-50"
          >
            {retrying ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                {selectedContext ? `Connect to ${selectedContext}` : "Retry Connection"}
              </>
            )}
          </button>
        </div>

        {/* Kubeconfig path info */}
        {status.kubeconfig_path && (
          <p className="text-center text-[11px] text-slate-600 mt-4 font-mono">
            Checking: {status.kubeconfig_path}
          </p>
        )}
      </motion.div>
    </div>
  );
}
