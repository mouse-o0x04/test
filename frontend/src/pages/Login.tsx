import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Form, Input, Typography, message } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login as apiLogin } from "../api/auth";
import { useAuth } from "../hooks/useAuth";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const data = await apiLogin(values.username, values.password);
      login(data.access_token, data.user);
      message.success("Добро пожаловать!");
      navigate("/");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      message.error(error.response?.data?.detail || "Ошибка входа");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="nc-login">
      <div className="nc-login-card">
        <div className="nc-login-logo">Т</div>
        <Typography.Title level={4} style={{ textAlign: "center", marginBottom: 4 }}>
          Типография CRM
        </Typography.Title>
        <Typography.Text type="secondary" style={{ display: "block", textAlign: "center", marginBottom: 28, fontSize: 13 }}>
          Управление заказами и клиентами
        </Typography.Text>

        <Form onFinish={onFinish} size="large" layout="vertical">
          <Form.Item name="username" rules={[{ required: true, message: "Введите логин" }]}>
            <Input
              prefix={<UserOutlined style={{ color: "#94a3b8" }} />}
              placeholder="Логин"
              style={{ borderRadius: 8 }}
            />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: "Введите пароль" }]}>
            <Input.Password
              prefix={<LockOutlined style={{ color: "#94a3b8" }} />}
              placeholder="Пароль"
              style={{ borderRadius: 8 }}
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 12 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              style={{ height: 40, borderRadius: 8, fontWeight: 500 }}
            >
              Войти
            </Button>
          </Form.Item>
        </Form>


      </div>
    </div>
  );
}
