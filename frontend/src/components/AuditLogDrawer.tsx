import { Drawer, Timeline, Tag, Typography, Empty, Spin } from "antd";
import { useQuery } from "@tanstack/react-query";
import { getAuditLogs } from "../api/auditLog";
import type { AuditLog } from "../types";

const { Text } = Typography;

const ACTION_LABELS: Record<string, { color: string; label: string }> = {
  create: { color: "green", label: "Создание" },
  update: { color: "blue", label: "Изменение" },
  delete: { color: "red", label: "Удаление" },
};

function DiffView({ oldData, newData }: { oldData?: string; newData?: string }) {
  let changes: { key: string; oldVal: string; newVal: string }[] = [];

  try {
    const oldObj = oldData ? JSON.parse(oldData) : null;
    const newObj = newData ? JSON.parse(newData) : null;
    if (oldObj && newObj) {
      const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
      for (const key of allKeys) {
        if (["id", "created_at", "display_format_script", "stock_calculation_script"].includes(key)) continue;
        const ov = oldObj[key];
        const nv = newObj[key];
        if (JSON.stringify(ov) !== JSON.stringify(nv)) {
          changes.push({ key, oldVal: ov === null ? "пусто" : String(ov), newVal: nv === null ? "пусто" : String(nv) });
        }
      }
    } else if (newObj) {
      changes = Object.entries(newObj)
        .filter(([k]) => !["id", "created_at", "display_format_script", "stock_calculation_script"].includes(k))
        .map(([k, v]) => ({ key: k, oldVal: "—", newVal: v === null ? "пусто" : String(v) }));
    } else if (oldObj) {
      changes = Object.entries(oldObj)
        .filter(([k]) => !["id", "created_at", "display_format_script", "stock_calculation_script"].includes(k))
        .map(([k, v]) => ({ key: k, oldVal: v === null ? "пусто" : String(v), newVal: "удалено" }));
    }
  } catch {
    return <Text type="secondary" style={{ fontSize: 12 }}>{newData || oldData || "—"}</Text>;
  }

  if (changes.length === 0) return <Text type="secondary" style={{ fontSize: 12 }}>Без изменений</Text>;

  return (
    <div style={{ fontSize: 12, lineHeight: 1.6 }}>
      {changes.map((c) => (
        <div key={c.key}>
          <Text strong>{c.key}:</Text>{" "}
          <Text type="secondary" delete>{c.oldVal}</Text>
          {" → "}
          <Text>{c.newVal}</Text>
        </div>
      ))}
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  entityType: string;
  entityId: number | null;
  entityName?: string;
}

export default function AuditLogDrawer({ open, onClose, entityType, entityId, entityName }: Props) {
  const { data: logs, isLoading } = useQuery({
    queryKey: ["audit-log", entityType, entityId],
    queryFn: () => getAuditLogs(entityType, entityId!),
    enabled: open && entityId != null,
  });

  return (
    <Drawer
      title={`История изменений${entityName ? `: ${entityName}` : ""}`}
      open={open}
      onClose={onClose}
      width={500}
      destroyOnClose
      forceRender
      styles={{ body: { padding: "12px 24px" } }}
    >
      {isLoading ? (
        <div style={{ textAlign: "center", padding: 40 }}><Spin /></div>
      ) : !logs || logs.length === 0 ? (
        <Empty description="Нет записей об изменениях" />
      ) : (
        <Timeline
          items={logs.map((log: AuditLog) => {
            const action = ACTION_LABELS[log.action] || { color: "gray", label: log.action };
            return {
              color: action.color,
              children: (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <Tag color={action.color}>{action.label}</Tag>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {new Date(log.created_at).toLocaleString("ru-RU")}
                    </Text>
                  </div>
                  {log.user_name && <Text type="secondary" style={{ fontSize: 12 }}>{log.user_name}</Text>}
                  <div style={{ marginTop: 4 }}>
                    {log.action === "update" ? (
                      <DiffView oldData={log.old_data} newData={log.new_data} />
                    ) : log.action === "delete" ? (
                      <DiffView oldData={log.old_data} />
                    ) : (
                      <DiffView newData={log.new_data} />
                    )}
                  </div>
                </div>
              ),
            };
          })}
        />
      )}
    </Drawer>
  );
}
