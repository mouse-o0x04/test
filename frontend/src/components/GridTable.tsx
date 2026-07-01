import { ExpandOutlined, PlusOutlined } from "@ant-design/icons";
import { type ReactNode, useCallback, useMemo, useState } from "react";

export interface GridColumn {
  key: string;
  title: string;
  width?: number;
  minWidth?: number;
  render?: (value: unknown, record: Record<string, unknown>, index: number) => ReactNode;
  sortable?: boolean;
  fixed?: "left" | "right";
}

export interface GridToolbarProps {
  left?: ReactNode;
  right?: ReactNode;
}

interface GridTableProps {
  columns: GridColumn[];
  data: Record<string, unknown>[];
  rowKey: string | ((record: Record<string, unknown>) => string);
  loading?: boolean;
  toolbar?: GridToolbarProps;
  onRowClick?: (record: Record<string, unknown>) => void;
  onAddRow?: () => void;
  addRowLabel?: string;
  footer?: ReactNode;
  emptyText?: string;
}

export default function GridTable({
  columns,
  data,
  rowKey,
  loading,
  toolbar,
  onRowClick,
  onAddRow,
  addRowLabel = "Добавить запись",
  footer,
  emptyText = "Нет данных",
}: GridTableProps) {
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = useCallback((key: string) => {
    if (sortField === key) {
      setSortDir((d) => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(key);
      setSortDir("asc");
    }
  }, [sortField]);

  const sortedData = useMemo(() => {
    if (!sortField) return data;
    return [...data].sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv), "ru");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortField, sortDir]);

  const getRowKey = useCallback((record: Record<string, unknown>, index: number): string => {
    if (typeof rowKey === "function") return rowKey(record);
    return String(record[rowKey] ?? index);
  }, [rowKey]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Toolbar */}
      {toolbar && (
        <div className="nc-toolbar">
          <div className="nc-toolbar-left">{toolbar.left}</div>
          <div className="nc-toolbar-right">{toolbar.right}</div>
        </div>
      )}

      {/* Grid */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <table className="nc-grid" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th style={{ width: 34, minWidth: 34 }}>#</th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{
                    width: col.width,
                    minWidth: col.minWidth,
                    cursor: col.sortable !== false ? "pointer" : "default",
                  }}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {col.title}
                    {sortField === col.key && (
                      <span style={{ fontSize: 10 }}>{sortDir === "asc" ? "↑" : "↓"}</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} style={{ textAlign: "center", padding: 32, color: "#94a3b8" }}>
                  {emptyText}
                </td>
              </tr>
            ) : (
              sortedData.map((record, index) => (
                <tr
                  key={getRowKey(record, index)}
                  onClick={() => onRowClick?.(record)}
                  style={{ cursor: onRowClick ? "pointer" : "default" }}
                >
                  <td className="nc-row-expand">
                    <ExpandOutlined style={{ fontSize: 12 }} />
                  </td>
                  {columns.map((col) => (
                    <td key={col.key}>
                      {col.render
                        ? col.render(record[col.key], record, index)
                        : (record[col.key] != null ? String(record[col.key]) : "—")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Add row */}
        {onAddRow && (
          <div className="nc-grid-add-row" onClick={onAddRow}>
            <PlusOutlined style={{ marginRight: 8 }} />
            {addRowLabel}
          </div>
        )}
      </div>

      {/* Footer */}
      {footer && <div className="nc-grid-footer">{footer}</div>}
    </div>
  );
}
