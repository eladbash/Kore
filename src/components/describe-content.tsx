import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { TextSearchBar } from "./text-search-bar";

function highlightJson(json: string): string {
  return json
    .replace(/("(?:[^"\\]|\\.)*")\s*:/g, '<span class="text-accent">$1</span>:')
    .replace(
      /:\s*("(?:[^"\\]|\\.)*")/g,
      (_match, value) => `: <span class="text-emerald-400">${value}</span>`,
    )
    .replace(/:\s*(\d+(?:\.\d+)?)\b/g, ': <span class="text-amber-400">$1</span>')
    .replace(/:\s*(true|false)\b/g, ': <span class="text-indigo-400">$1</span>')
    .replace(/:\s*(null)\b/g, ': <span class="text-slate-500">$1</span>');
}

function highlightSearchInHtml(
  html: string,
  query: string,
  currentMatchIndex: number,
): { result: string; matchCount: number } {
  if (!query) return { result: html, matchCount: 0 };
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escaped, "gi");
  let matchIdx = 0;

  const result = html.replace(/(<[^>]+>)|([^<]+)/g, (_match, tag, text) => {
    if (tag) return tag;
    return text.replace(regex, (m: string) => {
      const isCurrent = matchIdx === currentMatchIndex;
      matchIdx++;
      const style = isCurrent
        ? "background:rgba(251,191,36,0.35);box-shadow:0 0 0 1px rgba(251,191,36,0.5);border-radius:2px"
        : "background:rgba(251,191,36,0.15);border-radius:2px";
      return `<mark style="${style}" ${isCurrent ? 'data-current-match="true"' : ""}>${m}</mark>`;
    });
  });

  return { result, matchCount: matchIdx };
}

interface DescribeContentProps {
  content: string;
}

export function DescribeContent({ content }: DescribeContentProps) {
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const { highlightedHtml, matchCount } = useMemo(() => {
    const baseHtml = highlightJson(content || "No details available");
    if (!searchQuery) return { highlightedHtml: baseHtml, matchCount: 0 };
    const { result, matchCount } = highlightSearchInHtml(baseHtml, searchQuery, searchIndex);
    return { highlightedHtml: result, matchCount };
  }, [content, searchQuery, searchIndex]);

  // Scroll to current match
  useEffect(() => {
    if (matchCount > 0 && containerRef.current) {
      const mark = containerRef.current.querySelector("[data-current-match]");
      mark?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [searchIndex, matchCount, highlightedHtml]);

  // Reset search index when content changes
  useEffect(() => {
    setSearchIndex(0);
  }, [content]);

  // Cmd+F handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearchVisible(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleNext = useCallback(() => {
    if (matchCount === 0) return;
    setSearchIndex((prev) => (prev + 1) % matchCount);
  }, [matchCount]);

  const handlePrev = useCallback(() => {
    if (matchCount === 0) return;
    setSearchIndex((prev) => (prev - 1 + matchCount) % matchCount);
  }, [matchCount]);

  const handleClose = useCallback(() => {
    setSearchVisible(false);
    setSearchQuery("");
    setSearchIndex(0);
  }, []);

  const handleQueryChange = useCallback((q: string) => {
    setSearchQuery(q);
    setSearchIndex(0);
  }, []);

  return (
    <div className="relative h-full">
      {searchVisible && (
        <TextSearchBar
          query={searchQuery}
          onQueryChange={handleQueryChange}
          matchCount={matchCount}
          currentMatch={searchIndex}
          onNext={handleNext}
          onPrev={handlePrev}
          onClose={handleClose}
        />
      )}
      <div
        ref={containerRef}
        className="h-full overflow-auto p-4 font-mono text-xs leading-relaxed"
      >
        <pre
          className="whitespace-pre-wrap"
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      </div>
    </div>
  );
}
