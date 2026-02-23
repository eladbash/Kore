import { useCallback, useEffect, useState } from "react";
import { listContexts, listNamespaces, switchContext, loadFavorites } from "@/lib/api";

const DEFAULT_NAMESPACES = ["default", "kube-system", "kube-public", "kube-node-lease"];

const FAVORITE_CONTEXTS_KEY = "kore-favorite-contexts";
const FAVORITE_NAMESPACES_KEY = "kore-favorite-namespaces";

export function useK8sContext() {
  const [contexts, setContexts] = useState<string[]>([]);
  const [currentContext, setCurrentContext] = useState<string>();
  const [namespaces, setNamespaces] = useState<string[]>(DEFAULT_NAMESPACES);
  const [namespace, setNamespace] = useState<string>("default");

  const handleContextChange = useCallback(async (newContext: string) => {
    setNamespaces([]);

    try {
      await switchContext(newContext);
      setCurrentContext(newContext);
    } catch (err) {
      console.error("Failed to switch context", err);
    }
  }, []);

  // Load contexts on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ctxs = await listContexts();
        if (cancelled) return;
        if (ctxs && ctxs.length > 0) {
          setContexts(ctxs);

          // If exactly one favorite context exists, prefer it
          let initialContext = ctxs[0];
          try {
            const favContexts = (await loadFavorites(FAVORITE_CONTEXTS_KEY)).filter((f) =>
              ctxs.includes(f),
            );
            if (favContexts.length === 1) initialContext = favContexts[0];
          } catch {
            /* ignore – fall back to first context */
          }

          await handleContextChange(initialContext);
        } else {
          setContexts([]);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load contexts", err);
        setContexts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handleContextChange]);

  // Fetch namespaces when context changes — with race condition protection
  useEffect(() => {
    if (!currentContext) return;
    let cancelled = false;

    setNamespaces([]);

    (async () => {
      try {
        const ns = await listNamespaces();
        if (cancelled) return;
        if (ns && ns.length > 0) {
          setNamespaces(ns);

          // Load favorite namespaces from backend
          let favNamespaces: string[] = [];
          try {
            favNamespaces = (await loadFavorites(FAVORITE_NAMESPACES_KEY)).filter(
              (f) => f === "*" || ns.includes(f),
            );
          } catch {
            /* ignore */
          }

          setNamespace((currentNs) => {
            // If exactly one favorite namespace, always prefer it
            if (favNamespaces.length === 1) return favNamespaces[0];
            if (currentNs === "*" || ns.includes(currentNs)) {
              return currentNs;
            }
            return "default";
          });
        } else {
          setNamespaces(DEFAULT_NAMESPACES);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load namespaces", err);
        setNamespaces(DEFAULT_NAMESPACES);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentContext]);

  const refreshNamespaces = useCallback(async () => {
    if (!currentContext) return;
    try {
      const ns = await listNamespaces();
      if (ns && ns.length > 0) {
        setNamespaces(ns);
      }
    } catch (err) {
      console.error("Failed to refresh namespaces", err);
    }
  }, [currentContext]);

  return {
    contexts,
    currentContext,
    namespaces,
    namespace,
    setNamespace,
    handleContextChange,
    refreshNamespaces,
  };
}
