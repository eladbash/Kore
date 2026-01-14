import { useEffect, useState, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { getPodMetrics, describePod } from "../lib/api";
import { Activity } from "lucide-react";

interface PodMetricsProps {
  namespace: string;
  podName: string;
}

interface MetricDataPoint {
  timestamp: number;
  cpu: number;
  memory: number;
  timeLabel: string;
}

interface CurrentMetrics {
  cpu: {
    usage: number; // in millicores
    limit: number; // in millicores
  };
  memory: {
    usage: number; // in bytes
    limit: number; // in bytes
  };
}

// Helper function to parse Kubernetes resource quantities
function parseQuantity(quantity: string | undefined): number {
  if (!quantity) return 0;
  
  // Remove any whitespace
  let qty = quantity.trim();
  
  // Handle memory (Ki, Mi, Gi, etc.)
  if (qty.endsWith("Ki")) {
    return parseFloat(qty.slice(0, -2)) * 1024;
  } else if (qty.endsWith("Mi")) {
    return parseFloat(qty.slice(0, -2)) * 1024 * 1024;
  } else if (qty.endsWith("Gi")) {
    return parseFloat(qty.slice(0, -2)) * 1024 * 1024 * 1024;
  } else if (qty.endsWith("Ti")) {
    return parseFloat(qty.slice(0, -2)) * 1024 * 1024 * 1024 * 1024;
  }
  
  // Handle CPU (m for millicores)
  if (qty.endsWith("m")) {
    return parseFloat(qty.slice(0, -1));
  } else if (qty.endsWith("n")) {
    return parseFloat(qty.slice(0, -1)) / 1000000; // nancores to millicores
  }
  
  // Try to parse as number - if no suffix, assume cores and convert to millicores
  const num = parseFloat(qty);
  if (isNaN(num)) return 0;
  
  // If no suffix and it's a reasonable number (likely cores), convert to millicores
  // Kubernetes typically uses "1" for 1 core, "500m" for 500 millicores, etc.
  // If the number is >= 1 and has no suffix, it's likely cores
  if (num >= 1 && !qty.includes(".")) {
    return num * 1000; // cores to millicores
  }
  // Otherwise, assume it's already in millicores or return as-is
  return num;
}

// Format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

// Format millicores to human readable
function formatCPU(millicores: number): string {
  if (millicores === 0) return "0 m";
  if (millicores < 1000) {
    return `${millicores.toFixed(0)} m`;
  }
  return `${(millicores / 1000).toFixed(2)} cores`;
}

export function PodMetrics({ namespace, podName }: PodMetricsProps) {
  const [metrics, setMetrics] = useState<CurrentMetrics | null>(null);
  const [history, setHistory] = useState<MetricDataPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [podSpec, setPodSpec] = useState<any>(null);

  // Fetch pod spec once to get limits
  useEffect(() => {
    describePod(namespace, podName)
      .then((pod) => {
        setPodSpec(pod);
      })
      .catch(() => {
        // If we can't fetch pod spec, we'll use defaults
      });
  }, [namespace, podName]);

  // Extract limits from pod allocatedResources (from status)
  const getLimits = useCallback(() => {
    if (!podSpec) {
      return { cpu: 0, memory: 0 };
    }

    // Get allocatedResources from pod status
    const allocatedResources = (podSpec as any)?.status?.allocatedResources;
    
    if (allocatedResources) {
      const cpuLimit = allocatedResources?.cpu || "0";
      const memoryLimit = allocatedResources?.memory || "0";
      
      return {
        cpu: parseQuantity(cpuLimit),
        memory: parseQuantity(memoryLimit),
      };
    }

    // Fallback: try to get from spec if allocatedResources not available
    const containers = (podSpec as any)?.spec?.containers || [];
    let totalCpuLimit = 0;
    let totalMemoryLimit = 0;

    containers.forEach((container: any) => {
      const resources = container?.resources || {};
      const limits = resources?.limits || {};
      const requests = resources?.requests || {};

      // Use limit if available, otherwise use request
      const cpuLimit = limits?.cpu || requests?.cpu;
      const memoryLimit = limits?.memory || requests?.memory;

      if (cpuLimit) {
        totalCpuLimit += parseQuantity(cpuLimit);
      }
      if (memoryLimit) {
        totalMemoryLimit += parseQuantity(memoryLimit);
      }
    });

    return {
      cpu: totalCpuLimit || 0,
      memory: totalMemoryLimit || 0,
    };
  }, [podSpec]);

  const fetchMetrics = useCallback(async () => {
    try {
      const data = await getPodMetrics(namespace, podName);
      
      // Extract metrics from the response
      // The metrics API returns: { containers: [{ usage: { cpu: "...", memory: "..." } }] }
      const containers = (data as any)?.containers || [];
      let totalCpuUsage = 0;
      let totalMemoryUsage = 0;
      
      containers.forEach((container: any) => {
        const cpuUsage = container?.usage?.cpu || "0";
        const memoryUsage = container?.usage?.memory || "0";
        totalCpuUsage += parseQuantity(cpuUsage);
        totalMemoryUsage += parseQuantity(memoryUsage);
      });
      
      // Get limits from pod allocatedResources
      const limits = getLimits();
      // Use allocatedResources if available, otherwise fallback to defaults
      const cpuLimit = limits.cpu > 0 
        ? limits.cpu 
        : (totalCpuUsage > 0 ? totalCpuUsage * 2 : 1000); // Default to 2x usage or 1000m
      const memoryLimit = limits.memory > 0 
        ? limits.memory 
        : (totalMemoryUsage > 0 ? totalMemoryUsage * 2 : 512 * 1024 * 1024); // Default to 2x usage or 512Mi
      
      const currentMetrics: CurrentMetrics = {
        cpu: {
          usage: totalCpuUsage,
          limit: cpuLimit,
        },
        memory: {
          usage: totalMemoryUsage,
          limit: memoryLimit,
        },
      };
      
      setMetrics(currentMetrics);
      setError(null);
      
      // Add to history
      const now = Date.now();
      const newPoint: MetricDataPoint = {
        timestamp: now,
        cpu: (totalCpuUsage / cpuLimit) * 100, // percentage
        memory: (totalMemoryUsage / memoryLimit) * 100, // percentage
        timeLabel: new Date(now).toLocaleTimeString(),
      };
      
      setHistory((prev) => {
        const updated = [...prev, newPoint];
        // Keep only last 2 minutes (120 seconds, assuming we poll every 5 seconds = 24 points)
        const twoMinutesAgo = now - 120000;
        return updated.filter((p) => p.timestamp > twoMinutesAgo);
      });
    } catch (err: any) {
      const errorMsg = err?.toString() || "Unknown error";
      // Check for various error conditions
      if (errorMsg.includes("404") || errorMsg.includes("not found")) {
        // Check if it's specifically a metrics server issue or just pod not found
        if (errorMsg.includes("Metrics Server") || errorMsg.includes("metrics.k8s.io")) {
          setError("Metrics Server not detected");
        } else {
          setError(`Pod metrics not found: ${errorMsg}`);
        }
      } else if (errorMsg.includes("Metrics Server")) {
        setError("Metrics Server not detected");
      } else {
        // Show the actual error message for debugging
        setError(`Error fetching metrics: ${errorMsg}`);
      }
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  }, [namespace, podName, getLimits]);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  if (loading && !metrics && !error) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 animate-pulse" />
          Loading metrics...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-slate-400">
          <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg">{error}</p>
          <p className="text-sm mt-2 text-slate-500">
            Make sure the Metrics Server is installed in your cluster
          </p>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return null;
  }

  const cpuPercent = (metrics.cpu.usage / metrics.cpu.limit) * 100;
  const memoryPercent = (metrics.memory.usage / metrics.memory.limit) * 100;

  return (
    <div className="h-full overflow-auto p-4 space-y-6">
      {/* Gauge Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* CPU Gauge */}
        <div className="bg-surface/30 border border-slate-800 rounded-lg p-4">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-slate-300 mb-1">CPU Usage</h3>
            <div className="text-xs text-slate-400">
              {formatCPU(metrics.cpu.usage)} / {formatCPU(metrics.cpu.limit)}
            </div>
          </div>
          <div className="relative h-32">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-2xl font-bold text-accent">{cpuPercent.toFixed(1)}%</div>
            </div>
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke="rgb(30 41 59)"
                strokeWidth="8"
                className="opacity-30"
              />
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke={cpuPercent > 80 ? "#ef4444" : cpuPercent > 60 ? "#f59e0b" : "#10b981"}
                strokeWidth="8"
                strokeDasharray={`${2 * Math.PI * 40}`}
                strokeDashoffset={`${2 * Math.PI * 40 * (1 - Math.min(cpuPercent, 100) / 100)}`}
                strokeLinecap="round"
                className="transition-all duration-300"
              />
            </svg>
          </div>
        </div>

        {/* Memory Gauge */}
        <div className="bg-surface/30 border border-slate-800 rounded-lg p-4">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-slate-300 mb-1">Memory Usage</h3>
            <div className="text-xs text-slate-400">
              {formatBytes(metrics.memory.usage)} / {formatBytes(metrics.memory.limit)}
            </div>
          </div>
          <div className="relative h-32">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-2xl font-bold text-accent">{memoryPercent.toFixed(1)}%</div>
            </div>
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke="rgb(30 41 59)"
                strokeWidth="8"
                className="opacity-30"
              />
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke={memoryPercent > 80 ? "#ef4444" : memoryPercent > 60 ? "#f59e0b" : "#10b981"}
                strokeWidth="8"
                strokeDasharray={`${2 * Math.PI * 40}`}
                strokeDashoffset={`${2 * Math.PI * 40 * (1 - Math.min(memoryPercent, 100) / 100)}`}
                strokeLinecap="round"
                className="transition-all duration-300"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Line Chart */}
      {history.length > 0 && (
        <div className="bg-surface/30 border border-slate-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Usage Trend (Last 2 Minutes)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(51 65 85)" />
              <XAxis
                dataKey="timeLabel"
                stroke="rgb(148 163 184)"
                style={{ fontSize: "10px" }}
              />
              <YAxis
                stroke="rgb(148 163 184)"
                style={{ fontSize: "10px" }}
                domain={[0, 100]}
                label={{ value: "%", angle: -90, position: "insideLeft", style: { fill: "rgb(148 163 184)", fontSize: "10px" } }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgb(15 23 42)",
                  border: "1px solid rgb(51 65 85)",
                  borderRadius: "4px",
                  color: "rgb(226 232 240)",
                }}
                labelStyle={{ color: "rgb(148 163 184)" }}
              />
              <Line
                type="monotone"
                dataKey="cpu"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                name="CPU %"
              />
              <Line
                type="monotone"
                dataKey="memory"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                name="Memory %"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

