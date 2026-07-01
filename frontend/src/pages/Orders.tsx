import { AppstoreOutlined, CalculatorOutlined, CopyOutlined, DeleteOutlined, EditOutlined, ExclamationCircleOutlined, HistoryOutlined, MinusCircleOutlined, PlusCircleOutlined, PlusOutlined, UnorderedListOutlined, PrinterOutlined, PrinterFilled, CheckSquareOutlined, SwapRightOutlined } from "@ant-design/icons";
import {
  Button,
  Checkbox,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Progress,
  Select,
  Space,
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
import CalculatorModal from "../components/CalculatorModal";
import { createClient, getClients } from "../api/clients";
import { getOrderSettings } from "../api/orderSettings";
import { getProducts } from "../api/products";
import { getRawMaterials } from "../api/rawMaterials";
import { runDisplayScript } from "../api/scripts";
import { getUsers } from "../api/auth";
import { createOrder, deleteOrder, getOrderHistory, getOrders, saveItemAsProduct, toggleItemCompleted, toggleItemPrinted, updateOrder, bulkDeleteOrders } from "../api/orders";
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
  const [form] = Form.useForm();
  const [viewMode, setViewMode] = useViewMode("orders", "kanban");
  const [detailOrder, setDetailOrder] = useState<OrderRow | null>(null);
  const { user, hasPermission } = useAuth();
  const canViewPrices = hasPermission("prices.view");
  const canEditOrders = hasPermission("orders.edit");
  const colSettings = useColumnSettings("orders", ALL_ORDER_COLUMNS);

  const entityFilters = useEntityFilters("orders");
  const [calcItemIndex, setCalcItemIndex] = useState<number | null>(null);
  const [calcModalOpen, setCalcModalOpen] = useState(false);
  const [quickClientOpen, setQuickClientOpen] = useState(false);
  const [quickClientForm] = Form.useForm();
  const [editingStatusId, setEditingStatusId] = useState<number | null>(null);
  const [editingWorkersId, setEditingWorkersId] = useState<number | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  const { data: orders, isLoading } = useQuery({ queryKey: ["orders"], queryFn: getOrders });
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: getClients });
  const { data: products } = useQuery({ queryKey: ["products"], queryFn: getProducts });
  const { data: rawMaterials } = useQuery({ queryKey: ["rawMaterials"], queryFn: getRawMaterials });
  const { data: warehouseItems } = useQuery({ queryKey: ["warehouse"], queryFn: getWarehouseItems });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: getUsers });

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

  const createMutation = useMutation({
    mutationFn: async (data: OrderFormData) => {
      return await createOrder(data);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["orders"] }); queryClient.invalidateQueries({ queryKey: ["warehouse"] }); queryClient.invalidateQueries({ queryKey: ["writeoffs"] }); message.success("Заказ создан"); setModalOpen(false); form.resetFields(); },
    onError: (err: { response?: { data?: { detail?: string } } }) => { message.error(err.response?.data?.detail || "Ошибка создания заказа"); },
  });

  const quickClientMutation = useMutation({
    mutationFn: (data: { name: string; phone?: string; email?: string }) => createClient(data),
    onSuccess: (newClient) => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      form.setFieldsValue({ client_id: newClient.id });
      setQuickClientOpen(false);
      quickClientForm.resetFields();
      message.success("Клиент создан");
    },
    onError: () => message.error("Ошибка создания клиента"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<OrderFormData> }) => {
      await updateOrder(id, data);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["orders"] }); queryClient.invalidateQueries({ queryKey: ["writeoffs"] }); message.success("Заказ обновлён"); setModalOpen(false); setEditing(null); form.resetFields(); },
    onError: (err: { response?: { data?: { detail?: string } } }) => { message.error(err.response?.data?.detail || "Ошибка обновления заказа"); },
  });

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

  const toggleItemMutation = useMutation({
    mutationFn: ({ orderId, itemId }: { orderId: number; itemId: number }) => toggleItemCompleted(orderId, itemId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      setDetailOrder((prev) => prev ? { ...prev, items: data.items, progress: data.progress } : null);
      refetchHistory();
    },
  });

  const printedItemMutation = useMutation({
    mutationFn: ({ orderId, itemId }: { orderId: number; itemId: number }) => toggleItemPrinted(orderId, itemId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      setDetailOrder((prev) => prev ? { ...prev, items: data.items, progress: data.progress } : null);
      refetchHistory();
    },
  });

  const saveAsProductMutation = useMutation({
    mutationFn: ({ orderId, itemId }: { orderId: number; itemId: number }) => saveItemAsProduct(orderId, itemId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setDetailOrder((prev) => prev ? { ...prev, items: data.items, progress: data.progress } : null);
      message.success("Продукт сохранён в каталог");
    },
  });

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ items: [{ product_id: undefined, quantity: 1 }], status: "new" });
    setModalOpen(true);
  };

  const openEdit = (order: Order) => {
    setEditing(order);
    form.setFieldsValue({
      client_id: order.client_id,
      status: order.status,
      description: order.description,
      notes: order.notes,
      deadline: order.deadline ? dayjs(order.deadline) : undefined,
      items: order.items.map((i) => ({
        product_id: i.product_id,
        quantity: i.quantity,
        unit_price: i.unit_price,
        product_name: i.product_name,
        product_unit: i.product_unit,
        raw_material_id: i.raw_material_id,
        raw_material_qty: i.raw_material_qty,
        cut_width_mm: i.cut_width_mm,
        cut_height_mm: i.cut_height_mm,
        raw_materials: i.raw_materials || [],
        is_custom: i.is_custom,
        manual_writeoff_pending: i.manual_writeoff_pending,
        manual_writeoff_raw_material_id: i.manual_writeoff_raw_material_id,
        manual_writeoff_cut_width_mm: i.manual_writeoff_cut_width_mm,
        manual_writeoff_cut_height_mm: i.manual_writeoff_cut_height_mm,
        manual_writeoff_quantity: i.manual_writeoff_quantity,
      })),
      designer: order.designer,
      workers: order.workers,
      layout_type: order.layout_type,
      path: order.path,
      source: order.source,
    });
    setModalOpen(true);
  };

  const onFinish = (values: Record<string, unknown>) => {
    const v = values;
    const payload: OrderFormData = {
      client_id: v.client_id as number,
      status: v.status as string,
      description: (v.description as string) || undefined,
      notes: (v.notes as string) || undefined,
      deadline: v.deadline ? dayjs(v.deadline as string | number | Date).toISOString() : undefined,
      items: (v.items as Array<{ product_id?: number; product_name?: string; product_unit?: string; unit_price?: number; raw_material_id?: number; raw_material_qty?: number; cut_width_mm?: number; cut_height_mm?: number; raw_materials?: { raw_material_id: number; cut_width_mm?: number; cut_height_mm?: number }[]; quantity: number; manual_writeoff_pending?: boolean; manual_writeoff_raw_material_id?: number; manual_writeoff_cut_width_mm?: number; manual_writeoff_cut_height_mm?: number; manual_writeoff_quantity?: number }> || []).map((i) => ({
        product_id: i.product_id || undefined,
        product_name: i.product_name || undefined,
        product_unit: i.product_unit || undefined,
        unit_price: i.unit_price || undefined,
        raw_material_id: i.raw_material_id || undefined,
        raw_material_qty: i.raw_material_qty || undefined,
        cut_width_mm: i.cut_width_mm || undefined,
        cut_height_mm: i.cut_height_mm || undefined,
        raw_materials: (i.raw_materials || []).map((rm) => ({
          raw_material_id: rm.raw_material_id,
          cut_width_mm: rm.cut_width_mm || undefined,
          cut_height_mm: rm.cut_height_mm || undefined,
        })),
        quantity: i.quantity,
        manual_writeoff_pending: i.manual_writeoff_pending || false,
        manual_writeoff_raw_material_id: i.manual_writeoff_raw_material_id || undefined,
        manual_writeoff_cut_width_mm: i.manual_writeoff_cut_width_mm || undefined,
        manual_writeoff_cut_height_mm: i.manual_writeoff_cut_height_mm || undefined,
        manual_writeoff_quantity: i.manual_writeoff_quantity || undefined,
      })),
      designer: (v.designer as string) || undefined,
      workers: (v.workers as string[]) || [],
      layout_type: (v.layout_type as string) || undefined,
      path: (v.path as string) || undefined,
      source: (v.source as string) || undefined,
    };

    if (editing) {
      updateMutation.mutate({ id: editing.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
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
        render: (v: string) => v ? <Tag color={getColor(designerColors, v)}>{v}</Tag> : "—",
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
      { title: "Макет", dataIndex: "layout_type", key: "layout_type", render: (v: string) => v ? <Tag color={getColor(layoutOptions, v)}>{v}</Tag> : "—" },
      { title: "Путь", dataIndex: "path", key: "path", render: (v: string) => renderPathCell(v) },
      {
        title: "Где", dataIndex: "source", key: "source",
        filters: (sourceOptions ?? []).map((s) => ({ text: s.name, value: s.name })),
        ...selectFilterDropdown((sourceOptions ?? []).map((s) => ({ text: s.name, value: s.name })), saveSourceFilter),
        render: (v: string) => v ? <Tag color={getColor(sourceOptions, v)}>{v}</Tag> : "—",
        filteredValue: (entityFilters.filters["source"] as string[]) ?? null,
      },
    ];
    return cols.filter(Boolean) as typeof cols[number][];
  }, [entityFilters.filters, entityFilters.sortField, entityFilters.sortDirection, clientNames, canViewPrices, designerColors, workerColors, layoutOptions, sourceOptions, statusTagColors, renderDescription, renderPathCell]);

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
    const ordered = colSettings.orderedVisibleKeys
      .map((k) => {
        if (k === "id") return baseColumns[0];
        if (k === "client") return baseColumns[1];
        if (k === "description") return baseColumns[2];
        if (k === "total_price") return canViewPrices ? baseColumns[3] : null;
        if (k === "status") return baseColumns[4];
        if (k === "deadline") return baseColumns[5];
        if (k === "designer") return baseColumns[6];
        if (k === "workers") return baseColumns[7];
        if (k === "layout") return baseColumns[8];
        if (k === "path") return baseColumns[9];
        if (k === "source") return baseColumns[10];
        if (k === "actions") return actionColumn;
        return null;
      })
      .filter(Boolean) as typeof baseColumns[number][];
    return ordered;
  }, [colSettings.orderedVisibleKeys, baseColumns, canViewPrices, actionColumn]);

  const activeUsers = (users ?? []).filter((u) => u.is_active);

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

      <Modal
        title={editing ? "Редактировать заказ" : "Новый заказ"}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditing(null); }}
        onOk={() => form.validateFields().then(onFinish).catch(() => {})}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        width={680}
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="client_id" label="Клиент" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label">
              {(clients ?? []).map((c) => (<Select.Option key={c.id} value={c.id} label={c.name}>{c.name} ({c.email})</Select.Option>))}
            </Select>
          </Form.Item>

          {!quickClientOpen ? (
            <div style={{ marginTop: -12, marginBottom: 12 }}>
              <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => setQuickClientOpen(true)} style={{ padding: 0 }}>
                Новый клиент
              </Button>
            </div>
          ) : (
            <div style={{ border: "1px solid #d9d9d9", borderRadius: 6, padding: 12, marginBottom: 16, background: "#fafafa" }}>
              <Typography.Text strong style={{ display: "block", marginBottom: 8 }}>Новый клиент</Typography.Text>
              <Form form={quickClientForm} layout="vertical" size="small">
                <Form.Item name="name" label="Имя" rules={[{ required: true, message: "Введите имя клиента" }]} style={{ marginBottom: 8 }}>
                  <Input placeholder="Имя клиента" />
                </Form.Item>
                <div style={{ display: "flex", gap: 8 }}>
                  <Form.Item name="phone" label="Телефон" style={{ flex: 1, marginBottom: 8 }}>
                    <Input placeholder="+7 (999) 123-45-67" />
                  </Form.Item>
                  <Form.Item name="email" label="Email" style={{ flex: 1, marginBottom: 8 }}>
                    <Input placeholder="client@example.com" />
                  </Form.Item>
                </div>
                <Space>
                  <Button size="small" onClick={() => { setQuickClientOpen(false); quickClientForm.resetFields(); }}>Отмена</Button>
                  <Button type="primary" size="small" onClick={() => {
                    quickClientForm.validateFields().then((values) => {
                      quickClientMutation.mutate(values);
                    });
                  }} loading={quickClientMutation.isPending}>
                    Создать
                  </Button>
                </Space>
              </Form>
            </div>
          )}

          <Typography.Text strong style={{ display: "block", marginBottom: 8 }}>Продукты</Typography.Text>
          <Form.List name="items" rules={[{ validator: async (_, value) => { if (!value || value.length < 1) return Promise.reject(new Error("Добавьте хотя бы один продукт")); } }]}>
            {(fields, { add, remove }, { errors }) => (
              <>
                {fields.map((field, index) => (
                  <div key={field.key} style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "flex-start", flexDirection: "column" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", width: "100%" }}>
                      <Form.Item
                        name={[field.name, "product_id"]}
                        style={{ flex: 1, marginBottom: 0 }}
                      >
                        <Select showSearch optionFilterProp="label" placeholder="Продукт из каталога" allowClear>
                          {(products ?? []).map((p) => (<Select.Option key={p.id} value={p.id} label={p.name}>{p.name}{canViewPrices ? ` — ${p.unit_price} ₽` : ""} / {{ piece: "шт.", sheet: "лист", m2: "м²", roll: "рулон", set: "комплект" }[p.unit_type] || p.unit_type}</Select.Option>))}
                        </Select>
                      </Form.Item>
                      <Form.Item
                        name={[field.name, "quantity"]}
                        rules={[{ required: true, message: "Кол-во" }]}
                        style={{ width: 100, marginBottom: 0 }}
                      >
                        <InputNumber min={1} placeholder="Кол-во" style={{ width: "100%" }} />
                      </Form.Item>
                      {fields.length > 1 && (
                        <MinusCircleOutlined
                          style={{ marginTop: 8, color: "#ff4d4f", fontSize: 18, cursor: "pointer" }}
                          onClick={() => remove(field.name)}
                        />
                      )}
                    </div>
                    {!form.getFieldInstance(["items", field.name, "product_id"])?.getValue?.() && (
                      <div style={{ display: "flex", gap: 8, width: "100%", background: "#fafafa", padding: "8px 8px 0", borderRadius: 4, flexDirection: "column" }}>
                        <div style={{ display: "flex", gap: 8 }}>
                          <Form.Item name={[field.name, "product_name"]} style={{ flex: 1, marginBottom: 8 }}>
                            <Input placeholder="Название (произвольная позиция)" />
                          </Form.Item>
                          {canViewPrices && (
                            <Form.Item name={[field.name, "unit_price"]} style={{ width: 160, marginBottom: 8 }}>
                              <InputNumber min={0} placeholder="Цена ₽" style={{ width: "100%" }} addonAfter={<CalculatorOutlined style={{ cursor: "pointer", color: "#1677ff" }} onClick={(e) => { e.stopPropagation(); setCalcItemIndex(field.name); setCalcModalOpen(true); }} />} />
                            </Form.Item>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <Form.Item name={[field.name, "raw_material_id"]} style={{ flex: 1, marginBottom: 8 }}>
                            <Select allowClear placeholder="Сырьё (необязательно)" showSearch optionFilterProp="label">
                              {(rawMaterials ?? []).map((rm) => (
                                <Select.Option key={rm.id} value={rm.id} label={rm.name}>
                                  {rm.name} {rm.roll_width_m ? `(рулон ${rm.roll_width_m * 1000}мм)` : rm.width_mm && rm.height_mm ? `(${rm.width_mm}×${rm.height_mm})` : ""}
                                </Select.Option>
                              ))}
                            </Select>
                          </Form.Item>
                        </div>
                        <Form.Item noStyle shouldUpdate>
                          {() => {
                            const items = form.getFieldValue("items") || [];
                            const item = items[field.name] || {};
                            if (!item.raw_material_id) return null;
                            const rm = (rawMaterials ?? []).find((r) => r.id === item.raw_material_id);
                            return (
                              <div style={{ display: "flex", gap: 8, background: "#f6ffed", padding: "8px 8px 0", borderRadius: 4, flexDirection: "column" }}>
                                <div style={{ display: "flex", gap: 8 }}>
                                  <Form.Item name={[field.name, "cut_width_mm"]} style={{ flex: 1, marginBottom: 8 }}>
                                    <InputNumber min={0} step={1} placeholder={rm?.roll_width_m ? `Ширина отреза, мм (рулон ${rm.roll_width_m * 1000} мм)` : "Ширина отреза, мм"} style={{ width: "100%" }} />
                                  </Form.Item>
                                  <Form.Item name={[field.name, "cut_height_mm"]} style={{ flex: 1, marginBottom: 8 }}>
                                    <InputNumber min={0} step={1} placeholder={rm?.roll_length_m ? `Высота отреза, мм (рулон ${rm.roll_length_m * 1000} мм)` : "Высота отреза, мм"} style={{ width: "100%" }} />
                                  </Form.Item>
                                </div>
                                <div style={{ fontSize: 12, color: "#666", marginTop: -4, marginBottom: 8 }}>
                                  Расход рассчитается автоматически по размерам отреза
                                </div>
                              </div>
                            );
                          }}
                        </Form.Item>
                        <Divider orientation="left" orientationMargin={0} style={{ fontSize: 11, marginTop: 4, marginBottom: 8 }}>Доп. сырьё</Divider>
                        <Form.List name={[field.name, "raw_materials"]}>
                          {(rmFields, { add: addRm, remove: removeRm }) => (
                            <>
                              {rmFields.map((rmField) => (
                                <div key={rmField.key} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                                  <Form.Item {...rmField} name={[rmField.name, "raw_material_id"]} noStyle rules={[{ required: true }]}>
                                    <Select placeholder="Материал" showSearch optionFilterProp="label" style={{ flex: 1 }}>
                                      {(rawMaterials ?? []).map((rm) => (
                                        <Select.Option key={rm.id} value={rm.id} label={rm.name}>
                                          {rm.name} {rm.roll_width_m ? `(рулон ${rm.roll_width_m * 1000}мм)` : rm.width_mm && rm.height_mm ? `(${rm.width_mm}×${rm.height_mm})` : ""}
                                        </Select.Option>
                                      ))}
                                    </Select>
                                  </Form.Item>
                                  <Form.Item {...rmField} name={[rmField.name, "cut_width_mm"]} noStyle>
                                    <InputNumber min={0} step={1} placeholder="Ширина, мм" style={{ width: 120 }} />
                                  </Form.Item>
                                  <Form.Item {...rmField} name={[rmField.name, "cut_height_mm"]} noStyle>
                                    <InputNumber min={0} step={1} placeholder="Высота, мм" style={{ width: 120 }} />
                                  </Form.Item>
                                  <MinusCircleOutlined style={{ color: "#ff4d4f", cursor: "pointer" }} onClick={() => removeRm(rmField.name)} />
                                </div>
                              ))}
                              <Button type="dashed" size="small" onClick={() => addRm({})} block icon={<PlusOutlined />} style={{ marginBottom: 8 }}>
                                Добавить материал
                              </Button>
                            </>
                          )}
                        </Form.List>
                        <Divider orientation="left" orientationMargin={0} style={{ fontSize: 11, marginTop: 4, marginBottom: 8 }}>Ручное списание</Divider>
                        <Form.Item name={[field.name, "manual_writeoff_pending"]} valuePropName="checked" style={{ marginBottom: 8 }}>
                          <Checkbox>Списать со склада вручную</Checkbox>
                        </Form.Item>
                        <Form.Item noStyle shouldUpdate>
                          {() => {
                            const items = form.getFieldValue("items") || [];
                            const item = items[field.name] || {};
                            if (!item.manual_writeoff_pending) return null;
                            return (
                              <div style={{ display: "flex", gap: 8, background: "#fff7e6", padding: "8px 8px 0", borderRadius: 4, flexDirection: "column", border: "1px solid #ffd591" }}>
                                <div style={{ display: "flex", gap: 8 }}>
                                  <Form.Item name={[field.name, "manual_writeoff_raw_material_id"]} style={{ flex: 1, marginBottom: 8 }} rules={[{ required: true, message: "Выберите сырьё" }]}>
                                    <Select allowClear placeholder="Сырьё для списания" showSearch optionFilterProp="label">
                                      {(rawMaterials ?? []).map((rm) => (
                                        <Select.Option key={rm.id} value={rm.id} label={rm.name}>
                                          {rm.name} {rm.roll_width_m ? `(рулон ${rm.roll_width_m * 1000}мм)` : rm.width_mm && rm.height_mm ? `(${rm.width_mm}×${rm.height_mm})` : ""}
                                        </Select.Option>
                                      ))}
                                    </Select>
                                  </Form.Item>
                                </div>
                                <div style={{ display: "flex", gap: 8 }}>
                                  <Form.Item name={[field.name, "manual_writeoff_cut_width_mm"]} style={{ flex: 1, marginBottom: 8 }}>
                                    <InputNumber min={0} step={1} placeholder="Ширина отреза, мм" style={{ width: "100%" }} />
                                  </Form.Item>
                                  <Form.Item name={[field.name, "manual_writeoff_cut_height_mm"]} style={{ flex: 1, marginBottom: 8 }}>
                                    <InputNumber min={0} step={1} placeholder="Высота отреза, мм" style={{ width: "100%" }} />
                                  </Form.Item>
                                  <Form.Item name={[field.name, "manual_writeoff_quantity"]} style={{ width: 120, marginBottom: 8 }}>
                                    <InputNumber min={0} step={0.1} placeholder="Кол-во" style={{ width: "100%" }} />
                                  </Form.Item>
                                </div>
                                <div style={{ fontSize: 12, color: "#666", marginTop: -4, marginBottom: 8 }}>
                                  Расход рассчитается автоматически при подтверждении списания на складе
                                </div>
                              </div>
                            );
                          }}
                        </Form.Item>
                      </div>
                    )}
                  </div>
                ))}
                <Form.Item>
                  <Button type="dashed" onClick={() => add({ product_id: undefined, quantity: 1 })} block icon={<PlusOutlined />}>
                    Добавить продукт
                  </Button>
                  <Form.ErrorList errors={errors} />
                </Form.Item>
              </>
            )}
          </Form.List>

          <Form.Item name="status" label="Статус">
            <Select>{ORDER_STATUSES.map((s) => (<Select.Option key={s} value={s}>{statusLabels[s] || s}</Select.Option>))}</Select>
          </Form.Item>
          <Form.Item name="description" label="Описание заказа">
            <Input.TextArea rows={2} placeholder="Описание (автоиз списка продуктов, если пусто)" />
          </Form.Item>
          <Form.Item name="deadline" label="Дедлайн"><DatePicker style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="notes" label="Примечания"><Input.TextArea rows={2} /></Form.Item>

          {canEditOrders && (
            <>
              <Divider style={{ margin: "12px 0" }} />
              <Typography.Text strong style={{ display: "block", marginBottom: 8 }}>Дополнительные поля</Typography.Text>

              <Form.Item name="designer" label="Дизайнер">
                <Select allowClear showSearch optionFilterProp="label" placeholder="Выберите дизайнера">
                  {activeUsers.map((u) => (
                    <Select.Option key={u.id} value={u.username} label={u.full_name || u.username}>
                      {u.full_name || u.username} ({u.username})
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item name="workers" label="Работники">
                <Select mode="multiple" allowClear showSearch optionFilterProp="label" placeholder="Выберите работников">
                  {activeUsers.map((u) => (
                    <Select.Option key={u.id} value={u.username} label={u.full_name || u.username}>
                      {u.full_name || u.username} ({u.username})
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item name="layout_type" label="Макет">
                <Select allowClear placeholder="Выберите макет">
                  {(layoutOptions ?? []).map((opt) => (
                    <Select.Option key={opt.id} value={opt.name} label={opt.name}>
                      <Space>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: opt.color, display: "inline-block" }} />
                        {opt.name}
                      </Space>
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item name="path" label="Путь к файлам">
                <Input.TextArea rows={2} placeholder="\\192.168.1.150\buffer\заказчик номер 1" />
              </Form.Item>

              <Form.Item name="source" label="Где (Откуда заказчик)">
                <Select allowClear placeholder="Выберите источник">
                  {(sourceOptions ?? []).map((opt) => (
                    <Select.Option key={opt.id} value={opt.name} label={opt.name}>
                      <Space>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: opt.color, display: "inline-block" }} />
                        {opt.name}
                      </Space>
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </>
          )}

        </Form>
      </Modal>

      <Drawer
        title={`Заказ #${detailOrder?.id || ""}`}
        open={!!detailOrder}
        onClose={() => setDetailOrder(null)}
        width={560}
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
                <Descriptions.Item label="Описание">{detailOrder.description}</Descriptions.Item>
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
              <Typography.Text strong>Продукты</Typography.Text>
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
                  render: (_: unknown, r: OrderItem) => (
                    <Checkbox
                      checked={r.is_completed}
                      onChange={() => toggleItemMutation.mutate({ orderId: detailOrder.id, itemId: r.id })}
                    />
                  ),
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
      <CalculatorModal
        open={calcModalOpen}
        onClose={() => { setCalcModalOpen(false); setCalcItemIndex(null); }}
        onApply={(price, quantity) => {
          if (calcItemIndex !== null) {
            form.setFieldsValue({
              items: {
                [calcItemIndex]: {
                  unit_price: Math.round(price * 100) / 100,
                  ...(quantity > 0 ? { quantity } : {}),
                },
              },
            });
          }
          setCalcModalOpen(false);
          setCalcItemIndex(null);
        }}
      />
    </>
  );
}
