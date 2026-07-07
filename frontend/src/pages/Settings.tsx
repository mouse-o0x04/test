import { Tabs } from "antd";
import { CodeOutlined, QuestionCircleOutlined, RobotOutlined, SafetyOutlined, SettingOutlined, ThunderboltOutlined, UserOutlined, DatabaseOutlined } from "@ant-design/icons";
import AIProviderTab from "./settings/AIProviderTab";
import OrderSettingsTab from "./settings/OrderSettingsTab";
import RolesTab from "./settings/RolesTab";
import ScriptReferenceTab from "./settings/ScriptReferenceTab";
import ScriptsTab from "./settings/ScriptsTab";
import HermesTab from "./settings/HermesTab";
import UsersTab from "./settings/UsersTab";
import BackupTab from "./settings/BackupTab";

export default function SettingsPage() {
  return (
    <Tabs
      defaultActiveKey="ai"
      items={[
        {
          key: "ai",
          label: <span><RobotOutlined /> ИИ-ассистент</span>,
          children: <AIProviderTab />,
        },
        {
          key: "scripts",
          label: <span><CodeOutlined /> Скрипты</span>,
          children: <ScriptsTab />,
        },
        {
          key: "reference",
          label: <span><QuestionCircleOutlined /> Справка</span>,
          children: <ScriptReferenceTab />,
        },
        {
          key: "hermes",
          label: <span><ThunderboltOutlined /> Telegram bot</span>,
          children: <HermesTab />,
        },
        {
          key: "users",
          label: <span><UserOutlined /> Пользователи</span>,
          children: <UsersTab />,
        },
        {
          key: "roles",
          label: <span><SafetyOutlined /> Роли</span>,
          children: <RolesTab />,
        },
        {
          key: "orderSettings",
          label: <span><SettingOutlined /> Настройки заказов</span>,
          children: <OrderSettingsTab />,
        },
        {
          key: "backup",
          label: <span><DatabaseOutlined /> Экспорт / Импорт</span>,
          children: <BackupTab />,
        },
      ]}
    />
  );
}
