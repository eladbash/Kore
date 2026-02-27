import { useRef, useEffect } from "react";
import { Search, ChevronUp, ChevronDown, X } from "lucide-react";

interface TextSearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  matchCount: number;
  currentMatch: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

export function TextSearchBar({
  query,
  onQueryChange,
  matchCount,
  currentMatch,
  onNext,
  onPrev,
  onClose,
}: TextSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  // Handle Escape in capture phase to prevent parent handlers from firing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && inputRef.current === document.activeElement) {
        e.stopImmediatePropagation();
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  return (
    <div className="absolute top-2 right-6 z-20 flex items-center gap-1 bg-surface border border-slate-700 rounded-lg px-3 py-1.5 shadow-lg">
      <Search className="w-3.5 h-3.5 text-slate-500" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.shiftKey ? onPrev() : onNext();
          }
        }}
        placeholder="Search..."
        className="bg-transparent text-xs text-slate-200 outline-none w-40 placeholder:text-slate-600"
      />
      {query && matchCount === 0 && (
        <span className="text-[10px] text-red-400/70 mx-1">No results</span>
      )}
      {matchCount > 0 && (
        <span className="text-[10px] text-slate-500 mx-1">
          {currentMatch + 1}/{matchCount}
        </span>
      )}
      <button onClick={onPrev} className="text-slate-400 hover:text-slate-200 transition">
        <ChevronUp className="w-3.5 h-3.5" />
      </button>
      <button onClick={onNext} className="text-slate-400 hover:text-slate-200 transition">
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
      <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition ml-1">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
