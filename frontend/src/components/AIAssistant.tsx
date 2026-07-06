import { SendOutlined, ClearOutlined, ToolOutlined, RobotOutlined, UserOutlined } from "@ant-design/icons";
import { Badge, Button, Collapse, Drawer, Input, Space, Spin, Tag, Tooltip, Typography, message } from "antd";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useCallback, useEffect, useRef, useState } from "react";
import { sendChatMessage, type ToolCall } from "../api/aiAssistant";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  timestamp: number;
}

const TOOL_LABELS: Record<string, string> = {
  list_clients: "Поиск клиентов",
  get_client: "Просмотр клиента",
  create_client: "Создание клиента",
  update_client: "Обновление клиента",
  delete_client: "Удаление клиента",
  list_orders: "Поиск заказов",
  get_order: "Просмотр заказа",
  create_order: "Создание заказа",
  update_order_status: "Смена статуса",
  delete_order: "Удаление заказа",
  list_products: "Поиск продуктов",
  create_product: "Создание продукта",
  update_product: "Обновление продукта",
  delete_product: "Удаление продукта",
  get_warehouse: "Просмотр склада",
  update_stock: "Обновление остатков",
  get_dashboard_stats: "Статистика CRM",
  fetch_url: "Загрузка страницы",
};

const STORAGE_KEY = "ai_chat_history";

function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveHistory(msgs: ChatMessage[]) {
  try {
    const toSave = msgs.slice(-100);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {}
}

export default function AIAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(loadHistory);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    saveHistory(messages);
  }, [messages]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const result = await sendChatMessage(text, history);

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: result.reply,
        toolCalls: result.tool_calls.length > 0 ? result.tool_calls : undefined,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      const detail = error.response?.data?.detail || "Не удалось связаться с ИИ-ассистентом";
      message.error(detail);
      const errorMsg: ChatMessage = {
        role: "assistant",
        content: `Ошибка: ${detail}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
    message.success("История очищена");
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  };

  const hasNotification = messages.length > 0 && !open;

  return (
    <>
      <div
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 1000,
        }}
      >
        <Tooltip title="ИИ-ассистент">
          <Badge dot={hasNotification} offset={[-6, 6]}>
            <Button
              type="primary"
              shape="circle"
              size="large"
              icon={<RobotOutlined />}
              onClick={() => setOpen(!open)}
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              }}
            />
          </Badge>
        </Tooltip>
      </div>

      {open && (
        <Drawer
          title={
            <Space>
              <RobotOutlined style={{ fontSize: 18 }} />
              <Typography.Text strong>ИИ-ассистент</Typography.Text>
            </Space>
          }
          extra={
            <Tooltip title="Очистить историю">
              <Button type="text" icon={<ClearOutlined />} onClick={clearChat} size="small" />
            </Tooltip>
          }
          open={open}
          onClose={() => setOpen(false)}
          width={480}
          placement="right"
          styles={{ body: { padding: 0, display: "flex", flexDirection: "column", height: "100%" } }}
        >
          <style>{`
            .ai-markdown table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 12px; }
            .ai-markdown th, .ai-markdown td { border: 1px solid #d9d9d9; padding: 6px 8px; text-align: left; }
            .ai-markdown th { background: #fafafa; font-weight: 600; }
            .ai-markdown tr:nth-child(even) { background: #fafafa; }
            .ai-markdown p { margin: 4px 0; }
            .ai-markdown ul, .ai-markdown ol { margin: 4px 0; padding-left: 20px; }
            .ai-markdown li { margin: 2px 0; }
            .ai-markdown code { background: #f5f5f5; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
            .ai-markdown pre { background: #f5f5f5; padding: 8px; border-radius: 6px; overflow-x: auto; }
            .ai-markdown pre code { background: none; padding: 0; }
            .ai-markdown h1, .ai-markdown h2, .ai-markdown h3, .ai-markdown h4 { margin: 8px 0 4px; }
            .ai-markdown blockquote { border-left: 3px solid #d9d9d9; padding-left: 12px; color: #666; margin: 8px 0; }
            .ai-markdown hr { border: none; border-top: 1px solid #f0f0f0; margin: 8px 0; }
          `}</style>
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              background: "#fafafa",
            }}
          >
            {messages.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "#999" }}>
                <RobotOutlined style={{ fontSize: 48, marginBottom: 16, color: "#d9d9d9" }} />
                <Typography.Text type="secondary">
                  Задайте вопрос о вашей CRM.
                  <br />
                  Я могу искать, создавать и редактировать клиентов, заказы, продукты.
                </Typography.Text>
              </div>
            )}

            {messages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  flexDirection: msg.role === "user" ? "row-reverse" : "row",
                  gap: 8,
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    background: msg.role === "user" ? "#1677ff" : "#f0f0f0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {msg.role === "user" ? (
                    <UserOutlined style={{ color: "#fff", fontSize: 14 }} />
                  ) : (
                    <RobotOutlined style={{ color: "#666", fontSize: 14 }} />
                  )}
                </div>
                <div style={{ maxWidth: "80%" }}>
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <Collapse
                      size="small"
                      style={{ marginBottom: 6 }}
                      items={[
                        {
                          key: "1",
                          label: (
                            <Space size={4}>
                              <ToolOutlined style={{ fontSize: 12 }} />
                              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                Выполнено {msg.toolCalls.length} действие(я)
                              </Typography.Text>
                            </Space>
                          ),
                          children: msg.toolCalls.map((tc, i) => (
                            <div key={i} style={{ marginBottom: 4 }}>
                              <Tag color="blue" style={{ fontSize: 11 }}>
                                {TOOL_LABELS[tc.tool] || tc.tool}
                              </Tag>
                              <Typography.Text
                                type="secondary"
                                style={{ fontSize: 11, display: "block", whiteSpace: "pre-wrap" }}
                              >
                                {tc.result}
                              </Typography.Text>
                            </div>
                          )),
                        },
                      ]}
                    />
                  )}
                  <div
                    style={{
                      background: msg.role === "user" ? "#1677ff" : "#fff",
                      color: msg.role === "user" ? "#fff" : "#000",
                      padding: "8px 12px",
                      borderRadius: msg.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                      border: msg.role === "assistant" ? "1px solid #f0f0f0" : "none",
                      fontSize: 13,
                      lineHeight: 1.6,
                    }}
                  >
                    {msg.role === "assistant" ? (
                      <div className="ai-markdown">
                        <Markdown remarkPlugins={[remarkGfm]}>{msg.content}</Markdown>
                      </div>
                    ) : (
                      <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
                    )}
                  </div>
                  <Typography.Text type="secondary" style={{ fontSize: 10, marginTop: 2, display: "block" }}>
                    {formatTime(msg.timestamp)}
                  </Typography.Text>
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Spin size="small" />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Думаю...
                </Typography.Text>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div style={{ padding: 12, borderTop: "1px solid #f0f0f0", background: "#fff" }}>
            <Space.Compact style={{ width: "100%" }}>
              <Input
                ref={inputRef as never}
                placeholder="Введите сообщение..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPressEnter={sendMessage}
                disabled={loading}
                style={{ fontSize: 13 }}
              />
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={sendMessage}
                loading={loading}
                disabled={!input.trim()}
              />
            </Space.Compact>
          </div>
        </Drawer>
      )}
    </>
  );
}
