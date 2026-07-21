import { ClockCircleOutlined, RightOutlined, LeftOutlined } from "@ant-design/icons";
import { Button, DatePicker, Space, Tag, Tooltip, Typography } from "antd";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragStartEvent, type DragEndEvent } from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import dayjs from "dayjs";
import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useResponsive } from "../hooks/useResponsive";
import type { Order, OrderSettingsItem } from "../types";

const { RangePicker } = DatePicker;

const DEFAULT_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  new: { label: "Новый", color: "#1677ff", bg: "#e6f4ff" },
  in_progress: { label: "В работе", color: "#fa8c16", bg: "#fff7e6" },
  post_processing: { label: "Постобработка", color: "#fa8c16", bg: "#fff7e6" },
  ready: { label: "Готов", color: "#52c41a", bg: "#f6ffed" },
  delivered: { label: "Отдали", color: "#8c8c8c", bg: "#fafafa" },
};

const MAIN_STATUSES = ["new", "in_progress", "post_processing", "ready", "delivered"];

const STATUS_BG: Record<string, string> = {
  new: "#e6f4ff",
  in_progress: "#fff7e6",
  post_processing: "#fff7e6",
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
  return { label: custom?.name || def.label, color: custom?.color || def.color, bg: STATUS_BG[status] || def.bg };
}

const getColor = (settings: OrderSettingsItem[] | undefined, name: string): string => {
  return settings?.find((s) => s.name === name)?.color || "#1677ff";
};

function DraggableCard({ order, status, showLeft, showRight, onSelectOrder, moveLeft, moveRight, canViewPrices, statusColors, designerColors, workerColors, layoutOptions, sourceOptions }: {
  order: Order; status: string; showLeft: boolean; showRight: boolean;
  onSelectOrder?: (order: Order) => void; moveLeft: (id: number, s: string) => void; moveRight: (id: number, s: string) => void;
  canViewPrices: boolean; statusColors?: OrderSettingsItem[]; designerColors?: OrderSettingsItem[];
  workerColors?: OrderSettingsItem[]; layoutOptions?: OrderSettingsItem[]; sourceOptions?: OrderSettingsItem[];
}) {
  const cfg = getStatusConfig(status, statusColors);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `order-${order.id}`, data: { order, status } });

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 100 : "auto" as unknown as number,
    background: "#fff", borderRadius: 8, padding: 12, marginBottom: 8,
    border: `1px solid ${isDragging ? cfg.color : "#f0f0f0"}`,
    cursor: "grab", boxShadow: isDragging ? `0 4px 12px ${cfg.color}33` : "0 1px 2px rgba(0,0,0,0.06)",
    transition: "box-shadow 0.2s, border-color 0.2s",
  };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} onClick={() => onSelectOrder?.(order)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>#{order.id}</Typography.Text>
        <Space size={4}>
          {showLeft && <Button type="text" size="small" icon={<LeftOutlined />} onClick={(e) => { e.stopPropagation(); moveLeft(order.id, status); }} style={{ padding: 0, width: 20, height: 20 }} />}
          {showRight && <Button type="text" size="small" icon={<RightOutlined />} onClick={(e) => { e.stopPropagation(); moveRight(order.id, status); }} style={{ padding: 0, width: 20, height: 20 }} />}
        </Space>
      </div>
      <Typography.Text strong style={{ display: "block", marginBottom: 4, fontSize: 13 }} ellipsis={{ tooltip: (() => { let d = order.description; if (d?.trim().startsWith("{")) try { d = JSON.parse(d).text; } catch {} return d || order.items?.map((i) => i.product_name || `#${i.product_id}`).join(", "); })() }}>
        {(() => { let d = order.description; if (d?.trim().startsWith("{")) try { d = JSON.parse(d).text; } catch {} return d || (order.items?.length ? order.items.map((i) => i.product_name || `#${i.product_id}`).join(", ") : `Заказ #${order.id}`); })()}
      </Typography.Text>
      <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
        {order.client_name || `Клиент #${order.client_id}`}
      </Typography.Text>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
        {order.designer && <Tag color={getColor(designerColors, order.designer)} style={{ fontSize: 11, margin: 0 }}>{order.designer}</Tag>}
        {order.layout_type && <Tag color={getColor(layoutOptions, order.layout_type)} style={{ fontSize: 11, margin: 0 }}>{order.layout_type}</Tag>}
        {order.source && <Tag color={getColor(sourceOptions, order.source)} style={{ fontSize: 11, margin: 0 }}>{order.source}</Tag>}
      </div>
      {order.workers && order.workers.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
          {order.workers.map((w) => <Tag key={w} color={getColor(workerColors, w)} style={{ fontSize: 10, margin: 0 }}>{w}</Tag>)}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {canViewPrices && <Typography.Text strong style={{ fontSize: 13, color: "#1677ff" }}>{order.total_price.toLocaleString()} ₽</Typography.Text>}
        {order.deadline && (
          <Tooltip title={dayjs(order.deadline).format("DD.MM.YYYY")}>
            <Space size={2}>
              <ClockCircleOutlined style={{ fontSize: 11, color: dayjs(order.deadline).isBefore(dayjs()) ? "#ff4d4f" : "#8c8c8c" }} />
              <Typography.Text type={dayjs(order.deadline).isBefore(dayjs()) ? "danger" : "secondary"} style={{ fontSize: 11 }}>{dayjs(order.deadline).format("DD.MM")}</Typography.Text>
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
}

function DroppableColumn({ status, cfg, items, children }: { status: string; cfg: { label: string; color: string; bg: string }; items: Order[]; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${status}` });

  return (
    <div
      ref={setNodeRef}
      style={{
        minWidth: 240, maxWidth: 280, flex: "0 0 auto",
        background: isOver ? `${cfg.color}15` : cfg.bg,
        borderRadius: 12, padding: 8,
        border: isOver ? `2px dashed ${cfg.color}` : "2px solid transparent",
        transition: "background 0.2s, border 0.2s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", marginBottom: 8 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: cfg.color }} />
        <Typography.Text strong style={{ fontSize: 13 }}>{cfg.label}</Typography.Text>
        <Tag style={{ marginLeft: "auto", fontSize: 11 }}>{items.length}</Tag>
      </div>
      {children}
    </div>
  );
}

export default function KanbanBoard({ orders, onMoveOrder, onSelectOrder, designerColors, workerColors, layoutOptions, sourceOptions, statusColors }: KanbanBoardProps) {
  const { hasPermission } = useAuth();
  const { isMobile } = useResponsive();
  const canViewPrices = hasPermission("prices.view");
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

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

  const moveLeft = (orderId: number, currentStatus: string) => {
    const idx = MAIN_STATUSES.indexOf(currentStatus);
    if (idx > 0) onMoveOrder(orderId, MAIN_STATUSES[idx - 1]);
  };

  const moveRight = (orderId: number, currentStatus: string) => {
    const idx = MAIN_STATUSES.indexOf(currentStatus);
    if (idx < MAIN_STATUSES.length - 1) onMoveOrder(orderId, MAIN_STATUSES[idx + 1]);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const order = (active.data.current as { order: Order })?.order;
    if (order) setActiveOrder(order);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveOrder(null);
    if (!over) return;
    const overId = String(over.id);
    if (overId.startsWith("column-")) {
      const targetStatus = overId.replace("column-", "");
      const orderId = Number(String(active.id).replace("order-", ""));
      if (orderId && targetStatus) onMoveOrder(orderId, targetStatus);
    }
  };

  return (
    <>
      <div style={{ padding: "8px 12px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 16, flexDirection: isMobile ? "column" : "row" }}>
          {MAIN_STATUSES.map((status) => {
            const cfg = getStatusConfig(status, statusColors);
            const items = grouped[status] || [];
            const statusIdx = MAIN_STATUSES.indexOf(status);
            return (
              <DroppableColumn key={status} status={status} cfg={cfg} items={items}>
                {items.map((order) => (
                  <DraggableCard
                    key={order.id}
                    order={order}
                    status={status}
                    showLeft={statusIdx > 0}
                    showRight={statusIdx < MAIN_STATUSES.length - 1}
                    onSelectOrder={onSelectOrder}
                    moveLeft={moveLeft}
                    moveRight={moveRight}
                    canViewPrices={canViewPrices}
                    statusColors={statusColors}
                    designerColors={designerColors}
                    workerColors={workerColors}
                    layoutOptions={layoutOptions}
                    sourceOptions={sourceOptions}
                  />
                ))}
              </DroppableColumn>
            );
          })}
        </div>
        <DragOverlay>
          {activeOrder ? (
            <div style={{ background: "#fff", borderRadius: 8, padding: 12, border: "2px solid #1677ff", boxShadow: "0 4px 16px rgba(0,0,0,0.15)", maxWidth: 280, opacity: 0.9 }}>
              <Typography.Text strong style={{ fontSize: 13 }} ellipsis>
                {(() => { let d = activeOrder.description; if (d?.trim().startsWith("{")) try { d = JSON.parse(d).text; } catch {} return d || (activeOrder.items?.length ? activeOrder.items.map((i) => i.product_name || `#${i.product_id}`).join(", ") : `Заказ #${activeOrder.id}`); })()}
              </Typography.Text>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </>
  );
}
