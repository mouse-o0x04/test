import { Descriptions, Divider, Form, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import type { FormInstance } from "antd";
import dayjs from "dayjs";
import { getClients } from "../../api/clients";
import { getProducts } from "../../api/products";
import { useAuth } from "../../hooks/useAuth";

interface OrderConfirmStepProps {
  form: FormInstance;
}

export default function OrderConfirmStep({ form }: OrderConfirmStepProps) {
  const { hasPermission } = useAuth();
  const canViewPrices = hasPermission("prices.view");
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: getClients });
  const { data: products } = useQuery({ queryKey: ["products"], queryFn: getProducts });

  const clientId = Form.useWatch("client_id", form);
  const clientIds = Form.useWatch("client_ids", form) || [];
  const items = Form.useWatch("items", form) || [];
  const status = Form.useWatch("status", form);
  const description = Form.useWatch("description", form);
  const notes = Form.useWatch("notes", form);
  const designer = Form.useWatch("designer", form);
  const workers = Form.useWatch("workers", form);
  const deadlineStart = Form.useWatch("deadline_start", form);
  const deadline = Form.useWatch("deadline", form);

  const allClients = (clients as Array<{ id: number; name: string }> | undefined) || [];
  const client = allClients.find((c) => c.id === clientId);
  const subClients = (clientIds as number[]).filter(Boolean).map((id) => allClients.find((c) => c.id === id)).filter(Boolean);

  const statusLabels: Record<string, string> = {
    new: "Новый", in_progress: "В работе", ready: "Готов", delivered: "Отдали",
  };

  const totalSum = (items as Array<Record<string, unknown>>).reduce((sum, item) => {
    const formPrice = (item.unit_price as number) || 0;
    const qty = (item.quantity as number) || 0;
    const catalogProduct = item.product_id
      ? (products as Array<{ id: number; unit_price: number }> | undefined)?.find((p) => p.id === item.product_id)
      : undefined;
    const price = formPrice || catalogProduct?.unit_price || 0;
    return sum + price * qty;
  }, 0);

  return (
    <div>
      <Typography.Text strong style={{ display: "block", marginBottom: 12, fontSize: 15 }}>
        Подтверждение заказа
      </Typography.Text>

      <Descriptions column={1} bordered size="small">
        <Descriptions.Item label="Заказчик">{client?.name || "—"}{subClients.length > 0 && <> / {subClients.map((sc) => sc!.name).join(" / ")}</>}</Descriptions.Item>
        <Descriptions.Item label="Статус">{statusLabels[status as string] || status || "—"}</Descriptions.Item>
        {description && (() => { let d = description as string; if (d.trim().startsWith("{")) try { d = JSON.parse(d).text; } catch {} return d; })() && <Descriptions.Item label="Описание">{(() => { let d = description as string; if (d.trim().startsWith("{")) try { d = JSON.parse(d).text; } catch {} return d; })()}</Descriptions.Item>}
        {notes && <Descriptions.Item label="Примечания">{notes as string}</Descriptions.Item>}
        {(deadlineStart || deadline) && (
          <Descriptions.Item label="Сроки">
            {(() => {
              const s = deadlineStart ? dayjs(deadlineStart as string) : null;
              const e = deadline ? dayjs(deadline as string) : null;
              if (s && e && !s.isSame(e)) return `${s.format("DD.MM.YYYY")} - ${e.format("DD.MM.YYYY HH:mm")}`;
              return (e || s)!.format("DD.MM.YYYY HH:mm");
            })()}
          </Descriptions.Item>
        )}
        {designer && <Descriptions.Item label="Дизайнер">{designer as string}</Descriptions.Item>}
        {workers && (workers as string[]).length > 0 && <Descriptions.Item label="Работники">{(workers as string[]).join(", ")}</Descriptions.Item>}
      </Descriptions>

      <Divider style={{ margin: "12px 0" }} />

      <Typography.Text strong style={{ display: "block", marginBottom: 8 }}>Продукты</Typography.Text>
      {(items as Array<Record<string, unknown>>).map((item, idx) => {
        const product = (products as Array<{ id: number; name: string; unit_price: number; raw_materials?: any[]; has_components?: boolean }> | undefined)?.find((p) => p.id === item.product_id);
        const name = (item.product_name as string) || product?.name || `Позиция ${idx + 1}`;
        const qty = (item.quantity as number) || 0;
        const formPrice = (item.unit_price as number) || 0;
        const price = formPrice || product?.unit_price || 0;
        const components = product?.raw_materials || [];
        return (
          <div key={idx} style={{ padding: "6px 0", borderBottom: "1px solid #f0f0f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <Typography.Text>{name} × {qty}</Typography.Text>
              {canViewPrices && <Typography.Text strong>{(price * qty).toLocaleString()} ₽</Typography.Text>}
            </div>
            {components.length > 0 && (
              <div style={{ fontSize: 12, color: "#8c8c8c", marginTop: 4, paddingLeft: 12 }}>
                {components.filter((c: any) => c.component_product_id).map((c: any) => {
                  const compName = c.component_product_name || c.name || `#${c.component_product_id}`;
                  const compTotal = c.quantity_per_unit ? c.quantity_per_unit * qty : qty;
                  return (
                    <div key={c.id || compName}>
                      ↳ {compName} × {compTotal}
                      {c.cut_width_mm && c.cut_height_mm ? ` (${c.cut_width_mm}×${c.cut_height_mm}мм)` : ""}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {canViewPrices && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, padding: "8px 0" }}>
          <Typography.Text strong style={{ fontSize: 15 }}>Итого</Typography.Text>
          <Typography.Text strong style={{ fontSize: 18, color: "#1677ff" }}>{totalSum.toLocaleString()} ₽</Typography.Text>
        </div>
      )}
    </div>
  );
}
