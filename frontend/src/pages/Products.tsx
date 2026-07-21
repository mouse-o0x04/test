import { AppstoreOutlined, BlockOutlined, BorderOuterOutlined, CalculatorOutlined, DollarOutlined, PlusOutlined, UnorderedListOutlined, DeleteOutlined, EditOutlined, LinkOutlined, ClockCircleOutlined, MinusCircleOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import {
  AutoComplete,
  Button,
  Card,
  Checkbox,
  Col,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { createProduct, deleteProduct, getProducts, updateProduct, bulkDeleteProducts } from "../api/products";
import { getRawMaterials } from "../api/rawMaterials";
import { getScripts } from "../api/scripts";
import CalculatorModal from "../components/CalculatorModal";
import AuditLogDrawer from "../components/AuditLogDrawer";
import { textFilter, numberFilter, selectFilter } from "../components/TableFilters";
import { useAuth } from "../hooks/useAuth";
import { useColumnState, applyColumnWidths } from "../hooks/useColumnState";
import { useTablePagination } from "../hooks/useTablePagination";
import { useEntityFilters } from "../hooks/useEntityFilters";
import { useViewMode } from "../hooks/useViewMode";
import { ResizableHeaderCell } from "../components/ResizableHeaderCell";
import type { Product, ProductFormData } from "../types";
import { toSortOrder } from "../utils/sort";

const unitTypeLabels: Record<string, string> = { piece: "шт.", sheet: "лист", m2: "м²", roll: "рулон", set: "комплект" };

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form] = Form.useForm<ProductFormData>();
  const [viewMode, setViewMode] = useViewMode("products", "table");
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditEntity, setAuditEntity] = useState<{ entityType: string; entityId: number; entityName?: string } | null>(null);
  const [calcModalOpen, setCalcModalOpen] = useState(false);
  const [nestedProductModalOpen, setNestedProductModalOpen] = useState(false);
  const nestedProductCallbackRef = useRef<((p: Product) => void) | null>(null);
  const [nestedProductName, setNestedProductName] = useState<string>("");
  const [nestedForm] = Form.useForm();
  useEffect(() => {
    if (nestedProductModalOpen && nestedProductName) {
      nestedForm.setFieldsValue({ name: nestedProductName });
    }
  }, [nestedProductModalOpen, nestedProductName, nestedForm]);

  const handleCreateNested = (fieldName: number, currentInputName: string) => {
    nestedProductCallbackRef.current = (newProd: Product) => {
      form.setFieldValue(["raw_materials", fieldName, "component_product_id"], newProd.id);
    };
    setNestedProductName(currentInputName || "");
    setNestedProductModalOpen(true);
  };
  const entityFilters = useEntityFilters("products");
  const { widths, setWidth } = useColumnState("products");
  const { user, hasPermission } = useAuth();
  const canViewPrices = hasPermission("prices.view");
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [showSizes, setShowSizes] = useState(false);
  const { paginationConfig, onPaginationChange } = useTablePagination();

  const { data: products, isLoading } = useQuery({ queryKey: ["products"], queryFn: getProducts });
  const { data: scripts } = useQuery({ queryKey: ["scripts"], queryFn: getScripts });
  const { data: rawMaterials } = useQuery({ queryKey: ["rawMaterials"], queryFn: getRawMaterials });

  const createMutation = useMutation({
    mutationKey: ["createProduct"],
    mutationFn: createProduct,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["products"] }); message.success("Продукт создан"); setModalOpen(false); form.resetFields(); },
  });

  const nestedCreateMutation = useMutation({
    mutationKey: ["createNestedProduct"],
    mutationFn: createProduct,
    onSuccess: (newProd: Product) => {
      if (!newProd || !newProd.id) {
        message.error("Сервер вернул некорректный ответ при создании продукта");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["products"] });
      message.success(`Под-продукт «${newProd.name}» создан (ID: ${newProd.id})`);
      try {
        nestedProductCallbackRef.current?.(newProd);
        nestedProductCallbackRef.current = null;
      } catch (e) {
        console.error("nested callback error:", e);
      }
      setNestedProductModalOpen(false);
      setNestedProductName("");
      nestedForm.resetFields();
    },
    onError: (err: any) => message.error(err?.response?.data?.detail || "Не удалось создать под-продукт"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ProductFormData> }) => updateProduct(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["products"] }); message.success("Продукт обновлён"); setModalOpen(false); setEditing(null); form.resetFields(); },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["products"] }); message.success("Продукт удалён"); },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: bulkDeleteProducts,
    onSuccess: (data) => { queryClient.invalidateQueries({ queryKey: ["products"] }); message.success(`Удалено: ${data.deleted}`); setSelectedRowKeys([]); },
    onError: () => message.error("Ошибка удаления"),
  });

  const openCreate = () => { setEditing(null); form.resetFields(); setShowSizes(false); setModalOpen(true); };
  const openEdit = (product: Product) => {
    setEditing(product);
    const materials = product.raw_materials?.length
      ? product.raw_materials.map(m => ({
            raw_material_id: m.raw_material_id ?? undefined,
            component_product_id: m.component_product_id ?? undefined,
            coefficient: m.coefficient,
            name: m.component_product_name || m.name,
            cut_width_mm: m.cut_width_mm,
            cut_height_mm: m.cut_height_mm,
            quantity_per_unit: m.quantity_per_unit || 1,
            price_per_unit: m.price_per_unit,
            sort_order: m.sort_order,
          }))
      : product.raw_material_id ? [{ raw_material_id: product.raw_material_id, coefficient: product.material_coefficient, quantity_per_unit: 1 }] : [];
    setShowSizes(!!materials.some((m: any) => m.cut_width_mm || m.cut_height_mm));
    form.setFieldsValue({ ...product, raw_materials: materials });
    setModalOpen(true);
  };

  const onFinish = (values: ProductFormData) => {
    const materials = (values as any).raw_materials;
    const rawMaterialId = (values as any).raw_material_id;
    const payload = { ...values } as any;

    if (materials && materials.length > 0) {
      // Composite product — components are sub-products
      for (const m of materials) {
        if (!m.component_product_id) {
          message.error("Каждый компонент должен быть привязан к продукту. Выберите продукт из списка или создайте новый.");
          return;
        }
      }
      payload.raw_materials = materials.map((m: any, idx: number) => ({
        raw_material_id: null,
        component_product_id: m.component_product_id || null,
        coefficient: m.coefficient || 1,
        name: m.name || undefined,
        cut_width_mm: showSizes ? (m.cut_width_mm || undefined) : undefined,
        cut_height_mm: showSizes ? (m.cut_height_mm || undefined) : undefined,
        quantity_per_unit: m.quantity_per_unit || 1,
        price_per_unit: m.price_per_unit || undefined,
        sort_order: idx,
      }));
    } else if (rawMaterialId) {
      // Simple product — produced from raw material
      payload.raw_materials = [{
        raw_material_id: rawMaterialId,
        component_product_id: null,
        coefficient: (values as any).material_coefficient || 1,
        name: undefined,
        cut_width_mm: undefined,
        cut_height_mm: undefined,
        quantity_per_unit: 1,
        price_per_unit: undefined,
        sort_order: 0,
      }];
    } else {
      payload.raw_materials = [];
    }
    if (editing) { updateMutation.mutate({ id: editing.id, data: payload }); }
    else { createMutation.mutate(payload); }
  };

  const filteredData = (() => {
    let data = (products ?? []).filter((p) => {
      if (!entityFilters.search) return true;
      const q = entityFilters.search.toLowerCase();
      return p.name?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q);
    });
    if (entityFilters.sortField && entityFilters.sortDirection) {
      const dir = entityFilters.sortDirection === "asc" ? 1 : -1;
      data = [...data].sort((a, b) => {
        const av = a[entityFilters.sortField as keyof Product];
        const bv = b[entityFilters.sortField as keyof Product];
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
        if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
        return 0;
      });
    }
    return data;
  })();

  const unitTypes = [...new Set((products ?? []).map((p) => p.unit_type))];
  const categories = [...new Set((products ?? []).map((p) => p.category).filter(Boolean))];

  const baseColumns = [
    { title: "ID", dataIndex: "id", key: "id", width: 60, sorter: (a: Product, b: Product) => a.id - b.id, sortOrder: toSortOrder(entityFilters.sortField, "id", entityFilters.sortDirection) },
    { title: "Название", dataIndex: "name", key: "name", ...textFilter<Product>("name"), sorter: (a: Product, b: Product) => a.name.localeCompare(b.name), filteredValue: entityFilters.filters["name"] as string[] | null, sortOrder: toSortOrder(entityFilters.sortField, "name", entityFilters.sortDirection) },
    { title: "Категория", dataIndex: "category", key: "category", ...textFilter<Product>("category"), filters: categories.map((c) => ({ text: c!, value: c! })), onFilter: (v: unknown, r: Product) => r.category === v, filteredValue: entityFilters.filters["category"] as string[] | null },
    ...(canViewPrices ? [{ title: "Цена", dataIndex: "unit_price", key: "unit_price", render: (v: number) => `${v.toLocaleString()} ₽`, ...numberFilter<Product>("unit_price"), sorter: (a: Product, b: Product) => a.unit_price - b.unit_price, filteredValue: entityFilters.filters["unit_price"] as string[] | null, sortOrder: toSortOrder(entityFilters.sortField, "unit_price", entityFilters.sortDirection) }] : []),
    { title: "Ед. изм.", dataIndex: "unit_type", key: "unit_type", ...selectFilter<Product>("unit_type", unitTypes.map((t) => ({ text: unitTypeLabels[t] || t, value: t }))), filteredValue: entityFilters.filters["unit_type"] as string[] | null },
    ...(canViewPrices ? [{
      title: "Формула", dataIndex: "formula", key: "formula",
      filters: [{ text: "С формулой", value: "yes" }, { text: "Без формулы", value: "no" }],
      onFilter: (v: unknown, r: Product) => v === "yes" ? !!r.formula : !r.formula,
      filteredValue: entityFilters.filters["formula"] as string[] | null,
      render: (v: string | null, record: Product) => {
        if (record.formula_script) return <Tooltip title="Расчёт по скрипту"><Tag color="green">{record.formula_script}</Tag></Tooltip>;
        if (v) return <Tooltip title="Цена рассчитывается по формуле"><Tag color="purple">{v}</Tag></Tooltip>;
        return <Tag>фиксированная</Tag>;
      },
    }] : []),
    {
      title: "", key: "supplier", width: 40,
      render: (_: unknown, record: Product) => record.supplier_url ? (
        <Tooltip title="Ссылка на товар"><Button type="link" size="small" icon={<LinkOutlined />} href={record.supplier_url} target="_blank" onClick={(e) => e.stopPropagation()} /></Tooltip>
      ) : null,
    },
    {
      title: "Действия", key: "actions", width: 120,
      render: (_: unknown, record: Product) => (
        <Space>
          <Tooltip title="История">
            <Button type="link" size="small" icon={<ClockCircleOutlined />} onClick={(e) => { e.stopPropagation(); setAuditEntity({ entityType: "product", entityId: record.id, entityName: record.name }); setAuditOpen(true); }} />
          </Tooltip>
          <Tooltip title="Редактировать">
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          </Tooltip>
          <Popconfirm title="Удалить продукт?" onConfirm={() => deleteMutation.mutate(record.id)}>
            <Tooltip title="Удалить">
              <Button type="link" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const formulaLabel = (p: Product) => {
    if (p.formula_script) return <Tag color="green">{p.formula_script}</Tag>;
    if (p.formula) return <Tag color="purple">{p.formula}</Tag>;
    return <Tag>фиксированная</Tag>;
  };

  const columns = useMemo(() => applyColumnWidths(baseColumns, widths, setWidth), [baseColumns, widths, setWidth]);

  return (
    <>
      <div className="nc-toolbar" style={{ borderBottom: "1px solid #e5e7eb" }}>
        <div className="nc-toolbar-left">
          <Input.Search placeholder="Поиск..." allowClear value={entityFilters.search} onChange={(e) => entityFilters.updateSearch(e.target.value)} style={{ width: 250 }} size="small" />
          <button className={`nc-toolbar-btn ${viewMode === "table" ? "active" : ""}`} onClick={() => setViewMode("table")}>
            <UnorderedListOutlined /> Таблица
          </button>
          <button className={`nc-toolbar-btn ${viewMode === "cards" ? "active" : ""}`} onClick={() => setViewMode("cards")}>
            <AppstoreOutlined /> Карточки
          </button>
        </div>
        <div className="nc-toolbar-right">
          {selectedRowKeys.length > 0 && (
            <Popconfirm title={`Удалить ${selectedRowKeys.length} ${selectedRowKeys.length === 1 ? "продукт" : "продуктов"}?`} onConfirm={() => bulkDeleteMutation.mutate(selectedRowKeys as number[])}>
              <button className="nc-toolbar-btn" style={{ borderColor: "#ff4d4f", color: "#ff4d4f" }}>
                <DeleteOutlined /> Удалить ({selectedRowKeys.length})
              </button>
            </Popconfirm>
          )}
          <button className="nc-toolbar-btn primary" onClick={openCreate}>
            <PlusOutlined /> Продукт
          </button>
        </div>
      </div>

      {viewMode === "table" ? (
        <Table dataSource={filteredData} columns={columns} components={{ header: { cell: ResizableHeaderCell } }} rowKey="id" loading={isLoading} pagination={paginationConfig} size="small" rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}           onRow={(record) => ({
            onClick: (e) => {
              if ((e.target as HTMLElement).closest("button, .ant-btn, .ant-popconfirm, .ant-popover")) return;
              setDetailProduct(record);
            },
            style: { cursor: "pointer" },
          })} onChange={(pagination, filters, sorter) => {
          onPaginationChange(pagination);
          entityFilters.updateFilters(filters as Record<string, unknown>);
          const s = Array.isArray(sorter) ? sorter[0] : sorter;
          if (s && s.columnKey && s.order) {
            entityFilters.updateSort(s.columnKey as string, s.order === "ascend" ? "asc" : "desc");
          } else if (s && !s.order) {
            entityFilters.updateSort(null, "asc");
          }
        }} />
      ) : (
        <Spin spinning={isLoading}>
          {(filteredData ?? []).length === 0 && !isLoading ? (
            <Empty description="Нет продуктов" style={{ margin: "40px 0" }} />
          ) : (
          <Row gutter={[16, 16]}>
            {(filteredData ?? []).map((p) => (
            <Col key={p.id} xs={24} sm={12} md={8} lg={6}>
              <Card
                hoverable
                style={{ height: "100%", cursor: "pointer" }}
                actions={[
                  <Button type="link" size="small" icon={<ClockCircleOutlined />} onClick={(e) => { e.stopPropagation(); setAuditEntity({ entityType: "product", entityId: p.id, entityName: p.name }); setAuditOpen(true); }}>История</Button>,
                  <Button type="link" size="small" onClick={(e) => { e.stopPropagation(); openEdit(p); }}>Редактировать</Button>,
                  <Popconfirm title="Удалить продукт?" onConfirm={() => deleteMutation.mutate(p.id)}>
                    <Button type="link" danger size="small" onClick={(e) => e.stopPropagation()}>Удалить</Button>
                  </Popconfirm>,
                ]}
              >
                <div onClick={() => setDetailProduct(p)}>
                <Card.Meta
                  title={<span style={{ fontSize: 14 }}>{p.name}</span>}
                  description={
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {p.category && <Tag>{p.category}</Tag>}
                      {canViewPrices && <Typography.Text strong style={{ fontSize: 16 }}>{p.unit_price.toLocaleString()} ₽ / {unitTypeLabels[p.unit_type] || p.unit_type}</Typography.Text>}
                      {canViewPrices && formulaLabel(p)}
                      {p.description && <Typography.Text type="secondary" ellipsis style={{ fontSize: 12 }}>{p.description}</Typography.Text>}
                  {p.supplier_url && <Button type="link" size="small" icon={<LinkOutlined />} href={p.supplier_url} target="_blank" style={{ padding: 0, fontSize: 12 }} onClick={(e) => e.stopPropagation()}>Поставщик</Button>}
                    </div>
                  }
                />
                </div>
              </Card>
            </Col>
          ))}
        </Row>
          )}
        </Spin>
      )}

      <Modal
        title={editing ? "Редактировать продукт" : "Новый продукт"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.validateFields().then(onFinish).catch(() => {})}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        width={1100}
        className="product-modal"
        okText="Сохранить"
        cancelText="Отмена"
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>

          {/* Row 1: 2-column grid */}
          <div className="product-form-grid">

            {/* Card: Основная информация + Размеры */}
            <Card size="small" title={<><AppstoreOutlined /> Основная информация</>} style={{ marginBottom: 16 }}>
              <Row gutter={16}>
                <Col span={14}>
                  <Form.Item name="name" label="Название" rules={[{ required: true }]}>
                    <Input placeholder="Введите название продукта" />
                  </Form.Item>
                </Col>
                <Col span={10}>
                  <Form.Item name="category" label="Категория">
                    <Input placeholder="Введите категорию" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="description" label="Описание">
                <Input.TextArea rows={3} placeholder="Опишите продукт, его характеристики и особенности" />
              </Form.Item>

              {/* Сырьё — для простых продуктов, производимых из сырья */}
              <Form.Item
                name="raw_material_id"
                label="Сырьё"
                tooltip="Выберите сырьё, если продукт производится напрямую из него (без под-продуктов). Для составных продуктов используйте секцию «Компоненты» ниже."
              >
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="Не выбрано (продукт без сырья или составной)"
                  notFoundContent="Сырьё не найдено"
                >
                  {(rawMaterials ?? []).map((rm) => (
                    <Select.Option key={rm.id} value={rm.id} label={rm.name}>
                      {rm.name} {rm.width_mm && rm.height_mm ? `(${rm.width_mm}×${rm.height_mm} мм)` : ""}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>

              {/* Размеры */}
              <div className="form-divider">
                <div className="form-divider-title"><BorderOuterOutlined /> Размеры изделия</div>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item name="default_cut_width_mm" label="Ширина, мм" tooltip="Ширина по умолчанию при заказе">
                      <InputNumber min={0} step={1} placeholder="0" style={{ width: "100%" }} />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="default_cut_height_mm" label="Высота, мм" tooltip="Высота по умолчанию при заказе">
                      <InputNumber min={0} step={1} placeholder="0" style={{ width: "100%" }} />
                    </Form.Item>
                  </Col>
                </Row>
              </div>
            </Card>

            {/* Card: Расчёт цены и единицы */}
            <Card size="small" title={<><CalculatorOutlined /> Расчёт цены и единицы</>} style={{ marginBottom: 16 }}>
              {canViewPrices && (
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item name="formula" label="Формула расчёта" tooltip="Доступные переменные: quantity, unit_price. Пример: quantity * unit_price * 1.2" extra="Если пусто — unit_price × quantity">
                      <Input placeholder="quantity * unit_price" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="formula_script" label="Скрипт расчёта" tooltip="Скрипт имеет приоритет над формулой">
                      <Select allowClear placeholder="Не использовать">
                        {(scripts ?? []).map((s) => (<Select.Option key={s.name} value={s.name}>{s.name}</Select.Option>))}
                      </Select>
                    </Form.Item>
                  </Col>
                </Row>
              )}

              {/* Цена */}
              <div className="form-divider">
                <div className="form-divider-title"><DollarOutlined /> Цена</div>
                <Row gutter={16}>
                  <Col span={10}>
                    <Form.Item name="unit_type" label="Единица измерения" rules={[{ required: true }]}>
                      <Select>
                        <Select.Option value="piece">шт.</Select.Option>
                        <Select.Option value="sheet">лист</Select.Option>
                        <Select.Option value="m2">м²</Select.Option>
                        <Select.Option value="roll">рулон</Select.Option>
                        <Select.Option value="set">комплект</Select.Option>
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col span={14}>
                    {canViewPrices && (
                      <Form.Item
                        name="unit_price"
                        label={
                          <Space>
                            <span>Цена за единицу</span>
                            <Tooltip title="Рассчитать цену через калькулятор типографии">
                              <Button type="link" size="small" icon={<CalculatorOutlined />} onClick={() => setCalcModalOpen(true)} style={{ padding: 0, fontSize: 12 }}>
                                Калькулятор
                              </Button>
                            </Tooltip>
                          </Space>
                        }
                        rules={[{ required: true }]}
                      >
                        <InputNumber style={{ width: "100%" }} min={0} prefix="₽" placeholder="0.00" />
                      </Form.Item>
                    )}
                  </Col>
                </Row>
              </div>
            </Card>
          </div>

          {/* Row 2: Компоненты (full width) */}
          <Card size="small" title={<><BlockOutlined /> Компоненты</>} style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 12 }}>
              <Checkbox checked={showSizes} onChange={(e) => setShowSizes(e.target.checked)}>
                Свои размеры
              </Checkbox>
            </div>
            <div className="comp-table-wrapper">
              <Form.List name="raw_materials">
                {(fields, { add, remove }) => (
                  <>
                    <table className="comp-table">
                      <thead>
                        <tr>
                          <th style={{ width: 32 }}>№</th>
                          <th>Компонент</th>
                          {showSizes && <th style={{ width: 90 }}>Ширина, мм</th>}
                          {showSizes && <th style={{ width: 90 }}>Высота, мм</th>}
                          <th style={{ width: 80 }}>Кол-во</th>
                          <th style={{ width: 100 }}>Цена, ₽</th>
                          <th style={{ width: 40 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {fields.map((field, index) => (
                          <tr key={field.key}>
                            <td style={{ color: "#8C8C8C" }}>{index + 1}</td>
                            <td>
                              <Form.Item
                                {...field}
                                name={[field.name, "name"]}
                                noStyle
                                rules={[{ required: true, message: "Выберите продукт" }]}
                              >
                                <AutoComplete
                                  size="small"
                                  style={{ width: "100%" }}
                                  placeholder="Поиск продукта (или создать новый)"
                                  filterOption={(input, option) => (String(option?.value ?? "").toLowerCase()).includes(input.toLowerCase())}
                                  options={[
                                    ...(products ?? [])
                                      .filter((p) => p.id !== editing?.id)
                                      .map((p) => ({ value: p.name, label: `${p.name}${p.has_components ? " [составной]" : ""}`, product: p })),
                                  ]}
                                  onSelect={(val: string, opt: any) => {
                                    if (opt && opt.product) {
                                      form.setFieldValue(["raw_materials", field.name, "component_product_id"], opt.product.id);
                                      form.setFieldValue(["raw_materials", field.name, "name"], opt.product.name);
                                      const price = opt.product.auto_unit_price != null ? opt.product.auto_unit_price : opt.product.unit_price;
                                      form.setFieldValue(["raw_materials", field.name, "price_per_unit"], price);
                                    }
                                  }}
                                  onChange={(val: string) => {
                                    if (!val || !products?.find((p) => p.name === val)) {
                                      form.setFieldValue(["raw_materials", field.name, "component_product_id"], null);
                                    }
                                  }}
                                >
                                  <Input size="small" suffix={
                                    <Tooltip title="Создать новый продукт">
                                      <PlusOutlined
                                        onClick={() => {
                                          const currentName = form.getFieldValue(["raw_materials", field.name, "name"]) || "";
                                          handleCreateNested(field.name, typeof currentName === "string" ? currentName : "");
                                        }}
                                        style={{ color: "#4F7CFF", cursor: "pointer", fontSize: 12 }}
                                      />
                                    </Tooltip>
                                  } />
                                </AutoComplete>
                              </Form.Item>
                            </td>
                            {showSizes && (
                              <>
                                <td>
                                  <Form.Item {...field} name={[field.name, "cut_width_mm"]} noStyle>
                                    <InputNumber min={0} step={1} placeholder="мм" size="small" style={{ width: "100%" }} />
                                  </Form.Item>
                                </td>
                                <td>
                                  <Form.Item {...field} name={[field.name, "cut_height_mm"]} noStyle>
                                    <InputNumber min={0} step={1} placeholder="мм" size="small" style={{ width: "100%" }} />
                                  </Form.Item>
                                </td>
                              </>
                            )}
                            <td>
                              <Form.Item {...field} name={[field.name, "quantity_per_unit"]} noStyle>
                                <InputNumber min={1} step={1} placeholder="1" size="small" style={{ width: "100%" }} />
                              </Form.Item>
                            </td>
                            <td>
                              <Form.Item {...field} name={[field.name, "price_per_unit"]} noStyle>
                                <InputNumber min={0} step={1} placeholder="авто" size="small" style={{ width: "100%" }} />
                              </Form.Item>
                            </td>
                            <td>
                              <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <Button
                      type="dashed"
                      onClick={() => add({ coefficient: 1, quantity_per_unit: 1 })}
                      block
                      icon={<PlusOutlined />}
                      style={{ marginTop: 12, borderColor: "#D9DDEB", borderRadius: 10, height: 44 }}
                    >
                      Добавить компонент
                    </Button>
                  </>
                )}
              </Form.List>
            </div>
          </Card>

          {/* Row 3: Ссылка на товар */}
          <Card size="small" title={<><LinkOutlined /> Ссылка на товар</>}>
            <Form.Item name="supplier_url" tooltip="URL страницы товара у поставщика" style={{ marginBottom: 0 }}>
              <Input placeholder="https://..." prefix={<LinkOutlined />} />
            </Form.Item>
          </Card>
        </Form>
      </Modal>

      <Modal
        title="Новый под-продукт"
        open={nestedProductModalOpen}
        onCancel={() => { setNestedProductModalOpen(false); nestedProductCallbackRef.current = null; setNestedProductName(""); }}
        onOk={() => {
          nestedForm.validateFields().then((vals) => {
            const payload = {
              name: vals.name,
              unit_price: vals.unit_price ?? 0,
              unit_type: vals.unit_type || "piece",
              description: vals.description,
              category: vals.category,
              raw_materials: [],
            };
            nestedCreateMutation.mutate(payload as any);
          }).catch(() => {});
        }}
        confirmLoading={nestedCreateMutation.isPending}
        width={520}
      >
        <Form form={nestedForm} layout="vertical" initialValues={{ unit_type: "piece", unit_price: 0 }}>
          <Form.Item name="name" label="Название" rules={[{ required: true }]}>
            <Input placeholder="Например: Карман 100×50" />
          </Form.Item>
          <Form.Item name="description" label="Описание"><Input.TextArea rows={2} /></Form.Item>
          <Row gutter={8}>
            <Col span={12}>
              <Form.Item name="unit_price" label="Цена за единицу"><InputNumber min={0} prefix="₽" style={{ width: "100%" }} /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="unit_type" label="Единица измерения">
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
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Состав под-продукта (сырьё) можно настроить позже, отредактировав его в каталоге.
          </Typography.Text>
        </Form>
      </Modal>
      <Drawer
        title={detailProduct?.name}
        open={!!detailProduct}
        onClose={() => setDetailProduct(null)}
        width={480}
        extra={
          <Button type="primary" onClick={() => { setDetailProduct(null); openEdit(detailProduct!); }}>
            Редактировать
          </Button>
        }
      >
        {detailProduct && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="ID">{detailProduct.id}</Descriptions.Item>
            <Descriptions.Item label="Название">{detailProduct.name}</Descriptions.Item>
            <Descriptions.Item label="Описание">{detailProduct.description || "—"}</Descriptions.Item>
            <Descriptions.Item label="Категория">{detailProduct.category || "—"}</Descriptions.Item>
            {canViewPrices && (
              <Descriptions.Item label="Цена за единицу">
                <Typography.Text strong>{detailProduct.unit_price.toLocaleString()} ₽</Typography.Text>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Единица измерения">{unitTypeLabels[detailProduct.unit_type] || detailProduct.unit_type}</Descriptions.Item>
            {canViewPrices && (
              <Descriptions.Item label="Формула">{detailProduct.formula || "—"}</Descriptions.Item>
            )}
            {canViewPrices && detailProduct.formula_script && (
              <Descriptions.Item label="Скрипт расчёта">
                <Tag color="green">{detailProduct.formula_script}</Tag>
              </Descriptions.Item>
            )}
            {detailProduct.raw_materials && detailProduct.raw_materials.length > 0 ? (
              <>
                <Descriptions.Item label="Компоненты">
                  {detailProduct.raw_materials.map(m => {
                    const name = m.component_product_name || m.raw_material_name || m.name || `#${m.component_product_id || m.raw_material_id}`;
                    const kind = m.component_product_id ? "продукт" : "сырьё";
                    const qty = m.quantity_per_unit && m.quantity_per_unit > 1 ? ` ×${m.quantity_per_unit}` : "";
                    const price = m.price_per_unit != null ? ` (${m.price_per_unit}₽)` : "";
                    return `${name}${qty}${price} [${kind}]`;
                  }).join(", ")}
                </Descriptions.Item>
              </>
            ) : detailProduct.raw_material_id ? (
              <>
                <Descriptions.Item label="Сырьё">
                  {detailProduct.raw_material_name || `#${detailProduct.raw_material_id}`}
                </Descriptions.Item>
                <Descriptions.Item label="Коэффициент">{detailProduct.material_coefficient}</Descriptions.Item>
              </>
            ) : null}
            {detailProduct.default_cut_width_mm && detailProduct.default_cut_height_mm && (
              <Descriptions.Item label="Размер отреза">
                {detailProduct.default_cut_width_mm} × {detailProduct.default_cut_height_mm} мм
              </Descriptions.Item>
            )}
            {detailProduct.supplier_url && (
              <Descriptions.Item label="Поставщик">
                <Typography.Link href={detailProduct.supplier_url} target="_blank">
                  <LinkOutlined /> Открыть страницу товара
                </Typography.Link>
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Drawer>
      <CalculatorModal
        open={calcModalOpen}
        onClose={() => setCalcModalOpen(false)}
        onApply={(price, _qty, components) => {
          form.setFieldsValue({ unit_price: Math.round(price * 100) / 100 });
          if (components && components.length > 0) {
            const existing = form.getFieldValue("raw_materials") as any[] | undefined;
            const existingByIndex = existing ?? [];
            const updated = components.map((c, idx) => {
              const ex = existingByIndex[idx];
              return {
                ...ex,
                name: c.name,
                price_per_unit: Math.round(c.price * 100) / 100,
                quantity_per_unit: ex?.quantity_per_unit ?? 1,
                coefficient: ex?.coefficient ?? 1,
                raw_material_id: ex?.raw_material_id,
              };
            });
            form.setFieldsValue({ raw_materials: updated });
            message.info(`Заполнено компонентов: ${components.length}. Назначьте сырьё каждому.`);
          }
        }}
      />
      <AuditLogDrawer
        open={!!auditOpen && !!auditEntity}
        onClose={() => { setAuditOpen(false); setAuditEntity(null); }}
        entityType={auditEntity?.entityType || "product"}
        entityId={auditEntity?.entityId ?? null}
        entityName={auditEntity?.entityName}
      />
    </>
  );
}
