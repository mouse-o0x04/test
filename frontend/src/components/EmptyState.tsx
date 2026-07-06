import { Empty, Button } from "antd";
import { PlusOutlined } from "@ant-design/icons";

interface EmptyStateProps {
  description?: string;
  onCreate?: () => void;
  createLabel?: string;
  image?: React.ReactNode;
}

export default function EmptyState({ description = "Нет данных", onCreate, createLabel = "Добавить", image }: EmptyStateProps) {
  return (
    <div style={{ padding: "40px 0", textAlign: "center" }}>
      <Empty
        image={image || Empty.PRESENTED_IMAGE_SIMPLE}
        description={description}
      >
        {onCreate && (
          <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
            {createLabel}
          </Button>
        )}
      </Empty>
    </div>
  );
}
