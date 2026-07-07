import {
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useState } from "react";
import {
  createAgent,
  deleteAgent,
  getAgents,
  getEvents,
  sendEvent,
  updateAgent,
} from "../api/hermes";
import type { HermesAgent, HermesAgentFormData } from "../types";

export default function HermesPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<HermesAgent | null>(null);
  const [editing, setEditing] = useState<HermesAgent | null>(null);
  const [form] = Form.useForm<HermesAgentFormData>();
  const [eventForm] = Form.useForm();

  const { data: agents, isLoading } = useQuery({ queryKey: ["agents"], queryFn: getAgents });
  const { data: events } = useQuery({
    queryKey: ["events", selectedAgent?.id],
    queryFn: () => getEvents(selectedAgent?.id),
    enabled: !!selectedAgent,
  });

  const createMutation = useMutation({
    mutationFn: createAgent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      message.success("Агент создан");
      setModalOpen(false);
      form.resetFields();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<HermesAgentFormData> }) =>
      updateAgent(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      message.success("Агент обновлён");
      setModalOpen(false);
      setEditing(null);
      form.resetFields();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAgent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      message.success("Агент удалён");
    },
  });

  const sendEventMutation = useMutation({
    mutationFn: sendEvent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      message.success("Событие отправлено");
      setEventModalOpen(false);
      eventForm.resetFields();
    },
  });

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (agent: HermesAgent) => {
    setEditing(agent);
    form.setFieldsValue({
      name: agent.name,
      agent_type: agent.agent_type,
      config: agent.config as Record<string, string>,
      webhook_url: agent.webhook_url,
    });
    setModalOpen(true);
  };

  const onFinish = (values: HermesAgentFormData) => {
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: values });
    } else {
      createMutation.mutate(values);
    }
  };

  const onSendEvent = (values: { event_type: string; payload: string }) => {
    let payload: Record<string, unknown> = {};
    try {
      payload = values.payload ? JSON.parse(values.payload) : {};
    } catch {
      message.error("Неверный JSON в payload");
      return;
    }
    sendEventMutation.mutate({
      agent_id: selectedAgent!.id,
      event_type: values.event_type,
      payload,
    });
  };

  const agentColumns = [
    { title: "ID", dataIndex: "id", key: "id", width: 60 },
    { title: "Имя", dataIndex: "name", key: "name" },
    { title: "Тип", dataIndex: "agent_type", key: "agent_type" },
    {
      title: "Статус",
      dataIndex: "is_active",
      key: "is_active",
      render: (v: boolean) => (
        <Tag color={v ? "green" : "red"}>{v ? "активен" : "неактивен"}</Tag>
      ),
    },
    {
      title: "Последний раз",
      dataIndex: "last_seen",
      key: "last_seen",
      render: (v: string | null) => (v ? dayjs(v).format("DD.MM.YYYY HH:mm") : "никогда"),
    },
    {
      title: "Действия",
      key: "actions",
      render: (_: unknown, record: HermesAgent) => (
        <Space>
          <Button type="link" onClick={() => openEdit(record)}>Редактировать</Button>
          <Button
            type="link"
            onClick={() => {
              setSelectedAgent(record);
              setEventModalOpen(true);
            }}
          >
            Отправить событие
          </Button>
          <Button type="link" danger onClick={() => deleteMutation.mutate(record.id)}>
            Удалить
          </Button>
        </Space>
      ),
    },
  ];

  const eventColumns = [
    { title: "ID", dataIndex: "id", key: "id", width: 60 },
    { title: "Тип", dataIndex: "event_type", key: "event_type" },
    {
      title: "Статус",
      dataIndex: "status",
      key: "status",
      render: (s: string) => (
        <Tag color={s === "delivered" ? "green" : s === "failed" ? "red" : "orange"}>{s}</Tag>
      ),
    },
    {
      title: "Дата",
      dataIndex: "created_at",
      key: "created_at",
      render: (v: string) => dayjs(v).format("DD.MM.YYYY HH:mm"),
    },
  ];

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Telegram bot
          </Typography.Title>
          <Button type="primary" onClick={openCreate}>
            Добавить агента
          </Button>
        </Space>
        <Table
          dataSource={agents}
          columns={agentColumns}
          rowKey="id"
          loading={isLoading}
          onRow={(record) => ({
            onClick: () => setSelectedAgent(record),
            style: {
              cursor: "pointer",
              background: selectedAgent?.id === record.id ? "#e6f4ff" : undefined,
            },
          })}
        />
      </Col>

      {selectedAgent && (
        <Col span={24}>
          <Card
            title={`Агент: ${selectedAgent.name}`}
            extra={
              <Button type="primary" size="small" onClick={() => setEventModalOpen(true)}>
                Отправить событие
              </Button>
            }
          >
            <Descriptions column={2} size="small">
              <Descriptions.Item label="Тип">{selectedAgent.agent_type}</Descriptions.Item>
              <Descriptions.Item label="Webhook URL">
                {selectedAgent.webhook_url || "-"}
              </Descriptions.Item>
              <Descriptions.Item label="Активен">
                <Tag color={selectedAgent.is_active ? "green" : "red"}>
                  {selectedAgent.is_active ? "да" : "нет"}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Последний раз">
                {selectedAgent.last_seen
                  ? dayjs(selectedAgent.last_seen).format("DD.MM.YYYY HH:mm")
                  : "никогда"}
              </Descriptions.Item>
            </Descriptions>
            <Typography.Text strong style={{ display: "block", marginTop: 16, marginBottom: 8 }}>
              События
            </Typography.Text>
            <Table
              dataSource={events}
              columns={eventColumns}
              rowKey="id"
              size="small"
              pagination={{ pageSize: 5 }}
            />
          </Card>
        </Col>
      )}

      <Modal
        title={editing ? "Редактировать агента" : "Новый агент Telegram"}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onOk={() => form.validateFields().then(onFinish).catch(() => {})}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="name" label="Имя агента" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="agent_type" label="Тип агента" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="webhook">Webhook</Select.Option>
              <Select.Option value="notification">Уведомления</Select.Option>
              <Select.Option value="ai_assistant">AI-ассистент</Select.Option>
              <Select.Option value="external">Внешняя система</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="webhook_url" label="Webhook URL">
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item name="config" label="Конфигурация (JSON)">
            <Input.TextArea rows={3} placeholder='{"key": "value"}' />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Отправить событие агенту: ${selectedAgent?.name}`}
        open={eventModalOpen}
        onCancel={() => {
          setEventModalOpen(false);
          eventForm.resetFields();
        }}
        onOk={() => eventForm.validateFields().then(onSendEvent).catch(() => {})}
        confirmLoading={sendEventMutation.isPending}
      >
        <Form form={eventForm} layout="vertical" onFinish={onSendEvent}>
          <Form.Item name="event_type" label="Тип события" rules={[{ required: true }]}>
            <Input placeholder="order.created" />
          </Form.Item>
          <Form.Item name="payload" label="Payload (JSON)">
            <Input.TextArea rows={4} placeholder='{"order_id": 1}' />
          </Form.Item>
        </Form>
      </Modal>
    </Row>
  );
}
