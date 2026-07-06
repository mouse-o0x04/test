import { Button, Col, Drawer, Form, Modal, Row, Steps, message } from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient, getClients } from "../api/clients";
import { createOrder, getOrders, updateOrder } from "../api/orders";
import { getProducts } from "../api/products";
import { getRawMaterials } from "../api/rawMaterials";
import { getWarehouseItems } from "../api/warehouse";
import { getOrderSettings } from "../api/orderSettings";
import { getOrderTemplates, createOrderTemplate, deleteOrderTemplate, type OrderTemplate as ApiTemplate } from "../api/orderTemplates";
import { getUsers } from "../api/auth";
import CalculatorModal from "./CalculatorModal";
import { useAuth } from "../hooks/useAuth";
import { useResponsive } from "../hooks/useResponsive";
import type { Order, OrderFormData } from "../types";

import ClientStep from "./order-form/ClientStep";
import ProductsStep from "./order-form/ProductsStep";
import OrderDetailsStep from "./order-form/OrderDetailsStep";
import OrderConfirmStep from "./order-form/OrderConfirmStep";
import OrderSummary from "./order-form/OrderSummary";

const STEP_ITEMS = [
  { title: "Клиент" },
  { title: "Продукция" },
  { title: "Детали" },
  { title: "Подтверждение" },
];

interface OrderFormProps {
  open: boolean;
  editing: Order | null;
  onClose: () => void;
  onSuccess: () => void;
}

const DRAFT_KEY = "orderFormDraft";

function saveDraft(data: Record<string, unknown>) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch {}
}

function loadDraft(): Record<string, unknown> | null {
  try { const v = localStorage.getItem(DRAFT_KEY); return v ? JSON.parse(v) : null; } catch { return null; }
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
}

export default function OrderForm({ open, editing, onClose, onSuccess }: OrderFormProps) {
  const queryClient = useQueryClient();
  const { isMobile } = useResponsive();
  const { hasPermission } = useAuth();
  const [form] = Form.useForm();
  const [currentStep, setCurrentStep] = useState(0);
  const [calcItemIndex, setCalcItemIndex] = useState<number | null>(null);
  const [calcModalOpen, setCalcModalOpen] = useState(false);

  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: getClients });
  const { data: products } = useQuery({ queryKey: ["products"], queryFn: getProducts });
  const { data: rawMaterials } = useQuery({ queryKey: ["rawMaterials"], queryFn: getRawMaterials });
  const { data: warehouseItems } = useQuery({ queryKey: ["warehouse"], queryFn: getWarehouseItems });
  const { data: orders } = useQuery({ queryKey: ["orders"], queryFn: getOrders });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: getUsers });
  const { data: apiTemplates } = useQuery({ queryKey: ["orderTemplates"], queryFn: getOrderTemplates });
  const { data: layoutOptions } = useQuery({ queryKey: ["orderSettings", "layout"], queryFn: () => getOrderSettings("layout") });

  const createMutation = useMutation({
    mutationFn: (data: OrderFormData) => createOrder(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["orders"] }); queryClient.invalidateQueries({ queryKey: ["warehouse"] }); message.success("Заказ создан"); clearDraft(); onClose(); form.resetFields(); setCurrentStep(0); onSuccess(); },
    onError: (err: { response?: { data?: { detail?: string } } }) => { message.error(err.response?.data?.detail || "Ошибка создания заказа"); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<OrderFormData> }) => updateOrder(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["orders"] }); queryClient.invalidateQueries({ queryKey: ["warehouse"] }); message.success("Заказ обновлён"); onClose(); form.resetFields(); setCurrentStep(0); onSuccess(); },
    onError: (err: { response?: { data?: { detail?: string } } }) => { message.error(err.response?.data?.detail || "Ошибка обновления заказа"); },
  });

  useEffect(() => {
    if (open && editing) {
      form.setFieldsValue({
        client_id: editing.client_id,
        status: editing.status,
        description: editing.description,
        notes: editing.notes,
        deadline: editing.deadline ? dayjs(editing.deadline) : undefined,
        items: editing.items.map((i) => ({
          _itemMode: i.product_id ? "catalog" : "custom",
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
          processing_method: i.processing_method,
          manual_writeoff_pending: i.manual_writeoff_pending,
          manual_writeoff_raw_material_id: i.manual_writeoff_raw_material_id,
          manual_writeoff_cut_width_mm: i.manual_writeoff_cut_width_mm,
          manual_writeoff_cut_height_mm: i.manual_writeoff_cut_height_mm,
          manual_writeoff_quantity: i.manual_writeoff_quantity,
        })),
        designer: editing.designer,
        workers: editing.workers,
        layout_type: editing.layout_type,
        path: editing.path,
        source: editing.source,
      });
    } else if (open) {
      const draft = loadDraft();
      if (draft) {
        Modal.confirm({
          title: "Найден черновик",
          content: "Восстановить незавершённый заказ?",
          okText: "Восстановить",
          cancelText: "Начать заново",
          onOk() {
            form.setFieldsValue(draft);
            setCurrentStep((draft._step as number) || 0);
          },
          onCancel() {
            clearDraft();
            form.resetFields();
            form.setFieldsValue({ items: [], status: "new" });
            setCurrentStep(0);
          },
        });
      } else {
        const defaultLayout = layoutOptions?.[0]?.name || "";
        form.resetFields();
        form.setFieldsValue({ items: [], status: "new", layout_type: defaultLayout });
        setCurrentStep(0);
      }
    }
  }, [open, editing, layoutOptions]);

  const watchedClientId = Form.useWatch("client_id", form);
  const watchedItems = Form.useWatch("items", form);
  const clientSelected = !!watchedClientId;

  useEffect(() => {
    if (!watchedClientId || !orders || editing) return;
    const lastOrder = orders.filter((o) => o.client_id === watchedClientId).sort((a, b) => b.id - a.id)[0];
    if (lastOrder) {
      form.setFieldsValue({ designer: lastOrder.designer, source: lastOrder.source, path: lastOrder.path, layout_type: lastOrder.layout_type });
    }
  }, [watchedClientId, orders, editing]);

  useEffect(() => {
    if (!open || editing) return;
    const timeout = setTimeout(() => {
      const values = form.getFieldsValue();
      saveDraft({ ...values, _step: currentStep });
    }, 500);
    return () => clearTimeout(timeout);
  }, [watchedClientId, watchedItems, currentStep, open, editing]);

  const onFinish = (values: Record<string, unknown>) => {
    const v = values;
    const payload: OrderFormData = {
      client_id: v.client_id as number,
      status: v.status as string,
      description: (v.description as string) || undefined,
      notes: (v.notes as string) || undefined,
      deadline: v.deadline ? dayjs(v.deadline as string | number | Date).toISOString() : undefined,
      items: ((v.items as unknown[]) || []).map((i) => {
        const it = i as Record<string, unknown>;
        return {
          product_id: it.product_id as number | undefined,
          product_name: it.product_name as string | undefined,
          product_unit: it.product_unit as string | undefined,
          unit_price: it.unit_price as number | undefined,
          raw_material_id: it.raw_material_id as number | undefined,
          raw_material_qty: it.raw_material_qty as number | undefined,
          cut_width_mm: it.cut_width_mm as number | undefined,
          cut_height_mm: it.cut_height_mm as number | undefined,
          raw_materials: ((it.raw_materials as unknown[]) || []).map((rm) => {
            const r = rm as Record<string, unknown>;
            return {
              raw_material_id: r.raw_material_id as number,
              cut_width_mm: r.cut_width_mm as number | undefined,
              cut_height_mm: r.cut_height_mm as number | undefined,
            };
          }),
          quantity: it.quantity as number,
          processing_method: (it.processing_method as string) || undefined,
          manual_writeoff_pending: (it.manual_writeoff_pending as boolean) || false,
          manual_writeoff_raw_material_id: it.manual_writeoff_raw_material_id as number | undefined,
          manual_writeoff_cut_width_mm: it.manual_writeoff_cut_width_mm as number | undefined,
          manual_writeoff_cut_height_mm: it.manual_writeoff_cut_height_mm as number | undefined,
          manual_writeoff_quantity: it.manual_writeoff_quantity as number | undefined,
        };
      }),
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

  const canGoNext = () => {
    if (currentStep === 0) return !!watchedClientId;
    if (currentStep === 1) {
      return (watchedItems || []).length > 0;
    }
    return true;
  };

  const handleNext = async () => {
    if (currentStep === 0) {
      try { await form.validateFields(["client_id"]); } catch { return; }
    }
    if (currentStep < 3) setCurrentStep(currentStep + 1);
    else form.validateFields().then(onFinish).catch(() => {});
  };

  const handlePrev = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  const stepContent = (
    <>
      <div style={{ display: currentStep === 0 ? "block" : "none" }}><ClientStep form={form} /></div>
      <div style={{ display: currentStep === 1 ? "block" : "none" }}><ProductsStep form={form} calcItemIndex={calcItemIndex} setCalcItemIndex={setCalcItemIndex} setCalcModalOpen={setCalcModalOpen} /></div>
      <div style={{ display: currentStep === 2 ? "block" : "none" }}><OrderDetailsStep form={form} /></div>
      <div style={{ display: currentStep === 3 ? "block" : "none" }}><OrderConfirmStep form={form} /></div>
    </>
  );

  const formContent = (
    <Form form={form} layout="vertical" onFinish={onFinish}>
      <Row gutter={24}>
        <Col flex="auto" style={{ minWidth: 0 }}>
          <Steps current={currentStep} items={STEP_ITEMS} size="small" style={{ marginBottom: 24 }} />
          {stepContent}
        </Col>
        <Col style={{ width: 320, flexShrink: 0, borderLeft: "1px solid #f0f0f0", paddingLeft: 24 }}>
          <OrderSummary form={form} />
        </Col>
      </Row>
    </Form>
  );

  const footer = (
    <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
      <div>
        {currentStep > 0 && (
          <Button onClick={handlePrev}>Назад</Button>
        )}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Button onClick={() => { onClose(); form.resetFields(); setCurrentStep(0); }}>Отмена</Button>
        <Button type="primary" onClick={handleNext} disabled={!canGoNext()} loading={createMutation.isPending || updateMutation.isPending}>
          {currentStep === 3 ? (editing ? "Сохранить" : "Создать заказ") : "Далее"}
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer
        title={editing ? "Редактировать заказ" : "Новый заказ"}
        open={open}
        onClose={onClose}
        width="100%"
        height="100%"
        placement="bottom"
        styles={{ body: { padding: 12, overflow: "auto" }, footer: { padding: "8px 12px" } }}
        footer={footer}
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Steps current={currentStep} items={STEP_ITEMS} size="small" style={{ marginBottom: 16 }} />
          {stepContent}
          <div style={{ marginTop: 16 }}>
            <OrderSummary form={form} />
          </div>
        </Form>
      </Drawer>
    );
  }

  return (
    <Modal
      title={editing ? "Редактировать заказ" : "Новый заказ"}
      open={open}
      onCancel={() => { onClose(); form.resetFields(); setCurrentStep(0); }}
      width="90vw"
      style={{ maxWidth: 1400 }}
      footer={footer}
      destroyOnClose={false}
    >
      {formContent}
      <CalculatorModal
        open={calcModalOpen}
        onClose={() => setCalcModalOpen(false)}
        onApply={(price: number) => {
          if (calcItemIndex !== null) {
            const items = form.getFieldValue("items") || [];
            items[calcItemIndex] = { ...items[calcItemIndex], unit_price: price };
            form.setFieldValue("items", items);
          }
          setCalcModalOpen(false);
        }}
      />
    </Modal>
  );
}
