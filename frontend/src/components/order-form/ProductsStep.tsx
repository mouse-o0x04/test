import { CalculatorOutlined, DeleteOutlined, EditOutlined, HolderOutlined, MinusCircleOutlined, PlusOutlined, SaveOutlined } from "@ant-design/icons";
import { Button, Card, Col, Form, Input, InputNumber, Modal, Popconfirm, Radio, Row, Select, Space, Tag, Tooltip, Typography, message } from "antd";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { FormInstance } from "antd";
import { getProducts } from "../../api/products";
import { getRawMaterials } from "../../api/rawMaterials";
import { getWarehouseItems } from "../../api/warehouse";
import { getOrderTemplates, createOrderTemplate, updateOrderTemplate, deleteOrderTemplate, type OrderTemplate as ApiTemplate, type OrderTemplateItem } from "../../api/orderTemplates";
import { useAuth } from "../../hooks/useAuth";

const UNIT_TYPE_LABELS: Record<string, string> = { piece: "шт.", sheet: "лист", m2: "м²", roll: "рулон", set: "комплект" };

interface ProductsStepProps {
  form: FormInstance;
  calcItemIndex: number | null;
  setCalcItemIndex: (i: number | null) => void;
  setCalcModalOpen: (v: boolean) => void;
}

interface OrderTemplate {
  name: string;
  icon: string;
  items: Array<{ product_name: string; quantity: number; unit_price?: number; raw_material_id?: number; cut_width_mm?: number; cut_height_mm?: number }>;
}

const BUILT_IN_TEMPLATES: OrderTemplate[] = [
  { name: "Баннер 3×1", icon: "🎯", items: [{ product_name: "Баннер 3×1 м", quantity: 1, cut_width_mm: 3000, cut_height_mm: 1000 }] },
  { name: "Диплом А4", icon: "📜", items: [{ product_name: "Диплом А4", quantity: 1, cut_width_mm: 210, cut_height_mm: 297 }] },
  { name: "Визитки (100 шт)", icon: "💳", items: [{ product_name: "Визитки", quantity: 100 }] },
  { name: "Стенд", icon: "📋", items: [{ product_name: "Стенд", quantity: 1, cut_width_mm: 1200, cut_height_mm: 800 }] },
];

function SortableProductRow({ field, form, index, products, rawMaterials, canViewPrices, onRemove, setCalcItemIndex, setCalcModalOpen }: {
  field: { name: number; key: number };
  form: FormInstance;
  index: number;
  products: { id: number; name: string; unit_price: number; unit_type: string; raw_materials?: any[]; has_components?: boolean }[] | undefined;
  rawMaterials: { id: number; name: string }[] | undefined;
  canViewPrices: boolean;
  onRemove: () => void;
  setCalcItemIndex: (i: number | null) => void;
  setCalcModalOpen: (v: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `product-${field.key}` });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const itemMode: string = Form.useWatch(["items", field.name, "_itemMode"], form) || "catalog";
  const productId: number | undefined = Form.useWatch(["items", field.name, "product_id"], form);
  const qty: number = Form.useWatch(["items", field.name, "quantity"], form) || 1;
  const selectedProduct = products?.find((p) => p.id === productId);
  const components = selectedProduct?.raw_materials || [];

  return (
    <div ref={setNodeRef} style={{ ...style, padding: "8px 12px", background: "#fff", borderRadius: 6, border: "1px solid #f0f0f0", marginBottom: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span {...attributes} {...listeners} style={{ cursor: "grab", color: "#bbb", touchAction: "none" }}>
          <HolderOutlined />
        </span>

        <Radio.Group
          value={itemMode}
          onChange={(e) => {
            form.setFieldValue(["items", field.name, "_itemMode"], e.target.value);
            if (e.target.value === "catalog") {
              form.setFieldValue(["items", field.name, "product_name"], undefined);
              form.setFieldValue(["items", field.name, "unit_price"], undefined);
              form.setFieldValue(["items", field.name, "raw_material_id"], undefined);
              form.setFieldValue(["items", field.name, "raw_materials"], []);
            } else {
              form.setFieldValue(["items", field.name, "product_id"], undefined);
            }
          }}
          size="small"
          style={{ flexShrink: 0 }}
        >
          <Radio.Button value="catalog">Каталог</Radio.Button>
          <Radio.Button value="custom">Свой</Radio.Button>
        </Radio.Group>

        {itemMode === "catalog" ? (
          <Form.Item name={[field.name, "product_id"]} style={{ flex: 1, marginBottom: 0 }}>
            <Select showSearch optionFilterProp="label" placeholder="Продукт" allowClear size="small">
              {(products ?? []).map((p) => (
                <Select.Option key={p.id} value={p.id} label={p.name}>
                  {p.name}{canViewPrices ? ` — ${p.unit_price} ₽` : ""} / {UNIT_TYPE_LABELS[p.unit_type] || p.unit_type}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        ) : (
          <Form.Item name={[field.name, "product_name"]} style={{ flex: 1, marginBottom: 0 }} rules={[{ required: true, message: "Название" }]}>
            <Input placeholder="Название" size="small" />
          </Form.Item>
        )}

        <Form.Item name={[field.name, "quantity"]} rules={[{ required: true, message: "кол-во" }]} style={{ width: 70, marginBottom: 0 }}>
          <InputNumber min={1} size="small" style={{ width: "100%" }} />
        </Form.Item>

        {itemMode === "custom" && canViewPrices && (
          <Form.Item name={[field.name, "unit_price"]} style={{ width: 100, marginBottom: 0 }}>
            <InputNumber min={0} size="small" style={{ width: "100%" }} addonAfter={
              <CalculatorOutlined style={{ cursor: "pointer", color: "#1677ff", fontSize: 11 }} onClick={(e) => { e.stopPropagation(); setCalcItemIndex(field.name); setCalcModalOpen(true); }} />
            } />
          </Form.Item>
        )}

        {canViewPrices && itemMode === "catalog" && (
          <Form.Item name={[field.name, "unit_price"]} style={{ width: 100, marginBottom: 0 }} tooltip="Цена для этого заказа (каталог не меняется)">
            <InputNumber min={0} size="small" style={{ width: "100%" }} placeholder="из каталога" />
          </Form.Item>
        )}

        {canViewPrices && itemMode === "catalog" && (
          <Typography.Text type="secondary" style={{ fontSize: 12, width: 60, textAlign: "right", flexShrink: 0 }}>
            {(() => {
              const formPrice = form.getFieldValue(["items", field.name, "unit_price"]);
              const p = products?.find((p) => p.id === form.getFieldValue(["items", field.name, "product_id"]));
              const qty = form.getFieldValue(["items", field.name, "quantity"]) || 0;
              const price = formPrice || p?.unit_price || 0;
              return p || formPrice ? `${(price * qty).toLocaleString()} ₽` : "";
            })()}
          </Typography.Text>
        )}

        <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={onRemove} />
      </div>

      {itemMode === "custom" && (
        <div style={{ display: "flex", gap: 8, marginTop: 8, paddingLeft: 24 }}>
          <Form.Item name={[field.name, "raw_material_id"]} style={{ flex: 1, marginBottom: 0 }}>
            <Select allowClear placeholder="Сырьё" showSearch optionFilterProp="label" size="small">
              {(rawMaterials ?? []).map((rm: { id: number; name: string }) => (
                <Select.Option key={rm.id} value={rm.id} label={rm.name}>{rm.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name={[field.name, "cut_width_mm"]} style={{ width: 100, marginBottom: 0 }}>
            <InputNumber min={0} step={1} placeholder="Ширина, мм" size="small" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name={[field.name, "cut_height_mm"]} style={{ width: 100, marginBottom: 0 }}>
            <InputNumber min={0} step={1} placeholder="Высота, мм" size="small" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name={[field.name, "processing_method"]} style={{ width: 130, marginBottom: 0 }}>
            <Select placeholder="Обработка" allowClear size="small">
              <Select.Option value="Лазер">Лазер</Select.Option>
              <Select.Option value="Фреза">Фреза</Select.Option>
              <Select.Option value="Ручная резка">Ручная</Select.Option>
            </Select>
          </Form.Item>
        </div>
      )}

      {itemMode === "catalog" && components.length > 0 && (
        <div style={{ marginTop: 6, paddingLeft: 24, fontSize: 12, color: "#8c8c8c" }}>
          <Typography.Text type="secondary" style={{ fontSize: 11, fontWeight: 500 }}>Состав:</Typography.Text>
          {components.filter((c: any) => c.component_product_id).map((c: any, ci: number) => {
            const compName = c.component_product_name || c.name || `#${c.component_product_id}`;
            const compTotal = c.quantity_per_unit ? c.quantity_per_unit * qty : qty;
            return (
              <div key={ci} style={{ marginTop: 2 }}>
                ↳ {compName} × {compTotal}
                {c.cut_width_mm && c.cut_height_mm ? ` (${c.cut_width_mm}×${c.cut_height_mm}мм)` : ""}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ProductsStep({ form, calcItemIndex, setCalcItemIndex, setCalcModalOpen }: ProductsStepProps) {
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const canViewPrices = hasPermission("prices.view");
  const { data: products } = useQuery({ queryKey: ["products"], queryFn: getProducts });
  const { data: rawMaterials } = useQuery({ queryKey: ["rawMaterials"], queryFn: getRawMaterials });
  const { data: apiTemplates } = useQuery({ queryKey: ["orderTemplates"], queryFn: getOrderTemplates });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const items = Form.useWatch("items", form) || [];

  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ApiTemplate | null>(null);
  const [editingBuiltIn, setEditingBuiltIn] = useState<OrderTemplate | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [hiddenBuiltIns, setHiddenBuiltIns] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("hiddenBuiltInTemplates") || "[]"); } catch { return []; }
  });

  const saveTemplateMutation = useMutation({
    mutationFn: (data: { name: string; items: OrderTemplateItem[] }) => {
      if (editingTemplate) {
        return updateOrderTemplate(editingTemplate.id, data);
      }
      return createOrderTemplate(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orderTemplates"] });
      message.success(editingTemplate || editingBuiltIn ? "Шаблон обновлён" : "Шаблон сохранён");
      setTemplateModalOpen(false);
      setEditingTemplate(null);
      setEditingBuiltIn(null);
      setTemplateName("");
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      message.error(err.response?.data?.detail || "Ошибка сохранения шаблона");
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: number) => deleteOrderTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orderTemplates"] });
      message.success("Шаблон удалён");
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      message.error(err.response?.data?.detail || "Ошибка удаления шаблона");
    },
  });

  const handleSaveTemplate = () => {
    if (!templateName.trim()) {
      message.warning("Введите название шаблона");
      return;
    }
    if (editingBuiltIn) {
      const templateItems: OrderTemplateItem[] = editingBuiltIn.items.map((t) => ({
        product_name: t.product_name,
        quantity: t.quantity,
        unit_price: t.unit_price,
        raw_material_id: t.raw_material_id,
        cut_width_mm: t.cut_width_mm,
        cut_height_mm: t.cut_height_mm,
      }));
      saveTemplateMutation.mutate({ name: templateName.trim(), items: templateItems });
      return;
    }
    if (items.length === 0) {
      message.warning("Добавьте хотя бы один продукт");
      return;
    }
    const templateItems: OrderTemplateItem[] = items.map((item: Record<string, unknown>) => ({
      product_name: (item.product_name as string) || "",
      quantity: (item.quantity as number) || 1,
      product_id: (item.product_id as number) || undefined,
      unit_price: (item.unit_price as number) || undefined,
      raw_material_id: (item.raw_material_id as number) || undefined,
      cut_width_mm: (item.cut_width_mm as number) || undefined,
      cut_height_mm: (item.cut_height_mm as number) || undefined,
    }));
    saveTemplateMutation.mutate({ name: templateName.trim(), items: templateItems });
  };

  const handleEditBuiltIn = (e: React.MouseEvent, t: OrderTemplate) => {
    e.stopPropagation();
    setEditingBuiltIn(t);
    setEditingTemplate(null);
    setTemplateName(t.name);
    setTemplateModalOpen(true);
  };

  const handleDeleteBuiltIn = (e: React.MouseEvent, name: string) => {
    e.stopPropagation();
    const next = [...hiddenBuiltIns, name];
    setHiddenBuiltIns(next);
    localStorage.setItem("hiddenBuiltInTemplates", JSON.stringify(next));
    message.success("Шаблон скрыт");
  };

  const handleEditTemplate = (e: React.MouseEvent, t: ApiTemplate) => {
    e.stopPropagation();
    setEditingTemplate(t);
    setTemplateName(t.name);
    setTemplateModalOpen(true);
  };

  const handleDeleteTemplate = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    deleteTemplateMutation.mutate(id);
  };

  const applyBuiltInTemplate = (template: OrderTemplate) => {
    const newItems = template.items.map((t) => ({
      product_id: undefined, product_name: t.product_name, quantity: t.quantity, unit_price: t.unit_price,
      raw_material_id: t.raw_material_id, cut_width_mm: t.cut_width_mm, cut_height_mm: t.cut_height_mm,
      _itemMode: "custom",
    }));
    form.setFieldValue("items", [...items, ...newItems]);
  };

  const applyApiTemplate = (t: ApiTemplate) => {
    const newItems = t.items.map((i) => ({
      product_id: i.product_id || undefined,
      product_name: i.product_name,
      quantity: i.quantity,
      unit_price: i.unit_price,
      raw_material_id: i.raw_material_id,
      cut_width_mm: i.cut_width_mm,
      cut_height_mm: i.cut_height_mm,
      _itemMode: i.product_id ? "catalog" : "custom",
    }));
    form.setFieldValue("items", [...items, ...newItems]);
  };

  const handleDragEnd = (event: { active: { id: string | number }; over: { id: string | number } | null }) => {
    const { active, over } = event;
    if (!over) return;
    const activeIdx = Number(String(active.id).replace("product-", ""));
    const overIdx = Number(String(over.id).replace("product-", ""));
    if (activeIdx === overIdx) return;
    form.setFieldValue("items", arrayMove(items, activeIdx, overIdx));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Typography.Text strong style={{ fontSize: 15 }}>
          Продукция
        </Typography.Text>
        <Button
          size="small"
          icon={<SaveOutlined />}
          disabled={items.length === 0}
          onClick={() => { setEditingTemplate(null); setTemplateName(""); setTemplateModalOpen(true); }}
        >
          Сохранить как шаблон
        </Button>
      </div>

      {/* Template cards */}
      <Row gutter={[8, 8]} style={{ marginBottom: 16 }}>
        {BUILT_IN_TEMPLATES.filter((t) => !hiddenBuiltIns.includes(t.name)).map((t) => (
          <Col key={t.name} xs={12} sm={8} md={6}>
            <Card
              size="small"
              hoverable
              style={{ textAlign: "center", cursor: "pointer" }}
              onClick={() => applyBuiltInTemplate(t)}
              actions={[
                <Tooltip key="edit" title="Редактировать">
                  <EditOutlined onClick={(e) => handleEditBuiltIn(e, t)} />
                </Tooltip>,
                <Popconfirm
                  key="delete"
                  title="Скрыть шаблон?"
                  onConfirm={(e) => { e?.stopPropagation(); handleDeleteBuiltIn(e as unknown as React.MouseEvent, t.name); }}
                  onCancel={(e) => e?.stopPropagation()}
                >
                  <DeleteOutlined onClick={(e) => e.stopPropagation()} />
                </Popconfirm>,
              ]}
            >
              <div style={{ fontSize: 24, marginBottom: 4 }}>{t.icon}</div>
              <Typography.Text style={{ fontSize: 12 }}>{t.name}</Typography.Text>
            </Card>
          </Col>
        ))}
        {(apiTemplates ?? []).map((t) => (
          <Col key={t.id} xs={12} sm={8} md={6}>
            <Card
              size="small"
              hoverable
              style={{ textAlign: "center", cursor: "pointer", position: "relative" }}
              onClick={() => applyApiTemplate(t)}
              actions={[
                <Tooltip key="edit" title="Редактировать">
                  <EditOutlined onClick={(e) => handleEditTemplate(e, t)} />
                </Tooltip>,
                <Popconfirm
                  key="delete"
                  title="Удалить шаблон?"
                  onConfirm={(e) => { e?.stopPropagation(); handleDeleteTemplate(e as unknown as React.MouseEvent, t.id); }}
                  onCancel={(e) => e?.stopPropagation()}
                >
                  <DeleteOutlined onClick={(e) => e.stopPropagation()} />
                </Popconfirm>,
              ]}
            >
              <div style={{ fontSize: 24, marginBottom: 4 }}>📋</div>
              <Typography.Text style={{ fontSize: 12 }}>{t.name}</Typography.Text>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Product list */}
      <Form.List name="items">
        {(fields, { add, remove }, { errors }) => (
          <>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={fields.map((f) => `product-${f.key}`)} strategy={verticalListSortingStrategy}>
                {fields.map((field, index) => (
                  <SortableProductRow
                    key={field.key}
                    field={field}
                    form={form}
                    index={index}
                    products={products}
                    rawMaterials={rawMaterials}
                    canViewPrices={canViewPrices}
                    onRemove={() => remove(field.name)}
                    setCalcItemIndex={setCalcItemIndex}
                    setCalcModalOpen={setCalcModalOpen}
                  />
                ))}
              </SortableContext>
            </DndContext>
            <Form.Item style={{ marginTop: 8 }}>
              <Button type="dashed" onClick={() => add({ product_id: undefined, quantity: 1, _itemMode: "catalog" })} block icon={<PlusOutlined />}>
                Добавить продукт
              </Button>
              <Form.ErrorList errors={errors} />
            </Form.Item>
          </>
        )}
      </Form.List>

      {/* Save/Edit Template Modal */}
      <Modal
        title={editingTemplate || editingBuiltIn ? "Редактировать шаблон" : "Сохранить как шаблон"}
        open={templateModalOpen}
        onOk={handleSaveTemplate}
        onCancel={() => { setTemplateModalOpen(false); setEditingTemplate(null); setEditingBuiltIn(null); setTemplateName(""); }}
        okText={editingTemplate || editingBuiltIn ? "Сохранить" : "Создать"}
        cancelText="Отмена"
      >
        <div style={{ marginBottom: 12 }}>
          <Typography.Text type="secondary">Название:</Typography.Text>
          <Input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="Введите название шаблона"
            style={{ marginTop: 4 }}
            onPressEnter={handleSaveTemplate}
          />
        </div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {editingBuiltIn
            ? `Шаблон «${editingBuiltIn.name}» будет сохранён как пользовательский.`
            : `В шаблон попадёт ${items.length} позиц${items.length === 1 ? "ия" : items.length < 5 ? "и" : "ий"} из текущего заказа.`
          }
        </Typography.Text>
      </Modal>
    </div>
  );
}
