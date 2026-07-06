import { Checkbox, Collapse, DatePicker, Divider, Form, Input, InputNumber, Select, Space, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import type { FormInstance } from "antd";
import { getOrderSettings } from "../../api/orderSettings";
import { getUsers } from "../../api/auth";
import { useMemo } from "react";
import { useAuth } from "../../hooks/useAuth";
import { ORDER_STATUSES } from "../../types";

const statusLabels: Record<string, string> = {
  new: "Новый", in_progress: "В работе", ready: "Готов", delivered: "Отдали",
};

interface OrderDetailsStepProps {
  form: FormInstance;
}

export default function OrderDetailsStep({ form }: OrderDetailsStepProps) {
  const { hasPermission } = useAuth();
  const canEditOrders = hasPermission("orders.edit");
  const { data: layoutOptions } = useQuery({ queryKey: ["orderSettings", "layout"], queryFn: () => getOrderSettings("layout") });
  const { data: sourceOptions } = useQuery({ queryKey: ["orderSettings", "source"], queryFn: () => getOrderSettings("source") });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: getUsers });
  const activeUsers = useMemo(() => (users ?? []).filter((u) => u.is_active), [users]);

  return (
    <div>
      <Typography.Text strong style={{ display: "block", marginBottom: 12, fontSize: 15 }}>
        Детали заказа
      </Typography.Text>

      <Form.Item name="description" label="Описание заказа" style={{ marginBottom: 12 }}>
        <Input.TextArea rows={2} placeholder="Описание (автоиз продуктов, если пусто)" />
      </Form.Item>

      <Form.Item name="deadline" label="Дедлайн" style={{ marginBottom: 12 }}>
        <DatePicker style={{ width: "100%" }} />
      </Form.Item>

      <Form.Item name="notes" label="Примечания" style={{ marginBottom: 16 }}>
        <Input.TextArea rows={2} />
      </Form.Item>

      <Form.Item name="status" label="Статус" style={{ marginBottom: 16 }}>
        <Select>{ORDER_STATUSES.map((s) => (<Select.Option key={s} value={s}>{statusLabels[s] || s}</Select.Option>))}</Select>
      </Form.Item>

      {canEditOrders && (
        <Collapse
          defaultActiveKey={[]}
          items={[{
            key: "production",
            label: <Typography.Text strong>Производство</Typography.Text>,
            children: (
              <>
                <Form.Item name="designer" label="Дизайнер" style={{ marginBottom: 8 }}>
                  <Select allowClear showSearch optionFilterProp="label" placeholder="Выберите дизайнера" size="small">
                    {activeUsers.map((u) => (
                      <Select.Option key={u.id} value={u.username} label={u.full_name || u.username}>
                        {u.full_name || u.username} ({u.username})
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
                <Form.Item name="workers" label="Работники" style={{ marginBottom: 8 }}>
                  <Select mode="multiple" allowClear showSearch optionFilterProp="label" placeholder="Выберите работников" size="small">
                    {activeUsers.map((u) => (
                      <Select.Option key={u.id} value={u.username} label={u.full_name || u.username}>
                        {u.full_name || u.username} ({u.username})
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
                <Form.Item name="layout_type" label="Макет" style={{ marginBottom: 8 }}>
                  <Select allowClear placeholder="Выберите макет" size="small">
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
              </>
            ),
          }, {
            key: "additional",
            label: <Typography.Text strong>Дополнительно</Typography.Text>,
            children: (
              <>
                <Form.Item name="path" label="Путь к файлам" style={{ marginBottom: 8 }}>
                  <Input.TextArea rows={2} placeholder="\\192.168.1.150\buffer\заказчик номер 1" size="small" />
                </Form.Item>
                <Form.Item name="source" label="Где (Откуда заказчик)" style={{ marginBottom: 8 }}>
                  <Select allowClear placeholder="Выберите источник" size="small">
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
            ),
          }]}
        />
      )}
    </div>
  );
}
