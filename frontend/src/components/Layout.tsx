import {
  AppstoreOutlined,
  DownOutlined,
  MenuOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
  DatabaseOutlined,
  LogoutOutlined,
  SettingOutlined,
  UpOutlined,
} from "@ant-design/icons";
import { Button, Layout as AntLayout, Menu, Popover, Space, theme, Typography } from "antd";
import { type ReactNode, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useMenuOrder, type MenuItem } from "../hooks/useMenuOrder";

const { Header, Content, Sider } = AntLayout;

const defaultMenuItems: MenuItem[] = [
  { key: "/", icon: <AppstoreOutlined />, label: "Дашборд" },
  { key: "/clients", icon: <TeamOutlined />, label: "Клиенты" },
  { key: "/products", icon: <ShopOutlined />, label: "Продукты" },
  { key: "/orders", icon: <ShoppingCartOutlined />, label: "Заказы" },
  { key: "/warehouse", icon: <DatabaseOutlined />, label: "Склад" },
  { key: "/settings", icon: <SettingOutlined />, label: "Настройки" },
];

export default function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken();
  const { user, logout } = useAuth();
  const { orderedItems, moveUp, moveDown, reset, order } = useMenuOrder(defaultMenuItems);

  const selectedKey = useMemo(
    () => orderedItems.find((item) => item.key === location.pathname)?.key || "/",
    [location.pathname, orderedItems]
  );

  const menuItems = orderedItems.map(({ key, icon, label }) => ({ key, icon, label }));

  const settingsContent = (
    <div style={{ minWidth: 200 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Typography.Text strong>Порядок меню</Typography.Text>
        <Button type="link" size="small" onClick={reset}>Сбросить</Button>
      </div>
      {orderedItems.map((item, idx) => (
        <div
          key={item.key}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "4px 0",
            borderBottom: "1px solid #f0f0f0",
          }}
        >
          <Space size={8}>
            {item.icon}
            <Typography.Text style={{ fontSize: 13 }}>{item.label}</Typography.Text>
          </Space>
          <Space size={2}>
            <Button
              type="text"
              size="small"
              icon={<UpOutlined />}
              disabled={idx === 0}
              onClick={() => moveUp(item.key)}
            />
            <Button
              type="text"
              size="small"
              icon={<DownOutlined />}
              disabled={idx === orderedItems.length - 1}
              onClick={() => moveDown(item.key)}
            />
          </Space>
        </div>
      ))}
    </div>
  );

  return (
    <AntLayout style={{ minHeight: "100vh" }}>
      <Sider breakpoint="lg" collapsedWidth={0}>
        <div
          style={{
            height: 32,
            margin: 16,
            color: token.colorWhite,
            fontWeight: "bold",
            fontSize: 18,
            textAlign: "center",
          }}
        >
          Типография CRM
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <AntLayout>
        <Header
          style={{
            padding: "0 24px",
            background: token.colorBgContainer,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Space>
            <Typography.Text strong style={{ fontSize: 16 }}>
              {orderedItems.find((item) => item.key === selectedKey)?.label || "Типография CRM"}
            </Typography.Text>
            <Popover content={settingsContent} title="Настройка меню" trigger="click" placement="bottomLeft">
              <Button type="text" icon={<MenuOutlined />} size="small" />
            </Popover>
          </Space>
          <Space>
            <Typography.Text type="secondary">{user?.username}</Typography.Text>
            <Button type="text" icon={<LogoutOutlined />} onClick={logout}>
              Выйти
            </Button>
          </Space>
        </Header>
        <Content style={{ margin: 24 }}>{children}</Content>
      </AntLayout>
    </AntLayout>
  );
}
