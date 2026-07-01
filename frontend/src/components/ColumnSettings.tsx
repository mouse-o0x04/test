import { ColumnHeightOutlined, DownOutlined, MinusOutlined, ReloadOutlined, UpOutlined } from "@ant-design/icons";
import { Button, Popover, Space, Switch, Typography } from "antd";
import type { ColumnDef } from "../hooks/useColumnSettings";

interface ColumnSettingsProps {
  columns: ColumnDef[];
  isVisible: (key: string) => boolean;
  toggle: (key: string) => void;
  moveUp: (key: string) => void;
  moveDown: (key: string) => void;
  reset: () => void;
  order: string[];
}

export default function ColumnSettings({ columns, isVisible, toggle, moveUp, moveDown, reset, order }: ColumnSettingsProps) {
  const ordered = order.map((k) => columns.find((c) => c.key === k)).filter(Boolean) as ColumnDef[];

  const content = (
    <div style={{ minWidth: 220 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Typography.Text strong>Колонки</Typography.Text>
        <Button type="link" size="small" icon={<ReloadOutlined />} onClick={reset}>Сбросить</Button>
      </div>
      {ordered.map((col, idx) => (
        <div
          key={col.key}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "4px 0",
            borderBottom: "1px solid #f0f0f0",
          }}
        >
          <Space size={8}>
            <Switch
              size="small"
              checked={isVisible(col.key)}
              disabled={col.alwaysShow}
              onChange={() => toggle(col.key)}
            />
            <Typography.Text style={{ fontSize: 13 }}>{col.title}</Typography.Text>
          </Space>
          <Space size={2}>
            <Button
              type="text"
              size="small"
              icon={<UpOutlined />}
              disabled={idx === 0}
              onClick={() => moveUp(col.key)}
            />
            <Button
              type="text"
              size="small"
              icon={<DownOutlined />}
              disabled={idx === ordered.length - 1}
              onClick={() => moveDown(col.key)}
            />
          </Space>
        </div>
      ))}
    </div>
  );

  return (
    <Popover content={content} title="Настройка колонок" trigger="click" placement="bottomRight">
      <Button icon={<ColumnHeightOutlined />}>Колонки</Button>
    </Popover>
  );
}
