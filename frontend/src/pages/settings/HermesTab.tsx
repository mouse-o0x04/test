import {
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
  Spin,
  Statistic,
  Row,
  Col,
  Divider,
} from "antd";
import {
  FileTextOutlined,
  SendOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
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
  getDailyReportPreview,
  sendDailyReport,
  DailyReportPreview,
} from "../../api/hermes";
import type { HermesAgent, HermesAgentFormData } from "../../types";

const EVENT_TYPES = [
  { value: "order.created", label: "Заказ создан" },
  { value: "order.status_changed", label: "Смена статуса заказа" },
  { value: "order.deleted", label: "Заказ удалён" },
  { value: "client.created", label: "Клиент создан" },
  { value: "client.deleted", label: "Клиент удалён" },
  { value: "low_stock", label: "Мало на складе" },
  { value: "daily_report", label: "Дневной отчёт" },
];

export default function HermesTab() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<HermesAgent | null>(null);
  const [editing, setEditing] = useState<HermesAgent | null>(null);
  const [form] = Form.useForm();
  const [eventForm] = Form.useForm();
  const [agentType, setAgentType] = useState<string>("webhook");
  const [reportPreview, setReportPreview] = useState<DailyReportPreview | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportUseAi, setReportUseAi] = useState(true);

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
    mutationFn: ({ id, data }: { id: number; data: Partial<HermesAgentFormData> }) => updateAgent(id, data),
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

  const sendReportMutation = useMutation({
    mutationFn: ({ agentId, useAi }: { agentId: number; useAi: boolean }) =>
      sendDailyReport(agentId, useAi),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      message.success("Дневной отчёт отправлен");
      setReportModalOpen(false);
      setReportPreview(null);
    },
    onError: () => {
      message.error("Ошибка отправки отчёта");
    },
  });

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setAgentType("webhook");
    form.setFieldsValue({ agent_type: "webhook", is_active: true });
    setModalOpen(true);
  };

  const openEdit = (agent: HermesAgent) => {
    setEditing(agent);
    setAgentType(agent.agent_type);
    const config = agent.config || {};
    form.setFieldsValue({
      name: agent.name,
      agent_type: agent.agent_type,
      webhook_url: agent.webhook_url,
      is_active: agent.is_active,
      telegram_bot_token: (config.bot_token as string) || "",
      telegram_chat_id: (config.chat_id as string) || "",
      smtp_host: (config.smtp_host as string) || "",
      smtp_port: (config.smtp_port as number) || 587,
      smtp_user: (config.smtp_user as string) || "",
      smtp_pass: (config.smtp_pass as string) || "",
      smtp_to_email: (config.to_email as string) || "",
    });
    setModalOpen(true);
  };

  const onFinish = (values: Record<string, unknown>) => {
    const type = values.agent_type as string;
    let config: Record<string, unknown> = {};

    if (type === "webhook") {
      // webhook_url is a top-level field
    } else if (type === "telegram") {
      config = {
        bot_token: values.telegram_bot_token,
        chat_id: values.telegram_chat_id,
      };
    } else if (type === "email") {
      config = {
        smtp_host: values.smtp_host,
        smtp_port: values.smtp_port || 587,
        smtp_user: values.smtp_user,
        smtp_pass: values.smtp_pass,
        to_email: values.smtp_to_email,
      };
    }

    const payload: HermesAgentFormData = {
      name: values.name as string,
      agent_type: type,
      webhook_url: type === "webhook" ? (values.webhook_url as string) : undefined,
      config,
      is_active: values.is_active as boolean,
    };

    if (editing) updateMutation.mutate({ id: editing.id, data: payload });
    else createMutation.mutate(payload);
  };

  const onSendEvent = (values: { event_type: string; payload: string }) => {
    let payload: Record<string, unknown> = {};
    try {
      payload = values.payload ? JSON.parse(values.payload) : {};
    } catch {
      message.error("Неверный JSON");
      return;
    }
    sendEventMutation.mutate({ agent_id: selectedAgent!.id, event_type: values.event_type, payload });
  };

  const openReportModal = () => {
    setReportModalOpen(true);
    setReportPreview(null);
    loadReportPreview();
  };

  const loadReportPreview = async () => {
    setReportLoading(true);
    try {
      const data = await getDailyReportPreview(reportUseAi);
      setReportPreview(data);
    } catch {
      message.error("Ошибка загрузки отчёта");
    } finally {
      setReportLoading(false);
    }
  };

  const handleSendReport = () => {
    if (!selectedAgent) {
      message.warning("Выберите агента для отправки");
      return;
    }
    sendReportMutation.mutate({ agentId: selectedAgent.id, useAi: reportUseAi });
  };

  const agentColumns = [
    { title: "ID", dataIndex: "id", key: "id", width: 60 },
    { title: "Имя", dataIndex: "name", key: "name" },
    {
      title: "Тип", dataIndex: "agent_type", key: "agent_type",
      render: (v: string) => {
        const labels: Record<string, string> = { webhook: "Webhook", telegram: "Telegram", email: "Email", notification: "Уведомления", ai_assistant: "AI", external: "Внешний" };
        const colors: Record<string, string> = { webhook: "blue", telegram: "cyan", email: "orange", notification: "purple", ai_assistant: "green", external: "default" };
        return <Tag color={colors[v] || "default"}>{labels[v] || v}</Tag>;
      },
    },
    { title: "Статус", dataIndex: "is_active", key: "is_active", render: (v: boolean) => <Tag color={v ? "green" : "red"}>{v ? "активен" : "неактивен"}</Tag> },
    { title: "Последний раз", dataIndex: "last_seen", key: "last_seen", render: (v: string | null) => v ? dayjs(v).format("DD.MM.YYYY HH:mm") : "никогда" },
    {
      title: "", key: "actions", width: 180,
      render: (_: unknown, record: HermesAgent) => (
        <Space>
          <Button type="link" size="small" onClick={() => openEdit(record)}>Ред.</Button>
          <Button type="link" size="small" onClick={() => { setSelectedAgent(record); setEventModalOpen(true); }}>Событие</Button>
          <Button type="link" size="small" danger onClick={() => deleteMutation.mutate(record.id)}>Удал.</Button>
        </Space>
      ),
    },
  ];

  const eventColumns = [
    { title: "ID", dataIndex: "id", key: "id", width: 60 },
    { title: "Тип", dataIndex: "event_type", key: "event_type" },
    { title: "Статус", dataIndex: "status", key: "status", render: (s: string) => <Tag color={s === "delivered" ? "green" : s === "failed" ? "red" : "orange"}>{s}</Tag> },
    { title: "Дата", dataIndex: "created_at", key: "created_at", render: (v: string) => dayjs(v).format("DD.MM.YYYY HH:mm") },
  ];

  return (
    <>
      <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography.Text type="secondary">
          Автоматические уведомления при событиях в CRM (заказы, клиенты, склад)
        </Typography.Text>
        <Space>
          <Button icon={<FileTextOutlined />} onClick={openReportModal}>
            Дневной отчёт
          </Button>
          <Button type="primary" onClick={openCreate}>Добавить агента</Button>
        </Space>
      </div>

      <Table
        dataSource={agents}
        columns={agentColumns}
        rowKey="id"
        loading={isLoading}
        size="small"
        pagination={false}
        onRow={(record) => ({
          onClick: () => setSelectedAgent(record),
          style: { cursor: "pointer", background: selectedAgent?.id === record.id ? "#e6f4ff" : undefined },
        })}
      />

      {selectedAgent && (
        <Card title={`Агент: ${selectedAgent.name}`} style={{ marginTop: 16 }}>
          <Descriptions column={2} size="small">
            <Descriptions.Item label="Тип">{selectedAgent.agent_type}</Descriptions.Item>
            <Descriptions.Item label="Webhook">{selectedAgent.webhook_url || "—"}</Descriptions.Item>
          </Descriptions>
          <Table dataSource={events} columns={eventColumns} rowKey="id" size="small" pagination={{ pageSize: 5 }} style={{ marginTop: 12 }} />
        </Card>
      )}

      <Modal
        title={editing ? "Редактировать агента" : "Новый агент"}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditing(null); }}
        onOk={() => form.validateFields().then(onFinish).catch(() => {})}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        width={560}
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="name" label="Имя агента" rules={[{ required: true }]}>
            <Input placeholder="Мой Telegram бот" />
          </Form.Item>

          <Form.Item name="agent_type" label="Тип уведомлений" rules={[{ required: true }]}>
            <Select onChange={(v) => setAgentType(v)}>
              <Select.Option value="webhook">Webhook (HTTP POST)</Select.Option>
              <Select.Option value="telegram">Telegram Bot</Select.Option>
              <Select.Option value="email">Email (SMTP)</Select.Option>
            </Select>
          </Form.Item>

          {agentType === "webhook" && (
            <Form.Item name="webhook_url" label="Webhook URL" rules={[{ required: true }]}>
              <Input placeholder="https://your-server.com/webhook" />
            </Form.Item>
          )}

          {agentType === "telegram" && (
            <Tabs
              items={[
                {
                  key: "config",
                  label: "Настройки Telegram",
                  children: (
                    <>
                      <Form.Item name="telegram_bot_token" label="Bot Token" rules={[{ required: true }]} tooltip="Получите у @BotFather">
                        <Input.Password placeholder="123456789:ABCdefGHI..." />
                      </Form.Item>
                      <Form.Item name="telegram_chat_id" label="Chat ID" rules={[{ required: true }]} tooltip="ID чата или канала. Используйте @userinfobot">
                        <Input placeholder="-100123456789" />
                      </Form.Item>
                    </>
                  ),
                },
              ]}
            />
          )}

          {agentType === "email" && (
            <Tabs
              items={[
                {
                  key: "config",
                  label: "Настройки SMTP",
                  children: (
                    <>
                      <Space style={{ width: "100%" }}>
                        <Form.Item name="smtp_host" label="SMTP Host" rules={[{ required: true }]} style={{ flex: 2 }}>
                          <Input placeholder="smtp.gmail.com" />
                        </Form.Item>
                        <Form.Item name="smtp_port" label="Порт" style={{ flex: 1 }}>
                          <Input placeholder="587" />
                        </Form.Item>
                      </Space>
                      <Form.Item name="smtp_user" label="Email отправителя" rules={[{ required: true }]}>
                        <Input placeholder="user@gmail.com" />
                      </Form.Item>
                      <Form.Item name="smtp_pass" label="Пароль / App Password" rules={[{ required: true }]}>
                        <Input.Password placeholder="app-password" />
                      </Form.Item>
                      <Form.Item name="smtp_to_email" label="Email получателя" rules={[{ required: true }]}>
                        <Input placeholder="manager@company.com" />
                      </Form.Item>
                    </>
                  ),
                },
              ]}
            />
          )}

          <Form.Item name="is_active" label="Активен" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Отправить событие → ${selectedAgent?.name}`}
        open={eventModalOpen}
        onCancel={() => { setEventModalOpen(false); eventForm.resetFields(); }}
        onOk={() => eventForm.validateFields().then(onSendEvent).catch(() => {})}
        confirmLoading={sendEventMutation.isPending}
      >
        <Form form={eventForm} layout="vertical" onFinish={onSendEvent}>
          <Form.Item name="event_type" label="Тип события" rules={[{ required: true }]}>
            <Select placeholder="Выберите событие">
              {EVENT_TYPES.map((e) => (
                <Select.Option key={e.value} value={e.value}>{e.label}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="payload" label="Payload (JSON)">
            <Input.TextArea rows={4} placeholder='{"order_id": 1}' />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="📊 Дневной отчёт"
        open={reportModalOpen}
        onCancel={() => { setReportModalOpen(false); setReportPreview(null); }}
        width={700}
        footer={
          <Space>
            <Button onClick={() => setReportModalOpen(false)}>Закрыть</Button>
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSendReport}
              loading={sendReportMutation.isPending}
              disabled={!selectedAgent}
            >
              Отправить {selectedAgent ? `→ ${selectedAgent.name}` : "(выберите агента)"}
            </Button>
          </Space>
        }
      >
        <Space style={{ marginBottom: 16 }}>
          <Switch
            checked={reportUseAi}
            onChange={(v) => { setReportUseAi(v); loadReportPreview(); }}
            checkedChildren="ИИ"
            unCheckedChildren="Сырой"
          />
          <Button size="small" icon={<ReloadOutlined />} onClick={loadReportPreview} loading={reportLoading}>
            Обновить
          </Button>
        </Space>

        {reportLoading ? (
          <div style={{ textAlign: "center", padding: 40 }}><Spin size="large" /></div>
        ) : reportPreview ? (
          <>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={6}>
                <Statistic title="Выручка за сегодня" value={reportPreview.data.today_revenue} suffix="₽" />
              </Col>
              <Col span={6}>
                <Statistic title="Готовы" value={reportPreview.data.ready_count} />
              </Col>
              <Col span={6}>
                <Statistic title="Отданы" value={reportPreview.data.delivered_count} />
              </Col>
              <Col span={6}>
                <Statistic title="В работе" value={reportPreview.data.in_progress_count} />
              </Col>
            </Row>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={6}>
                <Statistic title="Активных" value={reportPreview.data.active_count} />
              </Col>
              <Col span={6}>
                <Statistic title="Мало на складе" value={reportPreview.data.low_stock_count} />
              </Col>
              <Col span={6}>
                <Statistic title="Всего заказов" value={reportPreview.data.total_orders} />
              </Col>
              <Col span={6}>
                <Statistic title="Общая выручка" value={reportPreview.data.total_revenue} suffix="₽" />
              </Col>
            </Row>
            <Divider style={{ margin: "12px 0" }} />
            <Typography.Text strong>Текст отчёта:</Typography.Text>
            <pre style={{
              background: "#f5f5f5",
              padding: 16,
              borderRadius: 8,
              marginTop: 8,
              whiteSpace: "pre-wrap",
              fontSize: 13,
              maxHeight: 300,
              overflow: "auto",
            }}>
              {reportPreview.report_text}
            </pre>
          </>
        ) : (
          <Typography.Text type="secondary">Нажмите «Обновить» для загрузки</Typography.Text>
        )}
      </Modal>
    </>
  );
}
