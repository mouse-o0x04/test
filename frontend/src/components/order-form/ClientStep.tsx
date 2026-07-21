import { Button, Card, Form, Input, Select, Space, Typography } from "antd";
import { PlusOutlined, CloseOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createClient, getClients } from "../../api/clients";
import type { FormInstance } from "antd";

interface ClientStepProps {
  form: FormInstance;
  initialClientIds?: number[];
}

export default function ClientStep({ form, initialClientIds }: ClientStepProps) {
  const queryClient = useQueryClient();
  const [quickClientOpen, setQuickClientOpen] = useState(false);
  const [quickClientForm] = Form.useForm();
  const [additionalClients, setAdditionalClients] = useState<number[]>(() =>
    initialClientIds ? initialClientIds.slice(1).map((_, i) => i) : []
  );

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

  const addClient = () => {
    setAdditionalClients((prev) => [...prev, Date.now()]);
  };

  const removeClient = (idx: number) => {
    setAdditionalClients((prev) => prev.filter((_, i) => i !== idx));
  };

  const clientOptions = (clients ?? []).map((c: { id: number; name: string }) => ({
    value: c.id,
    label: c.name,
  }));

  return (
    <div>
      <Typography.Text strong style={{ display: "block", marginBottom: 12, fontSize: 15 }}>
        Заказчик
      </Typography.Text>

      <Form.Item name="client_id" rules={[{ required: true, message: "Выберите клиента" }]} style={{ marginBottom: 12 }}>
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="Поиск клиента..."
          size="large"
          notFoundContent="Клиентов пока нет"
          options={clientOptions}
        />
      </Form.Item>

      {additionalClients.map((_, idx) => (
        <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
          <Form.Item name={["client_ids", idx]} style={{ flex: 1, marginBottom: 0 }}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Субзаказчик..."
              options={clientOptions}
            />
          </Form.Item>
          <Button
            type="text"
            danger
            icon={<CloseOutlined />}
            onClick={() => removeClient(idx)}
          />
        </div>
      ))}

      <Space>
        {!quickClientOpen ? (
          <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => setQuickClientOpen(true)} style={{ padding: 0 }}>
            Новый клиент
          </Button>
        ) : (
          <Button type="link" size="small" style={{ padding: 0 }} disabled>
            Новый клиент
          </Button>
        )}
        <Button type="link" size="small" icon={<PlusOutlined />} onClick={addClient} style={{ padding: 0 }}>
          Добавить заказчика
        </Button>
      </Space>

      {quickClientOpen && (
        <Card size="small" style={{ background: "#fafafa", marginTop: 8 }}>
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
