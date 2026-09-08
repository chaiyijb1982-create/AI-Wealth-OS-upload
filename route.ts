import { NextRequest, NextResponse } from "next/server";

import {
  createRecordTask,
  deleteRecordTask,
  getRecordTaskProgress,
  getRecordTasks,
  reorderRecordTasks,
  setRecordTaskCompleted,
  updateRecordTask,
} from "@/lib/records";

// =====================================================
// GET
// 获取某条记录的所有任务 + 进度
// =====================================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [tasks, progress] = await Promise.all([
      getRecordTasks(id),
      getRecordTaskProgress(id),
    ]);

    return NextResponse.json({
      tasks,
      progress,
    });
  } catch (error) {
    console.error(
      "GET /api/record/[id]/tasks error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "获取任务失败",
      },
      { status: 500 }
    );
  }
}

// =====================================================
// POST
// 新增任务
//
// 支持：
//
// {
//   title: "卖出日本基金",
//   condition: "回本后卖出",
//   holding_id: 123
// }
//
// 普通任务：
//
// {
//   title: "检查整体资产配置"
// }
//
// condition / holding_id 都是可选的。
// =====================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const body = await request.json();

    const title =
      typeof body?.title === "string"
        ? body.title
        : "";

    // ===================================================
    // condition
    // ===================================================

    let condition: string | null = null;

    if (
      body?.condition !== undefined &&
      body?.condition !== null
    ) {
      if (typeof body.condition !== "string") {
        return NextResponse.json(
          {
            error: "condition 必须是字符串",
          },
          { status: 400 }
        );
      }

      const cleanCondition =
        body.condition.trim();

      condition =
        cleanCondition.length > 0
          ? cleanCondition
          : null;
    }

    // ===================================================
    // holding_id
    //
    // 允许：
    // holding_id
    //
    // 也兼容：
    // holdingId
    // ===================================================

    const rawHoldingId =
      body?.holding_id ??
      body?.holdingId ??
      null;

    let holdingId: number | null = null;

    if (
      rawHoldingId !== null &&
      rawHoldingId !== undefined &&
      rawHoldingId !== ""
    ) {
      const numericHoldingId =
        Number(rawHoldingId);

      if (!Number.isInteger(numericHoldingId)) {
        return NextResponse.json(
          {
            error: "holding_id 必须是有效的整数",
          },
          { status: 400 }
        );
      }

      holdingId = numericHoldingId;
    }

    // ===================================================
    // 创建任务
    // ===================================================

    const task = await createRecordTask(
      id,
      title,
      condition,
      holdingId
    );

    return NextResponse.json(
      {
        task,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "POST /api/record/[id]/tasks error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "新增任务失败",
      },
      { status: 500 }
    );
  }
}

// =====================================================
// PUT
//
// 支持三种操作：
//
// 1. reorder
//
// {
//   action: "reorder",
//   taskIds: [...]
// }
//
// 2. complete
//
// {
//   taskId: "...",
//   completed: true
// }
//
// 3. 修改任务
//
// {
//   taskId: "...",
//   title: "...",
//   condition: "回本后卖出",
//   holding_id: 123
// }
//
// title / condition / holding_id
// 都可以修改。
// =====================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const body = await request.json();

    // ===================================================
    // 1. 调整任务顺序
    // ===================================================

    if (body?.action === "reorder") {
      const taskIds = Array.isArray(
        body.taskIds
      )
        ? body.taskIds
        : [];

      if (
        !taskIds.every(
          (taskId: unknown) =>
            typeof taskId === "string"
        )
      ) {
        return NextResponse.json(
          {
            error: "taskIds 无效",
          },
          { status: 400 }
        );
      }

      const tasks =
        await reorderRecordTasks(
          id,
          taskIds
        );

      const progress =
        await getRecordTaskProgress(id);

      return NextResponse.json({
        tasks,
        progress,
      });
    }

    // ===================================================
    // 2. 完成 / 取消完成任务
    // ===================================================

    if (
      body?.taskId &&
      typeof body.completed === "boolean"
    ) {
      const task =
        await setRecordTaskCompleted(
          String(body.taskId),
          body.completed
        );

      const progress =
        await getRecordTaskProgress(id);

      return NextResponse.json({
        task,
        progress,
      });
    }

    // ===================================================
    // 3. 修改任务
    //
    // title / condition / holding_id
    // 都可以修改。
    // ===================================================

    if (body?.taskId) {
      const taskId =
        String(body.taskId);

      // -----------------------------------------------
      // title
      // -----------------------------------------------

      const title =
        typeof body.title === "string"
          ? body.title
          : undefined;

      // -----------------------------------------------
      // condition
      //
      // undefined = 不修改
      // null = 清空
      // string = 修改
      // -----------------------------------------------

      let condition:
        | string
        | null
        | undefined = undefined;

      if (
        body.condition !== undefined
      ) {
        if (
          body.condition !== null &&
          typeof body.condition !== "string"
        ) {
          return NextResponse.json(
            {
              error:
                "condition 必须是字符串或 null",
            },
            { status: 400 }
          );
        }

        condition =
          body.condition === null
            ? null
            : body.condition.trim();
      }

      // -----------------------------------------------
      // holding_id
      //
      // undefined = 不修改
      // null = 清除关联
      // number = 设置 Holding
      // -----------------------------------------------

      let holdingId:
        | number
        | null
        | undefined = undefined;

      const hasHoldingId =
        Object.prototype.hasOwnProperty.call(
          body,
          "holding_id"
        ) ||
        Object.prototype.hasOwnProperty.call(
          body,
          "holdingId"
        );

      if (hasHoldingId) {
        const rawHoldingId =
          body.holding_id ??
          body.holdingId;

        if (
          rawHoldingId === null ||
          rawHoldingId === ""
        ) {
          holdingId = null;
        } else {
          const numericHoldingId =
            Number(rawHoldingId);

          if (
            !Number.isInteger(
              numericHoldingId
            )
          ) {
            return NextResponse.json(
              {
                error:
                  "holding_id 必须是有效的整数或 null",
              },
              { status: 400 }
            );
          }

          holdingId =
            numericHoldingId;
        }
      }

      // -----------------------------------------------
      // 必须至少修改一个字段
      // -----------------------------------------------

      if (
        title === undefined &&
        condition === undefined &&
        holdingId === undefined
      ) {
        return NextResponse.json(
          {
            error:
              "没有需要修改的任务内容",
          },
          { status: 400 }
        );
      }

      // -----------------------------------------------
      // updateRecordTask 当前函数需要 title。
      //
      // 如果只修改 condition / holding_id，
      // 先读取当前任务标题。
      // -----------------------------------------------

      let finalTitle = title;

      if (finalTitle === undefined) {
        const currentTasks =
          await getRecordTasks(id);

        const currentTask =
          currentTasks.find(
            (task) =>
              task.id === taskId
          );

        if (!currentTask) {
          return NextResponse.json(
            {
              error: "任务不存在",
            },
            { status: 404 }
          );
        }

        finalTitle =
          currentTask.title;
      }

      const task =
        await updateRecordTask(
          taskId,
          finalTitle,
          condition,
          holdingId
        );

      return NextResponse.json({
        task,
      });
    }

    return NextResponse.json(
      {
        error: "无效的请求",
      },
      { status: 400 }
    );
  } catch (error) {
    console.error(
      "PUT /api/record/[id]/tasks error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "更新任务失败",
      },
      { status: 500 }
    );
  }
}

// =====================================================
// DELETE
//
// 删除任务：
//
// {
//   taskId: "..."
// }
//
// 删除以后重新整理任务顺序。
// =====================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const body = await request.json();

    const taskId =
      typeof body?.taskId === "string"
        ? body.taskId
        : "";

    if (!taskId) {
      return NextResponse.json(
        {
          error: "taskId 不能为空",
        },
        { status: 400 }
      );
    }

    // ===================================================
    // 先删除任务
    // ===================================================

    await deleteRecordTask(taskId);

    // ===================================================
    // 获取剩余任务
    // ===================================================

    const remainingTasks =
      await getRecordTasks(id);

    // ===================================================
    // 重新整理 sort_order
    //
    // 例如：
    //
    // 0
    // 2
    // 5
    //
    // 删除中间任务后：
    //
    // 0
    // 1
    // ===================================================

    if (remainingTasks.length > 0) {
      await reorderRecordTasks(
        id,
        remainingTasks.map(
          (task) => task.id
        )
      );
    }

    // ===================================================
    // 返回最新任务和进度
    // ===================================================

    const tasks =
      await getRecordTasks(id);

    const progress =
      await getRecordTaskProgress(id);

    return NextResponse.json({
      tasks,
      progress,
    });
  } catch (error) {
    console.error(
      "DELETE /api/record/[id]/tasks error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "删除任务失败",
      },
      { status: 500 }
    );
  }
}
