import { Button, Card, Form, Input, Select, Space, Typography } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createClient, getClients } from "../../api/clients";
import type { FormInstance } from "antd";

interface ClientStepProps {
  form: FormInstance;
}

export default function ClientStep({ form }: ClientStepProps) {
  const queryClient = useQueryClient();
  const [quickClientOpen, setQuickClientOpen] = useState(false);
  const [quickClientForm] = Form.useForm();

  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: getClients });

  const quickClientMutation = useMutation({
    mutationFn: (data: { name: string; phone?: string; email?: string }) => createClient(data),
    onSuccess: (newClient) => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      form.setFieldsValue({ client_id: newClient.id });
      setQuickClientOpen(false);
      quickClientForm.resetFields();
    },
    onError: () => {},
  });

  return (
    <div>
      <Typography.Text strong style={{ display: "block", marginBottom: 12, fontSize: 15 }}>
        Выберите клиента
      </Typography.Text>

      <Form.Item name="client_id" rules={[{ required: true, message: "Выберите клиента" }]} style={{ marginBottom: 12 }}>
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="Поиск клиента..."
          size="large"
          notFoundContent="Клиентов пока нет"
        >
          {(clients ?? []).map((c: { id: number; name: string; email: string; phone?: string }) => (
            <Select.Option key={c.id} value={c.id} label={c.name}>
              <div>
                <div style={{ fontWeight: 500 }}>{c.name}</div>
              </div>
            </Select.Option>
          ))}
        </Select>
      </Form.Item>

      {!quickClientOpen ? (
        <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => setQuickClientOpen(true)} style={{ padding: 0 }}>
          Новый клиент
        </Button>
      ) : (
        <Card size="small" style={{ background: "#fafafa" }}>
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
              <Button type="primary" size="small" onClick={() => { quickClientForm.validateFields().then((values) => quickClientMutation.mutate(values)); }} loading={quickClientMutation.isPending}>
                Создать
              </Button>
            </Space>
          </Form>
        </Card>
      )}
    </div>
  );
}
