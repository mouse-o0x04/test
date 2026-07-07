import { AppstoreOutlined, CopyOutlined, DeleteOutlined, EditOutlined, ExclamationCircleOutlined, HistoryOutlined, PlusOutlined, UnorderedListOutlined, PrinterOutlined, PrinterFilled, CheckSquareOutlined, SwapRightOutlined, PlusCircleOutlined } from "@ant-design/icons";
import {
  Button,
  Checkbox,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Progress,
  Select,
  Space,
  Spin,
  Table,
  Timeline,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useCallback, useMemo, useState } from "react";
import OrderForm from "../components/OrderForm";
import { getOrderSettings } from "../api/orderSettings";
import { runDisplayScript } from "../api/scripts";
import { deleteOrder, getOrderHistory, getOrders, saveItemAsProduct, setProcessingMethod, toggleItemCompleted, toggleItemPrinted, updateOrder, bulkDeleteOrders } from "../api/orders";
import { getRawMaterials } from "../api/rawMaterials";
import { getWarehouseItems } from "../api/warehouse";
import ColumnSettings from "../components/ColumnSettings";
import KanbanBoard from "../components/KanbanBoard";
import { textFilter, numberFilter, selectFilter, dateRangeFilter } from "../components/TableFilters";
import { useAuth } from "../hooks/useAuth";
import { useColumnSettings } from "../hooks/useColumnSettings";
import { useEntityFilters } from "../hooks/useEntityFilters";
import { useViewMode } from "../hooks/useViewMode";
import type { Order, OrderFormData, OrderHistoryItem, OrderItem, OrderSettingsItem, User } from "../types";
import { ORDER_STATUSES } from "../types";
import { toSortOrder } from "../utils/sort";

const statusLabels: Record<string, string> = {
  new: "Новый", in_progress: "В работе", ready: "Готов", delivered: "Отдали",
};

function useDisplayFormat(scriptName: string | undefined, data: Record<string, unknown>) {
  const enabled = !!scriptName;
  const { data: result } = useQuery({
    queryKey: ["displayFormat", scriptName, data],
    queryFn: () => runDisplayScript(scriptName!, data).then((r) => r.result),
    enabled,
    staleTime: 60_000,
  });
  return enabled ? result : null;
}

interface OrderRow extends Order {}

interface GroupedMaterial {
  name: string;
  totalMeters: number;
  rollLength: number;
  isRoll: boolean;
  displayFormatScript?: string;
  items: OrderItem[];
}

function GroupedMaterialDisplay({ rmId, info }: { rmId: string; info: GroupedMaterial }) {
  const total = info.totalMeters;

  if (!info.isRoll || info.rollLength <= 0) {
    return (
      <div key={rmId} style={{ padding: "6px 12px", background: "#f6f8fa", borderRadius: 6, marginBottom: 6, fontSize: 13 }}>
        <b>{info.name}</b>: списано {total} ед.
      </div>
    );
  }

  const rollsTaken = Math.ceil(total / info.rollLength);
  const remaining = Number((rollsTaken * info.rollLength - total).toFixed(2));
  const remainingRolls = Math.floor(remaining / info.rollLength);
  const remainingMeters = Number((remaining % info.rollLength).toFixed(2));
  const productLabels = info.items.map((item) => {
    const name = item.product_name || "Продукт";
    const size = item.cut_width_mm && item.cut_height_mm ? ` (${item.cut_width_mm}×${item.cut_height_mm})` : "";
    return `${name}${size}`;
  });
  const uniqueLabels = [...new Set(productLabels)];
  const rollLabel = (n: number) => n === 1 ? "рулон" : n >= 2 && n <= 4 ? "рулона" : "рулонов";

  const scriptData = { totalMeters: total, rollLength: info.rollLength, rolls: rollsTaken, leftover: remaining, materialName: info.name, productLabels: uniqueLabels };
  const scriptResult = useDisplayFormat(info.displayFormatScript, scriptData);

  if (scriptResult) {
    return (
      <div key={rmId} style={{ padding: "6px 12px", background: "#f6f8fa", borderRadius: 6, marginBottom: 6, fontSize: 13 }}>
        <b>{info.name}</b>: <span>{scriptResult.main}</span>
        <span style={{ color: "#999" }}> — {scriptResult.sub}</span>
      </div>
    );
  }

  return (
    <div key={rmId} style={{ padding: "6px 12px", background: "#f6f8fa", borderRadius: 6, marginBottom: 6, fontSize: 13 }}>
      <b>{info.name}</b>:{" "}
      <span>Было {rollsTaken} {rollLabel(rollsTaken)}</span>
      {uniqueLabels.length > 0 && <span>, после {uniqueLabels.join(", ")}</span>}
      <span>, стало {remainingRolls > 0 ? `${remainingRolls} ${rollLabel(remainingRolls)} ` : ""}{remainingMeters} м</span>
    </div>
  );
}

function parsePaths(raw: string | undefined): string[] {
  if (!raw) return [];
  const parts = raw.split("\n").map((s) => s.trim()).filter(Boolean);
  const expanded: string[] = [];
  for (const part of parts) {
    const subParts = part.split(/(?=\\\\)/).filter(Boolean);
    expanded.push(...subParts);
  }
  return expanded;
}

function fallbackCopy(text: string): boolean {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(ta);
  return ok;
}

function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(
      () => message.success("Скопировано"),
      () => {
        fallbackCopy(text) ? message.success("Скопировано") : message.error("Не удалось скопировать");
      },
    );
  } else {
    fallbackCopy(text) ? message.success("Скопировано") : message.error("Не удалось скопировать");
  }
}

const ALL_ORDER_COLUMNS = [
  { key: "id", title: "ID", alwaysShow: true },
  { key: "client", title: "Клиент", alwaysShow: true },
  { key: "description", title: "Описание" },
  { key: "total_price", title: "Сумма" },
  { key: "status", title: "Статус", alwaysShow: true },
  { key: "deadline", title: "Дедлайн" },
  { key: "designer", title: "Дизайнер" },
  { key: "workers", title: "Работники" },
  { key: "layout", title: "Макет" },
  { key: "path", title: "Путь" },
  { key: "source", title: "Где" },
  { key: "actions", title: "Действия", alwaysShow: true },
];

export default function OrdersPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  const [viewMode, setViewMode] = useViewMode("orders", "kanban");
  const [detailOrder, setDetailOrder] = useState<OrderRow | null>(null);
  const { user, hasPermission } = useAuth();
  const canViewPrices = hasPermission("prices.view");
  const canEditOrders = hasPermission("orders.edit");
  const colSettings = useColumnSettings("orders", ALL_ORDER_COLUMNS);

  const entityFilters = useEntityFilters("orders");
  const [editingStatusId, setEditingStatusId] = useState<number | null>(null);
  const [editingWorkersId, setEditingWorkersId] = useState<number | null>(null);
  const [editingDesignerId, setEditingDesignerId] = useState<number | null>(null);
  const [editingLayoutId, setEditingLayoutId] = useState<number | null>(null);
  const [editingSourceId, setEditingSourceId] = useState<number | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  const { data: orders, isLoading } = useQuery({ queryKey: ["orders"], queryFn: getOrders, refetchInterval: 15000 });
  const { data: rawMaterials } = useQuery({ queryKey: ["rawMaterials"], queryFn: getRawMaterials });
  const { data: warehouseItems } = useQuery({ queryKey: ["warehouse"], queryFn: getWarehouseItems });

  const { data: designerColors } = useQuery({ queryKey: ["orderSettings", "designer_color"], queryFn: () => getOrderSettings("designer_color") });
  const { data: workerColors } = useQuery({ queryKey: ["orderSettings", "worker_color"], queryFn: () => getOrderSettings("worker_color") });
  const { data: layoutOptions } = useQuery({ queryKey: ["orderSettings", "layout"], queryFn: () => getOrderSettings("layout") });
  const { data: sourceOptions } = useQuery({ queryKey: ["orderSettings", "source"], queryFn: () => getOrderSettings("source") });
  const { data: statusColors } = useQuery({ queryKey: ["orderSettings", "status_color"], queryFn: () => getOrderSettings("status_color") });

  const { data: orderHistory, refetch: refetchHistory } = useQuery<OrderHistoryItem[]>({
    queryKey: ["orderHistory", detailOrder?.id],
    queryFn: () => getOrderHistory(detailOrder!.id),
    enabled: !!detailOrder,
  });

  const getColor = (settings: OrderSettingsItem[] | undefined, name: string): string => {
    return settings?.find((s) => s.name === name)?.color || "#1677ff";
  };

  const deleteMutation = useMutation({
    mutationFn: deleteOrder,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["orders"] }); queryClient.invalidateQueries({ queryKey: ["writeoffs"] }); message.success("Заказ удалён"); },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: bulkDeleteOrders,
    onSuccess: (data) => { queryClient.invalidateQueries({ queryKey: ["orders"] }); queryClient.invalidateQueries({ queryKey: ["writeoffs"] }); message.success(`Удалено: ${data.deleted}`); setSelectedRowKeys([]); },
    onError: () => message.error("Ошибка удаления"),
  });

  const moveMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => updateOrder(id, { status }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["orders"] }); queryClient.invalidateQueries({ queryKey: ["writeoffs"] }); refetchHistory(); },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => updateOrder(id, { status }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["orders"] }); queryClient.invalidateQueries({ queryKey: ["writeoffs"] }); message.success("Статус обновлён"); },
    onError: (err: { response?: { data?: { detail?: string } } }) => { message.error(err.response?.data?.detail || "Ошибка"); },
  });

  const workersMutation = useMutation({
    mutationFn: ({ id, workers }: { id: number; workers: string[] }) => updateOrder(id, { workers }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["orders"] }); message.success("Работники обновлены"); },
    onError: (err: { response?: { data?: { detail?: string } } }) => { message.error(err.response?.data?.detail || "Ошибка"); },
  });

  const designerMutation = useMutation({
    mutationFn: ({ id, designer }: { id: number; designer: string }) => updateOrder(id, { designer }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["orders"] }); message.success("Дизайнер обновлён"); },
    onError: (err: { response?: { data?: { detail?: string } } }) => { message.error(err.response?.data?.detail || "Ошибка"); },
  });

  const layoutMutation = useMutation({
    mutationFn: ({ id, layout_type }: { id: number; layout_type: string }) => updateOrder(id, { layout_type }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["orders"] }); message.success("Макет обновлён"); },
    onError: (err: { response?: { data?: { detail?: string } } }) => { message.error(err.response?.data?.detail || "Ошибка"); },
  });

  const sourceMutation = useMutation({
    mutationFn: ({ id, source }: { id: number; source: string }) => updateOrder(id, { source }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["orders"] }); message.success("Где обновлено"); },
    onError: (err: { response?: { data?: { detail?: string } } }) => { message.error(err.response?.data?.detail || "Ошибка"); },
  });

  const processingMethodMutation = useMutation({
    mutationFn: ({ orderId, itemId, processingMethod }: { orderId: number; itemId: number; processingMethod: string }) => setProcessingMethod(orderId, itemId, processingMethod),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      setDetailOrder((prev) => prev ? { ...prev, ...data } : null);
      message.success("Способ обработки обновлён");
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => { message.error(err.response?.data?.detail || "Ошибка"); },
  });

  const toggleItemMutation = useMutation({
    mutationFn: ({ orderId, itemId }: { orderId: number; itemId: number }) => toggleItemCompleted(orderId, itemId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      setDetailOrder((prev) => prev ? { ...prev, ...data } : null);
      refetchHistory();
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      message.error(err.response?.data?.detail || "Ошибка");
    },
  });

  const printedItemMutation = useMutation({
    mutationFn: ({ orderId, itemId }: { orderId: number; itemId: number }) => toggleItemPrinted(orderId, itemId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      setDetailOrder((prev) => prev ? { ...prev, ...data } : null);
      refetchHistory();
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      message.error(err.response?.data?.detail || "Ошибка");
    },
  });

  const saveAsProductMutation = useMutation({
    mutationFn: ({ orderId, itemId }: { orderId: number; itemId: number }) => saveItemAsProduct(orderId, itemId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setDetailOrder((prev) => prev ? { ...prev, ...data } : null);
      message.success("Продукт сохранён в каталог");
    },
  });

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (order: Order) => {
    setEditing(order);
    setModalOpen(true);
  };

  const handleMoveOrder = (orderId: number, newStatus: string) => {
    moveMutation.mutate({ id: orderId, status: newStatus });
  };

  const statusTagColors: Record<string, string> = { new: "blue", in_progress: "orange", ready: "green", delivered: "default" };

  const rows: OrderRow[] = useMemo(() => {
    return (orders ?? []).map((o) => ({ ...o }));
  }, [orders]);

  const filteredData = (() => {
    let data = rows.filter((o) => {
      if (entityFilters.search) {
        const q = entityFilters.search.toLowerCase();
        const desc = o.description?.toLowerCase() || "";
        if (!o.client_name?.toLowerCase().includes(q) && !desc.includes(q) && !o.status?.toLowerCase().includes(q) && !String(o.id).includes(q)) return false;
      }
      const f = entityFilters.filters;
      if (f.status && (f.status as string[]).length > 0 && !(f.status as string[]).includes(o.status)) return false;
      if (f.client && (f.client as string[]).length > 0 && !(f.client as string[]).includes(o.client_name || "")) return false;
      if (f.designer && (f.designer as string[]).length > 0 && !(f.designer as string[]).includes(o.designer || "")) return false;
      if (f.workers && (f.workers as string[]).length > 0 && (!Array.isArray(o.workers) || !(f.workers as string[]).some((w) => o.workers!.includes(w)))) return false;
      if (f.source && (f.source as string[]).length > 0 && !(f.source as string[]).includes(o.source || "")) return false;
      if (f.total_price && (f.total_price as string[]).length > 0) {
        const str = String((f.total_price as string[])[0]);
        const [minStr, maxStr] = str.split(",");
        if (minStr && o.total_price < Number(minStr)) return false;
        if (maxStr && o.total_price > Number(maxStr)) return false;
      }
      if (f.deadline && (f.deadline as string[]).length > 0) {
        const str = String((f.deadline as string[])[0]);
        const [fromStr, toStr] = str.split(",");
        if (!o.deadline) return false;
        const date = dayjs(o.deadline);
        if (fromStr && date.isBefore(dayjs(fromStr).startOf("day"))) return false;
        if (toStr && date.isAfter(dayjs(toStr).endOf("day"))) return false;
      }
      return true;
    });
    if (entityFilters.sortField && entityFilters.sortDirection) {
      const dir = entityFilters.sortDirection === "asc" ? 1 : -1;
      data = [...data].sort((a, b) => {
        const av = a[entityFilters.sortField as keyof OrderRow];
        const bv = b[entityFilters.sortField as keyof OrderRow];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
        if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
        return 0;
      });
    }
    return data;
  })();

  const clientNames = [...new Set((orders ?? []).map((o) => o.client_name).filter(Boolean))];

  const renderPathCell = (path: string | undefined) => {
    if (!path) return "—";
    const paths = parsePaths(path);
    if (paths.length === 0) return "—";
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {paths.map((p, i) => (
          <Tooltip key={i} title="Нажмите, чтобы скопировать">
            <Typography.Link
              onClick={(e) => { e.stopPropagation(); copyToClipboard(p); }}
              style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}
            >
              <CopyOutlined style={{ fontSize: 10 }} />
              {p.length > 35 ? `...${p.slice(-32)}` : p}
            </Typography.Link>
          </Tooltip>
        ))}
      </div>
    );
  };

  const renderDescription = (record: OrderRow) => {
    if (record.description) return <Typography.Text ellipsis style={{ maxWidth: 280 }}>{record.description}</Typography.Text>;
    if (record.items?.length) {
      const parts = record.items.map((i) => `${i.product_name || `#${i.product_id}`} × ${i.quantity}${i.product_unit ? " " + i.product_unit : ""}`);
      return <Typography.Text ellipsis style={{ maxWidth: 280 }}>{parts.join(", ")}</Typography.Text>;
    }
    return "—";
  };

  const baseColumns = useMemo(() => {
    const saveClientFilter = (value: string[]) => entityFilters.updateFilters({ ...entityFilters.filters, client: value.length ? value : undefined });
    const savePriceFilter = (value: string[]) => entityFilters.updateFilters({ ...entityFilters.filters, total_price: value.length ? value : undefined });
    const saveStatusFilter = (value: string[]) => entityFilters.updateFilters({ ...entityFilters.filters, status: value.length ? value : undefined });
    const saveDeadlineFilter = (value: string[]) => entityFilters.updateFilters({ ...entityFilters.filters, deadline: value.length ? value : undefined });
    const saveDesignerFilter = (value: string[]) => entityFilters.updateFilters({ ...entityFilters.filters, designer: value.length ? value : undefined });
    const saveWorkersFilter = (value: string[]) => entityFilters.updateFilters({ ...entityFilters.filters, workers: value.length ? value : undefined });
    const saveSourceFilter = (value: string[]) => entityFilters.updateFilters({ ...entityFilters.filters, source: value.length ? value : undefined });
    const saveLayoutFilter = (value: string[]) => entityFilters.updateFilters({ ...entityFilters.filters, layout: value.length ? value : undefined });

    const selectFilterDropdown = (options: { text: string; value: string | number | boolean }[], onSave: (value: string[]) => void) => ({
      filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }: { setSelectedKeys: (keys: React.Key[]) => void; selectedKeys: React.Key[]; confirm: () => void; clearFilters?: () => void }) => (
        <div style={{ padding: 8 }}>
          <div style={{ maxHeight: 200, overflowY: "auto", marginBottom: 8 }}>
            {options.map((o) => {
              const val = String(o.value);
              return (
                <div key={val} style={{ padding: "4px 8px", cursor: "pointer", borderRadius: 4, background: selectedKeys.includes(val) ? "#e6f4ff" : undefined }}
                  onClick={() => {
                    const newKeys = selectedKeys.includes(val) ? selectedKeys.filter((k) => k !== val) : [...selectedKeys, val];
                    setSelectedKeys(newKeys);
                  }}>
                  <Checkbox checked={selectedKeys.includes(val)}>{o.text}</Checkbox>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => { onSave(selectedKeys as string[]); confirm(); }} style={{ background: "#1677ff", color: "#fff", border: "none", borderRadius: 4, padding: "4px 12px", cursor: "pointer" }}>OK</button>
            <button onClick={() => { onSave([]); clearFilters?.(); confirm(); }} style={{ border: "1px solid #d9d9d9", borderRadius: 4, padding: "4px 12px", cursor: "pointer" }}>Сброс</button>
          </div>
        </div>
      ),
    });

    const cols = [
      { title: "ID", dataIndex: "id", key: "id", width: 60, sorter: (a: OrderRow, b: OrderRow) => a.id - b.id, sortOrder: toSortOrder(entityFilters.sortField, "id", entityFilters.sortDirection) },
      { title: "Клиент", dataIndex: "client_name", key: "client", ...textFilter<OrderRow>("client_name", "Клиент", saveClientFilter), filters: clientNames.map((n) => ({ text: n!, value: n! })), ...selectFilterDropdown(clientNames.map((n) => ({ text: n || "", value: n || "" })), saveClientFilter), sorter: (a: OrderRow, b: OrderRow) => (a.client_name || "").localeCompare(b.client_name || ""), filteredValue: (entityFilters.filters["client"] as string[]) ?? null, sortOrder: toSortOrder(entityFilters.sortField, "client", entityFilters.sortDirection) },
      { title: "Описание", key: "description", render: (_: unknown, record: OrderRow) => renderDescription(record), width: 300 },
      ...(canViewPrices ? [{ title: "Сумма", dataIndex: "total_price", key: "total_price", render: (v: number) => `${v.toLocaleString()} ₽`, ...numberFilter<OrderRow>("total_price", { onApply: savePriceFilter }), sorter: (a: OrderRow, b: OrderRow) => a.total_price - b.total_price, filteredValue: (entityFilters.filters["total_price"] as string[]) ?? null, sortOrder: toSortOrder(entityFilters.sortField, "total_price", entityFilters.sortDirection) }] : []),
      { title: "Статус", dataIndex: "status", key: "status", width: 150, ...selectFilter<OrderRow>("status", ORDER_STATUSES.map((s) => ({ text: statusLabels[s] || s, value: s }))), ...selectFilterDropdown(ORDER_STATUSES.map((s) => ({ text: statusLabels[s] || s, value: s })), saveStatusFilter), render: (_: string, record: OrderRow) => {
        if (editingStatusId === record.id) {
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <Select
                value={record.status}
                size="small"
                style={{ width: 140 }}
                options={ORDER_STATUSES.map((s) => ({ label: statusLabels[s] || s, value: s }))}
                autoFocus
                open
                onChange={(val) => {
                  statusMutation.mutate({ id: record.id, status: val });
                  setEditingStatusId(null);
                }}
                onBlur={() => setEditingStatusId(null)}
              />
            </div>
          );
        }
        return (
          <Tag color={statusTagColors[record.status] || "default"} style={{ margin: 0, cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); setEditingStatusId(record.id); }}>
            {statusLabels[record.status] || record.status}
          </Tag>
        );
      }, filteredValue: (entityFilters.filters["status"] as string[]) ?? null },
      { title: "Дедлайн", dataIndex: "deadline", key: "deadline", ...dateRangeFilter<OrderRow>("deadline", saveDeadlineFilter), render: (v: string) => (v ? dayjs(v).format("DD.MM.YYYY") : "-"), sorter: (a: OrderRow, b: OrderRow) => (a.deadline || "").localeCompare(b.deadline || ""), filteredValue: (entityFilters.filters["deadline"] as string[]) ?? null, sortOrder: toSortOrder(entityFilters.sortField, "deadline", entityFilters.sortDirection) },
      {
        title: "Дизайнер", dataIndex: "designer", key: "designer",
        filters: (designerColors ?? []).map((d) => ({ text: d.name, value: d.name })),
        ...selectFilterDropdown((designerColors ?? []).map((d) => ({ text: d.name, value: d.name })), saveDesignerFilter),
        render: (v: string, record: OrderRow) => {
          if (editingDesignerId === record.id) {
            return (
              <div onClick={(e) => e.stopPropagation()}>
                <Select
                  value={v || undefined}
                  size="small"
                  style={{ width: 180 }}
                  options={(designerColors ?? []).map((d) => ({ label: d.name, value: d.name }))}
                  autoFocus
                  open
                  onChange={(val) => {
                    designerMutation.mutate({ id: record.id, designer: val || "" });
                    setEditingDesignerId(null);
                  }}
                  onBlur={() => setEditingDesignerId(null)}
                  tagRender={({ label, closable, onClose }) => (
                    <Tag color={getColor(designerColors, label as string)} closable={closable} onClose={onClose} style={{ marginRight: 3 }}>
                      {label}
                    </Tag>
                  )}
                />
              </div>
            );
          }
          return v ? (
            <Tag color={getColor(designerColors, v)} style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); setEditingDesignerId(record.id); }}>
              {v}
            </Tag>
          ) : (
            <Tag style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); setEditingDesignerId(record.id); }}>
              + Добавить
            </Tag>
          );
        },
        filteredValue: (entityFilters.filters["designer"] as string[]) ?? null,
      },
      {
        title: "Работники", dataIndex: "workers", key: "workers",
        filters: (workerColors ?? []).map((w) => ({ text: w.name, value: w.name })),
        ...selectFilterDropdown((workerColors ?? []).map((w) => ({ text: w.name, value: w.name })), saveWorkersFilter),
        render: (v: string[], record: OrderRow) => {
          if (editingWorkersId === record.id) {
            return (
              <div onClick={(e) => e.stopPropagation()}>
                <Select
                  mode="multiple"
                  value={v || []}
                  size="small"
                  style={{ width: 250 }}
                  options={(workerColors ?? []).map((w) => ({ label: w.name, value: w.name }))}
                  autoFocus
                  open
                  onChange={(val) => {
                    workersMutation.mutate({ id: record.id, workers: val });
                    setEditingWorkersId(null);
                  }}
                  onBlur={() => setEditingWorkersId(null)}
                  tagRender={({ label, closable, onClose }) => (
                    <Tag color={getColor(workerColors, label as string)} closable={closable} onClose={onClose} style={{ marginRight: 3 }}>
                      {label}
                    </Tag>
                  )}
                />
              </div>
            );
          }
          return (
            <Space size={2} wrap>
              {v?.length ? v.map((w) => (
                <Tag key={w} color={getColor(workerColors, w)} style={{ margin: 0, cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); setEditingWorkersId(record.id); }}>
                  {w}
                </Tag>
              )) : (
                <Tag style={{ margin: 0, cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); setEditingWorkersId(record.id); }}>
                  + Добавить
                </Tag>
              )}
            </Space>
          );
        },
        filteredValue: (entityFilters.filters["workers"] as string[]) ?? null,
      },
      {
        title: "Макет", dataIndex: "layout_type", key: "layout_type",
        filters: (layoutOptions ?? []).map((l) => ({ text: l.name, value: l.name })),
        ...selectFilterDropdown((layoutOptions ?? []).map((l) => ({ text: l.name, value: l.name })), saveLayoutFilter),
        render: (v: string, record: OrderRow) => {
          if (editingLayoutId === record.id) {
            return (
              <div onClick={(e) => e.stopPropagation()}>
                <Select
                  allowClear
                  value={v || undefined}
                  size="small"
                  style={{ width: 160 }}
                  options={(layoutOptions ?? []).map((l) => ({ label: l.name, value: l.name }))}
                  autoFocus
                  open
                  onChange={(val) => {
                    layoutMutation.mutate({ id: record.id, layout_type: val || "" });
                    setEditingLayoutId(null);
                  }}
                  onBlur={() => setEditingLayoutId(null)}
                />
              </div>
            );
          }
          const displayName = v || layoutOptions?.[0]?.name || "";
          const color = getColor(layoutOptions, displayName);
          return (
            <span
              style={{ display: "inline-block", padding: "1px 8px", borderRadius: 4, fontSize: 12, cursor: "pointer", background: (color || "#1677ff") + "18", color: color || "#1677ff", border: `1px solid ${color || "#1677ff"}40`, lineHeight: "22px" }}
              onClick={(e) => { e.stopPropagation(); setEditingLayoutId(record.id); }}
            >
              {displayName || "+ Добавить"}
            </span>
          );
        },
        filteredValue: (entityFilters.filters["layout"] as string[]) ?? null,
      },
      { title: "Путь", dataIndex: "path", key: "path", render: (v: string) => renderPathCell(v) },
      {
        title: "Где", dataIndex: "source", key: "source",
        filters: (sourceOptions ?? []).map((s) => ({ text: s.name, value: s.name })),
        ...selectFilterDropdown((sourceOptions ?? []).map((s) => ({ text: s.name, value: s.name })), saveSourceFilter),
        render: (v: string, record: OrderRow) => {
          if (editingSourceId === record.id) {
            return (
              <div onClick={(e) => e.stopPropagation()}>
                <Select
                  allowClear
                  value={v || undefined}
                  size="small"
                  style={{ width: 160 }}
                  options={(sourceOptions ?? []).map((s) => ({ label: s.name, value: s.name }))}
                  autoFocus
                  open
                  onChange={(val) => {
                    sourceMutation.mutate({ id: record.id, source: val || "" });
                    setEditingSourceId(null);
                  }}
                  onBlur={() => setEditingSourceId(null)}
                />
              </div>
            );
          }
          const color = getColor(sourceOptions, v);
          return (
            <span
              style={{ display: "inline-block", padding: "1px 8px", borderRadius: 4, fontSize: 12, cursor: "pointer", background: color + "18", color, border: `1px solid ${color}40`, lineHeight: "22px" }}
              onClick={(e) => { e.stopPropagation(); setEditingSourceId(record.id); }}
            >
              {v || "+ Добавить"}
            </span>
          );
        },
        filteredValue: (entityFilters.filters["source"] as string[]) ?? null,
      },
    ];
    return cols.filter(Boolean) as typeof cols[number][];
  }, [entityFilters.filters, entityFilters.sortField, entityFilters.sortDirection, clientNames, canViewPrices, designerColors, workerColors, layoutOptions, sourceOptions, statusTagColors, renderDescription, renderPathCell, editingDesignerId, editingLayoutId, editingSourceId]);

  const actionColumn = {
    title: "Действия", key: "actions", width: 160,
    render: (_: unknown, record: OrderRow) => (
      <Space onClick={(e) => e.stopPropagation()}>
        <Button type="link" onClick={(e) => { e.stopPropagation(); openEdit(record); }}>Редактировать</Button>
        <Popconfirm title="Удалить заказ?" onConfirm={() => deleteMutation.mutate(record.id)}>
          <Button type="link" danger>Удалить</Button>
        </Popconfirm>
      </Space>
    ),
  };

  const columns = useMemo(() => {
    const colMap = new Map<string, typeof baseColumns[number]>();
    for (const col of baseColumns) {
      colMap.set(String(col.key), col);
    }
    colMap.set("actions", actionColumn);
    const keys = colSettings.orderedVisibleKeys.map(String);
    const ordered = keys
      .map((k) => {
        if (k === "total_price" && !canViewPrices) return null;
        return colMap.get(k) || null;
      })
      .filter(Boolean) as typeof baseColumns[number][];
    return ordered;
  }, [colSettings.orderedVisibleKeys, baseColumns, canViewPrices, actionColumn]);

  return (
    <>
      <div className="nc-toolbar" style={{ borderBottom: "1px solid #e5e7eb" }}>
        <div className="nc-toolbar-left">
          <Input.Search placeholder="Поиск..." allowClear value={entityFilters.search} onChange={(e) => entityFilters.updateSearch(e.target.value)} style={{ width: 250 }} size="small" />
          <button className={`nc-toolbar-btn ${viewMode === "kanban" ? "active" : ""}`} onClick={() => setViewMode("kanban")}>
            <AppstoreOutlined /> Канбан
          </button>
          <button className={`nc-toolbar-btn ${viewMode === "table" ? "active" : ""}`} onClick={() => setViewMode("table")}>
            <UnorderedListOutlined /> Таблица
          </button>
          {viewMode === "table" && (
            <ColumnSettings
              columns={ALL_ORDER_COLUMNS}
              isVisible={colSettings.isVisible}
              toggle={colSettings.toggle}
              moveUp={colSettings.moveUp}
              moveDown={colSettings.moveDown}
              reset={colSettings.reset}
              order={colSettings.state.order}
            />
          )}
        </div>
        <div className="nc-toolbar-right">
          {selectedRowKeys.length > 0 && (
            <Popconfirm title={`Удалить ${selectedRowKeys.length} ${selectedRowKeys.length === 1 ? "заказ" : "заказов"}?`} onConfirm={() => bulkDeleteMutation.mutate(selectedRowKeys as number[])}>
              <button className="nc-toolbar-btn" style={{ borderColor: "#ff4d4f", color: "#ff4d4f" }}>
                <DeleteOutlined /> Удалить ({selectedRowKeys.length})
              </button>
            </Popconfirm>
          )}
          <button className="nc-toolbar-btn primary" onClick={openCreate}>
            <PlusOutlined /> Заказ
          </button>
        </div>
      </div>

      {viewMode === "table" ? (
        <Table
          dataSource={filteredData}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `Всего: ${t}` }}
          size="small"
          scroll={{ x: "max-content" }}
          rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
          onChange={(_pagination, _filters, sorter) => {
            if (!entityFilters.loaded) return;
            const s = Array.isArray(sorter) ? sorter[0] : sorter;
            if (s && s.columnKey && s.order) {
              entityFilters.updateSort(s.columnKey as string, s.order === "ascend" ? "asc" : "desc");
            } else if (s && !s.order) {
              entityFilters.updateSort(null, "asc");
            }
          }}
          onRow={(record) => ({
            onClick: (e) => {
              if ((e.target as HTMLElement).closest("button, .ant-btn, .ant-popconfirm, .ant-popover")) return;
              setDetailOrder(record);
            },
            style: { cursor: "pointer" },
          })}
        />
      ) : (
        <Spin spinning={isLoading}>
          {filteredData.length === 0 && !isLoading ? (
            <Empty description="Нет заказов" style={{ margin: "40px 0" }} />
          ) : (
            <KanbanBoard
              orders={filteredData}
              onMoveOrder={handleMoveOrder}
              onSelectOrder={(order) => setDetailOrder(order)}
              designerColors={designerColors}
              workerColors={workerColors}
              layoutOptions={layoutOptions}
              sourceOptions={sourceOptions}
              statusColors={statusColors}
            />
          )}
        </Spin>
      )}

      <OrderForm
        open={modalOpen}
        editing={editing}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSuccess={() => {}}
      />

      <Drawer
        title={`Заказ #${detailOrder?.id || ""}`}
        open={!!detailOrder}
        onClose={() => setDetailOrder(null)}
        width={800}
        extra={
          detailOrder && (
            <Space>
              <Button onClick={() => { setDetailOrder(null); openEdit(detailOrder); }}>Редактировать</Button>
            </Space>
          )
        }
      >
        {detailOrder && (
          <>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Клиент">{detailOrder.client_name || `#${detailOrder.client_id}`}</Descriptions.Item>
              <Descriptions.Item label="Статус">
                <Tag color={statusTagColors[detailOrder.status] || "default"}>{statusLabels[detailOrder.status] || detailOrder.status}</Tag>
              </Descriptions.Item>
              {canViewPrices && (
                <Descriptions.Item label="Сумма">
                  <Typography.Text strong style={{ fontSize: 16, color: "#1677ff" }}>{detailOrder.total_price.toLocaleString()} ₽</Typography.Text>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Дедлайн">
                {detailOrder.deadline ? dayjs(detailOrder.deadline).format("DD.MM.YYYY") : "—"}
              </Descriptions.Item>
              {detailOrder.description && (
                <Descriptions.Item label="Описание">
                  <div style={{ whiteSpace: "pre-line" }}>{detailOrder.description}</div>
                </Descriptions.Item>
              )}
              {detailOrder.notes && (
                <Descriptions.Item label="Примечания">{detailOrder.notes}</Descriptions.Item>
              )}
              {detailOrder.designer && (
                <Descriptions.Item label="Дизайнер">
                  <Tag color={getColor(designerColors, detailOrder.designer)}>{detailOrder.designer}</Tag>
                </Descriptions.Item>
              )}
              {detailOrder.workers && detailOrder.workers.length > 0 && (
                <Descriptions.Item label="Работники">
                  {detailOrder.workers.map((w) => <Tag key={w} color={getColor(workerColors, w)}>{w}</Tag>)}
                </Descriptions.Item>
              )}
              {detailOrder.layout_type && (
                <Descriptions.Item label="Макет">
                  <Tag color={getColor(layoutOptions, detailOrder.layout_type)}>{detailOrder.layout_type}</Tag>
                </Descriptions.Item>
              )}
              {detailOrder.source && (
                <Descriptions.Item label="Где">
                  <Tag color={getColor(sourceOptions, detailOrder.source)}>{detailOrder.source}</Tag>
                </Descriptions.Item>
              )}
              {detailOrder.path && (
                <Descriptions.Item label="Путь">
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {parsePaths(detailOrder.path).map((p, i) => (
                      <Tooltip key={i} title="Нажмите, чтобы скопировать">
                        <Typography.Link
                          onClick={() => copyToClipboard(p)}
                          style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}
                        >
                          <CopyOutlined style={{ fontSize: 10 }} />
                          {p}
                        </Typography.Link>
                      </Tooltip>
                    ))}
                  </div>
                </Descriptions.Item>
              )}
            </Descriptions>

            <Divider style={{ margin: "16px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Space>
                <Typography.Text strong>Продукты</Typography.Text>
                <Tooltip title="Скопировать наименование, количество и цену всех продуктов">
                  <Button
                    size="small"
                    type="text"
                    icon={<CopyOutlined />}
                    onClick={() => {
                      const lines = detailOrder.items.map((i) => {
                        const name = i.product_name || `#${i.product_id}`;
                        const price = canViewPrices ? `\t${i.unit_price}` : "";
                        return `${name}\t${i.quantity}${price}`;
                      });
                      copyToClipboard(lines.join("\n"));
                    }}
                  />
                </Tooltip>
              </Space>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {detailOrder.items.filter((i) => i.is_completed).length} / {detailOrder.items.length} выполнено
              </Typography.Text>
            </div>
            <Progress
              percent={detailOrder.progress}
              status={detailOrder.progress === 100 ? "success" : "active"}
              style={{ marginBottom: 12 }}
              size="small"
            />
            <Table
              dataSource={detailOrder.items}
              rowKey="id"
              pagination={false}
              size="small"
              columns={[
                {
                  title: "", key: "check", width: 40,
                  render: (_: unknown, r: OrderItem) => {
                    const needsProcessing = !!(r.is_custom && (r.raw_material_id || (r.raw_materials && r.raw_materials.length > 0)) && !r.processing_method);
                    return (
                      <Tooltip title={needsProcessing ? "Сначала выберите способ обработки" : ""}>
                        <Checkbox
                          checked={r.is_completed}
                          disabled={needsProcessing}
                          onChange={() => toggleItemMutation.mutate({ orderId: detailOrder.id, itemId: r.id })}
                        />
                      </Tooltip>
                    );
                  },
                },
                {
                  title: <PrinterOutlined />, key: "printed", width: 40,
                  render: (_: unknown, r: OrderItem) => (
                    <Tooltip title={r.is_printed ? "Напечатан" : "Не напечатан"}>
                      <Checkbox
                        checked={r.is_printed}
                        disabled={r.is_completed}
                        onChange={() => printedItemMutation.mutate({ orderId: detailOrder.id, itemId: r.id })}
                      />
                    </Tooltip>
                  ),
                },
                {
                  title: "Продукт", dataIndex: "product_name", width: 280, ellipsis: true,
                  render: (v: string, r: OrderItem) => (
                    <div>
                      <Space size={4}>
                        <Typography.Text delete={r.is_completed} type={r.is_completed ? "secondary" : undefined} ellipsis style={{ maxWidth: 180 }}>
                          {v || `#${r.product_id}`}
                        </Typography.Text>
                        {r.is_printed && !r.is_completed && (
                          <Tag color="orange" style={{ margin: 0, fontSize: 11, flexShrink: 0 }}>Напечатан</Tag>
                        )}
                        {r.is_custom && (
                          <Tooltip title="Сохранить как продукт в каталоге">
                            <Button type="link" size="small" style={{ margin: 0, padding: 0, fontSize: 11 }} onClick={() => saveAsProductMutation.mutate({ orderId: detailOrder.id, itemId: r.id })}>
                              в каталог
                            </Button>
                          </Tooltip>
                        )}
                        {r.is_custom && r.raw_materials && r.raw_materials.length > 0 && (
                          <Tooltip title={r.raw_materials.map((rm) => `${rm.raw_material_name || `#${rm.raw_material_id}`}: ${rm.cut_width_mm}×${rm.cut_height_mm}мм, ${rm.raw_material_qty} ед.`).join("\n")}>
                            <Tag style={{ margin: 0, fontSize: 10, cursor: "default" }}>
                              {r.raw_materials.length} материал(а)
                            </Tag>
                          </Tooltip>
                        )}
                        {r.is_custom && r.raw_material_id && (!r.raw_materials || r.raw_materials.length === 0) && r.cut_width_mm && r.cut_height_mm && (
                          <Tooltip title={`Сырьё: ${r.raw_material_qty} ед.\nОтрез: ${r.cut_width_mm}×${r.cut_height_mm} мм`}>
                            <Tag style={{ margin: 0, fontSize: 10, cursor: "default" }}>
                              {r.cut_width_mm}×{r.cut_height_mm}
                            </Tag>
                          </Tooltip>
                        )}
                      </Space>
                      {r.is_custom && (r.raw_material_id || (r.raw_materials && r.raw_materials.length > 0)) && (
                        <div style={{ marginTop: 4 }}>
                          <Select
                            value={r.processing_method || undefined}
                            placeholder="Способ обработки"
                            size="small"
                            style={{ width: 160 }}
                            allowClear
                            onChange={(val) => processingMethodMutation.mutate({ orderId: detailOrder.id, itemId: r.id, processingMethod: val || "" })}
                          >
                            <Select.Option value="Фреза">Фреза</Select.Option>
                            <Select.Option value="Лазер">Лазер</Select.Option>
                            <Select.Option value="Ручная резка">Ручная резка</Select.Option>
                          </Select>
                        </div>
                      )}
                    </div>
                  ),
                },
                { title: "Кол-во", dataIndex: "quantity", width: 80 },
                { title: "Ед.", dataIndex: "product_unit", width: 60, render: (v: string) => v || "шт" },
                ...(canViewPrices ? [
                  { title: "Цена", dataIndex: "unit_price", width: 100, render: (v: number) => `${v.toLocaleString()} ₽` },
                  { title: "Сумма", key: "sum", width: 120, render: (_: unknown, r: OrderItem) => `${(r.quantity * r.unit_price).toLocaleString()} ₽` },
                ] : []),
              ]}
            />

            {(() => {
              const grouped: Record<number, { name: string; totalMeters: number; rollLength: number; isRoll: boolean; displayFormatScript: string | undefined; items: OrderItem[] }> = {};
              for (const item of detailOrder.items) {
                if (item.raw_materials && item.raw_materials.length > 0) {
                  for (const rm of item.raw_materials) {
                    const rmDef = rawMaterials?.find((r) => r.id === rm.raw_material_id);
                    if (!rmDef || !rm.raw_material_qty) continue;
                    const whItem = warehouseItems?.find((w) => w.raw_material_id === rm.raw_material_id);
                    if (!grouped[rm.raw_material_id]) grouped[rm.raw_material_id] = { name: rmDef.name, totalMeters: 0, rollLength: rmDef.roll_length_m || 0, isRoll: !!rmDef.roll_length_m, displayFormatScript: whItem?.display_format_script, items: [] };
                    grouped[rm.raw_material_id].totalMeters += rm.raw_material_qty * item.quantity;
                    grouped[rm.raw_material_id].items.push({ ...item, cut_width_mm: rm.cut_width_mm, cut_height_mm: rm.cut_height_mm } as OrderItem);
                  }
                } else if (item.raw_material_id && item.raw_material_qty && item.raw_material_qty > 0) {
                  const rm = rawMaterials?.find((r) => r.id === item.raw_material_id);
                  if (!rm) continue;
                  const whItem = warehouseItems?.find((w) => w.raw_material_id === rm.id);
                  if (!grouped[rm.id]) grouped[rm.id] = { name: rm.name, totalMeters: 0, rollLength: rm.roll_length_m || 0, isRoll: !!rm.roll_length_m, displayFormatScript: whItem?.display_format_script, items: [] };
                  grouped[rm.id].totalMeters += item.raw_material_qty! * item.quantity;
                  grouped[rm.id].items.push(item);
                }
              }
              if (Object.keys(grouped).length === 0) return null;
              return (
                <div style={{ marginBottom: 16 }}>
                  <Typography.Text strong style={{ display: "block", marginBottom: 8 }}>Списание сырья</Typography.Text>
                  {Object.entries(grouped).map(([rmId, info]) => (
                    <GroupedMaterialDisplay key={rmId} rmId={rmId} info={info} />
                  ))}
                </div>
              );
            })()}

            {(() => {
              const pendingItems = (detailOrder.items || []).filter((i) => i.manual_writeoff_pending);
              if (pendingItems.length === 0) return null;
              return (
                <div style={{ marginBottom: 16 }}>
                  <Typography.Text strong style={{ display: "block", marginBottom: 8 }}>
                    <ExclamationCircleOutlined style={{ color: "#faad14", marginRight: 4 }} />
                    Ожидает ручного списания ({pendingItems.length})
                  </Typography.Text>
                  {pendingItems.map((item) => (
                    <div key={item.id} style={{ padding: "4px 8px", background: "#fffbe6", border: "1px solid #ffe58f", borderRadius: 4, marginBottom: 4, fontSize: 13 }}>
                      <div><strong>{item.product_name || `#${item.id}`}</strong></div>
                      <div style={{ fontSize: 12, color: "#666" }}>
                        Сырьё: {item.manual_writeoff_raw_material_name || `#${item.manual_writeoff_raw_material_id}`}
                        {item.manual_writeoff_cut_width_mm && item.manual_writeoff_cut_height_mm && (
                          <span> — отрез {item.manual_writeoff_cut_width_mm}×{item.manual_writeoff_cut_height_mm} мм</span>
                        )}
                        {item.manual_writeoff_quantity != null && <span>, кол-во: {item.manual_writeoff_quantity}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            <Divider style={{ margin: "16px 0" }} />
            <Descriptions column={2} size="small">
              <Descriptions.Item label="Создан">
                {detailOrder.created_by_name ? `${detailOrder.created_by_name}` : "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Дата">{dayjs(detailOrder.created_at).format("DD.MM.YYYY HH:mm")}</Descriptions.Item>
            </Descriptions>

            <Divider style={{ margin: "16px 0" }}>
              <Space><HistoryOutlined /> История</Space>
            </Divider>
            {orderHistory && orderHistory.length > 0 ? (
              <Timeline
                items={orderHistory.map((h) => {
                  const color = h.action === "created" ? "blue"
                    : h.action === "status_changed" ? "orange"
                    : h.action === "item_completed" ? "green"
                    : h.action === "item_printed" ? "cyan"
                    : h.action === "deleted" ? "red"
                    : h.action === "updated" ? "purple" : "gray";
                  const icon = h.action === "created" ? <PlusCircleOutlined />
                    : h.action === "status_changed" ? <SwapRightOutlined />
                    : h.action === "item_completed" ? <CheckSquareOutlined />
                    : h.action === "item_printed" ? <PrinterFilled />
                    : h.action === "deleted" ? <DeleteOutlined />
                    : h.action === "updated" ? <EditOutlined /> : null;

                  const label = h.action === "created" ? "создал заказ"
                    : h.action === "status_changed" ? `статус: ${h.old_value} → ${h.new_value}`
                    : h.action === "item_completed" ? `выполнил «${h.new_value}»`
                    : h.action === "item_uncompleted" ? `отменил «${h.new_value}»`
                    : h.action === "item_printed" ? `напечатал «${h.new_value}»`
                    : h.action === "item_unprinted" ? `отменил печать «${h.new_value}»`
                    : h.action === "deleted" ? "удалил заказ"
                    : h.action === "updated" ? `изменил ${h.field}` : h.action;

                  return {
                    color,
                    dot: icon,
                    children: (
                      <div>
                        <Typography.Text strong>{h.user_name || "Система"}</Typography.Text>
                        {h.user_role && h.user_role !== "system" && (
                          <Typography.Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>({h.user_role})</Typography.Text>
                        )}
                        <br />
                        <Typography.Text>{label}</Typography.Text>
                        <br />
                        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                          {dayjs(h.created_at).format("DD.MM.YYYY HH:mm")}
                        </Typography.Text>
                      </div>
                    ),
                  };
                })}
              />
            ) : (
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>Нет записей</Typography.Text>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}
