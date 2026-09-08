"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useRouter,
  usePathname,
} from "next/navigation";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";

import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";

import {
  EditorContent,
  useEditor,
} from "@tiptap/react";

import StarterKit from "@tiptap/starter-kit";
import Color from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";

// =====================================================
// 类型
// =====================================================

type RecordItem = {
  id: string;
  title: string;
  content: Record<string, unknown>;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type RecordTask = {
  id: string;
  record_id: string;
  title: string;

  condition: string | null;
  holding_id: number | null;

  completed: boolean;
  completed_at: string | null;
  sort_order: number;
  created_at: string;
};

type RecordFile = {
  id: string;
  record_id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  created_at: string;
};

type TaskProgress = {
  completed: number;
  total: number;
};

// =====================================================
// 批量任务草稿
// =====================================================

type BatchTaskDraft = {
  id: string;
  title: string;

  // 是否可能是资产相关任务
  assetRelated: boolean;

  // 后续步骤再填写
  condition: string | null;
  holdingId: number | null;
};

// =====================================================
// 工具函数
// =====================================================

function formatDateTime(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * 去除批量粘贴任务前面的常见编号。
 *
 * 支持：
 *
 * 1. 卖出日本基金
 * 2、卖出摩根入息
 * - 更新现金
 * • 检查配置
 * ☐ 卖出 VOO
 * ✓ 检查资产
 */
function cleanBatchTaskTitle(value: string) {
  return value
    .trim()
    .replace(
      /^(?:\d+[\.\、\)]\s*|[-•·]\s*|[☐☑✓✔]\s*)/,
      ""
    )
    .trim();
}

/**
 * 判断任务是否可能属于资产操作。
 *
 * 注意：
 *
 * 这里只做“识别”，
 * 不直接认为它一定需要 Holding。
 *
 * 后面用户确认以后，
 * 才会关联 Holding。
 */
function isLikelyAssetTask(title: string) {
  const text = title.toLowerCase();

  const assetKeywords = [
    "卖出",
    "买入",
    "加仓",
    "减仓",
    "清仓",
    "增持",
    "减持",
    "持有",
    "调仓",
    "调整仓位",
    "归拢",
    "换仓",
    "基金",
    "股票",
    "etf",
    "voo",
    "schd",
    "qqqm",
    "gldm",
    "黄金",
    "纳指",
    "标普",
    "标普500",
    "恒生",
    "现金",
    "资产",
    "holding",
  ];

  return assetKeywords.some((keyword) =>
    text.includes(keyword.toLowerCase())
  );
}

// =====================================================
// Sortable Task
// =====================================================

type SortableTaskRowProps = {
  task: RecordTask;
  onToggle: (task: RecordTask) => void;
  onDelete: (task: RecordTask) => void;
};

function SortableTaskRow({
  task,
  onToggle,
  onDelete,
}: SortableTaskRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "border-b border-gray-100 px-4 py-3 last:border-b-0",
        isDragging
          ? "relative z-10 bg-gray-50 shadow-sm"
          : "bg-white",
      ].join(" ")}
    >
      <div className="flex items-center gap-3">
        {/* 拖动 */}
        <button
          type="button"
          aria-label="拖动任务"
          className="cursor-grab select-none text-gray-300 hover:text-gray-500 active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </button>

        {/* Checkbox */}
        <input
          type="checkbox"
          checked={task.completed}
          onChange={() => onToggle(task)}
          className="h-4 w-4 cursor-pointer rounded border-gray-300"
        />

        {/* 任务 */}
        <div className="min-w-0 flex-1">
          <div
            className={
              task.completed
                ? "text-sm text-gray-400"
                : "text-sm text-gray-900"
            }
          >
            {task.title}
          </div>

          {/* 条件 */}
          {task.condition && (
            <div className="mt-1 text-xs text-gray-500">
              条件：{task.condition}
            </div>
          )}

          {/* Holding */}
          {task.holding_id !== null && (
            <div className="mt-1 text-xs text-gray-400">
              已关联资产
            </div>
          )}

          {/* 完成时间 */}
          {task.completed &&
            task.completed_at && (
              <div className="mt-1 text-xs text-gray-400">
                完成于{" "}
                {formatDateTime(
                  task.completed_at
                )}
              </div>
            )}
        </div>

        {/* 删除任务 */}
        <button
          type="button"
          onClick={() => onDelete(task)}
          className="shrink-0 rounded px-2 py-1 text-xs text-red-400 transition hover:bg-red-50 hover:text-red-600"
        >
          删除
        </button>
      </div>
    </div>
  );
}

// =====================================================
// Page
// =====================================================

export default function RecordDetailPage() {
  const router = useRouter();
  const pathname = usePathname();

  // ===================================================
  // 关键修复
  //
  // 当前页面：
  //
  // /record/63da615e-9111-465e-ae55-9424e22dcbfd
  //
  // 从 pathname 最后一段直接取得 recordId。
  //
  // 不再依赖 useParams()，
  // 避免出现：
  //
  // /api/record/undefined
  // ===================================================

  const recordId = useMemo(() => {
    const parts = pathname
      .split("/")
      .filter(Boolean);

    if (parts.length < 2) {
      return "";
    }

    return parts[parts.length - 1] ?? "";
  }, [pathname]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const [record, setRecord] =
    useState<RecordItem | null>(null);

  const [tasks, setTasks] =
    useState<RecordTask[]>([]);

  const [progress, setProgress] =
    useState<TaskProgress>({
      completed: 0,
      total: 0,
    });

  const [files, setFiles] =
    useState<RecordFile[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [savingTitle, setSavingTitle] =
    useState(false);

  const [savingContent, setSavingContent] =
    useState(false);

  const [newTask, setNewTask] =
    useState("");

  const [batchText, setBatchText] =
    useState("");

  const [batchDrafts, setBatchDrafts] =
    useState<BatchTaskDraft[]>([]);

  const [showBatchReview, setShowBatchReview] =
    useState(false);

  const [addingTask, setAddingTask] =
    useState(false);

  const [uploading, setUploading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [title, setTitle] =
    useState("");

  // ===================================================
  // Editor
  // ===================================================

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color.configure({
        types: ["textStyle"],
      }),
    ],

    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
        },
      ],
    },

    editorProps: {
      attributes: {
        class:
          "min-h-[320px] px-5 py-5 outline-none",
      },
    },

    immediatelyRender: false,
  });

  // ===================================================
  // Load Record
  // ===================================================

  async function loadRecord() {
    if (!recordId) return;

    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `/api/record/${recordId}`,
        {
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || "获取记录失败"
        );
      }

      setRecord(data?.record ?? null);
      setTitle(data?.record?.title ?? "");

      if (
        editor &&
        data?.record?.content
      ) {
        editor.commands.setContent(
          data.record.content
        );
      }
    } catch (error) {
      console.error(
        "获取记录失败:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "获取记录失败"
      );
    } finally {
      setLoading(false);
    }
  }

  // ===================================================
  // Load Tasks
  // ===================================================

  async function loadTasks() {
    if (!recordId) return;

    try {
      const response = await fetch(
        `/api/record/${recordId}/tasks`,
        {
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || "获取任务失败"
        );
      }

      setTasks(
        Array.isArray(data?.tasks)
          ? data.tasks
          : []
      );

      setProgress(
        data?.progress ?? {
          completed: 0,
          total: 0,
        }
      );
    } catch (error) {
      console.error(
        "获取任务失败:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "获取任务失败"
      );
    }
  }

  // ===================================================
  // Load Files
  // ===================================================

  async function loadFiles() {
    if (!recordId) return;

    try {
      const response = await fetch(
        `/api/record/${recordId}/files`,
        {
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || "获取附件失败"
        );
      }

      setFiles(
        Array.isArray(data?.files)
          ? data.files
          : []
      );
    } catch (error) {
      console.error(
        "获取附件失败:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "获取附件失败"
      );
    }
  }

  // ===================================================
  // Initial Load
  // ===================================================

  useEffect(() => {
    if (!recordId) return;

    loadRecord();
    loadTasks();
    loadFiles();
  }, [recordId]);

  // ===================================================
  // Editor Sync
  // ===================================================

  useEffect(() => {
    if (!editor || !record) return;

    editor.commands.setContent(
      record.content
    );
  }, [editor, record]);

  // ===================================================
  // Save Title
  // ===================================================

  async function saveTitle() {
    if (!recordId) return;

    const value = title.trim();

    if (!value) {
      alert("记录名称不能为空");
      return;
    }

    try {
      setSavingTitle(true);

      const response = await fetch(
        `/api/record/${recordId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            title: value,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "保存标题失败"
        );
      }

      setRecord(
        data?.record ?? null
      );

      setTitle(
        data?.record?.title ??
          value
      );
    } catch (error) {
      console.error(
        "保存标题失败:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "保存标题失败"
      );
    } finally {
      setSavingTitle(false);
    }
  }

  // ===================================================
  // Save Content
  // ===================================================

  async function saveContent() {
    if (!recordId || !editor) return;

    try {
      setSavingContent(true);

      const content =
        editor.getJSON();

      const response = await fetch(
        `/api/record/${recordId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            content,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "保存内容失败"
        );
      }

      setRecord(
        data?.record ?? null
      );
    } catch (error) {
      console.error(
        "保存内容失败:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "保存内容失败"
      );
    } finally {
      setSavingContent(false);
    }
  }

  // ===================================================
  // Create One Task
  // ===================================================

  async function createTask(
    taskTitle: string,
    condition: string | null = null,
    holdingId: number | null = null
  ) {
    const value =
      taskTitle.trim();

    if (!value || !recordId) {
      return;
    }

    const response = await fetch(
      `/api/record/${recordId}/tasks`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          title: value,
          condition,
          holding_id: holdingId,
        }),
      }
    );

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data?.error ||
          "新增任务失败"
      );
    }
  }

  // ===================================================
  // Add One Task
  // ===================================================

  async function handleAddTask() {
    if (!newTask.trim()) return;

    try {
      setAddingTask(true);

      await createTask(newTask);

      setNewTask("");

      await loadTasks();
      await loadRecord();
    } catch (error) {
      console.error(
        "新增任务失败:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "新增任务失败"
      );
    } finally {
      setAddingTask(false);
    }
  }

  // ===================================================
  // Parse Batch Tasks
  // ===================================================

  function buildBatchDrafts() {
    const lines = batchText
      .split(/\r?\n/)
      .map(cleanBatchTaskTitle)
      .filter(Boolean);

    const uniqueLines: string[] = [];

    for (const line of lines) {
      if (
        !uniqueLines.includes(line)
      ) {
        uniqueLines.push(line);
      }
    }

    return uniqueLines.map(
      (taskTitle, index) => ({
        id: `batch-${Date.now()}-${index}`,
        title: taskTitle,
        assetRelated:
          isLikelyAssetTask(
            taskTitle
          ),
        condition: null,
        holdingId: null,
      })
    );
  }

  // ===================================================
  // Preview Batch
  // ===================================================

  function handlePreviewBatchTasks() {
    if (!batchText.trim()) {
      return;
    }

    const drafts =
      buildBatchDrafts();

    if (!drafts.length) {
      return;
    }

    setBatchDrafts(drafts);
    setShowBatchReview(true);
  }

  // ===================================================
  // Toggle Batch Asset Recognition
  // ===================================================

  function toggleBatchAssetRelated(
    id: string
  ) {
    setBatchDrafts(
      (current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                assetRelated:
                  !item.assetRelated,
              }
            : item
        )
    );
  }

  // ===================================================
  // Change Batch Condition
  // ===================================================

  function changeBatchCondition(
    id: string,
    condition: string | null
  ) {
    setBatchDrafts(
      (current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                condition,
              }
            : item
        )
    );
  }

  // ===================================================
  // Remove Batch Draft
  // ===================================================

  function removeBatchDraft(
    id: string
  ) {
    setBatchDrafts(
      (current) =>
        current.filter(
          (item) =>
            item.id !== id
        )
    );
  }

  // ===================================================
  // Confirm Batch Add
  // ===================================================

  async function handleConfirmBatchAdd() {
    if (
      !recordId ||
      !batchDrafts.length
    ) {
      return;
    }

    try {
      setAddingTask(true);

      for (const draft of batchDrafts) {
        await createTask(
          draft.title,
          draft.condition,
          draft.holdingId
        );
      }

      setBatchText("");
      setBatchDrafts([]);
      setShowBatchReview(false);

      await loadTasks();
      await loadRecord();
    } catch (error) {
      console.error(
        "确认批量新增任务失败:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "批量新增任务失败"
      );
    } finally {
      setAddingTask(false);
    }
  }

  // ===================================================
  // Cancel Batch Review
  // ===================================================

  function handleCancelBatchReview() {
    setShowBatchReview(false);
  }

  // ===================================================
  // Toggle Task
  // ===================================================

  async function handleToggleTask(
    task: RecordTask
  ) {
    try {
      const response = await fetch(
        `/api/record/${recordId}/tasks`,
        {
          method: "PUT",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            taskId: task.id,
            completed:
              !task.completed,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "更新任务失败"
        );
      }

      await loadTasks();
      await loadRecord();
    } catch (error) {
      console.error(
        "更新任务失败:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "更新任务失败"
      );
    }
  }

  // ===================================================
  // Delete Task
  // ===================================================

  async function handleDeleteTask(
    task: RecordTask
  ) {
    const confirmed =
      window.confirm(
        `确定删除任务「${task.title}」吗？`
      );

    if (!confirmed) return;

    try {
      const response = await fetch(
        `/api/record/${recordId}/tasks`,
        {
          method: "DELETE",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            taskId: task.id,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "删除任务失败"
        );
      }

      await loadTasks();
      await loadRecord();
    } catch (error) {
      console.error(
        "删除任务失败:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "删除任务失败"
      );
    }
  }

  // ===================================================
  // Drag
  // ===================================================

  async function handleDragEnd(
    event: DragEndEvent
  ) {
    const { active, over } = event;

    if (
      !over ||
      active.id === over.id
    ) {
      return;
    }

    const oldIndex =
      tasks.findIndex(
        (task) =>
          task.id === active.id
      );

    const newIndex =
      tasks.findIndex(
        (task) =>
          task.id === over.id
      );

    if (
      oldIndex < 0 ||
      newIndex < 0
    ) {
      return;
    }

    const nextTasks =
      arrayMove(
        tasks,
        oldIndex,
        newIndex
      );

    setTasks(nextTasks);

    try {
      const response = await fetch(
        `/api/record/${recordId}/tasks`,
        {
          method: "PUT",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            action: "reorder",
            taskIds:
              nextTasks.map(
                (task) =>
                  task.id
              ),
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "保存任务顺序失败"
        );
      }

      if (
        Array.isArray(
          data?.tasks
        )
      ) {
        setTasks(
          data.tasks
        );
      }

      await loadRecord();
    } catch (error) {
      console.error(
        "保存任务顺序失败:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "保存任务顺序失败"
      );

      await loadTasks();
    }
  }

  // ===================================================
  // Upload File
  // ===================================================

  async function handleUploadFile(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file =
      event.target.files?.[0];

    event.target.value = "";

    if (!file || !recordId) {
      return;
    }

    try {
      setUploading(true);

      const formData =
        new FormData();

      formData.append(
        "file",
        file
      );

      const response = await fetch(
        `/api/record/${recordId}/files`,
        {
          method: "POST",
          body: formData,
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "上传文件失败"
        );
      }

      await loadFiles();
      await loadRecord();
    } catch (error) {
      console.error(
        "上传文件失败:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "上传文件失败"
      );
    } finally {
      setUploading(false);
    }
  }

  // ===================================================
  // Open File
  // ===================================================

  async function handleOpenFile(
    file: RecordFile
  ) {
    try {
      const response = await fetch(
        `/api/record/${recordId}/files?fileId=${encodeURIComponent(
          file.id
        )}`
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "打开附件失败"
        );
      }

      if (data?.url) {
        window.open(
          data.url,
          "_blank",
          "noopener,noreferrer"
        );
      }
    } catch (error) {
      console.error(
        "打开附件失败:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "打开附件失败"
      );
    }
  }

  // ===================================================
  // Delete File
  // ===================================================

  async function handleDeleteFile(
    file: RecordFile
  ) {
    const confirmed =
      window.confirm(
        `确定删除附件「${file.file_name}」吗？`
      );

    if (!confirmed) return;

    try {
      const response = await fetch(
        `/api/record/${recordId}/files`,
        {
          method: "DELETE",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            fileId: file.id,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "删除附件失败"
        );
      }

      await loadFiles();
      await loadRecord();
    } catch (error) {
      console.error(
        "删除附件失败:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "删除附件失败"
      );
    }
  }

  // ===================================================
  // Memo
  // ===================================================

  const taskIds = useMemo(
    () =>
      tasks.map(
        (task) =>
          task.id
      ),
    [tasks]
  );

  const assetDraftCount =
    batchDrafts.filter(
      (item) =>
        item.assetRelated
    ).length;

  // ===================================================
  // Loading
  // ===================================================

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="text-sm text-gray-400">
            正在加载...
          </div>
        </div>
      </main>
    );
  }

  // ===================================================
  // Not Found
  // ===================================================

  if (!record) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <button
            type="button"
            onClick={() =>
              router.push(
                "/record"
              )
            }
            className="mb-6 text-sm text-gray-500 hover:text-gray-900"
          >
            ← 返回
          </button>

          <div className="rounded-xl border border-gray-200 bg-white p-8">
            <div className="text-sm text-red-600">
              {error ||
                "记录不存在"}
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ===================================================
  // Main
  // ===================================================

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* 返回 */}
        <button
          type="button"
          onClick={() =>
            router.push(
              "/record"
            )
          }
          className="mb-6 text-sm text-gray-500 transition hover:text-gray-900"
        >
          ← 返回
        </button>

        {/* =================================================
            标题
        ================================================= */}

        <section className="mb-8">
          <div className="flex items-center gap-3">
            <input
              value={title}
              onChange={(event) =>
                setTitle(
                  event.target.value
                )
              }
              onBlur={saveTitle}
              onKeyDown={(event) => {
                if (
                  event.key ===
                  "Enter"
                ) {
                  event.currentTarget.blur();
                }
              }}
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-2xl font-semibold text-gray-900 outline-none"
            />

            {savingTitle && (
              <span className="text-xs text-gray-400">
                保存中...
              </span>
            )}
          </div>

          <div className="mt-2 text-sm text-gray-500">
            最后更新：
            {" "}
            {formatDateTime(
              record.updated_at
            )}
          </div>
        </section>

        {/* =================================================
            正文
        ================================================= */}

        <section className="mb-8 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 bg-gray-50 p-2">
            <button
              type="button"
              onClick={() =>
                editor
                  ?.chain()
                  .focus()
                  .toggleBold()
                  .run()
              }
              className="rounded px-3 py-1.5 text-sm font-bold hover:bg-gray-200"
            >
              B
            </button>

            <button
              type="button"
              onClick={() =>
                editor
                  ?.chain()
                  .focus()
                  .toggleHeading({
                    level: 1,
                  })
                  .run()
              }
              className="rounded px-3 py-1.5 text-sm font-semibold hover:bg-gray-200"
            >
              H1
            </button>

            <button
              type="button"
              onClick={() =>
                editor
                  ?.chain()
                  .focus()
                  .toggleHeading({
                    level: 2,
                  })
                  .run()
              }
              className="rounded px-3 py-1.5 text-sm font-semibold hover:bg-gray-200"
            >
              H2
            </button>

            <button
              type="button"
              onClick={() =>
                editor
                  ?.chain()
                  .focus()
                  .toggleBulletList()
                  .run()
              }
              className="rounded px-3 py-1.5 text-sm hover:bg-gray-200"
            >
              • 列表
            </button>

            <button
              type="button"
              onClick={() =>
                editor
                  ?.chain()
                  .focus()
                  .toggleOrderedList()
                  .run()
              }
              className="rounded px-3 py-1.5 text-sm hover:bg-gray-200"
            >
              1. 列表
            </button>

            <button
              type="button"
              onClick={() =>
                editor
                  ?.chain()
                  .focus()
                  .setHorizontalRule()
                  .run()
              }
              className="rounded px-3 py-1.5 text-sm hover:bg-gray-200"
            >
              ─
            </button>

            <div className="mx-1 h-5 w-px bg-gray-300" />

            {[
              {
                label: "红",
                color: "#dc2626",
              },
              {
                label: "橙",
                color: "#ea580c",
              },
              {
                label: "黄",
                color: "#ca8a04",
              },
              {
                label: "绿",
                color: "#16a34a",
              },
              {
                label: "蓝",
                color: "#2563eb",
              },
              {
                label: "黑",
                color: "#111827",
              },
            ].map((item) => (
              <button
                key={item.color}
                type="button"
                onClick={() =>
                  editor
                    ?.chain()
                    .focus()
                    .setColor(
                      item.color
                    )
                    .run()
                }
                className="rounded px-2 py-1.5 text-xs hover:bg-gray-200"
                style={{
                  color:
                    item.color,
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          <EditorContent
            editor={editor}
          />

          <div className="flex justify-end border-t border-gray-100 px-5 py-3">
            <button
              type="button"
              onClick={saveContent}
              disabled={
                savingContent
              }
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingContent
                ? "保存中..."
                : "保存内容"}
            </button>
          </div>
        </section>

        {/* =================================================
            执行任务
        ================================================= */}

        <section className="mb-8 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                执行任务
              </h2>

              <div className="mt-1 text-xs text-gray-500">
                进度：
                {" "}
                {progress.completed}
                {" / "}
                {progress.total}
              </div>
            </div>
          </div>

          {/* =================================================
              任务列表
          ================================================= */}

          <div className="overflow-hidden rounded-lg bg-white">
            {tasks.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400">
                暂无任务
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={
                  closestCenter
                }
                onDragEnd={
                  handleDragEnd
                }
              >
                <SortableContext
                  items={taskIds}
                  strategy={
                    verticalListSortingStrategy
                  }
                >
                  {tasks.map(
                    (task) => (
                      <SortableTaskRow
                        key={
                          task.id
                        }
                        task={task}
                        onToggle={
                          handleToggleTask
                        }
                        onDelete={
                          handleDeleteTask
                        }
                      />
                    )
                  )}
                </SortableContext>
              </DndContext>
            )}
          </div>

          {/* =================================================
              新增单个任务
          ================================================= */}

          <div className="mt-4 flex gap-2">
            <input
              value={newTask}
              onChange={(event) =>
                setNewTask(
                  event.target.value
                )
              }
              onKeyDown={(event) => {
                if (
                  event.key ===
                  "Enter"
                ) {
                  handleAddTask();
                }
              }}
              placeholder="输入任务后回车"
              className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400"
            />

            <button
              type="button"
              onClick={
                handleAddTask
              }
              disabled={
                addingTask ||
                !newTask.trim()
              }
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              添加
            </button>
          </div>

          {/* =================================================
              批量添加
          ================================================= */}

          <details className="mt-6 border-t border-gray-200 pt-4">
            <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-900">
              ＋ 批量添加任务
            </summary>

            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
              <textarea
                value={batchText}
                onChange={(event) =>
                  setBatchText(
                    event.target.value
                  )
                }
                placeholder={
                  "可以直接粘贴 AI 给你的任务，例如：\n1. 卖出易方达纳指\n2. 卖出日本基金\n3. 卖出摩根入息\n4. 更新香港账户现金\n5. 最后检查整体资产配置"
                }
                rows={7}
                className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
              />

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-xs text-gray-400">
                  粘贴后先确认任务，确认后才会真正加入记录。
                </div>

                <button
                  type="button"
                  onClick={
                    handlePreviewBatchTasks
                  }
                  disabled={
                    addingTask ||
                    !batchText.trim()
                  }
                  className="shrink-0 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  识别并确认
                </button>
              </div>
            </div>
          </details>

          {/* =================================================
              批量任务确认区
          ================================================= */}

          {showBatchReview && (
            <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
              {/* Header */}
              <div className="border-b border-gray-200 bg-gray-50 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      批量任务确认
                    </h3>

                    <div className="mt-1 text-xs text-gray-500">
                      共{" "}
                      {batchDrafts.length}
                      {" "}
                      个任务，其中识别出{" "}
                      {assetDraftCount}
                      {" "}
                      个可能与资产有关。
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={
                      handleCancelBatchReview
                    }
                    className="text-xs text-gray-400 hover:text-gray-700"
                  >
                    取消
                  </button>
                </div>
              </div>

              {/* Draft List */}
              <div>
                {batchDrafts.map(
                  (draft, index) => (
                    <div
                      key={draft.id}
                      className="border-b border-gray-100 px-4 py-4 last:border-b-0"
                    >
                      <div className="flex items-start gap-3">
                        <div className="pt-0.5 text-xs text-gray-400">
                          {index + 1}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-gray-900">
                            {draft.title}
                          </div>

                          {/* 资产识别 */}
                          <div className="mt-2">
                            {draft.assetRelated ? (
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                                    资产相关任务
                                  </span>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleBatchAssetRelated(
                                        draft.id
                                      )
                                    }
                                    className="text-xs text-gray-400 hover:text-gray-700"
                                  >
                                    改为普通任务
                                  </button>
                                </div>

                                {/* 当前阶段先设置条件 */}
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs text-gray-500">
                                    执行条件
                                  </span>

                                  <select
                                    value={
                                      draft.condition ??
                                      ""
                                    }
                                    onChange={(event) =>
                                      changeBatchCondition(
                                        draft.id,
                                        event.target
                                          .value ||
                                          null
                                      )
                                    }
                                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 outline-none focus:border-gray-400"
                                  >
                                    <option value="">
                                      暂不设置
                                    </option>

                                    <option value="回本后卖出">
                                      回本后卖出
                                    </option>

                                    <option value="达到目标价格后处理">
                                      达到目标价格后处理
                                    </option>

                                    <option value="根据当时价格决定">
                                      根据当时价格决定
                                    </option>
                                  </select>
                                </div>

                                {/* 下一阶段提示 */}
                                <div className="text-xs text-gray-400">
                                  下一步可以关联具体 Holding，系统再自动读取成本、当前市值和盈亏判断条件是否达到。
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
                                  普通任务
                                </span>

                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleBatchAssetRelated(
                                      draft.id
                                    )
                                  }
                                  className="text-xs text-gray-400 hover:text-gray-700"
                                >
                                  设为资产相关任务
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 删除草稿 */}
                        <button
                          type="button"
                          onClick={() =>
                            removeBatchDraft(
                              draft.id
                            )
                          }
                          className="shrink-0 rounded px-2 py-1 text-xs text-red-400 hover:bg-red-50 hover:text-red-600"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>

              {/* Footer */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-4 py-3">
                <div className="text-xs text-gray-500">
                  确认后才会真正写入任务。
                </div>

                <button
                  type="button"
                  onClick={
                    handleConfirmBatchAdd
                  }
                  disabled={
                    addingTask ||
                    batchDrafts.length ===
                      0
                  }
                  className="rounded-lg bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {addingTask
                    ? "添加中..."
                    : `确认添加 ${batchDrafts.length} 个任务`}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* =================================================
            附件
        ================================================= */}

        <section className="mb-8 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <details>
            <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-gray-900">
              📎 附件

              {files.length > 0 && (
                <span className="ml-2 text-xs font-normal text-gray-400">
                  {files.length} 个
                </span>
              )}
            </summary>

            <div className="border-t border-gray-100 px-5 py-4">
              {files.length > 0 && (
                <div className="space-y-2">
                  {files.map(
                    (file) => (
                      <div
                        key={
                          file.id
                        }
                        className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            handleOpenFile(
                              file
                            )
                          }
                          className="min-w-0 flex-1 truncate text-left text-sm text-gray-700 hover:text-gray-900 hover:underline"
                        >
                          {
                            file.file_name
                          }
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleDeleteFile(
                              file
                            )
                          }
                          className="shrink-0 rounded px-2 py-1 text-xs text-red-400 hover:bg-red-50 hover:text-red-600"
                        >
                          删除
                        </button>
                      </div>
                    )
                  )}
                </div>
              )}

              <label className="mt-4 inline-flex cursor-pointer items-center rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                {uploading
                  ? "上传中..."
                  : "添加文件"}

                <input
                  type="file"
                  className="hidden"
                  onChange={
                    handleUploadFile
                  }
                  disabled={
                    uploading
                  }
                />
              </label>
            </div>
          </details>
        </section>
      </div>
    </main>
  );
}

