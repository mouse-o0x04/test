import { PlusOutlined, UnorderedListOutlined, DeleteOutlined, EditOutlined, ClockCircleOutlined } from "@ant-design/icons";
import {
  Button,
  Col,
  Collapse,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { createRawMaterial, deleteRawMaterial, getRawMaterials, updateRawMaterial, bulkDeleteRawMaterials } from "../api/rawMaterials";
import AuditLogDrawer from "../components/AuditLogDrawer";
import { createWarehouseItem, getWarehouseItems, updateWarehouseItem } from "../api/warehouse";
import { textFilter } from "../components/TableFilters";
import { useColumnState, applyColumnWidths } from "../hooks/useColumnState";
import { useTablePagination } from "../hooks/useTablePagination";
import { useEntityFilters } from "../hooks/useEntityFilters";
import { ResizableHeaderCell } from "../components/ResizableHeaderCell";
import { useViewMode } from "../hooks/useViewMode";
import type { RawMaterial, RawMaterialFormData } from "../types";
import { toSortOrder } from "../utils/sort";

export default function RawMaterialsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RawMaterial | null>(null);
  const [form] = Form.useForm<RawMaterialFormData>();
  const entityFilters = useEntityFilters("rawMaterials");
  const { widths, setWidth } = useColumnState("rawMaterials");
  const [viewMode, setViewMode] = useViewMode("rawMaterials", "table");
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const { paginationConfig, onPaginationChange } = useTablePagination();
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditEntity, setAuditEntity] = useState<{ entityType: string; entityId: number; entityName?: string } | null>(null);

  const { data: rawMaterials, isLoading } = useQuery({ queryKey: ["rawMaterials"], queryFn: getRawMaterials });
  const { data: warehouseItems } = useQuery({ queryKey: ["warehouse"], queryFn: getWarehouseItems });

  const createMutation = useMutation({
    mutationFn: createRawMaterial,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rawMaterials"] });
      message.success("Сырьё создано");
      setModalOpen(false);
      form.resetFields();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<RawMaterialFormData> }) => updateRawMaterial(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rawMaterials"] });
      message.success("Сырьё обновлено");
      setModalOpen(false);
      setEditing(null);
      form.resetFields();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRawMaterial,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rawMaterials"] });
      message.success("Сырьё удалено");
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: bulkDeleteRawMaterials,
    onSuccess: (data) => { queryClient.invalidateQueries({ queryKey: ["rawMaterials"] }); message.success(`Удалено: ${data.deleted}`); setSelectedRowKeys([]); },
    onError: () => message.error("Ошибка удаления"),
  });

  const [warehouseModalOpen, setWarehouseModalOpen] = useState(false);
  const [warehouseTarget, setWarehouseTarget] = useState<RawMaterial | null>(null);
  const [warehouseForm] = Form.useForm();

  const addToWarehouseMutation = useMutation({
    mutationFn: async (data: { raw_material_id: number; quantity: number; min_quantity: number }) => {
      const rm = rawMaterials?.find((r) => r.id === data.raw_material_id);
      const qtyInMeters = rm?.roll_length_m ? data.quantity * rm.roll_length_m : data.quantity;
      const freshWarehouse = await queryClient.fetchQuery({ queryKey: ["warehouse"], queryFn: getWarehouseItems });
      const existing = freshWarehouse?.find((w) => w.raw_material_id === data.raw_material_id);
      if (existing) {
        return updateWarehouseItem(existing.id, { quantity: existing.quantity + qtyInMeters, min_quantity: data.min_quantity });
      }
      return createWarehouseItem({ raw_material_id: data.raw_material_id, quantity: qtyInMeters, min_quantity: data.min_quantity, defective_quantity: 0 });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse"] });
      message.success("Добавлено на склад");
      setWarehouseModalOpen(false);
      setWarehouseTarget(null);
      warehouseForm.resetFields();
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      message.error(err.response?.data?.detail || "Ошибка добавления на склад");
    },
  });

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (item: RawMaterial) => {
    setEditing(item);
    form.setFieldsValue({
      ...item,
      roll_width_m: item.roll_width_m ? item.roll_width_m * 1000 : undefined,
      roll_length_m: item.roll_length_m ? item.roll_length_m * 1000 : undefined,
    });
    setModalOpen(true);
  };

  const onFinish = (values: RawMaterialFormData) => {
    const data = {
      ...values,
      roll_width_m: values.roll_width_m != null ? values.roll_width_m / 1000 : values.roll_width_m,
      roll_length_m: values.roll_length_m != null ? values.roll_length_m / 1000 : values.roll_length_m,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const filteredData = (() => {
    let data = (rawMaterials ?? []).filter((r) => {
      if (!entityFilters.search) return true;
      const q = entityFilters.search.toLowerCase();
      return r.name?.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q);
    });
    if (entityFilters.sortField && entityFilters.sortDirection) {
      const dir = entityFilters.sortDirection === "asc" ? 1 : -1;
      data = [...data].sort((a, b) => {
        const av = a[entityFilters.sortField as keyof RawMaterial];
        const bv = b[entityFilters.sortField as keyof RawMaterial];
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
        if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
        return 0;
      });
    }
    return data;
  })();

  const baseColumns = [
    {
      title: "ID",
      dataIndex: "id",
      key: "id",
      width: 60,
      sorter: (a: RawMaterial, b: RawMaterial) => a.id - b.id,
      sortOrder: toSortOrder(entityFilters.sortField, "id", entityFilters.sortDirection),
    },
    {
      title: "Название",
      dataIndex: "name",
      key: "name",
      ...textFilter<RawMaterial>("name"),
      sorter: (a: RawMaterial, b: RawMaterial) => a.name.localeCompare(b.name),
      filteredValue: entityFilters.filters["name"] as string[] | null,
      sortOrder: toSortOrder(entityFilters.sortField, "name", entityFilters.sortDirection),
    },
    {
      title: "Размер (мм)",
      key: "dimensions",
      render: (_: unknown, record: RawMaterial) =>
        record.width_mm && record.height_mm ? `${record.width_mm}×${record.height_mm}` : "—",
    },
    {
      title: "Рулон",
      key: "roll",
      render: (_: unknown, record: RawMaterial) =>
        record.roll_width_m && record.roll_length_m
          ? `${record.roll_width_m * 1000} мм × ${record.roll_length_m * 1000} мм`
          : "—",
    },
    {
      title: "Плотность",
      dataIndex: "density",
      key: "density",
      render: (v: string | null) => v || "—",
    },
    {
      title: "Finish",
      dataIndex: "color_finish",
      key: "color_finish",
      render: (v: string | null) => (v ? <Tag>{v}</Tag> : "—"),
    },
    {
      title: "Ед.",
      dataIndex: "unit_type",
      key: "unit_type",
      width: 70,
      render: (v: string) => ({ piece: "шт.", sheet: "лист", m2: "м²", roll: "рулон", set: "комплект" }[v] || v),
    },
    {
      title: "Цена",
      dataIndex: "unit_price",
      key: "unit_price",
      width: 130,
      render: (_: number, record: RawMaterial) => {
        if (!record.unit_price) return "—";
        const isRoll = !!record.roll_width_m || !!record.roll_length_m;
        if (isRoll && record.roll_width_m && record.roll_length_m) {
          const totalArea = record.roll_width_m * record.roll_length_m;
          const totalCost = totalArea * record.unit_price;
          return <span>{record.unit_price.toLocaleString()} ₽/м²<br/><span style={{ fontSize: 11, color: "#999" }}>рулон: {totalCost.toLocaleString()} ₽</span></span>;
        }
        return `${record.unit_price.toLocaleString()} ₽`;
      },
    },
    {
      title: "Действия",
      key: "actions",
      width: 150,
      render: (_: unknown, record: RawMaterial) => {
        const onWarehouse = warehouseItems?.some((w) => w.raw_material_id === record.id);
        return (
          <Space>
            <Tooltip title="История">
              <Button type="link" size="small" icon={<ClockCircleOutlined />} onClick={() => { setAuditEntity({ entityType: "raw_material", entityId: record.id, entityName: record.name }); setAuditOpen(true); }} />
            </Tooltip>
            <Tooltip title="Редактировать">
              <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
            </Tooltip>
            <Tooltip title={onWarehouse ? "Добавить на склад" : "На склад"}>
              <Button
                type="link"
                size="small"
                icon={<PlusOutlined />}
                onClick={() => {
                  setWarehouseTarget(record);
                  warehouseForm.resetFields();
                  warehouseForm.setFieldsValue({ quantity: 0, min_quantity: 0 });
                  setWarehouseModalOpen(true);
                }}
              />
            </Tooltip>
            <Popconfirm title="Удалить сырьё?" onConfirm={() => deleteMutation.mutate(record.id)}>
              <Tooltip title="Удалить">
                <Button type="link" danger size="small" icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  const columns = useMemo(() => applyColumnWidths(baseColumns, widths, setWidth), [baseColumns, widths, setWidth]);

  return (
    <>
      <div className="nc-toolbar" style={{ borderBottom: "1px solid #e5e7eb" }}>
        <div className="nc-toolbar-left">
          <Input.Search
            placeholder="Поиск..."
            allowClear
            value={entityFilters.search}
            onChange={(e) => entityFilters.updateSearch(e.target.value)}
            style={{ width: 250 }}
            size="small"
          />
          <button
            className={`nc-toolbar-btn ${viewMode === "table" ? "active" : ""}`}
            onClick={() => setViewMode("table")}
          >
            <UnorderedListOutlined /> Таблица
          </button>
        </div>
        <div className="nc-toolbar-right">
          {selectedRowKeys.length > 0 && (
            <Popconfirm title={`Удалить ${selectedRowKeys.length} ${selectedRowKeys.length === 1 ? "сырьё" : "сырья"}?`} onConfirm={() => bulkDeleteMutation.mutate(selectedRowKeys as number[])}>
              <button className="nc-toolbar-btn" style={{ borderColor: "#ff4d4f", color: "#ff4d4f" }}>
                <DeleteOutlined /> Удалить ({selectedRowKeys.length})
              </button>
            </Popconfirm>
          )}
          <button className="nc-toolbar-btn primary" onClick={openCreate}>
            <PlusOutlined /> Сырьё
          </button>
        </div>
      </div>

      <Table
        dataSource={filteredData}
        columns={columns}
        components={{ header: { cell: ResizableHeaderCell } }}
        rowKey="id"
        loading={isLoading}
        pagination={paginationConfig}
        size="small"
        rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
        onChange={(pagination, filters, sorter) => {
          onPaginationChange(pagination);
          entityFilters.updateFilters(filters as Record<string, unknown>);
          const s = Array.isArray(sorter) ? sorter[0] : sorter;
          if (s && s.columnKey && s.order) {
            entityFilters.updateSort(s.columnKey as string, s.order === "ascend" ? "asc" : "desc");
          } else if (s && !s.order) {
            entityFilters.updateSort(null, "asc");
          }
        }}
        onRow={(record) => ({
          onClick: (e) => {
            if ((e.target as HTMLElement).closest("button, .ant-btn")) return;
            openEdit(record);
          },
          style: { cursor: "pointer" },
        })}
      />

      <Modal
        title={editing ? "Редактировать сырьё" : "Новое сырьё"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.validateFields().then(onFinish).catch(() => {})}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="name" label="Название" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Divider orientation="left" orientationMargin={0} style={{ fontSize: 12, marginTop: 0 }}>
            Размеры и параметры
          </Divider>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="width_mm" label="Ширина, мм">
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="height_mm" label="Высота, мм">
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="unit_type" label="Ед. изм.">
                <Select>
                  <Select.Option value="piece">шт.</Select.Option>
                  <Select.Option value="sheet">лист</Select.Option>
                  <Select.Option value="m2">м²</Select.Option>
                  <Select.Option value="roll">рулон</Select.Option>
                  <Select.Option value="set">комплект</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Divider orientation="left" orientationMargin={0} style={{ fontSize: 12 }}>
            Рулонные параметры
          </Divider>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="roll_width_m" label="Ширина рулона, мм">
                <InputNumber min={0} step={10} precision={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="roll_length_m" label="Длина рулона, мм">
                <InputNumber min={0} step={100} precision={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
          <Divider orientation="left" orientationMargin={0} style={{ fontSize: 12 }}>
            Плотность и цвет
          </Divider>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="density" label="Плотность, г/м²">
                <Input placeholder="440" />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item name="color_finish" label="Цвет / finish">
                <Select
                  allowClear
                  placeholder="Выберите"
                  options={[
                    { value: "матовый", label: "матовый" },
                    { value: "глянцевый", label: "глянцевый" },
                    { value: "прозрачный матовый", label: "прозрачный матовый" },
                    { value: "прозрачный глянцевый", label: "прозрачный глянцевый" },
                    { value: "белый", label: "белый" },
                    { value: "чёрный", label: "чёрный" },
                    { value: "серый", label: "серый" },
                    { value: "холст", label: "холст" },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Divider orientation="left" orientationMargin={0} style={{ fontSize: 12 }}>
            Цена
          </Divider>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.roll_width_m !== cur.roll_width_m || prev.roll_length_m !== cur.roll_length_m}>
            {() => {
              const rw = form.getFieldValue("roll_width_m");
              const rl = form.getFieldValue("roll_length_m");
              const isRoll = (rw && rw > 0) || (rl && rl > 0);
              return (
                <Form.Item name="unit_price" label={isRoll ? "Цена за м²" : "Цена за единицу"}>
                  <InputNumber min={0} style={{ width: "100%" }} prefix="₽" />
                </Form.Item>
              );
            }}
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.roll_width_m !== cur.roll_width_m || prev.roll_length_m !== cur.roll_length_m || prev.unit_price !== cur.unit_price}>
            {() => {
              const rw = form.getFieldValue("roll_width_m");
              const rl = form.getFieldValue("roll_length_m");
              const price = form.getFieldValue("unit_price");
              if (!rw || !rl || !price) return null;
              const widthM = rw / 1000;
              const lengthM = rl / 1000;
              const area = widthM * lengthM;
              const totalCost = area * price;
              return (
                <div style={{ padding: "6px 12px", background: "#f6f8fa", borderRadius: 6, marginBottom: 16, fontSize: 13, color: "#666" }}>
                  Рулон: {widthM}м × {lengthM}м = <b>{area.toFixed(1)} м²</b> × {price.toLocaleString()} ₽/м² = <b style={{ color: "#1677ff" }}>{totalCost.toLocaleString()} ₽</b>
                </div>
              );
            }}
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={warehouseItems?.some((w) => w.raw_material_id === warehouseTarget?.id) ? `Дополнить: ${warehouseTarget?.name || ""}` : `На склад: ${warehouseTarget?.name || ""}`}
        open={warehouseModalOpen}
        onCancel={() => { setWarehouseModalOpen(false); setWarehouseTarget(null); warehouseForm.resetFields(); }}
        onOk={() => warehouseForm.validateFields().then((v) => {
          if (!warehouseTarget) return;
          addToWarehouseMutation.mutate({
            raw_material_id: warehouseTarget.id,
            quantity: v.quantity,
            min_quantity: v.min_quantity || 0,
          });
        }).catch(() => {})}
        confirmLoading={addToWarehouseMutation.isPending}
      >
        <Form form={warehouseForm} layout="vertical">
          <Form.Item label="Сырьё">
            <Input value={warehouseTarget?.name || ""} disabled />
          </Form.Item>
          {warehouseTarget?.roll_length_m ? (
            <Form.Item name="quantity" label={`Кол-во рулонов (${warehouseTarget.roll_length_m * 1000}мм/рулон)`} rules={[{ required: true, message: "Укажите количество" }]}>
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          ) : (
            <Form.Item name="quantity" label="Количество" rules={[{ required: true, message: "Укажите количество" }]}>
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          )}
          <Form.Item name="min_quantity" label="Минимальный остаток" tooltip="При достижении этого значения будет предупреждение">
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
      <AuditLogDrawer
        open={!!auditOpen && !!auditEntity}
        onClose={() => { setAuditOpen(false); setAuditEntity(null); }}
        entityType={auditEntity?.entityType || "raw_material"}
        entityId={auditEntity?.entityId ?? null}
        entityName={auditEntity?.entityName}
      />
    </>
  );
}
