import {
  DownloadOutlined,
  UploadOutlined,
  DatabaseOutlined,
  ExclamationCircleOutlined,
  DeleteOutlined,
  CloudDownloadOutlined,
  ReloadOutlined,
  HddOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Typography,
  Upload,
  Modal,
  Space,
  message,
  Table,
  Tag,
  Popconfirm,
  Spin,
} from "antd";
import { useEffect, useState, useCallback } from "react";
import {
  dumpAll,
  dumpSingle,
  restoreAll,
  listBackups,
  saveBackup,
  deleteBackup,
  BackupInfo,
} from "../../api/dbBackup";

const DB_NAMES = ["printing_crm"];

const DB_LABELS: Record<string, string> = {
  printing_crm: "CRM база данных",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export default function BackupTab() {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadBackups = useCallback(async () => {
    try {
      const data = await listBackups();
      setBackups(data);
    } catch {
      message.error("Не удалось загрузить список бэкапов");
    }
  }, []);

  useEffect(() => {
    loadBackups();
  }, [loadBackups]);

  const handleDumpAll = async () => {
    setDownloading(true);
    try {
      const blob = await dumpAll();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `crm_backup_${new Date().toISOString().slice(0, 10)}.tar`;
      a.click();
      URL.revokeObjectURL(url);
      message.success("Бэкап скачан");
    } catch {
      message.error("Ошибка создания бэкапа");
    } finally {
      setDownloading(false);
    }
  };

  const handleDumpSingle = async (db: string) => {
    try {
      const blob = await dumpSingle(db);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${db}_${new Date().toISOString().slice(0, 10)}.sql`;
      a.click();
      URL.revokeObjectURL(url);
      message.success(`Бэкап ${db} скачан`);
    } catch {
      message.error(`Ошибка бэкапа ${db}`);
    }
  };

  const handleRestore = async (file: File) => {
    Modal.confirm({
      title: "Восстановление базы данных",
      icon: <ExclamationCircleOutlined />,
      content: (
        <span>
          Все текущие данные будут <b> заменены</b> из бэкапа. Это действие
          необратимо. Продолжить?
        </span>
      ),
      okText: "Да, восстановить",
      cancelText: "Отмена",
      okButtonProps: { danger: true },
      onOk: async () => {
        setImporting(true);
        try {
          await restoreAll(file);
          message.success("Восстановление завершено. Перезагрузите страницу.");
          setTimeout(() => window.location.reload(), 1500);
        } catch {
          message.error("Ошибка восстановления");
        } finally {
          setImporting(false);
        }
      },
    });
    return false;
  };

  const handleSaveToServer = async () => {
    setSaving(true);
    try {
      await saveBackup();
      message.success("Бэкап сохранён на сервер");
      await loadBackups();
    } catch {
      message.error("Ошибка сохранения бэкапа");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    try {
      await deleteBackup(filename);
      message.success("Бэкап удалён");
      await loadBackups();
    } catch {
      message.error("Ошибка удаления");
    }
  };

  const columns = [
    {
      title: "Файл",
      dataIndex: "filename",
      key: "filename",
      render: (text: string) => <Typography.Text code>{text}</Typography.Text>,
    },
    {
      title: "Размер",
      dataIndex: "size_bytes",
      key: "size",
      render: (size: number) => formatSize(size),
    },
    {
      title: "Дата",
      dataIndex: "created_at",
      key: "created",
      render: (text: string) =>
        new Date(text).toLocaleString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
    },
    {
      title: "",
      key: "actions",
      width: 50,
      render: (_: unknown, record: BackupInfo) => (
        <Popconfirm
          title="Удалить этот бэкап?"
          onConfirm={() => handleDeleteBackup(record.filename)}
          okText="Удалить"
          cancelText="Отмена"
        >
          <Button type="text" danger icon={<DeleteOutlined />} size="small" />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 700 }}>
      <Space direction="vertical" style={{ width: "100%" }} size={16}>
        <Card
          size="small"
          title={
            <span>
              <CloudDownloadOutlined /> Создать бэкап
            </span>
          }
        >
          <Space direction="vertical" style={{ width: "100%" }} size={12}>
            <div>
              <Typography.Text style={{ display: "block", marginBottom: 8 }}>
                Полный бэкап всех баз данных (crm_core, clients, orders,
                warehouse):
              </Typography.Text>
              <Space>
                <Button
                  type="primary"
                  icon={<DownloadOutlined />}
                  onClick={handleDumpAll}
                  loading={downloading}
                >
                  Скачать полный бэкап (.tar)
                </Button>
                <Button
                  icon={<HddOutlined />}
                  onClick={handleSaveToServer}
                  loading={saving}
                >
                  Сохранить на сервер
                </Button>
              </Space>
            </div>
            <div>
              <Typography.Text
                style={{ display: "block", marginBottom: 8, fontSize: 13 }}
              >
                Отдельные базы:
              </Typography.Text>
              <Space wrap>
                {DB_NAMES.map((db) => (
                  <Button
                    key={db}
                    size="small"
                    icon={<DatabaseOutlined />}
                    onClick={() => handleDumpSingle(db)}
                  >
                    {db}
                  </Button>
                ))}
              </Space>
            </div>
          </Space>
        </Card>

        <Card
          size="small"
          title={
            <span>
              <UploadOutlined /> Восстановление
            </span>
          }
        >
          <Typography.Text
            style={{ display: "block", marginBottom: 12, fontSize: 13 }}
          >
            Загрузить <Typography.Text code>.tar</Typography.Text> или{" "}
            <Typography.Text code>.dump</Typography.Text> файл бэкапа.{" "}
            <Typography.Text type="danger">
              Все текущие данные будут заменены.
            </Typography.Text>
          </Typography.Text>
          <Upload
            accept=".tar,.dump,.sql,.pgdump"
            showUploadList={false}
            beforeUpload={handleRestore}
            disabled={importing}
          >
            <Button icon={<UploadOutlined />} loading={importing} danger>
              Восстановить из файла
            </Button>
          </Upload>
        </Card>

        <Card
          size="small"
          title={
            <span>
              <HddOutlined /> Бэкапы на сервере
            </span>
          }
          extra={
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={loadBackups}
            >
              Обновить
            </Button>
          }
        >
          {loading ? (
            <Spin />
          ) : (
            <Table
              dataSource={backups}
              columns={columns}
              rowKey="filename"
              size="small"
              pagination={false}
              locale={{ emptyText: "Нет сохранённых бэкапов" }}
            />
          )}
        </Card>
      </Space>
    </div>
  );
}
