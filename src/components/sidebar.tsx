import { LucideIcon, Boxes, Server, Activity, Cpu } from "lucide-react";
import { ResourceKind } from "../lib/api";

type MenuItem = {
  id: ResourceKind;
  label: string;
  icon: LucideIcon;
};

const menu: MenuItem[] = [
  { id: "pods", label: "Pods", icon: Boxes },
  { id: "deployments", label: "Deployments", icon: Server },
  { id: "services", label: "Services", icon: Activity },
  { id: "nodes", label: "Nodes", icon: Cpu }
];

interface SidebarProps {
  contexts: string[];
  currentContext?: string;
  namespaces: string[];
  currentNamespace?: string;
  currentResource?: ResourceKind;
  onContextChange: (context: string) => void;
  onNamespaceChange: (ns: string) => void;
  onResourceChange: (kind: ResourceKind) => void;
}

export function Sidebar({
  contexts,
  currentContext,
  namespaces,
  currentNamespace,
  currentResource,
  onContextChange,
  onNamespaceChange,
  onResourceChange
}: SidebarProps) {
  return (
    <aside className="w-64 h-full border-r border-slate-800 bg-surface/80 glass p-4 flex flex-col gap-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">Context</p>
        <div className="space-y-2">
          {contexts.map((ctx) => (
            <button
              key={ctx}
              onClick={() => onContextChange(ctx)}
              className={`w-full text-left px-3 py-2 rounded border transition ${
                currentContext === ctx
                  ? "border-accent text-accent bg-accent/10"
                  : "border-slate-800 hover:border-slate-700"
              }`}
            >
              {ctx}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">Namespaces</p>
        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
          <button
            onClick={() => onNamespaceChange("*")}
            className={`w-full text-left px-3 py-2 rounded border transition ${
              currentNamespace === "*"
                ? "border-accent text-accent bg-accent/10"
                : "border-slate-800 hover:border-slate-700"
            }`}
          >
            All Namespaces
          </button>
          {namespaces.map((ns) => (
            <button
              key={ns}
              onClick={() => onNamespaceChange(ns)}
              className={`w-full text-left px-3 py-2 rounded border transition ${
                currentNamespace === ns
                  ? "border-accent text-accent bg-accent/10"
                  : "border-slate-800 hover:border-slate-700"
              }`}
            >
              {ns}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">Resources</p>
        <div className="space-y-2">
          {menu.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onResourceChange(id)}
              className={`w-full px-3 py-2 rounded border transition flex items-center gap-2 ${
                currentResource === id
                  ? "border-accent text-accent bg-accent/10"
                  : "border-slate-800 hover:border-accent/70 text-slate-200"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

