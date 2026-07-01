import { AppstoreOutlined, CalculatorOutlined, PlusOutlined, UnorderedListOutlined, DeleteOutlined, LinkOutlined, ClockCircleOutlined, MinusCircleOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import {
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Drawer,
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
import { useState } from "react";
import { createProduct, deleteProduct, getProducts, updateProduct, bulkDeleteProducts } from "../api/products";
import { getScripts } from "../api/scripts";
import { getRawMaterials } from "../api/rawMaterials";
import CalculatorModal from "../components/CalculatorModal";
import AuditLogDrawer from "../components/AuditLogDrawer";
import { textFilter, numberFilter, selectFilter } from "../components/TableFilters";
import { useAuth } from "../hooks/useAuth";
import { useEntityFilters } from "../hooks/useEntityFilters";
import { useViewMode } from "../hooks/useViewMode";
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
  const entityFilters = useEntityFilters("products");
  const { user, hasPermission } = useAuth();
  const canViewPrices = hasPermission("prices.view");
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  const { data: products, isLoading } = useQuery({ queryKey: ["products"], queryFn: getProducts });
  const { data: scripts } = useQuery({ queryKey: ["scripts"], queryFn: getScripts });
  const { data: rawMaterials } = useQuery({ queryKey: ["rawMaterials"], queryFn: getRawMaterials });

  const createMutation = useMutation({
    mutationFn: createProduct,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["products"] }); message.success("Продукт создан"); setModalOpen(false); form.resetFields(); },
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

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (product: Product) => {
    setEditing(product);
    const materials = product.raw_materials?.length
      ? product.raw_materials.map(m => ({ raw_material_id: m.raw_material_id, coefficient: m.coefficient }))
      : product.raw_material_id ? [{ raw_material_id: product.raw_material_id, coefficient: product.material_coefficient }] : [];
    form.setFieldsValue({ ...product, raw_materials: materials });
    setModalOpen(true);
  };

  const onFinish = (values: ProductFormData) => {
    const materials = (values as any).raw_materials;
    const payload = { ...values };
    if (materials && materials.length > 0) {
      (payload as any).raw_materials = materials.map((m: any) => ({
        raw_material_id: m.raw_material_id,
        coefficient: m.coefficient || 1,
      }));
      // keep legacy fields for backward compat
      payload.raw_material_id = materials[0].raw_material_id;
      payload.material_coefficient = materials[0].coefficient || 1;
    } else {
      (payload as any).raw_materials = [];
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

  const columns = [
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
      title: "Действия", key: "actions",
      render: (_: unknown, record: Product) => (
        <Space>
          <Button type="link" size="small" icon={<ClockCircleOutlined />} onClick={(e) => { e.stopPropagation(); setAuditEntity({ entityType: "product", entityId: record.id, entityName: record.name }); setAuditOpen(true); }}>
            История
          </Button>
          <Button type="link" onClick={() => openEdit(record)}>Редактировать</Button>
          <Popconfirm title="Удалить продукт?" onConfirm={() => deleteMutation.mutate(record.id)}>
            <Button type="link" danger>Удалить</Button>
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
        <Table dataSource={filteredData} columns={columns} rowKey="id" loading={isLoading} pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `Всего: ${t}` }} size="small" rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}           onRow={(record) => ({
            onClick: (e) => {
              if ((e.target as HTMLElement).closest("button, .ant-btn, .ant-popconfirm, .ant-popover")) return;
              setDetailProduct(record);
            },
            style: { cursor: "pointer" },
          })} onChange={(_pagination, filters, sorter) => {
          entityFilters.updateFilters(filters as Record<string, unknown>);
          const s = Array.isArray(sorter) ? sorter[0] : sorter;
          if (s && s.columnKey && s.order) {
            entityFilters.updateSort(s.columnKey as string, s.order === "ascend" ? "asc" : "desc");
          } else if (s && !s.order) {
            entityFilters.updateSort(null, "asc");
          }
        }} />
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

      <Modal title={editing ? "Редактировать продукт" : "Новый продукт"} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.validateFields().then(onFinish).catch(() => {})} confirmLoading={createMutation.isPending || updateMutation.isPending}>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="name" label="Название" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="Описание"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="category" label="Категория"><Input /></Form.Item>
          {canViewPrices && <Form.Item name="unit_price" label={
            <Space>
              <span>Цена за единицу</span>
              <Tooltip title="Рассчитать цену через калькулятор типографии">
                <Button type="link" size="small" icon={<CalculatorOutlined />} onClick={() => setCalcModalOpen(true)} style={{ padding: 0, fontSize: 12 }}>
                  Калькулятор
                </Button>
              </Tooltip>
            </Space>
          } rules={[{ required: true }]}><InputNumber style={{ width: "100%" }} min={0} prefix="₽" /></Form.Item>}
          <Form.Item name="unit_type" label="Единица измерения" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="piece">шт.</Select.Option>
              <Select.Option value="sheet">лист</Select.Option>
              <Select.Option value="m2">м²</Select.Option>
              <Select.Option value="roll">рулон</Select.Option>
              <Select.Option value="set">комплект</Select.Option>
            </Select>
          </Form.Item>
          {canViewPrices && <Form.Item name="formula" label="Формула расчёта цены" tooltip="Доступные переменные: quantity, unit_price. Пример: quantity * unit_price * 1.2" extra="Если не указана, цена = unit_price * quantity">
            <Input placeholder="quantity * unit_price" />
          </Form.Item>}
          {canViewPrices && <Form.Item name="formula_script" label="Скрипт расчёта цены" tooltip="Выберите скрипт из настроек. Скрипт имеет приоритет над формулой.">
            <Select allowClear placeholder="Не использовать">
              {(scripts ?? []).map((s) => (<Select.Option key={s.name} value={s.name}>{s.name}</Select.Option>))}
            </Select>
          </Form.Item>}
          <Divider orientation="left" orientationMargin={0} style={{ fontSize: 12, marginTop: 0 }}>Сырьё</Divider>
          <Form.List name="raw_materials">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field, index) => (
                  <Row key={field.key} gutter={8} align="middle" style={{ marginBottom: 4 }}>
                    <Col flex="auto">
                      <Form.Item
                        {...field}
                        name={[field.name, "raw_material_id"]}
                        noStyle
                        rules={[{ required: true, message: "Выберите материал" }]}
                      >
                        <Select placeholder="Материал-сырьё" showSearch optionFilterProp="label" style={{ width: "100%" }}>
                          {(rawMaterials ?? []).map((rm) => (
                            <Select.Option key={rm.id} value={rm.id} label={rm.name}>
                              {rm.name} {rm.width_mm && rm.height_mm ? `(${rm.width_mm}×${rm.height_mm} мм)` : ""}
                            </Select.Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <div style={{ marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: "#666" }}>Коэфф. <Tooltip title="Коэффициент расхода сырья. Запасной вариант, если не настроен скрипт sheet_stock_calc. Пример: 0.5 = на 1 изделие тратится 0.5 листа (с одного листа — 2 изделия)."><QuestionCircleOutlined style={{ color: "#999", cursor: "help" }} /></Tooltip></span>
                      </div>
                      <Form.Item
                        {...field}
                        name={[field.name, "coefficient"]}
                        noStyle
                      >
                        <InputNumber min={0.01} step={0.1} placeholder="Коэфф." style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col span={2}>
                      {fields.length > 1 && (
                        <Button type="text" danger icon={<MinusCircleOutlined />} onClick={() => remove(field.name)} />
                      )}
                    </Col>
                  </Row>
                ))}
                <Button type="dashed" onClick={() => add({ coefficient: 1 })} block icon={<PlusOutlined />}>
                  Добавить материал
                </Button>
              </>
            )}
          </Form.List>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="default_cut_width_mm" label="Ширина отреза, мм" tooltip="Ширина по умолчанию при заказе">
                <InputNumber min={0} step={1} placeholder="мм" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="default_cut_height_mm" label="Высота отреза, мм" tooltip="Высота по умолчанию при заказе">
                <InputNumber min={0} step={1} placeholder="мм" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
          <Form.Item name="supplier_url" label="Ссылка на товар" tooltip="URL страницы товара у поставщика">
            <Input placeholder="https://..." />
          </Form.Item>
            </Col>
          </Row>
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
                <Descriptions.Item label="Сырьё">
                  {detailProduct.raw_materials.map(m => m.raw_material_name || `#${m.raw_material_id}`).join(", ")}
                </Descriptions.Item>
                <Descriptions.Item label="Коэффициенты">
                  {detailProduct.raw_materials.map(m => `${m.raw_material_name || `#${m.raw_material_id}`}: ${m.coefficient}`).join("; ")}
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
        onApply={(price) => form.setFieldsValue({ unit_price: Math.round(price * 100) / 100 })}
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
