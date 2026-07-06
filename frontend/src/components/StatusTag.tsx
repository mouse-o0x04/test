import { EditOutlined } from "@ant-design/icons";
import { Select, Tag, Tooltip } from "antd";
import { useState } from "react";

interface StatusTagProps {
  value: string;
  statusLabels: Record<string, string>;
  statusColors: Record<string, string>;
  onChange?: (newStatus: string) => void;
  editable?: boolean;
}

export default function StatusTag({ value, statusLabels, statusColors, onChange, editable = true }: StatusTagProps) {
  const [editing, setEditing] = useState(false);

  if (!editable || !onChange) {
    return <Tag color={statusColors[value] || "default"}>{statusLabels[value] || value}</Tag>;
  }

  if (editing) {
    return (
      <Select
        size="small"
        autoFocus
        defaultValue={value}
        style={{ minWidth: 120 }}
        onBlur={() => setEditing(false)}
        onChange={(v) => { onChange(v); setEditing(false); }}
        options={Object.entries(statusLabels).map(([k, v]) => ({ value: k, label: v }))}
      />
    );
  }

  return (
    <Tooltip title="Нажмите для изменения">
      <Tag
        color={statusColors[value] || "default"}
        style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
        onClick={() => setEditing(true)}
      >
        {statusLabels[value] || value}
        <EditOutlined style={{ fontSize: 10, opacity: 0.5 }} />
      </Tag>
    </Tooltip>
  );
}
