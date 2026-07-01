import { SaveOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { Button, Card, Col, Form, Input, InputNumber, Row, Select, Slider, Space, Switch, Typography, message } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getAIProviders, getAISettings, updateAISettings, type AIProviderOption } from "../../api/aiSettings";

const DEFAULT_SYSTEM_PROMPT = `Ты — ИИ-ассистент CRM для типографии. Ты помогаешь управлять клиентами, заказами, продуктами и складом.
Отвечай на русском языке. Будь краток и точен.`;

export default function AIProviderTab() {
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [selectedProvider, setSelectedProvider] = useState<string>("llamacpp");

  const { data: providers = [] } = useQuery({
    queryKey: ["aiProviders"],
    queryFn: getAIProviders,
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ["aiSettings"],
    queryFn: getAISettings,
  });

  useEffect(() => {
    if (settings) {
      form.setFieldsValue({
        provider_name: settings.provider_name,
        base_url: settings.base_url,
        api_key: settings.api_key,
        model_name: settings.model_name,
        temperature: settings.temperature,
        max_tokens: settings.max_tokens,
        system_prompt: settings.system_prompt,
        is_active: settings.is_active,
      });
      setSelectedProvider(settings.provider_name);
    }
  }, [settings, form]);

  const saveMutation = useMutation({
    mutationFn: updateAISettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aiSettings"] });
      message.success("Настройки ИИ сохранены");
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      message.error(err.response?.data?.detail || "Ошибка сохранения");
    },
  });

  const onProviderChange = (value: string) => {
    setSelectedProvider(value);
    const provider = providers.find((p: AIProviderOption) => p.key === value);
    if (provider && provider.default_url) {
      form.setFieldValue("base_url", provider.default_url);
    }
  };

  const onFinish = (values: Record<string, unknown>) => {
    saveMutation.mutate({
      provider_name: values.provider_name as string,
      base_url: values.base_url as string,
      api_key: (values.api_key as string) || undefined,
      model_name: values.model_name as string,
      temperature: values.temperature as number,
      max_tokens: values.max_tokens as number,
      system_prompt: (values.system_prompt as string) || undefined,
      is_active: values.is_active as boolean,
    });
  };

  const needsApiKey = ["openai", "together", "groq"].includes(selectedProvider);

  return (
    <Card loading={isLoading}>
      <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ provider_name: "llamacpp", temperature: 0.3, max_tokens: 4096, is_active: true }}>
        <Row gutter={24}>
          <Col xs={24} lg={12}>
            <Typography.Title level={5}>
              <Space>
                <ThunderboltOutlined />
                Провайдер ИИ
              </Space>
            </Typography.Title>

            <Form.Item name="provider_name" label="Провайдер" rules={[{ required: true }]}>
              <Select onChange={onProviderChange}>
                {providers.map((p: AIProviderOption) => (
                  <Select.Option key={p.key} value={p.key}>{p.label}</Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item name="base_url" label="Base URL" rules={[{ required: true }]} tooltip="Базовый URL API провайдера">
              <Input placeholder="http://localhost:8080" />
            </Form.Item>

            {needsApiKey && (
              <Form.Item name="api_key" label="API Key" rules={[{ required: true }]} tooltip="Ключ API для доступа к провайдеру">
                <Input.Password placeholder="sk-..." />
              </Form.Item>
            )}

            <Form.Item name="model_name" label="Модель" rules={[{ required: true }]} tooltip="ID или имя модели">
              <Input placeholder="local-model" />
            </Form.Item>

            <Form.Item name="is_active" label="ИИ-ассистент включён" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>

          <Col xs={24} lg={12}>
            <Typography.Title level={5}>Параметры генерации</Typography.Title>

            <Form.Item name="temperature" label="Temperature" tooltip="Креативность (0 = детерминировано, 1 = максимум креативности)">
              <Slider min={0} max={2} step={0.1} marks={{ 0: "0", 0.3: "0.3", 1: "1", 2: "2" }} />
            </Form.Item>

            <Form.Item name="max_tokens" label="Max Tokens" tooltip="Максимальная длина ответа">
              <InputNumber min={256} max={32768} step={256} style={{ width: "100%" }} />
            </Form.Item>

            <Form.Item name="system_prompt" label="Системный промпт" tooltip="Переопределяет стандартный промпт ассистента">
              <Input.TextArea rows={6} placeholder={DEFAULT_SYSTEM_PROMPT} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item>
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saveMutation.isPending} size="large">
            Сохранить настройки
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
}
