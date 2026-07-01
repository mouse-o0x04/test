import { ClockCircleOutlined, RightOutlined, LeftOutlined } from "@ant-design/icons";
import { Button, DatePicker, Space, Tag, Tooltip, Typography } from "antd";
import dayjs from "dayjs";
import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import type { Order, OrderSettingsItem } from "../types";
import { ORDER_STATUSES } from "../types";

const { RangePicker } = DatePicker;

const DEFAULT_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  new: { label: "Новый", color: "#1677ff", bg: "#e6f4ff" },
  in_progress: { label: "В работе", color: "#fa8c16", bg: "#fff7e6" },
  ready: { label: "Готов", color: "#52c41a", bg: "#f6ffed" },
  delivered: { label: "Отдали", color: "#8c8c8c", bg: "#fafafa" },
};

const MAIN_STATUSES = ["new", "in_progress", "ready", "delivered"];

const STATUS_BG: Record<string, string> = {
  new: "#e6f4ff",
  in_progress: "#fff7e6",
  ready: "#f6ffed",
  delivered: "#fafafa",
};

interface KanbanBoardProps {
  orders: Order[];
  onMoveOrder: (orderId: number, newStatus: string) => void;
  onSelectOrder?: (order: Order) => void;
  designerColors?: OrderSettingsItem[];
  workerColors?: OrderSettingsItem[];
  layoutOptions?: OrderSettingsItem[];
  sourceOptions?: OrderSettingsItem[];
  statusColors?: OrderSettingsItem[];
}

function getStatusConfig(status: string, statusColors?: OrderSettingsItem[]): { label: string; color: string; bg: string } {
  const def = DEFAULT_STATUS_CONFIG[status] || DEFAULT_STATUS_CONFIG.new;
  const custom = statusColors?.find((s) => s.name === def.label);
  return {
    label: custom?.name || def.label,
    color: custom?.color || def.color,
    bg: STATUS_BG[status] || def.bg,
  };
}

function getStatusLabel(status: string, statusColors?: OrderSettingsItem[]): string {
  const def = DEFAULT_STATUS_CONFIG[status];
  const custom = statusColors?.find((s) => s.name === def?.label);
  return custom?.name || def?.label || status;
}

const getColor = (settings: OrderSettingsItem[] | undefined, name: string): string => {
  return settings?.find((s) => s.name === name)?.color || "#1677ff";
};

export default function KanbanBoard({ orders, onMoveOrder, onSelectOrder, designerColors, workerColors, layoutOptions, sourceOptions, statusColors }: KanbanBoardProps) {
  const { hasPermission } = useAuth();
  const canViewPrices = hasPermission("prices.view");
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);

  const filteredOrders = orders.filter((o) => {
    if (!dateRange) return true;
    const date = dayjs(o.created_at);
    if (dateRange[0] && date.isBefore(dateRange[0].startOf("day"))) return false;
    if (dateRange[1] && date.isAfter(dateRange[1].endOf("day"))) return false;
    return true;
  });

  const grouped = MAIN_STATUSES.reduce<Record<string, Order[]>>((acc, status) => {
    acc[status] = filteredOrders.filter((o) => o.status === status);
    return acc;
  }, {});

  const handleDragStart = (e: React.DragEvent, orderId: number) => {
    e.dataTransfer.setData("orderId", String(orderId));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    const orderId = Number(e.dataTransfer.getData("orderId"));
    if (orderId) {
      onMoveOrder(orderId, targetStatus);
    }
  };

  const moveLeft = (orderId: number, currentStatus: string) => {
    const idx = MAIN_STATUSES.indexOf(currentStatus);
    if (idx > 0) {
      onMoveOrder(orderId, MAIN_STATUSES[idx - 1]);
    }
  };

  const moveRight = (orderId: number, currentStatus: string) => {
    const idx = MAIN_STATUSES.indexOf(currentStatus);
    if (idx < MAIN_STATUSES.length - 1) {
      onMoveOrder(orderId, MAIN_STATUSES[idx + 1]);
    }
  };

  const renderCard = (order: Order, status: string, showLeft: boolean, showRight: boolean) => {
    const cfg = getStatusConfig(status, statusColors);
    return (
      <div
        key={order.id}
        draggable
        onDragStart={(e) => handleDragStart(e, order.id)}
        onClick={() => onSelectOrder?.(order)}
        style={{
          background: "#fff",
          borderRadius: 8,
          padding: 12,
          marginBottom: 8,
          border: "1px solid #f0f0f0",
          cursor: "pointer",
          boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
          transition: "box-shadow 0.2s, border-color 0.2s",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = cfg.color; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 2px 8px ${cfg.color}33`; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "#f0f0f0"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 2px rgba(0,0,0,0.06)"; }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>#{order.id}</Typography.Text>
          <Space size={4}>
            {showLeft && (
              <Button type="text" size="small" icon={<LeftOutlined />} onClick={(e) => { e.stopPropagation(); moveLeft(order.id, status); }} style={{ padding: 0, width: 20, height: 20 }} />
            )}
            {showRight && (
              <Button type="text" size="small" icon={<RightOutlined />} onClick={(e) => { e.stopPropagation(); moveRight(order.id, status); }} style={{ padding: 0, width: 20, height: 20 }} />
            )}
          </Space>
        </div>
        <Typography.Text strong style={{ display: "block", marginBottom: 4, fontSize: 13 }} ellipsis={{ tooltip: order.description || order.items?.map((i) => i.product_name || `#${i.product_id}`).join(", ") }}>
          {order.description || (order.items?.length
            ? order.items.map((i) => i.product_name || `#${i.product_id}`).join(", ")
            : `Заказ #${order.id}`)}
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
          {order.client_name || `Клиент #${order.client_id}`}
        </Typography.Text>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
          {order.designer && (
            <Tag color={getColor(designerColors, order.designer)} style={{ fontSize: 11, margin: 0 }}>
              {order.designer}
            </Tag>
          )}
          {order.layout_type && (
            <Tag color={getColor(layoutOptions, order.layout_type)} style={{ fontSize: 11, margin: 0 }}>
              {order.layout_type}
            </Tag>
          )}
          {order.source && (
            <Tag color={getColor(sourceOptions, order.source)} style={{ fontSize: 11, margin: 0 }}>
              {order.source}
            </Tag>
          )}
        </div>

        {order.workers && order.workers.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
            {order.workers.map((w) => (
              <Tag key={w} color={getColor(workerColors, w)} style={{ fontSize: 10, margin: 0 }}>
                {w}
              </Tag>
            ))}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {canViewPrices && (
            <Typography.Text strong style={{ fontSize: 13, color: "#1677ff" }}>
              {order.total_price.toLocaleString()} ₽
            </Typography.Text>
          )}
          {order.deadline && (
            <Tooltip title={dayjs(order.deadline).format("DD.MM.YYYY")}>
              <Space size={2}>
                <ClockCircleOutlined style={{ fontSize: 11, color: dayjs(order.deadline).isBefore(dayjs()) ? "#ff4d4f" : "#8c8c8c" }} />
                <Typography.Text type={dayjs(order.deadline).isBefore(dayjs()) ? "danger" : "secondary"} style={{ fontSize: 11 }}>
                  {dayjs(order.deadline).format("DD.MM")}
                </Typography.Text>
              </Space>
            </Tooltip>
          )}
        </div>
        {order.items && order.items.length > 0 && (
          <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
            {order.items.map((item) => (
              <Tooltip key={item.id} title={`${item.product_name || `#${item.product_id}`} × ${item.quantity}${item.product_unit ? " " + item.product_unit : ""}`}>
                <Tag style={{ fontSize: 11, margin: 0, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.product_name || `#${item.product_id}`} × {item.quantity}{item.product_unit ? " " + item.product_unit : ""}
                </Tag>
              </Tooltip>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div style={{ padding: "8px 12px", display: "flex", gap: 8, alignItems: "center" }}>
        <RangePicker
          size="small"
          value={dateRange as [dayjs.Dayjs, dayjs.Dayjs] | null}
          onChange={(dates) => setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null])}
          placeholder={["От", "До"]}
          allowClear
        />
        {dateRange && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {filteredOrders.length} из {orders.length} заказов
          </Typography.Text>
        )}
      </div>
      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 16 }}>
      {MAIN_STATUSES.map((status) => {
        const cfg = getStatusConfig(status, statusColors);
        const items = grouped[status] || [];
        const statusIdx = MAIN_STATUSES.indexOf(status);
        return (
          <div
            key={status}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, status)}
            style={{
              minWidth: 240,
              maxWidth: 280,
              background: cfg.bg,
              borderRadius: 12,
              padding: 8,
              flex: "0 0 auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", marginBottom: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: cfg.color }} />
              <Typography.Text strong style={{ fontSize: 13 }}>{cfg.label}</Typography.Text>
              <Tag style={{ marginLeft: "auto", fontSize: 11 }}>{items.length}</Tag>
            </div>
            {items.map((order) =>
              renderCard(order, status, statusIdx > 0, statusIdx < MAIN_STATUSES.length - 1)
            )}
          </div>
        );
      })}
    </div>
    </>
  );
}
