import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Image, Space, Typography, message, Modal } from "antd";
import { UploadOutlined, DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { uploadOrderImage, deleteOrderImage, type OrderImage } from "../api/orders";

const MAX_SIZE = 20 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png"];

interface ImageUploaderProps {
  orderId: number;
  images: OrderImage[];
  onChange: (images: OrderImage[]) => void;
  disabled?: boolean;
}

export default function ImageUploader({ orderId, images, onChange, disabled }: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      message.error("Допустимые форматы: JPEG, PNG");
      return;
    }
    if (file.size > MAX_SIZE) {
      message.error("Максимальный размер файла 20 MB");
      return;
    }
    setUploading(true);
    try {
      const result = await uploadOrderImage(orderId, file);
      onChange([...images, result]);
      message.success("Фото загружено");
    } catch {
      message.error("Ошибка загрузки");
    } finally {
      setUploading(false);
    }
  }, [orderId, images, onChange]);

  const handleDelete = useCallback(async (img: OrderImage) => {
    const filename = img.url.split("/").pop() || "";
    try {
      await deleteOrderImage(orderId, filename);
      onChange(images.filter((i) => i.url !== img.url));
      message.success("Фото удалено");
    } catch {
      message.error("Ошибка удаления");
    }
  }, [orderId, images, onChange]);

  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    const onDragOver = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer?.files?.[0];
      if (file) handleFile(file);
    };
    el.addEventListener("dragover", onDragOver);
    el.addEventListener("drop", onDrop);
    return () => {
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("drop", onDrop);
    };
  }, [handleFile]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) handleFile(file);
          break;
        }
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [handleFile]);

  return (
    <div ref={dropRef} style={{ marginTop: 8 }}>
      {images.length > 0 && (
        <Image.PreviewGroup>
          <Space wrap size={8} style={{ marginBottom: 8 }}>
            {images.map((img) => (
              <div key={img.url} style={{ position: "relative", display: "inline-block" }}>
                <Image
                  src={img.url}
                  alt={img.name}
                  width={80}
                  height={80}
                  style={{ objectFit: "cover", borderRadius: 4, border: "1px solid #d9d9d9" }}
                  preview={{ mask: "Просмотр" }}
                />
                {!disabled && (
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => {
                      Modal.confirm({
                        title: "Удалить фото?",
                        okText: "Да",
                        cancelText: "Нет",
                        onOk: () => handleDelete(img),
                      });
                    }}
                    style={{ position: "absolute", top: -4, right: -4, background: "#fff", borderRadius: "50%" }}
                  />
                )}
              </div>
            ))}
          </Space>
        </Image.PreviewGroup>
      )}

      {!disabled && (
        <Button
          type="dashed"
          icon={<UploadOutlined />}
          loading={uploading}
          onClick={() => inputRef.current?.click()}
          style={{ width: "100%" }}
        >
          <PlusOutlined /> Загрузить фото (JPEG/PNG, до 20 MB)
        </Button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      {!disabled && (
        <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 4 }}>
          Drag & drop или Ctrl+V из буфера обмена
        </Typography.Text>
      )}
    </div>
  );
}
