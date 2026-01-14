import { useMemo, useEffect, useRef, useState } from "react";
import {
  ColumnDef,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  flexRender,
  useReactTable
} from "@tanstack/react-table";
import { ResourceItem, ResourceKind } from "../lib/api";

interface ResourceTableProps {
  data: ResourceItem[];
  sorting: SortingState;
  onSortingChange: (updater: SortingState) => void;
  onRowSelect?: (row: ResourceItem) => void;
  kind?: ResourceKind;
  selectedRowIndex?: number;
  onSelectedRowIndexChange?: (index: number) => void;
}

function formatRelativeAge(timestamp: string | undefined): string {
  if (!timestamp) return "-";
  
  try {
    const created = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
      return `${diffDays}d`;
    } else if (diffMinutes > 0) {
      return `${diffMinutes}m`;
    } else {
      return `${diffSeconds}s`;
    }
  } catch (e) {
    return "-";
  }
}

export function ResourceTable({ 
  data, 
  sorting, 
  onSortingChange, 
  onRowSelect, 
  kind,
  selectedRowIndex = -1,
  onSelectedRowIndexChange
}: ResourceTableProps) {
  const tableRef = useRef<HTMLDivElement>(null);
  const [internalSelectedIndex, setInternalSelectedIndex] = useState(-1);
  
  const selectedIndex = selectedRowIndex >= 0 ? selectedRowIndex : internalSelectedIndex;
  const setSelectedIndex = onSelectedRowIndexChange || setInternalSelectedIndex;
  const columns = useMemo<ColumnDef<ResourceItem>[]>(() => {
    if (kind === "deployments") {
      // Deployments: NAMESPACE, NAME, READY, UP-TO-DATE, AVAILABLE, AGE
      return [
        { accessorKey: "namespace", header: "Namespace" },
        { accessorKey: "name", header: "Name" },
        { accessorKey: "ready", header: "Ready" },
        { 
          accessorKey: "upToDate", 
          header: "Up-to-date",
          cell: ({ getValue }) => getValue() ?? "-"
        },
        { 
          accessorKey: "available", 
          header: "Available",
          cell: ({ getValue }) => getValue() ?? "-"
        },
        {
          accessorKey: "age",
          header: "Age",
          cell: ({ getValue }) => formatRelativeAge(getValue() as string),
          sortingFn: (rowA, rowB) => {
            const timestampA = rowA.original.age;
            const timestampB = rowB.original.age;
            if (!timestampA && !timestampB) return 0;
            if (!timestampA) return 1;
            if (!timestampB) return -1;
            const dateA = new Date(timestampA).getTime();
            const dateB = new Date(timestampB).getTime();
            return dateA - dateB;
          }
        }
      ];
    } else if (kind === "services") {
      // Services: NAMESPACE, NAME, TYPE, CLUSTER-IP, EXTERNAL-IP, PORT(S), AGE
      return [
        { accessorKey: "namespace", header: "Namespace" },
        { accessorKey: "name", header: "Name" },
        { 
          accessorKey: "type", 
          header: "Type",
          cell: ({ getValue }) => getValue() ?? "-"
        },
        { 
          accessorKey: "clusterIp", 
          header: "Cluster-IP",
          cell: ({ getValue }) => getValue() ?? "-"
        },
        { 
          accessorKey: "externalIp", 
          header: "External-IP",
          cell: ({ getValue }) => getValue() ?? "-"
        },
        { 
          accessorKey: "ports", 
          header: "Port(s)",
          cell: ({ getValue }) => getValue() ?? "-"
        },
        {
          accessorKey: "age",
          header: "Age",
          cell: ({ getValue }) => formatRelativeAge(getValue() as string),
          sortingFn: (rowA, rowB) => {
            const timestampA = rowA.original.age;
            const timestampB = rowB.original.age;
            if (!timestampA && !timestampB) return 0;
            if (!timestampA) return 1;
            if (!timestampB) return -1;
            const dateA = new Date(timestampA).getTime();
            const dateB = new Date(timestampB).getTime();
            return dateA - dateB;
          }
        }
      ];
    } else if (kind === "nodes") {
      // Nodes: NAME, STATUS, ROLES, AGE, VERSION
      return [
        { accessorKey: "name", header: "Name" },
        { 
          accessorKey: "status", 
          header: "Status",
          cell: ({ getValue }) => getValue() ?? "-"
        },
        { 
          accessorKey: "roles", 
          header: "Roles",
          cell: ({ getValue }) => getValue() ?? "-"
        },
        {
          accessorKey: "age",
          header: "Age",
          cell: ({ getValue }) => formatRelativeAge(getValue() as string),
          sortingFn: (rowA, rowB) => {
            const timestampA = rowA.original.age;
            const timestampB = rowB.original.age;
            if (!timestampA && !timestampB) return 0;
            if (!timestampA) return 1;
            if (!timestampB) return -1;
            const dateA = new Date(timestampA).getTime();
            const dateB = new Date(timestampB).getTime();
            return dateA - dateB;
          }
        },
        { 
          accessorKey: "version", 
          header: "Version",
          cell: ({ getValue }) => getValue() ?? "-"
        }
      ];
    } else {
      // Default columns for pods and other resources
      return [
        { accessorKey: "name", header: "Name" },
        { accessorKey: "namespace", header: "Namespace" },
        { accessorKey: "status", header: "Status" },
        { accessorKey: "ready", header: "Ready" },
        { accessorKey: "restarts", header: "Restarts" },
        {
          accessorKey: "age",
          header: "Age",
          cell: ({ getValue }) => formatRelativeAge(getValue() as string),
          sortingFn: (rowA, rowB) => {
            const timestampA = rowA.original.age;
            const timestampB = rowB.original.age;
            if (!timestampA && !timestampB) return 0;
            if (!timestampA) return 1;
            if (!timestampB) return -1;
            const dateA = new Date(timestampA).getTime();
            const dateB = new Date(timestampB).getTime();
            return dateA - dateB;
          }
        }
      ];
    }
  }, [kind]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    enableSortingRemoval: false,
    onSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  const rows = table.getRowModel().rows;

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return; // Don't handle if typing in input
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = prev < rows.length - 1 ? prev + 1 : prev;
          // Scroll into view
          if (next >= 0 && tableRef.current) {
            const rowElement = tableRef.current.querySelector(`[data-row-index="${next}"]`) as HTMLElement;
            rowElement?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
          return next;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = prev > 0 ? prev - 1 : 0;
          // Scroll into view
          if (next >= 0 && tableRef.current) {
            const rowElement = tableRef.current.querySelector(`[data-row-index="${next}"]`) as HTMLElement;
            rowElement?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
          return next;
        });
      } else if (e.key === "Enter" && selectedIndex >= 0 && selectedIndex < rows.length) {
        e.preventDefault();
        onRowSelect?.(rows[selectedIndex].original);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [rows, selectedIndex, setSelectedIndex, onRowSelect]);

  // Reset selection when data changes
  useEffect(() => {
    if (selectedIndex >= rows.length) {
      setSelectedIndex(Math.max(0, rows.length - 1));
    }
  }, [data.length, rows.length, selectedIndex, setSelectedIndex]);

  return (
    <div ref={tableRef} className="w-full h-full overflow-auto rounded-lg border border-slate-800 glass">
      <table className="min-w-full text-sm">
        <thead className="bg-surface/80 sticky top-0 z-10">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-slate-800">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-3 py-2 text-left text-slate-300 select-none cursor-pointer hover:text-accent"
                  onClick={header.column.getToggleSortingHandler()}
                >
                  <div className="flex items-center gap-1">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{
                      asc: "↑",
                      desc: "↓"
                    }[header.column.getIsSorted() as string] ?? null}
                  </div>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((row, index) => (
            <tr
              key={row.id}
              data-row-index={index}
              className={`transition cursor-pointer ${
                index === selectedIndex
                  ? "bg-accent/20 border-l-2 border-accent"
                  : "hover:bg-muted/40"
              }`}
              onClick={() => {
                setSelectedIndex(index);
                onRowSelect?.(row.original);
              }}
              onDoubleClick={() => onRowSelect?.(row.original)}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 py-2 text-slate-100">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

