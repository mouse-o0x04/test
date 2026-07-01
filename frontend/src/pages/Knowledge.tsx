import {
  FolderOutlined,
  FileTextOutlined,
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  SearchOutlined,
  ApartmentOutlined,
  FolderOpenOutlined,
  TagOutlined,
  EyeOutlined,
  CodeOutlined,
  ArrowLeftOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Input,
  List,
  Modal,
  Space,
  Tag,
  Tooltip,
  Tree,
  Typography,
  message,
  Popconfirm,
  Segmented,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useCallback, useMemo, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  getFolders,
  createFolder,
  deleteFolder,
  getNotes,
  getNote,
  createNote,
  updateNote,
  deleteNote,
  getKnowledgeGraph,
  type KnowledgeFolder,
  type KnowledgeNote,
} from "../api/knowledge";
import AIAssistant from "../components/AIAssistant";

function parseWikiLinks(content: string, allTitles: string[]): string {
  return content.replace(/\[\[([^\]]+)\]\]/g, (_, title: string) => {
    const match = allTitles.find((t) => t.toLowerCase() === title.toLowerCase());
    return match ? `**[[${match}]]**` : `**[[${title}]]**`;
  });
}

export default function KnowledgePage() {
  const queryClient = useQueryClient();
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [editingTitle, setEditingTitle] = useState("");
  const [editingContent, setEditingContent] = useState("");
  const [editingTags, setEditingTags] = useState("");
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const [showGraph, setShowGraph] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderParent, setNewFolderParent] = useState<number | null>(null);
  const [folderModalOpen, setFolderModalOpen] = useState(false);

  const { data: folders = [] } = useQuery({ queryKey: ["knowledge", "folders"], queryFn: getFolders });
  const { data: notes = [] } = useQuery({
    queryKey: ["knowledge", "notes", selectedFolderId, search],
    queryFn: () => getNotes({ folder_id: selectedFolderId, search: search || undefined }),
  });
  const { data: selectedNote } = useQuery({
    queryKey: ["knowledge", "note", selectedNoteId],
    queryFn: () => getNote(selectedNoteId!),
    enabled: !!selectedNoteId,
  });
  const { data: graph } = useQuery({ queryKey: ["knowledge", "graph"], queryFn: getKnowledgeGraph });

  const allTitles = useMemo(() => notes.map((n) => n.title), [notes]);

  const createFolderMut = useMutation({
    mutationFn: createFolder,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["knowledge", "folders"] }); setFolderModalOpen(false); setNewFolderName(""); message.success("Папка создана"); },
  });
  const deleteFolderMut = useMutation({
    mutationFn: deleteFolder,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["knowledge", "folders"] }); setSelectedFolderId(null); message.success("Папка удалена"); },
  });
  const createNoteMut = useMutation({
    mutationFn: createNote,
    onSuccess: (note) => {
      queryClient.invalidateQueries({ queryKey: ["knowledge", "notes"] });
      setSelectedNoteId(note.id);
      setEditingTitle(note.title);
      setEditingContent(note.content);
      setEditingTags(note.tags);
    },
  });
  const updateNoteMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateNote>[1] }) => updateNote(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["knowledge", "notes"] }); },
  });
  const deleteNoteMut = useMutation({
    mutationFn: deleteNote,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge", "notes"] });
      setSelectedNoteId(null);
      setEditingTitle("");
      setEditingContent("");
      setEditingTags("");
      message.success("Заметка удалена");
    },
  });

  const saveNote = useCallback(() => {
    if (!selectedNoteId) return;
    updateNoteMut.mutate({ id: selectedNoteId, data: { title: editingTitle, content: editingContent, tags: editingTags } });
  }, [selectedNoteId, editingTitle, editingContent, editingTags, updateNoteMut]);

  const handleSelectNote = useCallback((note: KnowledgeNote) => {
    if (selectedNoteId) saveNote();
    setSelectedNoteId(note.id);
    setEditingTitle(note.title);
    setEditingContent(note.content);
    setEditingTags(note.tags);
    setViewMode("edit");
  }, [selectedNoteId, saveNote]);

  const folderTree = useMemo(() => {
    const map = new Map<number, KnowledgeFolder & { children: KnowledgeFolder[] }>();
    const roots: (KnowledgeFolder & { children: KnowledgeFolder[] })[] = [];
    for (const f of folders) {
      map.set(f.id, { ...f, children: [] });
    }
    for (const f of folders) {
      const node = map.get(f.id)!;
      if (f.parent_id && map.has(f.parent_id)) {
        map.get(f.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }, [folders]);

  const toTreeData = (items: (KnowledgeFolder & { children?: KnowledgeFolder[] })[]): any[] =>
    items.map((f) => ({
      key: f.id,
      title: f.name,
      icon: selectedFolderId === f.id ? <FolderOpenOutlined /> : <FolderOutlined />,
      children: f.children && f.children.length > 0 ? toTreeData(f.children) : undefined,
    }));

  const renderedContent = useMemo(() => {
    if (!editingContent) return "";
    return parseWikiLinks(editingContent, allTitles);
  }, [editingContent, allTitles]);

  const extractedTags = useMemo(() => {
    const matches = renderedContent.match(/#[\w\u0400-\u04FF]+/g) || [];
    return [...new Set(matches.map((t) => t.slice(1)))];
  }, [renderedContent]);

  return (
    <div style={{ display: "flex", height: "calc(100vh - 52px)", overflow: "hidden" }}>
      {/* Sidebar — folders */}
      <div style={{ width: 220, borderRight: "1px solid #f0f0f0", display: "flex", flexDirection: "column", background: "#fafafa" }}>
        <div style={{ padding: "8px 12px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Typography.Text strong style={{ fontSize: 13 }}>Папки</Typography.Text>
          <Space size={4}>
            <Tooltip title="Граф связей">
              <Button type="text" size="small" icon={<ApartmentOutlined />} onClick={() => setShowGraph(!showGraph)} />
            </Tooltip>
            <Tooltip title="Новая папка">
              <Button type="text" size="small" icon={<PlusOutlined />} onClick={() => setFolderModalOpen(true)} />
            </Tooltip>
          </Space>
        </div>
        <div
          style={{ padding: "4px 0", cursor: "pointer", fontSize: 12, color: selectedFolderId === null ? "#1677ff" : undefined, background: selectedFolderId === null ? "#e6f4ff" : undefined, paddingLeft: 12, paddingRight: 12 }}
          onClick={() => setSelectedFolderId(null)}
        >
          <FileTextOutlined style={{ marginRight: 6 }} /> Все заметки
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "0 4px" }}>
          {folderTree.length > 0 && (
            <Tree
              treeData={toTreeData(folderTree)}
              selectedKeys={selectedFolderId ? [selectedFolderId] : []}
              onSelect={(keys) => setSelectedFolderId(keys[0] as number || null)}
              showIcon
              blockNode
              style={{ fontSize: 12 }}
            />
          )}
        </div>
      </div>

      {/* Note list */}
      <div style={{ width: 280, borderRight: "1px solid #f0f0f0", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "8px 12px", borderBottom: "1px solid #f0f0f0" }}>
          <Input
            prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
            placeholder="Поиск заметок..."
            size="small"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
          />
        </div>
        <div style={{ padding: "8px 12px", borderBottom: "1px solid #f0f0f0" }}>
          <Button type="primary" size="small" icon={<PlusOutlined />} block onClick={() => createNoteMut.mutate({ title: "Новая заметка", folder_id: selectedFolderId })}>
            Новая заметка
          </Button>
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>
          <List
            dataSource={notes}
            size="small"
            renderItem={(note) => (
              <List.Item
                key={note.id}
                onClick={() => handleSelectNote(note)}
                style={{
                  cursor: "pointer",
                  padding: "8px 12px",
                  background: selectedNoteId === note.id ? "#e6f4ff" : undefined,
                  borderLeft: selectedNoteId === note.id ? "3px solid #1677ff" : "3px solid transparent",
                }}
              >
                <div style={{ width: "100%" }}>
                  <Typography.Text strong style={{ fontSize: 12, display: "block" }} ellipsis>
                    {note.title}
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    {dayjs(note.updated_at).format("DD.MM.YYYY HH:mm")}
                  </Typography.Text>
                  {note.tags && (
                    <div style={{ marginTop: 2 }}>
                      {note.tags.split(",").filter(Boolean).slice(0, 3).map((t) => (
                        <Tag key={t} style={{ fontSize: 10, margin: 0, marginRight: 2, padding: "0 4px" }}>{t.trim()}</Tag>
                      ))}
                    </div>
                  )}
                </div>
              </List.Item>
            )}
          />
        </div>
      </div>

      {/* Editor / Preview */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {selectedNoteId ? (
          <>
            <div style={{ padding: "8px 16px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Space>
                <Input
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  variant="borderless"
                  style={{ fontSize: 16, fontWeight: 600, width: 300 }}
                  placeholder="Название заметки..."
                />
              </Space>
              <Space>
                <Segmented
                  size="small"
                  value={viewMode}
                  onChange={(v) => { saveNote(); setViewMode(v as "edit" | "preview"); }}
                  options={[
                    { label: <span><CodeOutlined /> Ред.</span>, value: "edit" },
                    { label: <span><EyeOutlined /> Просмотр</span>, value: "preview" },
                  ]}
                />
                <Tooltip title="Теги">
                  <TagOutlined style={{ color: "#94a3b8" }} />
                </Tooltip>
                <Input
                  size="small"
                  value={editingTags}
                  onChange={(e) => setEditingTags(e.target.value)}
                  placeholder="Теги через запятую"
                  style={{ width: 180 }}
                />
                <Popconfirm title="Удалить заметку?" onConfirm={() => deleteNoteMut.mutate(selectedNoteId)}>
                  <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
              {viewMode === "edit" ? (
                <Input.TextArea
                  value={editingContent}
                  onChange={(e) => setEditingContent(e.target.value)}
                  onBlur={saveNote}
                  placeholder="Пишите в Markdown... Используйте [[Название заметки]] для ссылок"
                  autoSize={{ minRows: 20 }}
                  style={{ fontFamily: "monospace", fontSize: 13, border: "none", resize: "none" }}
                />
              ) : (
                <div className="knowledge-preview" style={{ maxWidth: 700 }}>
                  <Markdown remarkPlugins={[remarkGfm]}>{renderedContent}</Markdown>
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#999" }}>
            <div style={{ textAlign: "center" }}>
              <FileTextOutlined style={{ fontSize: 48, marginBottom: 16, color: "#d9d9d9" }} />
              <div>Выберите заметку или создайте новую</div>
            </div>
          </div>
        )}
      </div>

      {/* Graph modal */}
      <Modal
        title="Граф связей"
        open={showGraph}
        onCancel={() => setShowGraph(false)}
        footer={null}
        width={800}
      >
        {graph && graph.nodes.length > 0 ? (
          <svg width={760} height={500} style={{ background: "#fafafa", borderRadius: 8 }}>
            {graph.edges.map((e, i) => {
              const s = graph.nodes.find((n) => n.id === e.source);
              const t = graph.nodes.find((n) => n.id === e.target);
              if (!s || !t) return null;
              const si = graph.nodes.indexOf(s);
              const ti = graph.nodes.indexOf(t);
              const angle_s = (2 * Math.PI * si) / graph.nodes.length;
              const angle_t = (2 * Math.PI * ti) / graph.nodes.length;
              const r = 180;
              const cx = 380, cy = 250;
              return (
                <line key={i}
                  x1={cx + r * Math.cos(angle_s)} y1={cy + r * Math.sin(angle_s)}
                  x2={cx + r * Math.cos(angle_t)} y2={cy + r * Math.sin(angle_t)}
                  stroke="#d9d9d9" strokeWidth={1.5}
                />
              );
            })}
            {graph.nodes.map((n, i) => {
              const angle = (2 * Math.PI * i) / graph.nodes.length;
              const r = 180;
              const cx = 380, cy = 250;
              const x = cx + r * Math.cos(angle);
              const y = cy + r * Math.sin(angle);
              return (
                <g key={n.id}>
                  <circle cx={x} cy={y} r={20} fill="#e6f4ff" stroke="#1677ff" strokeWidth={2} />
                  <text x={x} y={y + 4} textAnchor="middle" fontSize={9} fill="#1677ff">
                    {n.title.length > 12 ? n.title.slice(0, 11) + "…" : n.title}
                  </text>
                </g>
              );
            })}
          </svg>
        ) : (
          <div style={{ textAlign: "center", padding: 40, color: "#999" }}>Нет связей между заметками</div>
        )}
      </Modal>

      {/* New folder modal */}
      <Modal
        title="Новая папка"
        open={folderModalOpen}
        onCancel={() => setFolderModalOpen(false)}
        onOk={() => { if (newFolderName.trim()) createFolderMut.mutate({ name: newFolderName, parent_id: newFolderParent }); }}
        okButtonProps={{ disabled: !newFolderName.trim() }}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input placeholder="Название папки" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} />
          <select
            style={{ width: "100%", padding: "4px 8px", borderRadius: 4, border: "1px solid #d9d9d9" }}
            value={newFolderParent ?? ""}
            onChange={(e) => setNewFolderParent(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Корень</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Space>
      </Modal>

      <AIAssistant />
    </div>
  );
}
