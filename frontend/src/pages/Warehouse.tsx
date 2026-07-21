import { ExclamationCircleOutlined, PlusOutlined, WarningOutlined, DeleteOutlined, EditOutlined, ClockCircleOutlined } from "@ant-design/icons";
import {
  Button,
  Collapse,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getProducts } from "../api/products";
import { getRawMaterials } from "../api/rawMaterials";
import { getScripts, runDisplayScript } from "../api/scripts";
import { getOffcuts, createOffcut, deleteOffcut, type Offcut } from "../api/offcuts";
import { createWriteoff, getWriteoffs, reverseWriteoff } from "../api/writeoffs";
import AuditLogDrawer from "../components/AuditLogDrawer";
import {
  createWarehouseItem,
  deleteWarehouseItem,
  getWarehouseItems,
  updateWarehouseItem,
  bulkDeleteWarehouse,
  getPendingWriteoffs,
  confirmManualWriteoff,
  cancelPendingWriteoff,
} from "../api/warehouse";
import { textFilter, numberFilter } from "../components/TableFilters";
import { useEntityFilters } from "../hooks/useEntityFilters";
import { useColumnState, applyColumnWidths } from "../hooks/useColumnState";
import { useTablePagination } from "../hooks/useTablePagination";
import { ResizableHeaderCell } from "../components/ResizableHeaderCell";
import { useAuth } from "../hooks/useAuth";
import type { WarehouseFormData, WarehouseItem, WriteoffFormData, StockWriteoff, ManualWriteoffPending } from "../types";
import { toSortOrder } from "../utils/sort";

type TabMode = "products" | "raw_materials";

const unitTypeLabels: Record<string, string> = { piece: "шт.", sheet: "лист", m2: "м²", roll: "рулон", set: "комплект" };

function SheetMaterialDisplay({ record, isLow, unit }: { record: WarehouseItem; isLow: boolean; unit: string }) {
  const available = record.quantity - (record.defective_quantity || 0);
  const scriptName = record.display_format_script;
  const scriptData = { totalQuantity: available, width_mm: record.raw_material_width_mm || 0, height_mm: record.raw_material_height_mm || 0, minQuantity: record.min_quantity };
  const scriptResult = useDisplayFormat(scriptName, scriptData);

  if (scriptResult) {
    return (
      <Space direction="vertical" size={0}>
        <Space>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{scriptResult.main}</span>
          {isLow && <Tag icon={<ExclamationCircleOutlined />} color="warning">мало</Tag>}
        </Space>
        <span style={{ fontSize: 12, color: "#888" }}>{scriptResult.sub}</span>
      </Space>
    );
  }

  const mainText = `${available % 1 === 0 ? available : Number(available.toFixed(2))} ${unit}`;
  return (
    <Space direction="vertical" size={0}>
      <Space>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{mainText}</span>
        {isLow && <Tag icon={<ExclamationCircleOutlined />} color="warning">мало</Tag>}
      </Space>
    </Space>
  );
}

function RollMaterialDisplay({ record, isLow }: { record: WarehouseItem; isLow: boolean }) {
  const available = record.quantity - (record.defective_quantity || 0);
  const rollLength = record.raw_material_roll_length_m!;
  const totalMeters = available;
  const rolls = rollLength > 0 ? Math.floor(totalMeters / rollLength) : 0;
  const leftover = rollLength > 0 ? Number((totalMeters % rollLength).toFixed(2)) : 0;

  const scriptName = record.display_format_script;
  const scriptData = { totalMeters, rollLength, rolls, leftover, materialName: record.raw_material_name || "", totalQuantity: totalMeters, width_mm: 0, height_mm: 0 };
  const scriptResult = useDisplayFormat(scriptName, scriptData);

  if (scriptResult) {
    return (
      <Space direction="vertical" size={0}>
        <Space>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{scriptResult.main}</span>
          {isLow && <Tag icon={<ExclamationCircleOutlined />} color="warning">мало</Tag>}
        </Space>
        <span style={{ fontSize: 12, color: "#888" }}>{scriptResult.sub}</span>
      </Space>
    );
  }

  return (
    <Space direction="vertical" size={0}>
      <Space>
        <span style={{ fontWeight: 600, fontSize: 14 }}>
          {rolls} {rolls === 1 ? "рулон" : rolls >= 2 && rolls <= 4 ? "рулона" : "рулонов"}
          {leftover > 0 && <span> + {leftover} м</span>}
        </span>
        {isLow && <Tag icon={<ExclamationCircleOutlined />} color="warning">мало</Tag>}
      </Space>
      <span style={{ fontSize: 12, color: "#888" }}>
        Остаток: {totalMeters % 1 === 0 ? totalMeters : totalMeters.toFixed(2)} м ({rollLength}м/рулон)
      </span>
    </Space>
  );
}

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

function OffcutsTab({ rawMaterials }: { rawMaterials: Array<{ id: number; name: string; width_mm?: number; height_mm?: number }> | undefined }) {
  const queryClient = useQueryClient();
  const { data: offcuts = [], isLoading } = useQuery({ queryKey: ["offcuts"], queryFn: () => getOffcuts() });
  const [form] = Form.useForm();

  const createMutation = useMutation({
    mutationFn: createOffcut,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["offcuts"] }); message.success("Обрезок добавлен"); form.resetFields(); },
    onError: (err: { response?: { data?: { detail?: string } } }) => { message.error(err.response?.data?.detail || "Ошибка"); },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteOffcut,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["offcuts"] }); message.success("Обрезок удалён"); },
  });

  const columns = [
    { title: "ID", dataIndex: "id", width: 50 },
    { title: "Сырьё", dataIndex: "raw_material_name", render: (v: string) => v || "—" },
    { title: "Ширина", dataIndex: "width_mm", width: 100, render: (v: number) => `${v} мм` },
    { title: "Высота", dataIndex: "height_mm", width: 100, render: (v: number) => `${v} мм` },
    { title: "Кол-во", dataIndex: "quantity", width: 80 },
    { title: "Заказ", dataIndex: "order_id", width: 80, render: (v: number) => v ? `#${v}` : "—" },
    {
      title: "", width: 40,
      render: (_: unknown, record: Offcut) => (
        <Popconfirm title="Удалить обрезок?" onConfirm={() => deleteMutation.mutate(record.id)}>
          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <Form form={form} layout="inline" onFinish={(v) => createMutation.mutate(v)} style={{ gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <Form.Item name="raw_material_id" rules={[{ required: true, message: "Сырьё" }]} style={{ marginBottom: 0 }}>
          <Select placeholder="Сырьё" showSearch optionFilterProp="label" style={{ width: 180 }}>
            {(rawMaterials ?? []).map((rm) => <Select.Option key={rm.id} value={rm.id} label={rm.name}>{rm.name}</Select.Option>)}
          </Select>
        </Form.Item>
        <Form.Item name="width_mm" rules={[{ required: true, message: "Ширина" }]} style={{ marginBottom: 0 }}>
          <InputNumber min={1} placeholder="Ширина, мм" style={{ width: 100 }} />
        </Form.Item>
        <Form.Item name="height_mm" rules={[{ required: true, message: "Высота" }]} style={{ marginBottom: 0 }}>
          <InputNumber min={1} placeholder="Высота, мм" style={{ width: 100 }} />
        </Form.Item>
        <Form.Item name="quantity" initialValue={1} rules={[{ required: true }]} style={{ marginBottom: 0 }}>
          <InputNumber min={1} style={{ width: 70 }} />
        </Form.Item>
        <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={createMutation.isPending}>Добавить</Button>
      </Form>
      <Table dataSource={offcuts} columns={columns} rowKey="id" size="small" pagination={{ pageSize: 10 }} loading={isLoading} />
    </div>
  );
}

export default function WarehousePage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseItem | null>(null);
  const [form] = Form.useForm<WarehouseFormData>();
  const entityFilters = useEntityFilters("warehouse");
  const { widths, setWidth } = useColumnState("warehouse");
  const { hasPermission } = useAuth();
  const canViewPrices = hasPermission("prices.view");
  const [showLowOnly, setShowLowOnly] = useState(false);
  const [tabMode, setTabMode] = useState<TabMode>(() => {
    const saved = localStorage.getItem("warehouse_tab_mode");
    return saved === "raw_materials" || saved === "products" ? saved : "products";
  });
  const handleTabModeChange = (mode: TabMode) => {
    setTabMode(mode);
    localStorage.setItem("warehouse_tab_mode", mode);
  };
  const [productWriteoffForm] = Form.useForm<WriteoffFormData>();
  const [rawMaterialWriteoffForm] = Form.useForm<WriteoffFormData>();
  const [selectedRawMatId, setSelectedRawMatId] = useState<number | undefined>();
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const { paginationConfig, onPaginationChange } = useTablePagination();
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditEntity, setAuditEntity] = useState<{ entityType: string; entityId: number; entityName?: string } | null>(null);
  const [writeoffDrawerItem, setWriteoffDrawerItem] = useState<WarehouseItem | null>(null);
  const [pendingWriteoffModalItem, setPendingWriteoffModalItem] = useState<WarehouseItem | null>(null);
  const [pendingWriteoffs, setPendingWriteoffs] = useState<ManualWriteoffPending[]>([]);
  const [rollInputMode, setRollInputMode] = useState<"rolls" | "meters">("rolls");
  const [showExtra, setShowExtra] = useState(false);

  const { data: items, isLoading } = useQuery({ queryKey: ["warehouse"], queryFn: getWarehouseItems });
  const { data: products } = useQuery({ queryKey: ["products"], queryFn: getProducts });
  const { data: rawMaterials } = useQuery({ queryKey: ["rawMaterials"], queryFn: getRawMaterials });
  const { data: scripts } = useQuery({ queryKey: ["scripts"], queryFn: getScripts });
  const { data: writeoffs } = useQuery({ queryKey: ["writeoffs"], queryFn: getWriteoffs });

  const createMutation = useMutation({
    mutationFn: createWarehouseItem,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["warehouse"] }); message.success("Позиция добавлена на склад"); setModalOpen(false); form.resetFields(); },
    onError: (err: { response?: { data?: { detail?: string } } }) => { message.error(err.response?.data?.detail || "Ошибка"); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<WarehouseFormData> }) => updateWarehouseItem(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["warehouse"] }); message.success("Склад обновлён"); setModalOpen(false); setEditing(null); form.resetFields(); },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWarehouseItem,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["warehouse"] }); message.success("Позиция удалена со склада"); },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: bulkDeleteWarehouse,
    onSuccess: (data) => { queryClient.invalidateQueries({ queryKey: ["warehouse"] }); message.success(`Удалено: ${data.deleted}`); setSelectedRowKeys([]); },
    onError: () => message.error("Ошибка удаления"),
  });

  const writeoffMutation = useMutation({
    mutationFn: createWriteoff,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse"] });
      queryClient.invalidateQueries({ queryKey: ["writeoffs"] });
      message.success("Списание выполнено");
      productWriteoffForm.resetFields();
      rawMaterialWriteoffForm.resetFields();
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => { message.error(err.response?.data?.detail || "Ошибка"); },
  });

  const reverseMutation = useMutation({
    mutationFn: reverseWriteoff,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse"] });
      queryClient.invalidateQueries({ queryKey: ["writeoffs"] });
      message.success("Списание отменено, остатки восстановлены");
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => { message.error(err.response?.data?.detail || "Ошибка"); },
  });

  const confirmWriteoffMutation = useMutation({
    mutationFn: ({ itemId, orderItemId }: { itemId: number; orderItemId: number }) => confirmManualWriteoff(itemId, orderItemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse"] });
      queryClient.invalidateQueries({ queryKey: ["writeoffs"] });
      message.success("Списание выполнено");
      setPendingWriteoffModalItem(null);
      setPendingWriteoffs([]);
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => { message.error(err.response?.data?.detail || "Ошибка"); },
  });

  const cancelWriteoffMutation = useMutation({
    mutationFn: cancelPendingWriteoff,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse"] });
      message.success("Пометка списания отменена");
      if (pendingWriteoffModalItem) {
        loadPendingWriteoffs(pendingWriteoffModalItem);
      }
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => { message.error(err.response?.data?.detail || "Ошибка"); },
  });

  const openCreate = () => { setEditing(null); form.resetFields(); setRollInputMode("rolls"); setModalOpen(true); };

  const loadPendingWriteoffs = async (item: WarehouseItem) => {
    try {
      const data = await getPendingWriteoffs(item.id);
      setPendingWriteoffs(data);
    } catch {
      setPendingWriteoffs([]);
    }
  };

  const openPendingWriteoffModal = async (item: WarehouseItem) => {
    setPendingWriteoffModalItem(item);
    await loadPendingWriteoffs(item);
  };
  const openEdit = (item: WarehouseItem) => {
    setEditing(item);
    setRollInputMode("rolls");
    const rm = item.raw_material_id ? rawMaterials?.find((r) => r.id === item.raw_material_id) : null;
    const quantityForForm = rm?.roll_length_m ? item.quantity / rm.roll_length_m : item.quantity;
    form.setFieldsValue({
      product_id: item.product_id,
      raw_material_id: item.raw_material_id,
      quantity: Number(quantityForForm.toFixed(2)),
      min_quantity: item.min_quantity,
      defective_quantity: item.defective_quantity ?? 0,
      defective_reason: item.defective_reason ?? "",
      stock_calculation_script: item.stock_calculation_script,
      display_format_script: item.display_format_script,
    });
    setSelectedRawMatId(item.raw_material_id);
    setModalOpen(true);
  };

  const onFinish = (values: WarehouseFormData) => {
    const rmId = values.raw_material_id || editing?.raw_material_id;
    const rm = rmId ? rawMaterials?.find((r) => r.id === rmId) : null;
    const dataToSend = { ...values };
    if (rm?.roll_length_m && dataToSend.quantity > 0 && rollInputMode === "rolls") {
      dataToSend.quantity = Number((dataToSend.quantity * rm.roll_length_m).toFixed(2));
    }
    if (editing) { updateMutation.mutate({ id: editing.id, data: dataToSend }); }
    else { createMutation.mutate(dataToSend); }
  };

  const isItemProduct = (item: WarehouseItem) => !!item.product_id;
  const isItemRawMaterial = (item: WarehouseItem) => !!item.raw_material_id;
  const getItemName = (item: WarehouseItem) => item.product_name || item.raw_material_name || "—";
  const getItemUnit = (item: WarehouseItem) => item.product_unit_type || item.raw_material_unit_type || "";

  const isRollMaterial = (item: WarehouseItem) =>
    isItemRawMaterial(item) && (item.raw_material_roll_length_m ?? 0) > 0;

  const filteredData = (() => {
    let data = (items ?? []).filter((item) => {
      if (tabMode === "products" && !isItemProduct(item)) return false;
      if (tabMode === "raw_materials" && !isItemRawMaterial(item)) return false;
      if (showLowOnly && item.min_quantity > 0 && (item.quantity - (item.defective_quantity || 0)) > item.min_quantity) return false;
      if (!entityFilters.search) return true;
      const q = entityFilters.search.toLowerCase();
      const name = getItemName(item);
      return name?.toLowerCase().includes(q);
    });
    if (entityFilters.sortField && entityFilters.sortDirection) {
      const dir = entityFilters.sortDirection === "asc" ? 1 : -1;
      data = [...data].sort((a, b) => {
        const av = a[entityFilters.sortField as keyof WarehouseItem];
        const bv = b[entityFilters.sortField as keyof WarehouseItem];
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
        if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
        return 0;
      });
    }
    return data;
  })();

  const baseColumns = [
    { title: "ID", dataIndex: "id", key: "id", width: 60, sorter: (a: WarehouseItem, b: WarehouseItem) => a.id - b.id, sortOrder: toSortOrder(entityFilters.sortField, "id", entityFilters.sortDirection) },
    {
      title: tabMode === "products" ? "Продукт" : "Сырьё",
      key: "name",
      render: (_: unknown, record: WarehouseItem) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Space>
            <span>{getItemName(record)}</span>
            {isItemRawMaterial(record) && <Tag color="orange">сырьё</Tag>}
          </Space>
          {record.components && record.components.length > 0 ? (
            record.components.map((c, i) => (
              <Typography.Text key={i} type="secondary" style={{ fontSize: 11 }}>
                ↳ {c.component_product_id ? "[продукт] " : "[сырьё] "}{c.name || (c.component_product_id ? `#${c.component_product_id}` : `#${c.raw_material_id}`)}
                {c.quantity_per_unit && c.quantity_per_unit > 1 ? ` ×${c.quantity_per_unit}` : ""}
                {c.cut_width_mm && c.cut_height_mm ? ` ${c.cut_width_mm}×${c.cut_height_mm}мм` : ""}
                {c.stock_quantity != null && ` (остаток: ${c.stock_quantity})`}
              </Typography.Text>
            ))
          ) : record.source_raw_material_name && (
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              ↳ сырьё: {record.source_raw_material_name}
              {record.source_raw_material_quantity != null && ` (остаток: ${record.source_raw_material_quantity})`}
            </Typography.Text>
          )}
        </div>
      ),
    },
    {
      title: "Остаток", dataIndex: "quantity", key: "quantity",
      sorter: (a: WarehouseItem, b: WarehouseItem) => (a.quantity - a.defective_quantity) - (b.quantity - b.defective_quantity),
      render: (_: number, record: WarehouseItem) => {
        const available = record.quantity - (record.defective_quantity || 0);
        const isLow = record.min_quantity > 0 && available <= record.min_quantity;
        const unit = getItemUnit(record);

        if (record.source_raw_material_name && available === 0) {
          return <Tag color="orange" style={{ margin: 0 }}>из сырья</Tag>;
        }

        if (isRollMaterial(record)) {
          return <RollMaterialDisplay record={record} isLow={isLow} />;
        }

        return <SheetMaterialDisplay record={record} isLow={isLow} unit={unit} />;
      },
    },
    {
      title: "Мин. остаток", dataIndex: "min_quantity", key: "min_quantity", ...numberFilter<WarehouseItem>("min_quantity"),
      sorter: (a: WarehouseItem, b: WarehouseItem) => a.min_quantity - b.min_quantity,
      filteredValue: entityFilters.filters["min_quantity"] as string[] | null,
      sortOrder: toSortOrder(entityFilters.sortField, "min_quantity", entityFilters.sortDirection),
    },
    {
      title: "Брак", dataIndex: "defective_quantity", key: "defective_quantity",
      sorter: (a: WarehouseItem, b: WarehouseItem) => a.defective_quantity - b.defective_quantity,
      sortOrder: toSortOrder(entityFilters.sortField, "defective_quantity", entityFilters.sortDirection),
      render: (v: number, record: WarehouseItem) => {
        if (!v) return <span style={{ color: "#999" }}>—</span>;
        return (
          <Tooltip title={record.defective_reason || undefined}>
            <Space>
              <span style={{ fontWeight: 600, color: "#cf1322" }}>{v}</span>
              <WarningOutlined style={{ color: "#cf1322" }} />
            </Space>
          </Tooltip>
        );
      },
    },
    {
      title: "Действия", key: "actions", width: 130,
      render: (_: unknown, record: WarehouseItem) => (
        <Space>
          {(record.pending_writeoffs_count ?? 0) > 0 && (
            <Tooltip title={`Ожидает списания: ${record.pending_writeoffs_count}`}>
              <Button type="link" size="small" icon={<ExclamationCircleOutlined style={{ color: "#ff4d4f", fontSize: 16 }} />} onClick={(e) => { e.stopPropagation(); openPendingWriteoffModal(record); }} style={{ padding: 0 }} />
            </Tooltip>
          )}
          <Tooltip title="История">
            <Button type="link" size="small" icon={<ClockCircleOutlined />} onClick={(e) => { e.stopPropagation(); setAuditEntity({ entityType: "warehouse", entityId: record.id, entityName: getItemName(record) }); setAuditOpen(true); }} />
          </Tooltip>
          <Tooltip title="Редактировать">
            <Button type="link" size="small" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); openEdit(record); }} />
          </Tooltip>
          <Popconfirm title="Удалить со склада?" onConfirm={() => deleteMutation.mutate(record.id)} onCancel={(e) => e?.stopPropagation()}>
            <Tooltip title="Удалить">
              <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const columns = useMemo(() => applyColumnWidths(baseColumns, widths, setWidth), [baseColumns, widths, setWidth]);

  const usedProductIds = new Set((items ?? []).filter((i) => !!i.product_id).map((i) => i.product_id!));
  const usedRawMaterialIds = new Set((items ?? []).filter((i) => !!i.raw_material_id).map((i) => i.raw_material_id!));
  const availableProducts = (products ?? []).filter((p) => editing ? true : !usedProductIds.has(p.id));
  const availableRawMaterials = (rawMaterials ?? []).filter((rm) =>
    editing ? true : !usedRawMaterialIds.has(rm.id)
  );

  const editingType: TabMode = editing
    ? (editing.product_id ? "products" : "raw_materials")
    : tabMode;

  return (
    <>
      <div className="nc-toolbar" style={{ borderBottom: "1px solid #e5e7eb" }}>
        <div className="nc-toolbar-left">
            <Radio.Group value={tabMode} onChange={(e) => handleTabModeChange(e.target.value)} size="small" buttonStyle="solid">
            <Radio.Button value="products">Продукты</Radio.Button>
            <Radio.Button value="raw_materials">Сырьё</Radio.Button>
          </Radio.Group>
          <Input.Search placeholder="Поиск..." allowClear value={entityFilters.search} onChange={(e) => entityFilters.updateSearch(e.target.value)} style={{ width: 250 }} size="small" />
          <Switch checked={showLowOnly} onChange={setShowLowOnly} checkedChildren="Мало" unCheckedChildren="Все" size="small" />
        </div>
        <div className="nc-toolbar-right">
          {selectedRowKeys.length > 0 && (
            <Popconfirm title={`Удалить ${selectedRowKeys.length} ${selectedRowKeys.length === 1 ? "позицию" : "позиций"}?`} onConfirm={() => bulkDeleteMutation.mutate(selectedRowKeys as number[])}>
              <button className="nc-toolbar-btn" style={{ borderColor: "#ff4d4f", color: "#ff4d4f" }}>
                <DeleteOutlined /> Удалить ({selectedRowKeys.length})
              </button>
            </Popconfirm>
          )}
          <button className="nc-toolbar-btn primary" onClick={openCreate}>
            <PlusOutlined /> Позиция
          </button>
        </div>
      </div>

      {!showExtra && (
        <div style={{ marginBottom: 12, textAlign: "center" }}>
          <Button size="small" type="link" onClick={() => setShowExtra(true)}>
            Показать обрезки, списание, историю
          </Button>
        </div>
      )}

      <Collapse
        size="small"
        style={{ marginBottom: 12 }}
        defaultActiveKey={["sklad"]}
        items={[
          {
            key: "sklad",
            label: `Склад (${filteredData.length})`,
            children: <Table dataSource={filteredData} columns={columns} components={{ header: { cell: ResizableHeaderCell } }} rowKey="id" loading={isLoading} pagination={paginationConfig} size="small" rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }} onRow={(record) => ({ onClick: () => setWriteoffDrawerItem(record), style: { cursor: "pointer" } })} onChange={(pagination, filters, sorter) => {
              onPaginationChange(pagination);
              entityFilters.updateFilters(filters as Record<string, unknown>);
              const s = Array.isArray(sorter) ? sorter[0] : sorter;
              if (s && s.columnKey && s.order) {
                entityFilters.updateSort(s.columnKey as string, s.order === "ascend" ? "asc" : "desc");
              } else if (s && !s.order) {
                entityFilters.updateSort(null, "asc");
              }
            }} />,
          },
          ...(showExtra ? [
            {
              key: "offcuts",
              label: "Обрезки",
              children: <OffcutsTab rawMaterials={rawMaterials} />,
            },
            {
              key: "writeoff",
              label: "Списание",
              children: (
                <>
                  <Tabs
                    size="small"
                    destroyInactiveTabPane
                    items={[
                      {
                        key: "product",
                        label: "Продукт",
                        children: (
                          <Form form={productWriteoffForm} layout="inline" onFinish={(v) => writeoffMutation.mutate({ ...v, item_type: "product" })} style={{ gap: 8, flexWrap: "wrap" }}>
                            <Form.Item name="product_id" rules={[{ required: true, message: "Выберите продукт" }]} style={{ marginBottom: 0, minWidth: 220 }}>
                              <Select placeholder="Продукт" showSearch optionFilterProp="label" style={{ width: 220 }}>
                                {(items ?? []).filter((i) => !!i.product_id).map((i) => (
                                  <Select.Option key={i.product_id} value={i.product_id} label={i.product_name}>
                                    {i.product_name} (остаток: {i.quantity})
                                  </Select.Option>
                                ))}
                              </Select>
                            </Form.Item>
                            <Form.Item name="quantity" rules={[{ required: true, message: "Кол-во" }]} style={{ marginBottom: 0 }}>
                              <InputNumber min={0.01} step={0.1} placeholder="Кол-во" style={{ width: 100 }} />
                            </Form.Item>
                            <Form.Item name="reason" style={{ marginBottom: 0, flex: 1, minWidth: 200 }}>
                              <Input placeholder="Причина" />
                            </Form.Item>
                            <Form.Item style={{ marginBottom: 0 }}>
                              <Button type="primary" danger htmlType="submit" loading={writeoffMutation.isPending}>Списать</Button>
                            </Form.Item>
                          </Form>
                        ),
                      },
                      {
                        key: "raw_material",
                        label: "Сырьё",
                        children: (
                          <>
                          <Form form={rawMaterialWriteoffForm} layout="inline" onFinish={(v) => writeoffMutation.mutate({ ...v, item_type: "raw_material" })} style={{ gap: 8, flexWrap: "wrap" }}>
                            <Form.Item name="raw_material_id" rules={[{ required: true, message: "Выберите сырьё" }]} style={{ marginBottom: 0, minWidth: 220 }}>
                              <Select placeholder="Сырьё" showSearch optionFilterProp="label" style={{ width: 220 }}
                                onChange={() => rawMaterialWriteoffForm.setFieldsValue({ quantity: undefined })}
                              >
                                {(items ?? []).filter((i) => !!i.raw_material_id).map((i) => (
                                  <Select.Option key={i.raw_material_id} value={i.raw_material_id} label={i.raw_material_name}>
                                    {i.raw_material_name} (остаток: {i.quantity})
                                  </Select.Option>
                                ))}
                              </Select>
                            </Form.Item>
                            <Form.Item noStyle shouldUpdate={(prev, cur) => prev.raw_material_id !== cur.raw_material_id}>
                              {() => {
                                const rmId = rawMaterialWriteoffForm.getFieldValue("raw_material_id");
                                const rm = rawMaterials?.find((r) => r.id === rmId);
                                const isRoll = !!rm?.roll_length_m;
                                const label = isRoll ? `Кол-во, м (рулон ${rm!.roll_width_m ? rm!.roll_width_m * 1000 + "×" : ""}${rm!.roll_length_m! * 1000}мм)` : "Кол-во";
                                return (
                                  <Form.Item name="quantity" rules={[{ required: true, message: "Кол-во" }]} style={{ marginBottom: 0 }}>
                                    <InputNumber min={0.01} step={isRoll ? 0.5 : 0.1} placeholder={label} style={{ width: 140 }} />
                                  </Form.Item>
                                );
                              }}
                            </Form.Item>
                            <Form.Item name="reason" style={{ marginBottom: 0, flex: 1, minWidth: 200 }}>
                              <Input placeholder="Причина" />
                            </Form.Item>
                            <Form.Item style={{ marginBottom: 0 }}>
                              <Button type="primary" danger htmlType="submit" loading={writeoffMutation.isPending}>Списать</Button>
                            </Form.Item>
                          </Form>
                          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.raw_material_id !== cur.raw_material_id || prev.quantity !== cur.quantity}>
                            {() => {
                              const rmId = rawMaterialWriteoffForm.getFieldValue("raw_material_id");
                              const qty = rawMaterialWriteoffForm.getFieldValue("quantity");
                              const rm = rawMaterials?.find((r) => r.id === rmId);
                              if (!rm || !qty || qty <= 0) return null;
                              if (rm.roll_width_m && rm.unit_price) {
                                const widthM = rm.roll_width_m;
                                const area = qty * widthM;
                                const cost = area * rm.unit_price;
                                return (
                                  <div style={{ padding: "4px 0", fontSize: 13, color: "#666" }}>
                                    {qty} м × {widthM} м ширина = <b>{area.toFixed(1)} м²</b> × {rm.unit_price.toLocaleString()} ₽/м² = <b style={{ color: "#cf1322" }}>{cost.toLocaleString()} ₽</b>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          </Form.Item>
                          </>
                        ),
                      },
                    ]}
                  />
                </>
              ),
            },
            {
              key: "history",
              label: `История (${writeoffs?.length || 0})`,
              children: (
                <>
                  {canViewPrices && writeoffs && writeoffs.length > 0 && (
                    <div style={{ padding: "6px 12px", background: "#fff2f0", borderRadius: 6, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <Typography.Text>Списано на сумму:</Typography.Text>
                      <Typography.Text strong style={{ color: "#cf1322" }}>
                        {writeoffs.reduce((sum, w) => sum + (w.total_value ?? 0), 0).toLocaleString()} ₽
                      </Typography.Text>
                    </div>
                  )}
                <Table
                  dataSource={writeoffs}
                  rowKey="id"
                  size="small"
                  pagination={{ pageSize: 5, showTotal: (t) => `Всего: ${t}` }}
                  columns={[
                    { title: "Дата", dataIndex: "created_at", width: 150, render: (v: string) => new Date(v).toLocaleString("ru-RU") },
                    { title: "Тип", dataIndex: "item_type", width: 90, render: (v: string) => <Tag color={v === "product" ? "blue" : "orange"}>{v === "product" ? "Продукт" : "Сырьё"}</Tag> },
                    { title: "Наименование", dataIndex: "item_name", width: 180 },
                    { title: "Кол-во", dataIndex: "quantity", width: 90, render: (_: number, record: StockWriteoff) => {
                      if (record.item_type === "raw_material" && record.raw_material_id) {
                        const rm = rawMaterials?.find((r) => r.id === record.raw_material_id);
                        if (rm?.roll_width_m && rm.unit_price) {
                          const area = record.quantity * rm.roll_width_m;
                          return <span>{record.quantity} м<br/><span style={{ fontSize: 11, color: "#999" }}>({area.toFixed(1)} м²)</span></span>;
                        }
                      }
                      return record.quantity;
                    }},
                    ...(canViewPrices ? [{ title: "Стоимость", dataIndex: "total_value", width: 120, render: (v: number | null, record: StockWriteoff) => {
                      if (v == null) return "—";
                      if (record.item_type === "raw_material" && record.raw_material_id) {
                        const rm = rawMaterials?.find((r) => r.id === record.raw_material_id);
                        if (rm?.roll_width_m && rm.unit_price) {
                          const area = record.quantity * rm.roll_width_m;
                          return <span>{v.toLocaleString()} ₽<br/><span style={{ fontSize: 11, color: "#999" }}>{area.toFixed(1)} м² × {rm.unit_price} ₽/м²</span></span>;
                        }
                      }
                      return `${v.toLocaleString()} ₽`;
                    } }] : []),
                    { title: "Причина", dataIndex: "reason", ellipsis: true, render: (_: unknown, record: StockWriteoff) => {
                      if (record.order_id) {
                        const offcutMatch = record.reason?.match(/обрезок\s+(\d+\.?\d*)×(\d+\.?\d*)\s*мм/i);
                        if (offcutMatch) {
                          return <span><Tag color="purple">Обрезок</Tag> <span style={{ fontSize: 11 }}>{offcutMatch[1]}×{offcutMatch[2]} мм</span> <a href={`/orders`} onClick={(e) => e.stopPropagation()}>Заказ #{record.order_id}</a></span>;
                        }
                        return <span><Tag color="purple">Заказ</Tag> <a href={`/orders`} onClick={(e) => e.stopPropagation()}>#{record.order_id}</a></span>;
                      }
                      if (record.reason && record.reason.toLowerCase().includes("брак")) {
                        return <span><Tag color="red">Брак</Tag> {record.reason}</span>;
                      }
                      return record.reason || "—";
                    } },
                    { title: "Остаток", dataIndex: "remaining_offcut", width: 120, render: (_: unknown, record: StockWriteoff) => {
                      if (record.remaining_width && record.remaining_height) {
                        return <span style={{ fontSize: 11, color: "#52c41a" }}>→ {record.remaining_width}×{record.remaining_height} мм</span>;
                      }
                      return "—";
                    } },
                    { title: "Кто", dataIndex: "created_by_name", width: 120 },
                    ...(canViewPrices ? [{
                      title: "", width: 60,
                      render: (_: unknown, record: StockWriteoff) => (
                        <Popconfirm title="Отменить? Остатки восстановятся." onConfirm={() => reverseMutation.mutate(record.id)}>
                          <Button type="link" danger size="small">Отменить</Button>
                        </Popconfirm>
                      ),
                    }] : []),
                  ]}
                />
              </>
            ),
          },
        ] : [])
        ]}
      />

      <Modal title={editing ? "Редактировать остатки" : "Добавить на склад"} open={modalOpen} onCancel={() => { setModalOpen(false); setEditing(null); }} onOk={() => form.validateFields().then(onFinish).catch(() => {})} confirmLoading={createMutation.isPending || updateMutation.isPending}>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          {editing ? (
            editingType === "products" ? (
              <Form.Item label="Тип"><Tag color="blue">Продукт</Tag></Form.Item>
            ) : (
              <Form.Item label="Тип"><Tag color="orange">Сырьё</Tag></Form.Item>
            )
          ) : (
            <Form.Item name="raw_material_id" hidden initialValue={undefined}>
              <Input />
            </Form.Item>
          )}
          {!editing && (
            <Form.Item label="Тип позиции" rules={[{ required: true }]}>
              <Radio.Group
                value={tabMode}
                onChange={(e) => {
                  const val: TabMode = e.target.value;
                  handleTabModeChange(val);
                  form.setFieldsValue({ product_id: undefined, raw_material_id: undefined });
                }}
              >
                <Radio.Button value="products">Продукт</Radio.Button>
                <Radio.Button value="raw_materials">Сырьё</Radio.Button>
              </Radio.Group>
            </Form.Item>
          )}
          {tabMode === "products" && (
            <Form.Item name="product_id" label="Продукт" rules={[{ required: true, message: "Выберите продукт" }]}>
              <Select placeholder="Выберите продукт" disabled={!!editing} showSearch optionFilterProp="label">
                {availableProducts.map((p) => (<Select.Option key={p.id} value={p.id} label={p.name}>{p.name} ({unitTypeLabels[p.unit_type] || p.unit_type})</Select.Option>))}
              </Select>
            </Form.Item>
          )}
          {tabMode === "raw_materials" && (
            <Form.Item name="raw_material_id" label="Сырьё" rules={[{ required: true, message: "Выберите сырьё" }]}>
              <Select placeholder="Выберите сырьё" disabled={!!editing} showSearch optionFilterProp="label">
                {availableRawMaterials.map((rm) => (
                  <Select.Option key={rm.id} value={rm.id} label={rm.name}>{rm.name} ({unitTypeLabels[rm.unit_type] || rm.unit_type})</Select.Option>
                ))}
              </Select>
            </Form.Item>
          )}
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.raw_material_id !== cur.raw_material_id}>
            {() => {
              const rmId = form.getFieldValue("raw_material_id") || editing?.raw_material_id;
              const rm = rmId ? rawMaterials?.find((r) => r.id === rmId) : null;
              if (!rm?.roll_length_m) {
                return (
                  <Form.Item name="quantity" label="Количество на складе" rules={[{ required: true, message: "Укажите количество" }]} initialValue={0}>
                    <InputNumber min={0} style={{ width: "100%" }} />
                  </Form.Item>
                );
              }
              return (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <Typography.Text strong style={{ fontSize: 13 }}>Количество на складе</Typography.Text>
                    <Radio.Group size="small" value={rollInputMode} onChange={(e) => setRollInputMode(e.target.value)}>
                      <Radio.Button value="rolls">Ролики</Radio.Button>
                      <Radio.Button value="meters">Метры</Radio.Button>
                    </Radio.Group>
                  </div>
                  <Form.Item name="quantity" rules={[{ required: true, message: "Укажите количество" }]} initialValue={0}>
                    {rollInputMode === "rolls"
                      ? <InputNumber min={0} step={0.01} placeholder={`Роликов (${rm.roll_length_m}м/рулон)`} style={{ width: "100%" }} />
                      : <InputNumber min={0} step={1} placeholder={`Метраж (всего м)`} style={{ width: "100%" }} />
                    }
                  </Form.Item>
                </>
              );
            }}
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.raw_material_id !== cur.raw_material_id || prev.quantity !== cur.quantity}>
            {() => {
              const rmId = form.getFieldValue("raw_material_id") || editing?.raw_material_id;
              const rm = rmId ? rawMaterials?.find((r) => r.id === rmId) : null;
              if (!rm?.roll_length_m) return null;
              const quantity: number = form.getFieldValue("quantity") ?? 0;
              if (rollInputMode === "rolls") {
                const totalMeters = Number((quantity * rm.roll_length_m).toFixed(2));
                return (
                  <div style={{ padding: "6px 12px", background: "#f6f8fa", borderRadius: 6, marginBottom: 16, fontSize: 13, color: "#666" }}>
                    {quantity} {quantity === 1 ? "рулон" : quantity >= 2 && quantity <= 4 ? "рулона" : "рулонов"} × {rm.roll_length_m}м = <b>{totalMeters}</b> м
                  </div>
                );
              }
              const rolls = quantity > 0 ? (quantity / rm.roll_length_m).toFixed(2) : "0";
              return (
                <div style={{ padding: "6px 12px", background: "#f6f8fa", borderRadius: 6, marginBottom: 16, fontSize: 13, color: "#666" }}>
                  <b>{quantity}</b> м = {rolls} {Number(rolls) === 1 ? "рулон" : Number(rolls) >= 2 && Number(rolls) <= 4 ? "рулона" : "рулонов"} ({rm.roll_length_m}м/рулон)
                </div>
              );
            }}
          </Form.Item>
          <Form.Item name="min_quantity" label="Минимальный остаток" tooltip="При достижении этого значения будет предупреждение" initialValue={0}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="defective_quantity" label="Количество брака" tooltip="Товар от поставщика, который нужно списать" initialValue={0}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="defective_reason" label="Причина брака" tooltip="Необязательно" initialValue=""><Input.TextArea rows={2} placeholder="Например: повреждена упаковка, не тот цвет..." /></Form.Item>
          <Divider style={{ margin: "4px 0 12px" }} />
          <Form.Item name="stock_calculation_script" label="Скрипт расчёта остатков" tooltip="Скрипт для расчёта расхода сырья при списании">
            <Select allowClear placeholder="По умолчанию" options={(scripts ?? []).map((s) => ({ value: s.name, label: s.name }))} />
          </Form.Item>
          <Form.Item name="display_format_script" label="Скрипт форматирования" tooltip="Скрипт для отображения остатков на складе">
            <Select allowClear placeholder="По умолчанию" options={(scripts ?? []).map((s) => ({ value: s.name, label: s.name }))} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={writeoffDrawerItem ? getItemName(writeoffDrawerItem) : ""}
        open={!!writeoffDrawerItem}
        onClose={() => setWriteoffDrawerItem(null)}
        width={600}
      >
        {writeoffDrawerItem && (() => {
          const itemWriteoffs = (writeoffs ?? []).filter((w) =>
            (writeoffDrawerItem.product_id && w.product_id === writeoffDrawerItem.product_id) ||
            (writeoffDrawerItem.raw_material_id && w.raw_material_id === writeoffDrawerItem.raw_material_id)
          );
          return (
            <>
              <Descriptions size="small" bordered column={1} style={{ marginBottom: 16 }}>
                <Descriptions.Item label="Тип">{writeoffDrawerItem.product_id ? "Продукт" : "Сырьё"}</Descriptions.Item>
                <Descriptions.Item label="Остаток">{writeoffDrawerItem.quantity}</Descriptions.Item>
                {writeoffDrawerItem.defective_quantity ? <Descriptions.Item label="Брак">{writeoffDrawerItem.defective_quantity}</Descriptions.Item> : null}
              </Descriptions>
              {itemWriteoffs.length === 0 ? (
                <Typography.Text type="secondary">Нет списаний для этой позиции</Typography.Text>
              ) : (
                <>
                  <div style={{ padding: "6px 12px", background: "#fff2f0", borderRadius: 6, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Typography.Text>Списано ({itemWriteoffs.length}):</Typography.Text>
                    {canViewPrices ? (
                      <Typography.Text strong style={{ color: "#cf1322" }}>
                        {itemWriteoffs.reduce((sum, w) => sum + (w.total_value ?? 0), 0).toLocaleString()} ₽
                      </Typography.Text>
                    ) : (
                      <span />
                    )}
                  </div>
                  <Table
                    dataSource={itemWriteoffs}
                    rowKey="id"
                    size="small"
                    pagination={{ pageSize: 10, showTotal: (t) => `Всего: ${t}` }}
                    columns={[
                      { title: "Дата", dataIndex: "created_at", render: (v: string) => new Date(v).toLocaleString("ru-RU") },
                      { title: "Кол-во", dataIndex: "quantity", width: 90, render: (_: number, record: StockWriteoff) => {
                        if (record.item_type === "raw_material" && record.raw_material_id) {
                          const rm = rawMaterials?.find((r) => r.id === record.raw_material_id);
                          if (rm?.roll_width_m && rm.unit_price) {
                            const area = record.quantity * rm.roll_width_m;
                            return <span>{record.quantity} м<br/><span style={{ fontSize: 11, color: "#999" }}>({area.toFixed(1)} м²)</span></span>;
                          }
                        }
                        return record.quantity;
                      }},
                      ...(canViewPrices ? [{ title: "Сумма", dataIndex: "total_value", width: 100, render: (v: number | null) => v != null ? `${v.toLocaleString()} ₽` : "—" }] : []),
                      { title: "Причина", dataIndex: "reason", render: (_: unknown, record: StockWriteoff) => {
                        if (record.order_id) {
                          return <span><Tag color="purple">Заказ</Tag> #{record.order_id}</span>;
                        }
                        return record.reason || "—";
                      }},
                      { title: "Кто", dataIndex: "created_by_name", width: 120 },
                    ]}
                  />
                </>
              )}
            </>
          );
        })()}
      </Drawer>

      <AuditLogDrawer
        open={!!auditOpen && !!auditEntity}
        onClose={() => { setAuditOpen(false); setAuditEntity(null); }}
        entityType={auditEntity?.entityType || "warehouse"}
        entityId={auditEntity?.entityId ?? null}
        entityName={auditEntity?.entityName}
      />

      <Modal
        title={<><ExclamationCircleOutlined style={{ color: "#faad14", marginRight: 8 }} />Ручное списание со склада</>}
        open={!!pendingWriteoffModalItem}
        onCancel={() => { setPendingWriteoffModalItem(null); setPendingWriteoffs([]); }}
        footer={null}
        width={500}
      >
        {pendingWriteoffModalItem && (
          <div>
            <Descriptions size="small" bordered column={1} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Сырьё">{pendingWriteoffModalItem.raw_material_name}</Descriptions.Item>
              <Descriptions.Item label="Остаток на складе">{pendingWriteoffModalItem.quantity}</Descriptions.Item>
            </Descriptions>
            {pendingWriteoffs.length === 0 ? (
              <Typography.Text type="secondary">Нет ожидающих списания</Typography.Text>
            ) : (
              pendingWriteoffs.map((pw) => (
                  <div key={pw.order_item_id} style={{ padding: "8px 12px", background: "#fffbe6", border: "1px solid #ffe58f", borderRadius: 4, marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div><strong>Заказ #{pw.order_id}</strong></div>
                      <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                        {pw.cut_width_mm && pw.cut_height_mm && (
                          <div>Отрез: {pw.cut_width_mm}×{pw.cut_height_mm} мм</div>
                        )}
                        {pw.quantity != null && <div>Количество: {pw.quantity}</div>}
                        {pw.already_written_off && <div style={{ color: "#52c41a", marginTop: 2 }}>✓ Уже списано</div>}
                      </div>
                    </div>
                    <Space>
                      {pw.already_written_off ? (
                        <Button
                          size="small"
                          danger
                          onClick={() => cancelWriteoffMutation.mutate(pw.order_item_id)}
                          loading={cancelWriteoffMutation.isPending}
                        >
                          Отменить списание
                        </Button>
                      ) : (
                        <>
                          <Button
                            size="small"
                            onClick={() => cancelWriteoffMutation.mutate(pw.order_item_id)}
                            loading={cancelWriteoffMutation.isPending}
                          >
                            Отмена
                          </Button>
                          <Button
                            type="primary"
                            size="small"
                            onClick={() => confirmWriteoffMutation.mutate({ itemId: pendingWriteoffModalItem.id, orderItemId: pw.order_item_id })}
                            loading={confirmWriteoffMutation.isPending}
                          >
                            Списать
                          </Button>
                        </>
                      )}
                    </Space>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
