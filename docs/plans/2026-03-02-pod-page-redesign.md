# Pod Page Redesign — Compact Header + Contextual Toolbars

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure the pod details page to reduce header clutter by using a compact inline header with collapsible pod info, contextual per-tab toolbars, and a toggleable port forwarding panel.

**Architecture:** All changes are in `src/components/pod-details-view.tsx`. The header shrinks to a single row with pod name + status inline. Log-specific controls move to a contextual toolbar rendered between the tab bar and content. Port forwarding becomes toggleable via a new state variable.

**Tech Stack:** React, Tailwind CSS, Framer Motion, lucide-react icons

---

### Task 1: Add new state variables and imports

**Files:**
- Modify: `src/components/pod-details-view.tsx:1-16` (imports) and `:222-248` (state)

**Step 1: Add ChevronRight and Plug to the lucide-react import**

Change the import block at line 5-16 to add `ChevronRight` and `Plug`:

```tsx
import {
  ArrowLeft,
  Copy,
  Download,
  AlertCircle,
  Trash2,
  Search,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  X,
  Bug,
  Plug,
} from "lucide-react";
```

**Step 2: Add new state variables after line 247**

Add these two state variables inside `PodDetailsView`, after the existing state declarations:

```tsx
const [showPodInfo, setShowPodInfo] = useState(false);
const [showPortForward, setShowPortForward] = useState(false);
```

**Step 3: Verify the app compiles**

Run: `npm run build`
Expected: Compiles with no errors (unused variable warnings OK for now)

**Step 4: Commit**

```bash
git add src/components/pod-details-view.tsx
git commit -m "feat(pod-details): add state and imports for redesign"
```

---

### Task 2: Restructure the header to compact single-row layout

**Files:**
- Modify: `src/components/pod-details-view.tsx:594-758`

**Step 1: Replace the entire header section (lines 594-758) with the new compact layout**

Replace the `{/* Header */}` div (line 594, `<div className="border-b border-slate-800 p-4 bg-surface/50">`) through its closing `</div>` at line 758 with:

```tsx
        {/* Header */}
        <div className="border-b border-slate-800 bg-surface/50">
          <div className="flex items-center gap-3 px-4 py-2.5">
            {/* Left: Back button */}
            <button
              onClick={onBack}
              aria-label="Go back to resource list"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-800 hover:border-accent/50 hover:bg-muted/30 transition text-sm text-slate-300 shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <Kbd>Esc</Kbd>
            </button>

            {/* Center: Pod name + status */}
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <span className="text-slate-100 font-mono text-sm truncate">{podName}</span>
              <StatusBadge status={status} />
              <button
                onClick={() => setShowPodInfo(!showPodInfo)}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition shrink-0"
                aria-label={showPodInfo ? "Hide pod details" : "Show pod details"}
              >
                <motion.span
                  animate={{ rotate: showPodInfo ? 90 : 0 }}
                  transition={{ duration: 0.15 }}
                  className="inline-flex"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </motion.span>
                <span className="hidden sm:inline">details</span>
              </button>
            </div>

            {/* Right: Pod-level actions */}
            {!isDeleted && (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => !isStaticPod && setShowDebugModal(true)}
                  disabled={isStaticPod}
                  title={isStaticPod ? "Static pods do not support ephemeral debug containers" : "Debug container"}
                  aria-label="Debug container"
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition text-sm",
                    isStaticPod
                      ? "border-slate-800 text-slate-600 cursor-not-allowed"
                      : "border-accent/30 hover:border-accent/50 hover:bg-accent/15 text-accent",
                  )}
                >
                  <Bug className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Debug</span>
                  <Kbd>B</Kbd>
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isDeleting}
                  aria-label="Delete pod"
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-red-800/50 hover:border-red-600 hover:bg-red-500/15 transition text-sm text-red-400 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Delete</span>
                  <Kbd>D</Kbd>
                </button>
                <button
                  onClick={() => setShowPortForward(!showPortForward)}
                  aria-label={showPortForward ? "Hide port forwarding" : "Show port forwarding"}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition text-sm relative",
                    showPortForward
                      ? "border-accent/50 bg-accent/15 text-accent"
                      : "border-slate-800 hover:border-accent/50 hover:bg-muted/30 text-slate-300",
                  )}
                >
                  <Plug className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Ports</span>
                </button>
              </div>
            )}
          </div>

          {/* Collapsible Pod Info */}
          <AnimatePresence>
            {showPodInfo && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-6 px-4 py-2 border-t border-slate-800/50 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500">Namespace:</span>
                    <span className="text-slate-200 font-mono">{namespace}</span>
                  </div>
                  <div className="h-3 w-px bg-slate-800" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500">Node:</span>
                    <span className="text-slate-200 font-mono">{node}</span>
                  </div>
                  <div className="h-3 w-px bg-slate-800" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500">IP:</span>
                    <span className="text-slate-200 font-mono">{ip}</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Debug container banner */}
          {debugContainer && (
            <div className="flex items-center gap-2 px-4 py-2 border-t border-slate-800/50 bg-accent/5">
              <Bug className="w-3.5 h-3.5 text-accent shrink-0" />
              <span className="text-xs text-accent font-medium">Debug:</span>
              <span className="text-xs text-slate-200">{debugContainer.name}</span>
              <span className="text-[10px] font-mono text-accent/70 bg-accent/10 px-1.5 py-0.5 rounded">
                {debugContainer.image}
              </span>
              <button
                disabled={stoppingDebug}
                onClick={async () => {
                  const dc = debugContainer;
                  if (!dc) return;
                  setStoppingDebug(true);
                  try {
                    await stopDebugContainer(namespace, podName, dc.name);
                    setDebugContainer(undefined);
                    toast("Debug container stopped", "success");
                  } catch (err) {
                    toast(`Failed to stop debug container: ${formatError(err)}`, "error");
                  } finally {
                    setStoppingDebug(false);
                  }
                }}
                className="ml-auto text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded border border-slate-700 hover:border-slate-600 transition disabled:opacity-50"
              >
                {stoppingDebug ? "Stopping..." : "Disconnect"}
              </button>
            </div>
          )}
        </div>
```

**Step 2: Verify the app compiles**

Run: `npm run build`
Expected: Compiles with no errors

**Step 3: Commit**

```bash
git add src/components/pod-details-view.tsx
git commit -m "feat(pod-details): compact header with collapsible pod info"
```

---

### Task 3: Add contextual logs toolbar between tab bar and content

**Files:**
- Modify: `src/components/pod-details-view.tsx`

**Step 1: Add the logs toolbar between the tab bar and the content area**

Find the `{/* Content */}` comment (around line 795 after Task 2's edits). Insert the following **before** `<div className="flex-1 overflow-hidden relative">`:

```tsx
        {/* Contextual Toolbar — Logs tab */}
        {!isDeleted && activeTab === "logs" && (
          <div className="flex items-center gap-2 px-4 py-1.5 border-b border-slate-800/50 bg-surface/30">
            {/* Container selector */}
            {containers.length > 1 && (
              <select
                value={selectedContainer || ""}
                onChange={(e) => setSelectedContainer(e.target.value || undefined)}
                className="px-2 py-1 rounded-md border border-slate-800 bg-surface/60 text-xs text-slate-300 outline-none"
              >
                <option value="">All containers</option>
                {containers.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
            {/* Previous toggle */}
            <label className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-slate-800 hover:border-accent/50 hover:bg-muted/30 transition text-xs cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={showPrevious}
                onChange={(e) => setShowPrevious(e.target.checked)}
                className="w-3 h-3"
              />
              Previous
            </label>
            {/* Auto-scroll toggle */}
            <label className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-slate-800 hover:border-accent/50 hover:bg-muted/30 transition text-xs cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="w-3 h-3"
              />
              Auto-scroll
            </label>

            <div className="flex-1" />

            {/* Right side: Copy, Download, Search */}
            <button
              onClick={handleCopyLogs}
              aria-label="Copy logs to clipboard"
              className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-slate-800 hover:border-accent/50 hover:bg-muted/30 transition text-xs text-slate-300"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy
            </button>
            <button
              onClick={handleDownloadLogs}
              aria-label="Download logs as file"
              className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-slate-800 hover:border-accent/50 hover:bg-muted/30 transition text-xs text-slate-300"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </button>
            <button
              onClick={() => {
                setLogSearchVisible(true);
                if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
                focusTimeoutRef.current = setTimeout(() => logSearchInputRef.current?.focus(), 50);
              }}
              aria-label="Search logs"
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-md border transition text-xs",
                logSearchVisible
                  ? "border-accent/50 bg-accent/15 text-accent"
                  : "border-slate-800 hover:border-accent/50 hover:bg-muted/30 text-slate-300",
              )}
            >
              <Search className="w-3.5 h-3.5" />
              <Kbd>⌘F</Kbd>
            </button>
          </div>
        )}
```

**Step 2: Remove the old log-specific controls from the header**

Since Task 2 already replaced the header, verify the old `{activeTab === "logs" && ( ... )}` block with Copy YAML, Container selector, Previous, Copy, Download, Auto-scroll is no longer present in the header area. (It should already be gone after Task 2.)

**Step 3: Also remove the Copy YAML button** — it was in the header's right-side actions. It's redundant with the YAML tab's copy functionality. If we want to keep it, we can add it to the YAML tab toolbar later, but for now it clutters the header.

Verify there is no `handleCopyYaml` call remaining in the JSX. The function definition can stay (it's used nowhere else) or be removed.

**Step 4: Verify the app compiles**

Run: `npm run build`
Expected: Compiles with no errors

**Step 5: Commit**

```bash
git add src/components/pod-details-view.tsx
git commit -m "feat(pod-details): contextual logs toolbar between tabs and content"
```

---

### Task 4: Make port forwarding panel toggleable

**Files:**
- Modify: `src/components/pod-details-view.tsx` — the port forward rendering at the bottom

**Step 1: Replace the port forwarding sidebar rendering**

Find the current rendering near the end of the component (around line 997):

```tsx
      {/* Port Forwarding Sidebar */}
      {!isDeleted && activeTab !== "shell" && (
        <PortForwarding namespace={namespace} podName={podName} />
      )}
```

Replace with:

```tsx
      {/* Port Forwarding Sidebar — toggleable */}
      <AnimatePresence>
        {!isDeleted && activeTab !== "shell" && showPortForward && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden shrink-0"
          >
            <PortForwarding namespace={namespace} podName={podName} />
          </motion.div>
        )}
      </AnimatePresence>
```

**Step 2: Verify the app compiles**

Run: `npm run build`
Expected: Compiles with no errors

**Step 3: Commit**

```bash
git add src/components/pod-details-view.tsx
git commit -m "feat(pod-details): toggleable port forwarding sidebar"
```

---

### Task 5: Visual polish and final verification

**Files:**
- Modify: `src/components/pod-details-view.tsx`

**Step 1: Run the full dev mode and visually verify**

Run: `npm run tauri:dev`

Check:
- [ ] Header is a single compact row with pod name + status inline
- [ ] Clicking the "details" chevron expands/collapses Namespace/Node/IP
- [ ] Debug and Delete buttons work, Kbd hints visible
- [ ] Port Forward toggle opens/closes the sidebar panel
- [ ] On Logs tab: contextual toolbar appears with Container selector, Previous, Auto-scroll, Copy, Download, Search
- [ ] On other tabs: no toolbar shown, full content area
- [ ] Debug container banner still appears when debug container is active
- [ ] Keyboard shortcuts still work (Esc, B, D, 1-6, ⌘F)
- [ ] Log search overlay still appears correctly
- [ ] Tab indicator animation still works

**Step 2: Fix any layout issues found during visual testing**

Adjust padding/gaps as needed for a polished look.

**Step 3: Commit final polish**

```bash
git add src/components/pod-details-view.tsx
git commit -m "feat(pod-details): polish compact header layout"
```
