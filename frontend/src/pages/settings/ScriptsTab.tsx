import { DeleteOutlined, EditOutlined, PlayCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Card, Col, Form, Input, Modal, Popconfirm, Row, Space, Typography, message } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createScript, deleteScript, getScript, getScripts, runScript, updateScript } from "../../api/scripts";
import type { Script } from "../../types";

const DEFAULT_TEMPLATE = `def calculate(data):
    """
    data = {
        "quantity": 100,
        "unit_price": 50.0,
        "price": 50.0,
        "product_name": "Визитки"
    }
    """
    quantity = data["quantity"]
    unit_price = data["unit_price"]

    # Пример: скидка за объем
    if quantity >= 1000:
        return quantity * unit_price * 0.8
    elif quantity >= 500:
        return quantity * unit_price * 0.9
    else:
        return quantity * unit_price
`;

export default function ScriptsTab() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Script | null>(null);
  const [editorContent, setEditorContent] = useState(DEFAULT_TEMPLATE);
  const [form] = Form.useForm();
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testScript, setTestScript] = useState<string>("");
  const [testData, setTestData] = useState('{"quantity": 100, "unit_price": 50, "price": 50}');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testForm] = Form.useForm();

  const { data: scripts, isLoading } = useQuery({ queryKey: ["scripts"], queryFn: getScripts });

  const createMutation = useMutation({
    mutationFn: ({ name, content }: { name: string; content: string }) => createScript(name, content),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["scripts"] }); message.success("Скрипт создан"); setModalOpen(false); form.resetFields(); setEditorContent(DEFAULT_TEMPLATE); },
    onError: (err: { response?: { data?: { detail?: string } } }) => { message.error(err.response?.data?.detail || "Ошибка"); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ name, content }: { name: string; content: string }) => updateScript(name, content),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["scripts"] }); message.success("Скрипт обновлён"); setModalOpen(false); setEditing(null); form.resetFields(); },
    onError: (err: { response?: { data?: { detail?: string } } }) => { message.error(err.response?.data?.detail || "Ошибка"); },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteScript,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["scripts"] }); message.success("Скрипт удалён"); },
  });

  const openCreate = () => { setEditing(null); form.resetFields(); setEditorContent(DEFAULT_TEMPLATE); setModalOpen(true); };

  const openEdit = async (script: Script) => {
    setEditing(script);
    form.setFieldsValue({ name: script.name });
    try {
      const data = await getScript(script.name);
      setEditorContent(data.content);
    } catch {
      setEditorContent("");
    }
    setModalOpen(true);
  };

  const openTest = (scriptName: string) => {
    setTestScript(scriptName);
    setTestResult(null);
    setTestData('{"quantity": 100, "unit_price": 50, "price": 50}');
    setTestModalOpen(true);
  };

  const onTestRun = async () => {
    try {
      const parsed = JSON.parse(testData);
      const res = await runScript(testScript, parsed);
      setTestResult(`Результат: ${res.result}`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      setTestResult(`Ошибка: ${e.response?.data?.detail || "неверный JSON"}`);
    }
  };

  const onFinish = (values: { name: string }) => {
    if (editing) {
      updateMutation.mutate({ name: editing.name, content: editorContent });
    } else {
      createMutation.mutate({ name: values.name, content: editorContent });
    }
  };

  return (
    <>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography.Text strong>Скрипты расчёта цены</Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Новый скрипт</Button>
      </div>

      <Row gutter={[16, 16]}>
        {(scripts ?? []).map((script) => (
          <Col key={script.name} xs={24} sm={12} md={8}>
            <Card
              size="small"
              title={script.name}
              extra={
                <Space>
                  <Button type="link" size="small" icon={<PlayCircleOutlined />} onClick={() => openTest(script.name)}>Тест</Button>
                  <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(script)} />
                  <Popconfirm title="Удалить скрипт?" onConfirm={() => deleteMutation.mutate(script.name)}>
                    <Button type="link" size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              }
            >
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {script.filename} ({(script.size / 1024).toFixed(1)} KB)
              </Typography.Text>
            </Card>
          </Col>
        ))}
        {(scripts ?? []).length === 0 && !isLoading && (
          <Col span={24}>
            <Typography.Text type="secondary">Скриптов пока нет. Создайте первый скрипт для автоматического расчёта цен.</Typography.Text>
          </Col>
        )}
      </Row>

      <Modal
        title={editing ? `Редактировать: ${editing.name}` : "Новый скрипт"}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditing(null); }}
        onOk={() => form.validateFields().then(onFinish).catch(() => {})}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        width={720}
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="name" label="Имя скрипта" rules={[{ required: true }, { pattern: /^[a-zA-Z0-9_-]+$/, message: "Только латиница, цифры, _ и -" }]}>
            <Input disabled={!!editing} placeholder="my_price_calc" />
          </Form.Item>
        </Form>
        <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8, fontSize: 12 }}>
          Функция calculate(data) получает dict с ключами: quantity, unit_price, price, product_name. Должна вернуть число.
        </Typography.Text>
        <Input.TextArea
          value={editorContent}
          onChange={(e) => setEditorContent(e.target.value)}
          rows={18}
          style={{ fontFamily: "monospace", fontSize: 13 }}
          placeholder="def calculate(data): ..."
        />
      </Modal>

      <Modal
        title={`Тест: ${testScript}`}
        open={testModalOpen}
        onCancel={() => setTestModalOpen(false)}
        footer={[
          <Button key="run" type="primary" icon={<PlayCircleOutlined />} onClick={onTestRun}>Запустить</Button>,
          <Button key="close" onClick={() => setTestModalOpen(false)}>Закрыть</Button>,
        ]}
        width={520}
      >
        <Typography.Text strong style={{ display: "block", marginBottom: 8 }}>Входные данные (JSON):</Typography.Text>
        <Input.TextArea
          value={testData}
          onChange={(e) => setTestData(e.target.value)}
          rows={4}
          style={{ fontFamily: "monospace", fontSize: 13, marginBottom: 12 }}
        />
        {testResult && (
          <Card size="small" style={{ background: testResult.startsWith("Ошибка") ? "#fff2f0" : "#f6ffed" }}>
            <Typography.Text style={{ fontFamily: "monospace" }}>{testResult}</Typography.Text>
          </Card>
        )}
      </Modal>
    </>
  );
}
