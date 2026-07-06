import { Divider, Form, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import type { FormInstance } from "antd";
import { getClients } from "../../api/clients";
import { getProducts } from "../../api/products";
import { useAuth } from "../../hooks/useAuth";

interface OrderSummaryProps {
  form: FormInstance;
}

export default function OrderSummary({ form }: OrderSummaryProps) {
  const { hasPermission } = useAuth();
  const canViewPrices = hasPermission("prices.view");
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: getClients });
  const { data: products } = useQuery({ queryKey: ["products"], queryFn: getProducts });

  const clientId = Form.useWatch("client_id", form);
  const items = Form.useWatch("items", form) || [];
  const status = Form.useWatch("status", form);

  const client = (clients as Array<{ id: number; name: string; phone?: string; email?: string }> | undefined)?.find((c) => c.id === clientId);

  const totalSum = items.reduce((sum: number, item: Record<string, unknown>) => {
    const formPrice = (item.unit_price as number) || 0;
    const qty = (item.quantity as number) || 0;
    const catalogProduct = item.product_id
      ? (products as Array<{ id: number; unit_price: number }> | undefined)?.find((p) => p.id === item.product_id)
      : undefined;
    const price = formPrice || catalogProduct?.unit_price || 0;
    return sum + price * qty;
  }, 0);

  const statusLabels: Record<string, string> = {
    new: "Новый", in_progress: "В работе", ready: "Готов", delivered: "Отдали",
  };

  return (
    <div style={{ position: "sticky", top: 0 }}>
      <Typography.Text strong style={{ fontSize: 14, display: "block", marginBottom: 12 }}>
        Сводка заказа
      </Typography.Text>

      {client ? (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "#8c8c8c" }}>Клиент</div>
          <div style={{ fontWeight: 600 }}>{client.name}</div>
          {client.phone && <div style={{ fontSize: 12, color: "#8c8c8c", marginTop: 2 }}>{client.phone}</div>}
          {client.email && <div style={{ fontSize: 12, color: "#8c8c8c" }}>{client.email}</div>}
        </div>
      ) : (
        <Typography.Text type="secondary" style={{ display: "block", marginBottom: 16, fontSize: 13 }}>
          Клиент не выбран
        </Typography.Text>
      )}

      <Divider style={{ margin: "8px 0" }} />

      <Typography.Text type="secondary" style={{ fontSize: 12 }}>Продукты</Typography.Text>
      {items.length > 0 ? (
        <div style={{ marginTop: 4 }}>
          {items.map((item: Record<string, unknown>, idx: number) => {
            const product = (products as Array<{ id: number; name: string; unit_price: number }> | undefined)?.find((p) => p.id === item.product_id);
            const name = (item.product_name as string) || product?.name || `Позиция ${idx + 1}`;
            const qty = (item.quantity as number) || 0;
            const price = (item.unit_price as number) || product?.unit_price || 0;
            return (
              <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
                <Typography.Text ellipsis style={{ maxWidth: 180 }}>
                  {name} × {qty}
                </Typography.Text>
                {canViewPrices && <Typography.Text>{(price * qty).toLocaleString()} ₽</Typography.Text>}
              </div>
            );
          })}
        </div>
      ) : (
        <Typography.Text type="secondary" style={{ display: "block", marginTop: 4, fontSize: 13 }}>
          Нет продуктов
        </Typography.Text>
      )}

      <Divider style={{ margin: "8px 0" }} />

      {canViewPrices && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Typography.Text strong>Итого</Typography.Text>
          <Typography.Text strong style={{ fontSize: 18, color: "#1677ff" }}>
            {totalSum.toLocaleString()} ₽
          </Typography.Text>
        </div>
      )}

      {status && (
        <div style={{ marginTop: 8 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>Статус</Typography.Text>
          <Typography.Text style={{ display: "block" }}>{statusLabels[status] || status}</Typography.Text>
        </div>
      )}
    </div>
  );
}
