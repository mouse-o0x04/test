import { Checkbox, Collapse, DatePicker, Divider, Form, Input, InputNumber, Radio, Select, Space, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import type { FormInstance } from "antd";
import { getOrderSettings } from "../../api/orderSettings";
import { getUsers } from "../../api/auth";
import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { useAuth } from "../../hooks/useAuth";
import { ORDER_STATUSES } from "../../types";
import type { Order } from "../../types";
import type { OrderImage } from "../../api/orders";
import ImageUploader from "../ImageUploader";

const { RangePicker } = DatePicker;

const statusLabels: Record<string, string> = {
  new: "Новый", in_progress: "В работе", post_processing: "Постобработка", ready: "Готов", delivered: "Отдали",
};

function parseDescription(desc: string | undefined): { text: string; images: OrderImage[] } {
  if (!desc || !desc.trim().startsWith("{")) return { text: desc || "", images: [] };
  try {
    const parsed = JSON.parse(desc);
    return { text: parsed.text || "", images: parsed.images || [] };
  } catch {
    return { text: desc, images: [] };
  }
}

interface OrderDetailsStepProps {
  form: FormInstance;
  editing?: Order | null;
}

export default function OrderDetailsStep({ form, editing }: OrderDetailsStepProps) {
  const { hasPermission } = useAuth();
  const canEditOrders = hasPermission("orders.edit");
  const { data: layoutOptions } = useQuery({ queryKey: ["orderSettings", "layout"], queryFn: () => getOrderSettings("layout") });
  const { data: sourceOptions } = useQuery({ queryKey: ["orderSettings", "source"], queryFn: () => getOrderSettings("source") });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: getUsers });
  const { data: workerColors } = useQuery({ queryKey: ["orderSettings", "worker_color"], queryFn: () => getOrderSettings("worker_color") });
  const activeUsers = useMemo(() => (users ?? []).filter((u) => u.is_active), [users]);
  const [dateMode, setDateMode] = useState<"single" | "range">("single");

  const [images, setImages] = useState<OrderImage[]>([]);
  const [textValue, setTextValue] = useState(() => parseDescription(editing?.description).text);

  useEffect(() => {
    if (editing) {
      const parsed = parseDescription(editing.description);
      setImages(parsed.images);
      setTextValue(parsed.text);
    }
  }, [editing]);

  useEffect(() => {
    if (images.length > 0) {
      form.setFieldsValue({ description: JSON.stringify({ text: textValue, images }) });
    } else {
      form.setFieldsValue({ description: textValue || undefined });
    }
  }, [textValue, images, form]);

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTextValue(e.target.value);
  }, []);

  const handleImagesChange = useCallback((newImages: OrderImage[]) => {
    setImages(newImages);
  }, []);

  return (
    <div>
      <Typography.Text strong style={{ display: "block", marginBottom: 12, fontSize: 15 }}>
        Детали заказа
      </Typography.Text>

      <Form.Item label="Описание заказа" style={{ marginBottom: 12 }}>
        <Input.TextArea rows={2} placeholder="Описание (автоиз продуктов, если пусто)" value={textValue} onChange={handleTextChange} />
      </Form.Item>

      {editing && (
        <Form.Item label="Фото" style={{ marginBottom: 12 }}>
          <ImageUploader orderId={editing.id} images={images} onChange={handleImagesChange} />
        </Form.Item>
      )}

      <Form.Item label="Сроки" style={{ marginBottom: 12 }}>
        <Space direction="vertical" style={{ width: "100%" }}>
          <Radio.Group
            value={dateMode}
            onChange={(e) => {
              setDateMode(e.target.value);
              form.setFieldsValue({ deadline_start: undefined, deadline: undefined, deadlineRange: undefined, deadlineSingle: undefined });
            }}
            size="small"
          >
            <Radio.Button value="single">Одна дата</Radio.Button>
            <Radio.Button value="range">Период</Radio.Button>
          </Radio.Group>
          {dateMode === "single" ? (
            <Form.Item name="deadlineSingle" noStyle>
              <DatePicker
                style={{ width: "100%" }}
                showTime={{ format: "HH:mm" }}
                format="DD.MM.YYYY HH:mm"
                onChange={(val) => {
                  if (val) {
                    const iso = val.toISOString();
                    form.setFieldsValue({ deadline_start: iso, deadline: iso });
                  } else {
                    form.setFieldsValue({ deadline_start: undefined, deadline: undefined });
                  }
                }}
              />
            </Form.Item>
          ) : (
            <Form.Item name="deadlineRange" noStyle>
              <RangePicker
                style={{ width: "100%" }}
                showTime={{ format: "HH:mm" }}
                format="DD.MM.YYYY HH:mm"
                onChange={(_dates, dateStrings) => {
                  if (dateStrings && dateStrings[0] && dateStrings[1]) {
                    form.setFieldsValue({
                      deadline_start: dayjs(dateStrings[0], "DD.MM.YYYY HH:mm").toISOString(),
                      deadline: dayjs(dateStrings[1], "DD.MM.YYYY HH:mm").toISOString(),
                    });
                  } else {
                    form.setFieldsValue({ deadline_start: undefined, deadline: undefined });
                  }
                }}
              />
            </Form.Item>
          )}
        </Space>
      </Form.Item>

      <Form.Item name="deadline_start" hidden><Input /></Form.Item>
      <Form.Item name="deadline" hidden><Input /></Form.Item>

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
                    {(workerColors ?? []).map((w) => (
                      <Select.Option key={w.id} value={w.name} label={w.name}>
                        <Space>
                          <span style={{ width: 10, height: 10, borderRadius: 2, background: w.color, display: "inline-block" }} />
                          {w.name}
                        </Space>
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
                  <Select
                    mode="multiple"
                    allowClear
                    placeholder="Выберите источник"
                    size="small"
                    options={(sourceOptions ?? []).map((opt) => ({ label: opt.name, value: opt.name }))}
                  />
                </Form.Item>
              </>
            ),
          }]}
        />
      )}
    </div>
  );
}
