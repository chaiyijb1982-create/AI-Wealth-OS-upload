"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  loadCashflowPlanning,
  saveCashflowPlanning,
  clearCashflowPlanning,
  type CashflowState,
} from "@/lib/cashflow-planning";


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
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";
// ============================================================
// AI Wealth OS
// CASHFLOW-PLANNING
//
// 功能：
// 1. Excel 模板导入
// 2. 收入 / 支出分开
// 3. 新增项目 → 同步全部年月
// 4. 改名 → 同项目全部年月同步
// 5. 删除 → 同项目全部年月删除
// 6. 独立 → 当前年月脱离联动
// 7. 金额 → 每个月独立
// 8. Excel 原始现金 / 年金计算
// 9. AI 分析数据导出
// ============================================================

const TARGET_START_YEAR = 2026;

const TARGET_END_YEAR = 2042;

// 2026 只从 9 月开始读取；2027–2037 保持全年。




// ============================================================
// 类型
// ============================================================

type Role = "income" | "expense";

type Project = {
  projectId: string;
  role: Role;
  name: string;
  custom: boolean;
  sourceOffset?: number;
  isAnnuityContribution?: boolean;
  isPensionPayment?: boolean;
};

type CellItem = {
  id: string;

  year: number;
  month: number;

  role: Role;

  projectId: string;

  name: string;

  value: number;

  independent: boolean;

  fromExcel: boolean;

  sourceRow?: number;
  sourceCol?: number;
  sourceOffset?: number;

  isAnnuityContribution?: boolean;
  isPensionPayment?: boolean;

  deleted?: boolean;
};

type MonthData = {
  year: number;
  month: number;
  income: CellItem[];
  expense: CellItem[];

  // 手动覆盖计算结果；修改后会作为后续月份的滚动起点
  manualRemaining?: number;
  manualTotalCash?: number;
  manualAnnuity?: number;
};

type YearData = {
  year: number;
  months: MonthData[];

  originalOpeningCash: number;
  originalOpeningAnnuity: number;
};

type CalculationMonth = {
  income: number;
  expense: number;
  remaining: number;
  totalCash: number;
  annuity: number;
};

type YearCalculation = {
  year: number;
  months: CalculationMonth[];
  endingCash: number;
  endingAnnuity: number;
};


type ParsedExcel = {
  years: YearData[];
  projects: Project[];
  diagnostics: ExcelDiagnostics;
};

// ============================================================
// 工具
// ============================================================

function uid(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function projectUid(role: Role) {
  return `${role}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function normalizeName(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function numberValue(value: unknown): number {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (typeof value === "string") {
    const cleaned = value
      .replace(/,/g, "")
      .replace(/¥/g, "")
      .replace(/\$/g, "")
      .replace(/\s/g, "")
      .trim();

    if (
      !cleaned ||
      cleaned === "#REF!" ||
      cleaned === "#VALUE!"
    ) {
      return 0;
    }

    const n = Number(cleaned);

    return Number.isFinite(n) ? n : 0;
  }

  return 0;
}

function formatMoney(value: number) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatSigned(value: number) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  const abs = Math.abs(value).toLocaleString(
    "zh-CN",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }
  );

  if (value > 0) return `+${abs}`;
  if (value < 0) return `-${abs}`;

  return "0";
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function isValidName(name: string) {
  return normalizeName(name).length > 0;
}


function extractFormulaAdjustment(
  value: unknown
) {
  if (typeof value !== "string") {
    return 0;
  }

  const formula = value.trim();

  if (!formula.startsWith("=")) {
    return 0;
  }

  const matches = formula.match(
    /([+-])\s*(\d+(?:\.\d+)?)(?![A-Z0-9])/gi
  );

  if (!matches || matches.length === 0) {
    return 0;
  }

  const last =
    matches[matches.length - 1];

  const sign = last
    .trim()
    .startsWith("-")
    ? -1
    : 1;

  const numberPart = last
    .replace(/[+-]/g, "")
    .trim();

  const n = Number(numberPart);

  if (!Number.isFinite(n)) {
    return 0;
  }

  return sign * n;
}



// ============================================================
// 项目
// ============================================================

function getProjectById(
  projects: Project[],
  projectId: string
) {
  return projects.find(
    (p) =>
      p.projectId === projectId
  );
}

function findSharedProject(
  projects: Project[],
  role: Role,
  name: string
) {
  const normalized =
    normalizeName(name);

  return projects.find(
    (p) =>
      p.role === role &&
      normalizeName(p.name) ===
        normalized
  );
}

// ============================================================
// 新增全局项目
// ============================================================

function addGlobalProject(
  years: YearData[],
  projects: Project[],
  role: Role,
  name: string
) {
  const cleanName =
    name.trim();

  if (!isValidName(cleanName)) {
    return {
      years,
      projects,
    };
  }

  let project =
    findSharedProject(
      projects,
      role,
      cleanName
    );

  if (!project) {
    project = {
      projectId:
        projectUid(role),

      role,

      name: cleanName,

      custom: true,

      isAnnuityContribution:
        false,
    };

    projects.push(project);
  }

  /**
   * ==========================================================
   * 核心：
   *
   * 新增项目同步全部年份 × 全部月份
   * ==========================================================
   */

  for (const year of years) {
    for (const month of year.months) {
      const list =
        role === "income"
          ? month.income
          : month.expense;

      const exists =
        list.some(
          (item) =>
            item.projectId ===
              project!.projectId &&
            !item.deleted
        );

      if (!exists) {
        list.push({
          id: uid("cell"),

          year: year.year,

          month: month.month,

          role,

          projectId:
            project!.projectId,

          name:
            project!.name,

          value: 0,

          independent: false,

          fromExcel: false,

          isAnnuityContribution:
            false,
        });
      }
    }
  }

  return {
    years,
    projects,
  };
}

// ============================================================
// 单月新增项目
// ============================================================

function addMonthlyProject(
  years: YearData[],
  yearValue: number,
  monthValue: number,
  role: Role,
  name: string,
  value = 0
) {
  const cleanName = name.trim();

  if (!isValidName(cleanName)) {
    return years;
  }

  const isTransferToPension =
    role === "expense" &&
    normalizeName(cleanName) ===
      "转去养老保险";

  for (const year of years) {
    if (year.year !== yearValue) continue;

    for (const month of year.months) {
      if (month.month !== monthValue) continue;

      const list =
        role === "income"
          ? month.income
          : month.expense;

      list.push({
        id: uid("cell"),
        year: yearValue,
        month: monthValue,
        role,
        projectId: projectUid(role),
        name: cleanName,
        value,

        // 单月新增 = 只属于当前年月，不同步其他月份
        independent: true,
        fromExcel: false,

        // “转去养老保险”必须进入累计年金
        isAnnuityContribution:
          isTransferToPension,
      });
    }
  }

  // ==========================================================
  // 关键：
  // 新增“转去养老保险”以后，
  // 当前月及后续月份不能继续使用旧的 manualAnnuity。
  // ==========================================================
  if (isTransferToPension) {
    for (const year of years) {
      for (const month of year.months) {
        const isAfterOrEqual =
          year.year > yearValue ||
          (
            year.year === yearValue &&
            month.month >= monthValue
          );

        if (isAfterOrEqual) {
          delete month.manualAnnuity;
        }
      }
    }
  }

  return years;
}

// ============================================================
// 删除
// ============================================================

function deleteProject(
  years: YearData[],
  projects: Project[],
  item: CellItem
) {
  /**
   * 独立项目：
   * 只删除当前 occurrence
   */
  if (item.independent) {
    for (const year of years) {
      for (const month of year.months) {
        if (
          year.year !==
            item.year ||
          month.month !==
            item.month
        ) {
          continue;
        }

        if (
          item.role === "income"
        ) {
          month.income =
            month.income.filter(
              (x) =>
                x.id !== item.id
            );
        } else {
          month.expense =
            month.expense.filter(
              (x) =>
                x.id !== item.id
            );
        }
      }
    }

    return {
      years,
      projects,
    };
  }

  /**
   * 非独立项目：
   * 全部年月删除
   */
  for (const year of years) {
    for (const month of year.months) {
      month.income =
        month.income.filter(
          (x) =>
            x.projectId !==
            item.projectId
        );

      month.expense =
        month.expense.filter(
          (x) =>
            x.projectId !==
            item.projectId
        );
    }
  }

  return {
    years,
    projects:
      projects.filter(
        (p) =>
          p.projectId !==
          item.projectId
      ),
  };
}

// ============================================================
// 独立
// ============================================================

function toggleIndependent(
  years: YearData[],
  projects: Project[],
  item: CellItem
) {
  /**
   * 共享 → 独立
   */
  if (!item.independent) {
    const newProjectId =
      projectUid(item.role);

    projects.push({
      projectId:
        newProjectId,

      role: item.role,

      name: item.name,

      custom: true,

      sourceOffset:
        item.sourceOffset,

      isAnnuityContribution:
        item.isAnnuityContribution,
    });

    for (const year of years) {
      for (const month of year.months) {
        for (const x of [
          ...month.income,
          ...month.expense,
        ]) {
          if (
            x.id === item.id
          ) {
            x.projectId =
              newProjectId;

            x.independent =
              true;
          }
        }
      }
    }

    return {
      years,
      projects,
    };
  }

  /**
   * 独立 → 共享
   */
  let targetProject =
    findSharedProject(
      projects,
      item.role,
      item.name
    );

  if (!targetProject) {
    targetProject = {
      projectId:
        projectUid(
          item.role
        ),

      role: item.role,

      name: item.name,

      custom: true,

      isAnnuityContribution:
        item.isAnnuityContribution,
    };

    projects.push(
      targetProject
    );
  }

  for (const year of years) {
    for (const month of year.months) {
      for (const x of [
        ...month.income,
        ...month.expense,
      ]) {
        if (
          x.id === item.id
        ) {
          x.projectId =
            targetProject!.projectId;

          x.independent =
            false;
        }
      }
    }
  }

  return {
    years,
    projects,
  };
}

// ============================================================
// 改名
// ============================================================

function renameItem(
  years: YearData[],
  projects: Project[],
  item: CellItem,
  newName: string
) {
  const cleanName =
    newName.trim();

  if (!isValidName(cleanName)) {
    return {
      years,
      projects,
    };
  }

  /**
   * 独立：
   * 只改当前月份
   */
  if (item.independent) {
    for (const year of years) {
      for (const month of year.months) {
        for (const x of [
          ...month.income,
          ...month.expense,
        ]) {
          if (
            x.id === item.id
          ) {
            x.name =
              cleanName;
          }
        }
      }
    }

    const project =
      getProjectById(
        projects,
        item.projectId
      );

    if (project) {
      project.name =
        cleanName;
    }

    return {
      years,
      projects,
    };
  }

  /**
   * 共享：
   * 全部年月一起改
   */
  const project =
    getProjectById(
      projects,
      item.projectId
    );

  if (project) {
    project.name =
      cleanName;
  }

  for (const year of years) {
    for (const month of year.months) {
      for (const x of [
        ...month.income,
        ...month.expense,
      ]) {
        if (
          x.projectId ===
            item.projectId &&
          !x.independent
        ) {
          x.name =
            cleanName;
        }
      }
    }
  }

  return {
    years,
    projects,
  };
}

// ============================================================
// 金额
// ============================================================

function updateItemValue(
  years: YearData[],
  item: CellItem,
  value: number
) {
  const safeValue =
    Number.isFinite(value)
      ? value
      : 0;

  /*
   * “下月定投”是连续的计划项目。
   * 从用户修改的这个月份开始，后面的所有月份
   * 都沿用新的定投金额。
   *
   * 例如：
   * 9月下月定投改成 5000
   * → 10月、11月、12月……后续月份也同步为 5000。
   *
   * 前面的月份保持原来的历史数据不变。
   */
  // 普通买入 / 支出从修改月份开始同步同一项目；固定养老保险除外。
  const shouldPropagate =
    item.isPensionPayment !== true;

  /*
   * “转去养老保险”是积累年金的唯一月度新增来源。
   * 如果用户修改了它，就必须从这个月开始重新计算年金滚动链。
   *
   * 旧数据可能存在 manualAnnuity（用户以前手动修改过“积累年金”），
   * 如果不清掉，calculateYears() 会优先使用旧的 manualAnnuity，
   * 导致修改“转去养老保险”后，下面的“积累年金”看起来不变。
   *
   * 因此：只要修改的是标记为 isAnnuityContribution 的项目，
   * 就清除当前月及所有后续月份的 manualAnnuity，让新的金额重新
   * 按“上个月积累年金 + 当月转去养老保险”向后滚动。
   * 前面的月份完全不受影响。
   */
  const shouldResetAnnuity =
    item.role === "expense" &&
    (
      item.isAnnuityContribution === true ||
      item.isPensionPayment === true
    );

  for (const year of years) {
    for (const month of year.months) {
      const isAfterOrEqual =
        year.year > item.year ||
        (
          year.year === item.year &&
          month.month >= item.month
        );

      for (const x of [
        ...month.income,
        ...month.expense,
      ]) {
        const sameProject =
          x.projectId === item.projectId &&
          x.role === item.role;

        const shouldUpdate =
          x.id === item.id ||
          (
            shouldPropagate &&
            sameProject &&
            isAfterOrEqual
          );

        if (shouldUpdate) {
          x.value = safeValue;
        }
      }

      // 修改收入 / 普通支出后，本月“本月剩下”必须重新按
      // 收入 - 普通支出实时计算，不能继续被旧的手工值卡住。
      // 同时清掉从本月开始的“总现金剩下”手工覆盖，
      // 让它重新沿着“上月总现金剩下 + 本月剩下”滚动。
      if (
        shouldPropagate &&
        isAfterOrEqual &&
        (item.role === "income" || item.role === "expense")
      ) {
        delete month.manualRemaining;
        delete month.manualTotalCash;
      }

      if (shouldResetAnnuity && isAfterOrEqual) {
        delete month.manualAnnuity;
      }
    }
  }
}


// ============================================================
// 固定养老保险缴费
//
// 规则：
// 2026：从现有 Supabase 数据读取，不自动新增
// 2027：7月 503000，10月 221000
// 2028-2032：7月 393000，10月 221000
// 2033：7月 130000，10月 221000
// 2034-2037：7月 130000，10月 129000
// 2038：10月 129000
// 2039-2042：10月 39000
//
// “本月交养老保险”只影响积累年金，
// 不进入普通家庭现金支出。
// ============================================================

function getPensionPayment(
  year: number,
  month: number
): number {
  if (year === 2027) {
    if (month === 7) return 503000;
    if (month === 10) return 221000;
    return 0;
  }

  if (year >= 2028 && year <= 2032) {
    if (month === 7) return 393000;
    if (month === 10) return 221000;
    return 0;
  }

  if (year === 2033) {
    if (month === 7) return 130000;
    if (month === 10) return 221000;
    return 0;
  }

  if (year >= 2034 && year <= 2037) {
    if (month === 7) return 130000;
    if (month === 10) return 129000;
    return 0;
  }

  if (year === 2038) {
    if (month === 10) return 129000;
    return 0;
  }

  if (year >= 2039 && year <= 2042) {
    if (month === 10) return 39000;
    return 0;
  }

  return 0;
}

function ensurePensionPaymentItems(
  years: YearData[],
  projects: Project[]
) {
  const nextYears = clone(years);
  const nextProjects = clone(projects);

  // 固定项目 ID。
  // 必须稳定，不能每次初始化都生成新的 projectId，
  // 否则会造成重复项目。
  const projectId = "fixed:pension-payment";

  let project =
    nextProjects.find(
      (item) =>
        item.projectId === projectId
    );

  if (!project) {
    project = {
      projectId,
      role: "expense",
      name: "本月交养老保险",
      custom: false,
      isPensionPayment: true,
      isAnnuityContribution: false,
    };

    nextProjects.push(project);
  } else {
    // 确保旧数据也具有正确标记
    project.role = "expense";
    project.name = "本月交养老保险";
    project.isPensionPayment = true;
    project.isAnnuityContribution = false;
  }

  for (const year of nextYears) {
    for (const month of year.months) {
      const amount = getPensionPayment(
        year.year,
        month.month
      );

      // 找到这个月现有的养老保险项目
      const existingIndex =
        month.expense.findIndex(
          (item) =>
            item.projectId ===
              projectId ||
            (
              item.role === "expense" &&
              item.isPensionPayment === true
            )
        );

      if (amount > 0) {
        const item =
          existingIndex >= 0
            ? month.expense[existingIndex]
            : null;

        if (item) {
          item.projectId = projectId;
          item.name = "本月交养老保险";
          item.role = "expense";
          item.value = amount;
          item.independent = false;
          item.fromExcel = false;
          item.isPensionPayment = true;
          item.isAnnuityContribution = false;
          item.deleted = false;
        } else {
          month.expense.push({
            id: `pension-${year.year}-${month.month}`,
            year: year.year,
            month: month.month,
            role: "expense",
            projectId,
            name: "本月交养老保险",
            value: amount,
            independent: false,
            fromExcel: false,
            isPensionPayment: true,
            isAnnuityContribution: false,
          });
        }
      } else {
        // 非缴费月份：
        // 如果以前有自动生成的养老保险项目，则删除。
        if (existingIndex >= 0) {
          month.expense.splice(
            existingIndex,
            1
          );
        }
      }
    }
  }

  return {
    years: nextYears,
    projects: nextProjects,
  };
}

// ============================================================
// 年金特殊调整
// ============================================================

function getExcelAnnuityAdjustment(
  year: number,
  month: number
) {
  if (
    year === 2027 &&
    month === 7
  ) {
    return -503000;
  }

  if (
    year === 2027 &&
    month === 10
  ) {
    return -221000;
  }

  return 0;
}

// ============================================================
// 计算
// ============================================================

function calculateYears(
  years: YearData[]
): YearCalculation[] {
  const sorted =
    [...years].sort(
      (a, b) =>
        a.year - b.year
    );

  const results: YearCalculation[] =
    [];

  let previousCash:
    | number
    | null = null;

  let previousAnnuity:
    | number
    | null = null;

  for (const year of sorted) {
    const months: CalculationMonth[] =
      [];

    let runningCash: number =
  previousCash ??
  year.originalOpeningCash;

   let runningAnnuity: number =
  previousAnnuity ??
  year.originalOpeningAnnuity;

    for (const month of year.months) {
      const income =
        month.income.reduce(
          (sum, item) =>
            sum +
            (item.deleted
              ? 0
              : item.value),
          0
        );

      // “本月交养老保险”只从“积累年金”扣除，
      // 不属于家庭现金流支出，因此不能进入 expense / 本月剩下 / 总现金剩下。
      const expense =
        month.expense
          .filter(
            (item) =>
              !item.deleted &&
              !item.isPensionPayment
          )
          .reduce(
            (sum, item) =>
              sum + item.value,
            0
          );

      const calculatedRemaining =
        income - expense;

      // 本月剩下可以手动修改。修改后的值会影响后续月份。
      const remaining =
        Number.isFinite(month.manualRemaining)
          ? month.manualRemaining!
          : calculatedRemaining;

      // 总现金剩下严格按月滚动：
      // 本月“本月剩下” + 上个月“总现金剩下”。
      // 第一笔的 runningCash 就是 Excel 提供的期初现金。
      const calculatedTotalCash =
        runningCash + remaining;

      // 总现金剩下可以手动修改。修改后的值直接作为下个月现金起点。
      const totalCash =
        Number.isFinite(month.manualTotalCash)
          ? month.manualTotalCash!
          : calculatedTotalCash;

      runningCash = totalCash;

      const annuityContribution =
        month.expense
          .filter(
            (item) =>
              item.isAnnuityContribution &&
              !item.deleted
          )
          .reduce(
            (sum, item) =>
              sum + item.value,
            0
          );

      const pensionPayment =
        month.expense
          .filter(
            (item) =>
              item.isPensionPayment &&
              !item.deleted
          )
          .reduce(
            (sum, item) =>
              sum + item.value,
            0
          );

      // 积累年金 = 上个月积累年金 + 当月转去养老保险 - 当月交养老保险。
      const calculatedAnnuity =
        runningAnnuity +
        annuityContribution -
        pensionPayment;

      // 积累年金可以手动修改。修改后的值直接作为下个月年金起点。
      const annuity =
        Number.isFinite(month.manualAnnuity)
          ? month.manualAnnuity!
          : calculatedAnnuity;

      runningAnnuity = annuity;

      months.push({
        income,
        expense,
        remaining,
        totalCash,
        annuity,
      });
    }

    const endingCash: number = 
      months.length > 0
        ? months[
            months.length - 1
          ].totalCash
        : runningCash;

    const endingAnnuity: number  =
      months.length > 0
        ? months[
            months.length - 1
          ].annuity
        : runningAnnuity;

    results.push({
      year: year.year,

      months,

      endingCash,

      endingAnnuity,
    });

    previousCash =
      endingCash;

    previousAnnuity =
      endingAnnuity;
  }

  return results;
}

// ============================================================
// AI 数据生成
// ============================================================

function buildAIExport(
  years: YearData[],
  calculations: YearCalculation[]
) {
  const yearSummary =
    years.map((year) => {
      const calc =
        calculations.find(
          (x) =>
            x.year === year.year
        );

      const yearIncome =
        year.months.reduce(
          (sum, month) =>
            sum +
            month.income.reduce(
              (
                s,
                item
              ) =>
                s +
                item.value,
              0
            ),
          0
        );

      const yearExpense =
        year.months.reduce(
          (sum, month) =>
            sum +
            month.expense
              .filter(
                (item) =>
                  !item.deleted &&
                  !item.isPensionPayment
              )
              .reduce(
                (s, item) =>
                  s + item.value,
                0
              ),
          0
        );

      return {
        year:
          year.year,

        totalIncome:
          yearIncome,

        totalExpense:
          yearExpense,

        netCashFlow:
          yearIncome -
          yearExpense,

        endingCash:
          calc?.endingCash ??
          0,

        endingAnnuity:
          calc?.endingAnnuity ??
          0,
      };
    });

  const monthData =
    years.flatMap(
      (year) =>
        year.months.map(
          (month) => {
            const calc =
              calculations
                .find(
                  (x) =>
                    x.year ===
                    year.year
                )
                ?.months.find(
                  (_, index) =>
                    year.months[
                      index
                    ]?.month ===
                    month.month
                );

            return {
              year:
                year.year,

              month:
                month.month,

              income:
                month.income
                  .filter(
                    (x) =>
                      !x.deleted
                  )
                  .map(
                    (x) => ({
                      name:
                        x.name,

                      amount:
                        x.value,

                      independent:
                        x.independent,

                      projectId:
                        x.projectId,
                    })
                  ),

              expense:
                month.expense
                  .filter(
                    (x) =>
                      !x.deleted
                  )
                  .map(
                    (x) => ({
                      name:
                        x.name,

                      amount:
                        x.value,

                      independent:
                        x.independent,

                      projectId:
                        x.projectId,

                      isAnnuityContribution:
                        !!x.isAnnuityContribution,
                    })
                  ),

              calculated: {
                income:
                  calc?.income ??
                  0,

                expense:
                  calc?.expense ??
                  0,

                remaining:
                  calc?.remaining ??
                  0,

                totalCash:
                  calc?.totalCash ??
                  0,

                annuity:
                  calc?.annuity ??
                  0,
              },
            };
          }
        )
    );

  const projectSummary =
    Array.from(
      new Map(
        years
          .flatMap(
            (year) =>
              year.months
          )
          .flatMap(
            (month) => [
              ...month.income,
              ...month.expense,
            ]
          )
          .filter(
            (item) =>
              !item.deleted
          )
          .map((item) => [
            `${item.role}::${item.projectId}`,
            {
              projectId:
                item.projectId,

              role:
                item.role,

              name:
                item.name,

              independent:
                item.independent,
            },
          ])
      ).values()
    );

  return {
    meta: {
      system:
        "AI Wealth OS",

      module:
        "CASHFLOW-PLANNING",

      exportTime:
        new Date().toISOString(),

      description:
        "家庭资金计划完整现金流数据",

      rules: {
        newProjectSync:
          "新增项目同步所有年份所有月份",

        rename:
          "共享项目改名同步全部年月",

        delete:
          "共享项目删除同步全部年月",

        independent:
          "独立项目只影响当前年月",

        amount:
          "金额每个月独立填写",

        negativeBalanceInterest:
          false,
      },
    },

    years:
      yearSummary,

    projects:
      projectSummary,

    months:
      monthData,
  };
}

function buildAIPrompt(
  years: YearData[],
  calculations: YearCalculation[]
) {
  const data =
    buildAIExport(
      years,
      calculations
    );

  return `你现在是我的家庭财务 CFO。

下面是 AI Wealth OS 的 CASHFLOW-PLANNING 完整数据。

请不要修改原始数据，也不要自行假设不存在的数据。

请从以下几个方面分析：

1. 整体现金流
   - 每年的收入
   - 每年的支出
   - 每年的净现金流
   - 哪些年份压力最大

2. 月度现金流
   - 哪些月份现金流明显偏弱
   - 是否存在现金余额快速下降的月份
   - 是否存在潜在现金流断裂

3. 支出结构
   - 哪些支出项目占比最大
   - 哪些支出增长最快
   - 哪些项目属于固定支出
   - 哪些项目值得优化

4. 年金
   - 积累年金增长速度
   - 哪些年份增长最快
   - 是否存在明显的大额转入/转出
   - 这些变化对现金流有什么影响

5. 财务安全
   - 哪些年份最危险
   - 哪些年份现金最充裕
   - 是否应该提前准备现金缓冲
   - 是否存在资金安排过于集中的问题

6. 给我具体建议
   - 最重要的 3~5 个问题
   - 最值得调整的 3~5 个项目
   - 如果不调整，未来可能发生什么
   - 如果调整，建议怎么调整

7. 最后给一个结论：
   - 当前家庭资金计划：健康 / 基本健康 / 有压力 / 需要调整
   - 最需要关注的年份
   - 最需要关注的项目
   - 最重要的一项行动

请尽量使用数字说明，不要只给泛泛的理财建议。

==============================
以下是原始结构化数据
==============================

${JSON.stringify(
  data,
  null,
  2
)}
`;
}

// ============================================================
// Month Card
// ============================================================

type MonthCardProps = {
  month: MonthData;
  monthCalc?: CalculationMonth;

  editingId: string | null;
  editingValue: string;

  setEditingId: (
    value: string | null
  ) => void;

  setEditingValue: (
    value: string
  ) => void;

  onRename: (
    item: CellItem,
    value: string
  ) => void;

  onValueCommit: (
    item: CellItem
  ) => void;

  onDelete: (
    item: CellItem
  ) => void;

  onToggleIndependent: (
    item: CellItem
  ) => void;

  onReorderItems: (
  year: number,
  month: number,
  role: Role,
  activeId: string,
  overId: string
) => void;

  onAddMonthlyItem: (
    year: number,
    month: number,
    role: Role,
    name: string
  ) => void;

  editingCalcKey: string | null;
  editingCalcValue: string;
  setEditingCalcKey: (value: string | null) => void;
  setEditingCalcValue: (value: string) => void;
  onCalculationCommit: (
    month: MonthData,
    field: "remaining" | "totalCash" | "annuity"
  ) => void;
};

function MonthCard({
  month,
  monthCalc,
  editingId,
  editingValue,
  setEditingId,
  setEditingValue,
  onRename,
  onValueCommit,
  onDelete,
  onToggleIndependent,
  onReorderItems,
  onAddMonthlyItem,
  editingCalcKey,
  editingCalcValue,
  setEditingCalcKey,
  setEditingCalcValue,
  onCalculationCommit,
}: MonthCardProps) {
  const [addingRole, setAddingRole] = useState<Role | null>(null);
  const [addingName, setAddingName] = useState("");
  
  const sensors = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: {
      distance: 6,
    },
  })
);

function handleDragEnd(event: DragEndEvent) {
  const { active, over } = event;

  if (!over || active.id === over.id) {
    return;
  }

  const activeId = String(active.id);
  const overId = String(over.id);

  const incomeIds = month.income.map(
    (item) => item.id
  );

  const expenseIds = month.expense.map(
    (item) => item.id
  );

  if (
    incomeIds.includes(activeId) &&
    incomeIds.includes(overId)
  ) {
    onReorderItems(
      month.year,
      month.month,
      "income",
      activeId,
      overId
    );
    return;
  }

  if (
    expenseIds.includes(activeId) &&
    expenseIds.includes(overId)
  ) {
    onReorderItems(
      month.year,
      month.month,
      "expense",
      activeId,
      overId
    );
  }
}

  function submitMonthlyItem() {
    if (!addingRole || !addingName.trim()) return;

    onAddMonthlyItem(
      month.year,
      month.month,
      addingRole,
      addingName
    );

    setAddingName("");
    setAddingRole(null);
  }

  const incomeTotal =
    month.income.reduce(
      (sum, item) =>
        sum +
        (item.deleted
          ? 0
          : item.value),
      0
    );

  // “本月交养老保险”不计入家庭现金支出合计，
  // 它只在“积累年金”计算中扣除。
  const expenseTotal =
    month.expense
      .filter(
        (item) =>
          !item.deleted &&
          !item.isPensionPayment
      )
      .reduce(
        (sum, item) =>
          sum + item.value,
        0
      );

return (
  <DndContext
    sensors={sensors}
    collisionDetection={closestCenter}
    onDragEnd={handleDragEnd}
  >
    <div className="min-w-0 overflow-hidden rounded-xl border border-gray-200">

      {/* 月份 */}

      <div className="border-b border-gray-200 bg-white px-3 py-2.5">
        <div className="text-sm font-semibold">
          {month.month}月
        </div>
      </div>

      {/* ======================================================
          收入
      ====================================================== */}

      <div className="bg-slate-50 px-2.5 py-2.5">

        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold text-gray-700">
            收入
          </div>

          <div className="text-xs font-medium">
            ¥
            {formatMoney(
              incomeTotal
            )}
          </div>
        </div>

        <SortableContext
  items={month.income.map((item) => item.id)}
  strategy={verticalListSortingStrategy}
>
  <div className="space-y-1.5">
    {month.income.length === 0 ? (
      <div className="py-2 text-center text-xs text-gray-400">
        无收入项目
      </div>
    ) : (
      month.income.map((item) => (
        <ProjectRow
          key={item.id}
          item={item}
          editingId={editingId}
          editingValue={editingValue}
          setEditingId={setEditingId}
          setEditingValue={setEditingValue}
          onRename={onRename}
          onValueCommit={onValueCommit}
          onDelete={onDelete}
          onToggleIndependent={onToggleIndependent}
        />
      ))
    )}
  </div>
</SortableContext>

        <div className="mt-2 flex items-center gap-1.5">
          {addingRole === "income" ? (
            <div className="flex min-w-0 flex-1 gap-1.5">
              <input
                autoFocus
                value={addingName}
                onChange={(e) => setAddingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitMonthlyItem();
                  if (e.key === "Escape") {
                    setAddingRole(null);
                    setAddingName("");
                  }
                }}
                placeholder="收入项目名称"
                className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs outline-none focus:border-gray-500"
              />
              <button
                type="button"
                onClick={submitMonthlyItem}
                className="rounded border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-100"
              >
                添加
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingRole("income")}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-100"
            >
              ＋收入
            </button>
          )}
        </div>
      </div>

      {/* ======================================================
          支出
      ====================================================== */}

      <div className="border-t border-gray-200 bg-stone-50 px-2.5 py-2.5">

        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold text-gray-700">
            支出
          </div>

          <div className="text-xs font-medium">
            ¥
            {formatMoney(
              expenseTotal
            )}
          </div>
        </div>



        <SortableContext
  items={month.expense.map((item) => item.id)}
  strategy={verticalListSortingStrategy}
>
  <div className="space-y-1.5">
    {month.expense.length === 0 ? (
      <div className="py-2 text-center text-xs text-gray-400">
        无支出项目
      </div>
    ) : (
      month.expense.map((item) => (
        <ProjectRow
          key={item.id}
          item={item}
          editingId={editingId}
          editingValue={editingValue}
          setEditingId={setEditingId}
          setEditingValue={setEditingValue}
          onRename={onRename}
          onValueCommit={onValueCommit}
          onDelete={onDelete}
          onToggleIndependent={onToggleIndependent}
        />
      ))
    )}
  </div>
</SortableContext>

        <div className="mt-2 flex items-center gap-1.5">
          {addingRole === "expense" ? (
            <div className="flex min-w-0 flex-1 gap-1.5">
              <input
                autoFocus
                value={addingName}
                onChange={(e) => setAddingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitMonthlyItem();
                  if (e.key === "Escape") {
                    setAddingRole(null);
                    setAddingName("");
                  }
                }}
                placeholder="支出项目名称"
                className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs outline-none focus:border-gray-500"
              />
              <button
                type="button"
                onClick={submitMonthlyItem}
                className="rounded border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-100"
              >
                添加
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingRole("expense")}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-100"
            >
              ＋支出
            </button>
          )}
        </div>
      </div>

      {/* ======================================================
          计算
      ====================================================== */}

      <div className="border-t border-gray-200 bg-white px-3 py-2.5">

        <CalculationEditRow
          label="本月剩下"
          value={monthCalc?.remaining ?? incomeTotal - expenseTotal}
          signed
          editKey={`${month.year}-${month.month}-remaining`}
          editingCalcKey={editingCalcKey}
          editingCalcValue={editingCalcValue}
          setEditingCalcKey={setEditingCalcKey}
          setEditingCalcValue={setEditingCalcValue}
          onCommit={() =>
            onCalculationCommit(month, "remaining")
          }
        />

        <CalculationEditRow
          label="总现金剩下"
          value={monthCalc?.totalCash ?? 0}
          editKey={`${month.year}-${month.month}-totalCash`}
          editingCalcKey={editingCalcKey}
          editingCalcValue={editingCalcValue}
          setEditingCalcKey={setEditingCalcKey}
          setEditingCalcValue={setEditingCalcValue}
          onCommit={() =>
            onCalculationCommit(month, "totalCash")
          }
        />

        <CalculationEditRow
          label="积累年金"
          value={monthCalc?.annuity ?? 0}
          editKey={`${month.year}-${month.month}-annuity`}
          editingCalcKey={editingCalcKey}
          editingCalcValue={editingCalcValue}
          setEditingCalcKey={setEditingCalcKey}
          setEditingCalcValue={setEditingCalcValue}
          onCommit={() =>
            onCalculationCommit(month, "annuity")
          }
        />
      </div>
    </div>
    </DndContext>
  );
}

// ============================================================
// Calculation Edit Row
// ============================================================

type CalculationEditRowProps = {
  label: string;
  value: number;
  signed?: boolean;
  editKey: string;
  editingCalcKey: string | null;
  editingCalcValue: string;
  setEditingCalcKey: (value: string | null) => void;
  setEditingCalcValue: (value: string) => void;
  onCommit: () => void;
};

function CalculationEditRow({
  label,
  value,
  signed = false,
  editKey,
  editingCalcKey,
  editingCalcValue,
  setEditingCalcKey,
  setEditingCalcValue,
  onCommit,
}: CalculationEditRowProps) {
  const editing = editingCalcKey === editKey;

  function startEdit() {
    setEditingCalcKey(editKey);
    setEditingCalcValue(String(value));
  }

  return (
    <div className="flex items-center justify-between py-1 text-xs">
      <span className="text-gray-500">
        {label}
      </span>

      {editing ? (
        <div className="flex min-w-0 items-center gap-1">
          <span className="text-gray-500">¥</span>
          <input
            autoFocus
            value={editingCalcValue}
            onChange={(e) =>
              setEditingCalcValue(e.target.value)
            }
            onBlur={() => onCommit()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onCommit();
              }

              if (e.key === "Escape") {
                setEditingCalcKey(null);
                setEditingCalcValue("");
              }
            }}
            inputMode="decimal"
            className="w-28 rounded border border-gray-200 bg-white px-1.5 py-1 text-right text-xs outline-none focus:border-gray-400"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={startEdit}
          title="点击修改；修改后会作为下个月的起点继续计算"
          className="rounded px-1.5 py-0.5 text-right font-semibold hover:bg-gray-50"
        >
          ¥{signed ? formatSigned(value) : formatMoney(value)}
        </button>
      )}
    </div>
  );
}

// ============================================================
// Project Row
// ============================================================

type ProjectRowProps = {
  item: CellItem;

  editingId: string | null;
  editingValue: string;

  setEditingId: (
    value: string | null
  ) => void;

  setEditingValue: (
    value: string
  ) => void;

  onRename: (
    item: CellItem,
    value: string
  ) => void;

  onValueCommit: (
    item: CellItem
  ) => void;

  onDelete: (
    item: CellItem
  ) => void;

  onToggleIndependent: (
    item: CellItem
  ) => void;
};

function ProjectRow({
  item,
  editingId,
  editingValue,
  setEditingId,
  setEditingValue,
  onRename,
  onValueCommit,
  onDelete,
  onToggleIndependent,
}: ProjectRowProps) {
  const nameEditing =
    editingId === item.id;

  const valueEditing =
    editingId ===
    `value:${item.id}`;

const {
  attributes,
  listeners,
  setNodeRef,
  transform,
  transition,
  isDragging,
} = useSortable({
  id: item.id,
});

const style = {
  transform: CSS.Transform.toString(transform),
  transition,
  opacity: isDragging ? 0.5 : 1,
  zIndex: isDragging ? 10 : undefined,
};

  return (
    <div
  ref={setNodeRef}
  style={style}
  className={`rounded-lg border border-gray-200 bg-white px-2 py-1.5 ${
    isDragging ? "shadow-lg" : ""
  }`}
>

 <div className="flex min-w-0 items-center gap-1.5">

  {/* 拖拽 */}

  <button
    type="button"
    {...attributes}
    {...listeners}
    title="拖动调整顺序"
    className="shrink-0 cursor-grab touch-none rounded px-1 text-gray-300 hover:bg-gray-100 hover:text-gray-500 active:cursor-grabbing"
  >
    ⋮⋮
  </button>

  {/* 名称 */}

  <div className="min-w-0 flex-1">

          {nameEditing ? (
            <input
              autoFocus
              value={
                editingValue
              }
              onChange={(e) =>
                setEditingValue(
                  e.target.value
                )
              }
              onBlur={() => {
                onRename(
                  item,
                  editingValue
                );

                setEditingId(
                  null
                );

                setEditingValue(
                  ""
                );
              }}
              onKeyDown={(e) => {
                if (
                  e.key ===
                  "Enter"
                ) {
                  onRename(
                    item,
                    editingValue
                  );

                  setEditingId(
                    null
                  );

                  setEditingValue(
                    ""
                  );
                }

                if (
                  e.key ===
                  "Escape"
                ) {
                  setEditingId(
                    null
                  );

                  setEditingValue(
                    ""
                  );
                }
              }}
              className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs outline-none"
            />
          ) : (
            <button
              type="button"
              title={
                item.independent
                  ? "独立项目"
                  : "点击修改名称；共享项目会同步全部年月"
              }
              onClick={() => {
                setEditingId(
                  item.id
                );

                setEditingValue(
                  item.name
                );
              }}
              className="block w-full truncate text-left text-xs text-gray-800 hover:underline"
            >
              {item.name}
            </button>
          )}
        </div>

        {/* 独立 */}

        <label
          title={
            item.independent
              ? "当前年月独立"
              : "勾选后当前年月脱离联动"
          }
          className="flex shrink-0 cursor-pointer items-center gap-1 text-[10px] text-gray-500"
        >
          <input
            type="checkbox"
            checked={
              item.independent
            }
            onChange={() =>
              onToggleIndependent(
                item
              )
            }
            className="h-3 w-3"
          />

          <span>
            独立
          </span>
        </label>

        {/* 金额 */}

        <div className="w-[82px] shrink-0">
          <input
            value={
              valueEditing
                ? editingValue
                : String(
                    item.value
                  )
            }
            onFocus={() => {
              setEditingId(
                `value:${item.id}`
              );

              setEditingValue(
                String(
                  item.value
                )
              );
            }}
            onChange={(e) =>
              setEditingValue(
                e.target.value
              )
            }
            onBlur={() => {
              if (
                valueEditing
              ) {
                onValueCommit(
                  item
                );
              }
            }}
            onKeyDown={(e) => {
              if (
                e.key ===
                "Enter"
              ) {
                onValueCommit(
                  item
                );
              }

              if (
                e.key ===
                "Escape"
              ) {
                setEditingId(
                  null
                );

                setEditingValue(
                  ""
                );
              }
            }}
            inputMode="decimal"
            className="w-full rounded border border-gray-200 bg-white px-1.5 py-1 text-right text-xs outline-none focus:border-gray-400"
          />
        </div>

        {/* DEL */}

        <button
          type="button"
          title={
            item.independent
              ? "删除当前年月"
              : "删除全部年月中的该项目"
          }
          onClick={() =>
            onDelete(item)
          }
          className="shrink-0 rounded px-1.5 py-1 text-[10px] text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          DEL
        </button>
      </div>

      {item.independent && (
        <div className="mt-1 text-[9px] text-gray-400">
          当前年月独立
        </div>
      )}
    </div>
  );
}

// ============================================================
// 年份清洗
// ============================================================
// 防止旧版本 localStorage 中残留 2025 或重复年份。
function sanitizeYears(years: YearData[]) {
  const map = new Map<number, YearData>();

  for (const year of years) {
    if (
      year.year < TARGET_START_YEAR ||
      year.year > TARGET_END_YEAR
    ) {
      continue;
    }

    if (!map.has(year.year)) {
      // 清理旧版本/迁移数据中同一共享项目在同一月份重复出现的问题。
      // independent=true 的项目允许同名，因此只清理共享项目。
      for (const month of year.months) {
        const dedupe = (items: CellItem[]) => {
          const seen = new Set<string>();
          return items.filter((item) => {
            if (item.independent) return true;
            const key = `${item.role}::${item.projectId}::${normalizeName(item.name)}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        };

        month.income = dedupe(month.income);
        month.expense = dedupe(month.expense);
      }

      map.set(year.year, year);
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => a.year - b.year
  );
}

// ============================================================
// 快速录入
// ============================================================

const DEFAULT_QUICK_ENTRY =
  "支出 报销 1-11月4596，12月6396\n收入 房租 1/4/7/10月6000\n支出 转去养老保险 1月55000 2月160000 3月80000 4月0  5月32000 6月47000 7月50000 8月40000  9月47000 10月57000 11月0 12月139926";

function parseQuickEntry(text: string) {
  const lines = text
    .split(/[\n;；]+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed: Array<{
    role: Role;
    name: string;
    monthValues: Map<number, number>;
  }> = [];

  const scheduleRegex = /(\d{1,2})\s*-\s*(\d{1,2})\s*月\s*([\d,.]+)|(\d{1,2}(?:\s*[\/、,，]\s*\d{1,2})+)\s*月\s*([\d,.]+)|(\d{1,2})\s*月\s*([\d,.]+)/g;

  for (const line of lines) {
    const roleMatch = line.match(/(收入|支出)/);
    if (!roleMatch) continue;

    const role: Role =
      roleMatch[1] === "收入" ? "income" : "expense";

    const firstMatch = scheduleRegex.exec(line);
    scheduleRegex.lastIndex = 0;
    if (!firstMatch) continue;

const roleIndex = roleMatch.index ?? 0;

const name = line
  .slice(
    roleIndex + roleMatch[0].length,
    firstMatch.index
  )
  .replace(/^[\s:：\-—]+|[\s:：\-—]+$/g, "")
  .trim();

    if (!name) continue;

    const monthValues = new Map<number, number>();
    let match: RegExpExecArray | null;

    while ((match = scheduleRegex.exec(line))) {
      if (match[1] && match[2] && match[3]) {
        const start = Number(match[1]);
        const end = Number(match[2]);
        const value = numberValue(match[3]);
        for (let month = start; month <= end; month++) {
          if (month >= 1 && month <= 12) {
            monthValues.set(month, value);
          }
        }
      } else if (match[4] && match[5]) {
        const value = numberValue(match[5]);
        for (const part of match[4].split(/[\/、,，]/)) {
          const month = Number(part.trim());
          if (month >= 1 && month <= 12) {
            monthValues.set(month, value);
          }
        }
      } else if (match[6] && match[7]) {
        const month = Number(match[6]);
        const value = numberValue(match[7]);
        if (month >= 1 && month <= 12) {
          monthValues.set(month, value);
        }
      }
    }

    if (monthValues.size > 0) {
      parsed.push({ role, name, monthValues });
    }
  }

  return parsed;
}

function applyQuickEntry(
  years: YearData[],
  projects: Project[],
  text: string
) {
  const entries = parseQuickEntry(text);

  if (entries.length === 0) {
    return {
      years,
      projects,
      count: 0,
      message:
        "没有识别到可填写的内容。格式例如：支出 报销 1-11月4596，12月6396",
    };
  }

  let count = 0;

  for (const entry of entries) {
    let project = findSharedProject(
      projects,
      entry.role,
      entry.name
    );

    // ========================================================
    // 关键：判断是不是“转去养老保险”
    // ========================================================
    const isTransferToPension =
      entry.role === "expense" &&
      normalizeName(entry.name) ===
        "转去养老保险";

    if (!project) {
      project = {
        projectId: projectUid(entry.role),
        role: entry.role,
        name: entry.name,
        custom: true,
        isAnnuityContribution:
          isTransferToPension,
      };

      projects.push(project);
    } else if (isTransferToPension) {
      // 已经存在的“转去养老保险”项目，
      // 也强制标记为累计年金来源。
      project.isAnnuityContribution = true;
    }

    for (const year of years) {
      for (const month of year.months) {
        const list =
          entry.role === "income"
            ? month.income
            : month.expense;

        const matches = list.filter(
          (item) =>
            !item.independent &&
            item.projectId ===
              project!.projectId &&
            item.role === entry.role
        );

        let target = matches[0];

        // 快速录入时，同一共享项目同一月份只保留一条
        for (const duplicate of matches.slice(1)) {
          const index =
            list.indexOf(duplicate);

          if (index >= 0) {
            list.splice(index, 1);
          }
        }

        if (!target) {
          target = {
            id: uid("quick"),
            year: year.year,
            month: month.month,
            role: entry.role,
            projectId:
              project!.projectId,
            name: project!.name,
            value: 0,
            independent: false,
            fromExcel: false,

            // ==================================================
            // 关键修改
            // ==================================================
            isAnnuityContribution:
              isTransferToPension,
          };

          list.push(target);
        }

        // 只修改用户明确填写的月份
        const value =
          entry.monthValues.get(
            month.month
          );

        if (value !== undefined) {
          if (target.value !== value) {
            count++;
          }

          target.value = value;
          target.deleted = false;

          // ==================================================
          // 关键修改
          // 即使这个项目以后被设为 independent，
          // 也必须保留累计年金标记。
          // ==================================================
          if (isTransferToPension) {
            target.isAnnuityContribution =
              true;
          }
        }
      }
    }
  }

  // 修改普通收入/支出后，
  // 旧的手工计算结果不能继续卡住现金滚动。
  for (const year of years) {
    for (const month of year.months) {
      delete month.manualRemaining;
      delete month.manualTotalCash;
    }
  }

  return {
    years,
    projects,
    count,
    message: `已快速填写 ${entries.length} 个项目，共更新 ${count} 个金额。`,
  };
}

// ============================================================
// 页面
// ============================================================

export default function CashflowPlanningPage() {
  const [years, setYears] =
    useState<YearData[]>([]);

  const [projects, setProjects] =
    useState<Project[]>([]);

  const [selectedYear, setSelectedYear] =
    useState<number | null>(
      null
    );

  const [copySourceYear, setCopySourceYear] =
    useState<number | null>(null);

  const [copySingleYear, setCopySingleYear] =
    useState(true);

  const [copyTargetStartYear, setCopyTargetStartYear] =
    useState<number | null>(null);

  const [copyTargetEndYear, setCopyTargetEndYear] =
    useState<number | null>(null);

  const [copyMessage, setCopyMessage] =
    useState<string | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(
      null
    );

  const [excelDiagnostics, setExcelDiagnostics] =
    useState<ExcelDiagnostics | null>(null);

  const [showExcelDiagnostics, setShowExcelDiagnostics] =
    useState(false);

  const [saved, setSaved] =
    useState(false);

  const [newIncomeName, setNewIncomeName] =
    useState("");

  const [newExpenseName, setNewExpenseName] =
    useState("");

  // ==========================================================
  // 快速录入
  // ==========================================================

  const [quickEntryText, setQuickEntryText] =
    useState(
      "支出 报销 1-11月4596，12月6396\n收入 房租 1/4/7/10月6000 \n支出 转去养老保险 1月55000 2月160000 3月80000 4月0  5月32000 6月47000 7月50000 8月40000  9月47000 10月57000 11月0 12月139926"
    );

  const [quickEntryMessage, setQuickEntryMessage] =
    useState<string | null>(null);



  const [editingId, setEditingId] =
    useState<string | null>(
      null
    );

  const [editingValue, setEditingValue] =
    useState("");

  const [editingCalcKey, setEditingCalcKey] =
    useState<string | null>(null);

  const [editingCalcValue, setEditingCalcValue] =
    useState("");

  // ==========================================================
  // AI
  // ==========================================================

  const [aiText, setAiText] =
    useState("");

  const [aiGenerated, setAiGenerated] =
    useState(false);

  const [copied, setCopied] =
    useState(false);

  

    // ==========================================================
  // Supabase 保存控制
  //
  // 关键规则：
  // 1. 首次从 Supabase 读取时，绝不自动反写。
  // 2. 用户真正修改 state 后才保存。
  // 3. 保存请求严格串行，避免旧 POST 晚于新 POST 完成，
  //    用旧快照把新数据（例如 2037）覆盖掉。
  // ==========================================================

  const skipInitialSaveRef = useRef(true);

  const saveChainRef = useRef<Promise<void>>(
    Promise.resolve()
  );

  // ==========================================================
  // Supabase 初始化
  //
  // 唯一数据来源：
  // 页面打开 → Supabase
  //
  // 不再从 NEW.xlsx 初始化
  // 不再从 localStorage 恢复业务数据
  // ==========================================================

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        setLoading(true);
        setError(null);

        console.log(
          "[CASHFLOW] 开始读取 Supabase..."
        );

        const cloud = await Promise.race([
          loadCashflowPlanning(),

          new Promise<never>((_, reject) => {
            window.setTimeout(() => {
              reject(
                new Error(
                  "读取 Supabase 现金流数据超过 15 秒，请检查 /api/cashflow-planning"
                )
              );
            }, 15000);
          }),
        ]);

        if (!mounted) {
          return;
        }

        console.log(
          "[CASHFLOW] Supabase 返回：",
          cloud
        );

        if (
          !cloud.hasData ||
          !cloud.state ||
          !Array.isArray(
            cloud.state.years
          ) ||
          cloud.state.years.length === 0
        ) {
          throw new Error(
            "Supabase 中没有现金流规划数据，请先完成一次初始化。"
          );
        }

        // ======================================================
        // 从 Supabase 恢复数据
        // ======================================================

        const rebuilt =
          rebuildProjectLinks(
            sanitizeYears(
              clone(
                cloud.state.years
              )
            ),
            clone(
              cloud.state.projects ?? []
            )
          );

        // ======================================================
        // 自动确保养老保险项目存在
        // ======================================================

        const withPension =
          ensurePensionPaymentItems(
            rebuilt.years,
            rebuilt.projects
          );

        if (!mounted) {
          return;
        }

        // ======================================================
        // 非常重要：
        // 第一次从 Supabase 读取以后，
        // 不允许初始化数据立即反向 POST。
        // ======================================================

        skipInitialSaveRef.current =
          true;

        setYears(
          withPension.years
        );

        setProjects(
          withPension.projects
        );

        // 默认打开 2026
        setSelectedYear(
          withPension.years.find(
            (year) =>
              year.year === 2026
          )?.year ??
            withPension.years[0]
              ?.year ??
            null
        );

        console.log(
          "[CASHFLOW] Supabase 读取完成：",
          {
            years:
              withPension.years.map(
                (year) => year.year
              ),
            projectCount:
              withPension.projects.length,
          }
        );
      } catch (err) {
        console.error(
          "[CASHFLOW] Supabase 初始化失败：",
          err
        );

        if (mounted) {
          setError(
            err instanceof Error
              ? err.message
              : "读取现金流规划数据失败"
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, []);

  // ==========================================================
  // 自动保存：Supabase 正式数据
  //
  // 注意：API POST 是“整套快照 DELETE + INSERT”。
  // 因此这里必须保证：
  // - 初始化读取不能触发保存；
  // - 同一时间只能有一个保存请求；
  // - 后来的快照必须排在前一个保存完成之后。
  // ==========================================================

  useEffect(() => {
    if (loading || years.length === 0) return;

    // 首次从 Supabase 加载出来的数据，只是初始化快照，不能立即 POST。
    if (skipInitialSaveRef.current) {
      skipInitialSaveRef.current = false;
      return;
    }

    // 在 effect 中立即复制，避免后续 state 变化影响本次快照。
    const snapshot: CashflowState = clone({
      years,
      projects,
    });

    setSaved(true);

    const savedTimer = window.setTimeout(() => {
      setSaved(false);
    }, 1000);

    const saveTimer = window.setTimeout(() => {
      // 严格串行保存。
      // 如果旧请求还没结束，新请求必须等旧请求完成后再执行，
      // 防止旧快照最后完成并覆盖最新数据。
      saveChainRef.current = saveChainRef.current
        .catch((previousError) => {
          console.error(
            "CASHFLOW-PLANNING 上一次 Supabase 保存失败：",
            previousError
          );
        })
        .then(async () => {
          try {
            await saveCashflowPlanning(snapshot);
          } catch (saveError) {
            console.error(
              "CASHFLOW-PLANNING Supabase 保存失败：",
              saveError
            );
            throw saveError;
          }
        });
    }, 700);

    return () => {
      window.clearTimeout(savedTimer);
      window.clearTimeout(saveTimer);
    };
  }, [years, projects, loading]);



  // ==========================================================
  // 计算
  // ==========================================================

  const calculations =
    useMemo(
      () =>
        calculateYears(
          years
        ),
      [years]
    );

  const calculationMap =
    useMemo(() => {
      const map =
        new Map<
          number,
          YearCalculation
        >();

      for (const calc of calculations) {
        map.set(
          calc.year,
          calc
        );
      }

      return map;
    }, [calculations]);

  // ==========================================================
  // 当前年份
  // ==========================================================

  const visibleYears =
    selectedYear == null
      ? years
      : years.filter(
          (year) =>
            year.year ===
            selectedYear
        );

  // ==========================================================
  // 单月新增收入 / 支出
  // ==========================================================

  function handleAddMonthlyItem(
    yearValue: number,
    monthValue: number,
    role: Role,
    name: string
  ) {
    const nextYears = addMonthlyProject(
      clone(years),
      yearValue,
      monthValue,
      role,
      name
    );

    setYears(nextYears);
  }

  // ==========================================================
  // 新增（全局项目）
  // ==========================================================

  function handleAddProject(
    role: Role
  ) {
    const name =
      role === "income"
        ? newIncomeName
        : newExpenseName;

    if (
      !isValidName(name)
    ) {
      return;
    }

    const result =
      addGlobalProject(
        clone(years),
        clone(projects),
        role,
        name
      );

    setYears(
      result.years
    );

    setProjects(
      result.projects
    );

    if (
      role === "income"
    ) {
      setNewIncomeName(
        ""
      );
    } else {
      setNewExpenseName(
        ""
      );
    }
  }

  // ==========================================================
  // 快速填写
  // ==========================================================

  function handleQuickEntry() {
    const nextYears = clone(years);
    const nextProjects = clone(projects);

    const result = applyQuickEntry(
      nextYears,
      nextProjects,
      quickEntryText
    );

    setYears(result.years);
    setProjects(result.projects);
    setQuickEntryMessage(result.message);
  }

  // ==========================================================
  // 删除
  // ==========================================================

  function handleDelete(
    item: CellItem
  ) {
    const result =
      deleteProject(
        clone(years),
        clone(projects),
        item
      );

    setYears(
      result.years
    );

    setProjects(
      result.projects
    );
  }

// ==========================================================
// 拖拽排序：只调整当前月份、当前收入/支出的项目顺序
// 不修改金额、项目属性或任何计算逻辑
// ==========================================================
function handleReorderItems(
  yearValue: number,
  monthValue: number,
  role: Role,
  activeId: string,
  overId: string
) {
  const nextYears = clone(years);

  const targetYear = nextYears.find(
    (year) =>
      year.year === yearValue
  );

  const targetMonth =
    targetYear?.months.find(
      (month) =>
        month.month === monthValue
    );

  if (!targetMonth) {
    return;
  }

  const list =
    role === "income"
      ? targetMonth.income
      : targetMonth.expense;

  const oldIndex = list.findIndex(
    (item) =>
      item.id === activeId
  );

  const newIndex = list.findIndex(
    (item) =>
      item.id === overId
  );

  if (
    oldIndex < 0 ||
    newIndex < 0 ||
    oldIndex === newIndex
  ) {
    return;
  }

  const reordered = arrayMove(
    list,
    oldIndex,
    newIndex
  );

  if (role === "income") {
    targetMonth.income =
      reordered;
  } else {
    targetMonth.expense =
      reordered;
  }

  setYears(nextYears);
}


  // ==========================================================
  // 独立
  // ==========================================================

  function handleToggleIndependent(
    item: CellItem
  ) {
    const result =
      toggleIndependent(
        clone(years),
        clone(projects),
        item
      );

    setYears(
      result.years
    );

    setProjects(
      result.projects
    );
  }

  // ==========================================================
  // 改名
  // ==========================================================

  function handleRename(
    item: CellItem,
    value: string
  ) {
    const result =
      renameItem(
        clone(years),
        clone(projects),
        item,
        value
      );

    setYears(
      result.years
    );

    setProjects(
      result.projects
    );
  }

  // ==========================================================
  // 金额
  // ==========================================================

  function commitValue(
    item: CellItem
  ) {
    const value =
      Number(
        editingValue
          .replace(/,/g, "")
          .trim()
      );

    const nextYears =
      clone(years);

    updateItemValue(
      nextYears,
      item,
      Number.isFinite(value)
        ? value
        : 0
    );

    setYears(
      nextYears
    );

    setEditingId(
      null
    );

    setEditingValue(
      ""
    );
  }

  // ==========================================================
  // 计算结果手动修改
  // ==========================================================

  function commitCalculation(
    month: MonthData,
    field: "remaining" | "totalCash" | "annuity"
  ) {
    const value = Number(
      editingCalcValue
        .replace(/,/g, "")
        .trim()
    );

    const nextYears = clone(years);

    const targetYear = nextYears.find(
      (year) => year.year === month.year
    );

    const targetMonth = targetYear?.months.find(
      (x) => x.month === month.month
    );

    if (targetMonth) {
      const safeValue = Number.isFinite(value)
        ? value
        : 0;

      if (field === "remaining") {
        targetMonth.manualRemaining = safeValue;
      } else if (field === "totalCash") {
        targetMonth.manualTotalCash = safeValue;
      } else {
        targetMonth.manualAnnuity = safeValue;
      }
    }

    setYears(nextYears);
    setEditingCalcKey(null);
    setEditingCalcValue("");
  }

  // ==========================================================
  // AI 生成
  // ==========================================================

  function handleGenerateAI() {
    const prompt =
      buildAIPrompt(
        years,
        calculations
      );

    setAiText(
      prompt
    );

    setAiGenerated(
      true
    );

    setCopied(
      false
    );

    window.setTimeout(
      () => {
        document
          .getElementById(
            "ai-analysis-box"
          )
          ?.scrollIntoView({
            behavior:
              "smooth",
            block:
              "start",
          });
      },
      50
    );
  }

  // ==========================================================
  // 复制
  // ==========================================================

  async function handleCopyAI() {
    if (!aiText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        aiText
      );

      setCopied(
        true
      );

      window.setTimeout(
        () => {
          setCopied(
            false
          );
        },
        1800
      );
    } catch {
      /**
       * 某些浏览器 clipboard API
       * 不可用时，不报错。
       */
      setCopied(false);
    }
  }

  // ==========================================================
  // 下载
  // ==========================================================

  function handleDownloadAI() {
    if (!aiText) {
      return;
    }

    const blob =
      new Blob(
        [aiText],
        {
          type:
            "text/plain;charset=utf-8",
        }
      );

    const url =
      URL.createObjectURL(
        blob
      );

    const a =
      document.createElement(
        "a"
      );

    a.href = url;

    a.download =
      "AI-Wealth-OS-Cashflow-Analysis.txt";

    a.click();

    URL.revokeObjectURL(
      url
    );
  }

  // ==========================================================
  // 复制年度计划
  // ==========================================================

  function handleCopyYearRange() {
    if (copySourceYear == null) {
      setCopyMessage("请选择模板年份");
      return;
    }

    const targetStart = copySingleYear
      ? copyTargetStartYear
      : copyTargetStartYear;
    const targetEnd = copySingleYear
      ? copyTargetStartYear
      : copyTargetEndYear;

    if (targetStart == null || targetEnd == null) {
      setCopyMessage("请选择目标年份");
      return;
    }

    if (targetStart <= copySourceYear || targetEnd <= copySourceYear) {
      setCopyMessage("目标年份必须在模板年份之后");
      return;
    }

    if (targetStart > targetEnd) {
      setCopyMessage("目标年份的起始年份不能大于结束年份");
      return;
    }

    const sourceYear = years.find((year) => year.year === copySourceYear);
    if (!sourceYear) {
      setCopyMessage(`找不到 ${copySourceYear} 年`);
      return;
    }

    const nextYears = clone(years);
    const targetCount = targetEnd - targetStart + 1;

    for (let targetYear = targetStart; targetYear <= targetEnd; targetYear++) {
      const existingIndex = nextYears.findIndex((year) => year.year === targetYear);

      const copiedYear: YearData = {
        year: targetYear,
        originalOpeningCash: sourceYear.originalOpeningCash,
        originalOpeningAnnuity: sourceYear.originalOpeningAnnuity,
        months: sourceYear.months.map((sourceMonth) => ({
          year: targetYear,
          month: sourceMonth.month,
          income: sourceMonth.income.map((item) => ({
            ...clone(item),
            id: `${targetYear}-${sourceMonth.month}-${item.role}-${item.projectId}-income-${Math.random().toString(36).slice(2, 10)}`,
            year: targetYear,
            month: sourceMonth.month,
            fromExcel: false,
          })),
          expense: sourceMonth.expense.map((item) => ({
            ...clone(item),
            id: `${targetYear}-${sourceMonth.month}-${item.role}-${item.projectId}-expense-${Math.random().toString(36).slice(2, 10)}`,
            year: targetYear,
            month: sourceMonth.month,
            fromExcel: false,
          })),
          manualRemaining: undefined,
          manualTotalCash: undefined,
          manualAnnuity: undefined,
        })),
      };

      if (existingIndex >= 0) {
        nextYears[existingIndex] = copiedYear;
      } else {
        nextYears.push(copiedYear);
      }
    }

    const sortedYears = sanitizeYears(nextYears);
    const rebuilt = rebuildProjectLinks(sortedYears, projects);
    const withPension = ensurePensionPaymentItems(
      rebuilt.years,
      rebuilt.projects
    );

    setYears(withPension.years);
    setProjects(withPension.projects);
    setSelectedYear(targetEnd);
    setCopyMessage(
      `已复制：${copySourceYear} 年模板 → ${targetStart}${targetStart === targetEnd ? "" : `～${targetEnd}`} 年（共 ${targetCount} 年）`
    );
  }



 


  // ==========================================================
  // 清除保存
  // ==========================================================

 async function clearSaved() {
  try {
    await clearCashflowPlanning();
    window.location.reload();
  } catch (clearError) {
    console.error(
      "清除 Supabase CASHFLOW-PLANNING 失败：",
      clearError
    );
    setError(
      clearError instanceof Error
        ? clearError.message
        : "清除 Supabase 数据失败"
    );
  }
}

  // ==========================================================
  // Loading
  // ==========================================================

  if (loading) {
    return (
      <main className="min-h-screen bg-white p-6">
        <div className="text-sm text-gray-500">
          正在读取 Supabase 现金流数据……
        </div>
      </main>
    );
  }

  // ==========================================================
  // Error
  // ==========================================================

  if (error) {
    return (
      <main className="min-h-screen bg-white p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {error}
        </div>
      </main>
    );
  }

  // ==========================================================
  // 页面
  // ==========================================================

  return (
    <main className="min-h-screen bg-white text-gray-900">

      <div className="mx-auto max-w-[1800px] px-4 py-5 md:px-6">

        {/* ====================================================
            Header
        ==================================================== */}

        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">

          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              家庭资金计划
            </h1>

            <div className="mt-1 text-xs text-gray-500">
              CASHFLOW-PLANNING · Excel 模型版
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">

            <select
              value={
                selectedYear ?? ""
              }
              onChange={(e) =>
                setSelectedYear(
                  e.target.value
                    ? Number(
                        e.target.value
                      )
                    : null
                )
              }
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none"
            >
              <option value="">
                全部年份
              </option>

              {years.map(
                (year) => (
                  <option
                    key={
                      year.year
                    }
                    value={
                      year.year
                    }
                  >
                    {year.year}
                  </option>
                )
              )}
            </select>

            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5">
              <span className="text-sm font-medium text-gray-700">复制年度计划</span>

              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                <span>模板年份</span>
                <select
                  value={copySourceYear ?? ""}
                  onChange={(e) => {
                    const value = e.target.value ? Number(e.target.value) : null;
                    setCopySourceYear(value);
                    setCopyMessage(null);
                    if (value != null) {
                      setCopyTargetStartYear(value + 1);
                      setCopyTargetEndYear(value + 1);
                    }
                  }}
                  className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm outline-none"
                >
                  <option value="">请选择</option>
                  {years.map((year) => (
                    <option key={`copy-template-${year.year}`} value={year.year}>
                      {year.year}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={copySingleYear}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setCopySingleYear(checked);
                    setCopyMessage(null);
                    if (checked && copySourceYear != null) {
                      setCopyTargetStartYear(copySourceYear + 1);
                      setCopyTargetEndYear(copySourceYear + 1);
                    }
                  }}
                  className="h-4 w-4"
                />
                只复制 1 年
              </label>

              {copySingleYear ? (
                <label className="flex items-center gap-1.5 text-xs text-gray-600">
                  <span>目标年份</span>
                  <select
                    value={copyTargetStartYear ?? ""}
                    onChange={(e) => {
                      const value = e.target.value ? Number(e.target.value) : null;
                      setCopyTargetStartYear(value);
                      setCopyTargetEndYear(value);
                      setCopyMessage(null);
                    }}
                    className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm outline-none"
                  >
                    <option value="">请选择</option>
                    {Array.from(
                      { length: TARGET_END_YEAR - TARGET_START_YEAR + 1 },
                      (_, index) => TARGET_START_YEAR + index
                    ).map((year) => (
                      <option key={`copy-one-${year}`} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="flex items-center gap-1.5 text-xs text-gray-600">
                  <span>目标年份</span>
                  <select
                    value={copyTargetStartYear ?? ""}
                    onChange={(e) => {
                      const value = e.target.value ? Number(e.target.value) : null;
                      setCopyTargetStartYear(value);
                      setCopyMessage(null);
                    }}
                    className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm outline-none"
                  >
                    <option value="">起始年份</option>
                    {Array.from(
                      { length: TARGET_END_YEAR - TARGET_START_YEAR + 1 },
                      (_, index) => TARGET_START_YEAR + index
                    ).map((year) => (
                      <option key={`copy-start-${year}`} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>

                  <span className="text-gray-400">至</span>

                  <select
                    value={copyTargetEndYear ?? ""}
                    onChange={(e) => {
                      const value = e.target.value ? Number(e.target.value) : null;
                      setCopyTargetEndYear(value);
                      setCopyMessage(null);
                    }}
                    className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm outline-none"
                  >
                    <option value="">结束年份</option>
                    {Array.from(
                      { length: TARGET_END_YEAR - TARGET_START_YEAR + 1 },
                      (_, index) => TARGET_START_YEAR + index
                    ).map((year) => (
                      <option key={`copy-end-${year}`} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <button
                type="button"
                onClick={handleCopyYearRange}
                disabled={
                  copySourceYear == null ||
                  (copySingleYear
                    ? copyTargetStartYear == null
                    : copyTargetStartYear == null || copyTargetEndYear == null)
                }
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                复制年度计划
              </button>

              {copySourceYear != null && (
                <span className="text-xs text-gray-500">
                  {copySingleYear
                    ? copyTargetStartYear != null
                      ? `将 ${copySourceYear} 年模板复制到 ${copyTargetStartYear} 年，共 1 年`
                      : `将 ${copySourceYear} 年模板复制到下一年`
                    : copyTargetStartYear != null && copyTargetEndYear != null && copyTargetEndYear >= copyTargetStartYear
                      ? `将 ${copySourceYear} 年模板复制到 ${copyTargetStartYear}～${copyTargetEndYear} 年，共 ${copyTargetEndYear - copyTargetStartYear + 1} 年`
                      : `将 ${copySourceYear} 年模板复制到目标年份区间`}
                </span>
              )}
            </div>


            <button
              type="button"
              onClick={
                clearSaved
              }
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
            >
              清除保存
            </button>

            {saved && (
              <span className="text-xs text-gray-400">
                已保存
              </span>
            )}
          </div>
        </div>



        {/* ====================================================
            规则
        ==================================================== */}

        <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">

          <div className="flex flex-wrap gap-x-5 gap-y-1">

            <span>
              <b>
                新增项目：
              </b>
              自动同步全部年份 × 全部月份
            </span>

            <span>
              <b>
                改名：
              </b>
              同项目全部年月同步
            </span>

            <span>
              <b>
                删除：
              </b>
              同项目全部年月删除
            </span>

            <span>
              <b>
                独立：
              </b>
              当前年月脱离联动
            </span>

            <span>
              <b>
                金额：
              </b>
              每个月独立填写
            </span>
          </div>
        </div>

        {/* ====================================================
            快速填写
        ==================================================== */}

        <section className="mb-5 rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-2 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold">快速填写</div>
              <div className="mt-0.5 text-xs text-gray-500">
                直接用一句话写月份和金额，系统会自动填入全部年份；同一项目同一月份不会重复。
              </div>
            </div>
            <div className="text-xs text-gray-400">
              例如：支出 报销 1-11月4596，12月6396, 支出 转去养老保险 1月55000 2月160000 3月80000 4月0  5月32000 6月47000 7月50000 8月40000  9月47000 10月57000 11月0 12月139926
            </div>
          </div>

          <textarea
            value={quickEntryText}
            onChange={(e) => setQuickEntryText(e.target.value)}
            className="min-h-[86px] w-full resize-y rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm leading-6 outline-none focus:border-gray-500"
            placeholder={'支出 报销 1-11月4596，12月6396\n收入 房租 1/4/7/10月6000'}
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleQuickEntry}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-100"
            >
              一键填写
            </button>

            <button
              type="button"
              onClick={() => setQuickEntryText(DEFAULT_QUICK_ENTRY)}
              className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 hover:bg-gray-100"
            >
              恢复示例
            </button>

            {quickEntryMessage && (
              <span className="text-xs text-gray-500">
                {quickEntryMessage}
              </span>
            )}
          </div>
        </section>

        {/* ====================================================
            新增项目
        ==================================================== */}

        <section className="mb-6 grid gap-3 lg:grid-cols-2">

          {/* 收入 */}

          <div className="rounded-xl border border-gray-200 bg-slate-50 p-4">

            <div className="mb-3">
              <div className="text-sm font-semibold">
                新增收入项目
              </div>

              <div className="mt-0.5 text-xs text-gray-500">
                新项目会自动加入全部年月
              </div>
            </div>

            <div className="flex gap-2">

              <input
                value={
                  newIncomeName
                }
                onChange={(e) =>
                  setNewIncomeName(
                    e.target.value
                  )
                }
                onKeyDown={(e) => {
                  if (
                    e.key ===
                    "Enter"
                  ) {
                    handleAddProject(
                      "income"
                    );
                  }
                }}
                placeholder="例如：年终奖"
                className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-500"
              />

              <button
                type="button"
                onClick={() =>
                  handleAddProject(
                    "income"
                  )
                }
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-100"
              >
                ＋新增
              </button>
            </div>
          </div>

          {/* 支出 */}

          <div className="rounded-xl border border-gray-200 bg-stone-50 p-4">

            <div className="mb-3">
              <div className="text-sm font-semibold">
                新增支出项目
              </div>

              <div className="mt-0.5 text-xs text-gray-500">
                新项目会自动加入全部年月
              </div>
            </div>

            <div className="flex gap-2">

              <input
                value={
                  newExpenseName
                }
                onChange={(e) =>
                  setNewExpenseName(
                    e.target.value
                  )
                }
                onKeyDown={(e) => {
                  if (
                    e.key ===
                    "Enter"
                  ) {
                    handleAddProject(
                      "expense"
                    );
                  }
                }}
                placeholder="例如：转去养老保险"
                className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-500"
              />

              <button
                type="button"
                onClick={() =>
                  handleAddProject(
                    "expense"
                  )
                }
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-100"
              >
                ＋新增
              </button>
            </div>
          </div>
        </section>

        {/* ====================================================
            年度
        ==================================================== */}

        <div className="space-y-6">

          {visibleYears.map(
            (year) => {
              const calc =
                calculationMap.get(
                  year.year
                );

              return (
                <section
                  key={
                    year.year
                  }
                  className="overflow-hidden rounded-2xl border border-gray-200 bg-white"
                >

                  {/* 年标题 */}

                  <div className="flex flex-col gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3 md:flex-row md:items-center md:justify-between">

                    <div>
                      <div className="text-base font-semibold">
                        {year.year}
                      </div>

                      <div className="text-xs text-gray-500">
                        共 12 个月
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-4 text-xs">

                      <div>
                        <span className="text-gray-500">
                          年末现金
                        </span>

                        <span className="ml-2 font-semibold">
                          ¥
                          {formatMoney(
                            calc?.endingCash ??
                              0
                          )}
                        </span>
                      </div>

                      <div>
                        <span className="text-gray-500">
                          年末积累年金
                        </span>

                        <span className="ml-2 font-semibold">
                          ¥
                          {formatMoney(
                            calc?.endingAnnuity ??
                              0
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 月份 */}

                  <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-4">

                    {year.months.map(
                      (
                        month,
                        monthIndex
                      ) => (
                        <MonthCard
                          key={`${year.year}-${month.month}`}
                          month={
                            month
                          }
                          monthCalc={
                            calc
                              ?.months[
                              monthIndex
                            ]
                          }
                          editingId={
                            editingId
                          }
                          editingValue={
                            editingValue
                          }
                          setEditingId={
                            setEditingId
                          }
                          setEditingValue={
                            setEditingValue
                          }
                          onRename={
                            handleRename
                          }
                          onValueCommit={
                            commitValue
                          }
                          onDelete={
                            handleDelete
                          }
                          onToggleIndependent={
                            handleToggleIndependent
                          }
                          onReorderItems={
                           handleReorderItems
                          }
                          onAddMonthlyItem={
                            handleAddMonthlyItem
                          }
                          editingCalcKey={editingCalcKey}
                          editingCalcValue={editingCalcValue}
                          setEditingCalcKey={setEditingCalcKey}
                          setEditingCalcValue={setEditingCalcValue}
                          onCalculationCommit={
                            commitCalculation
                          }
                        />
                      )
                    )}
                  </div>
                </section>
              );
            }
          )}
        </div>

        {/* ====================================================
            AI CFO
        ==================================================== */}

        <section
          id="ai-analysis-box"
          className="mt-8 overflow-hidden rounded-2xl border border-gray-200 bg-white"
        >

          {/* AI Header */}

          <div className="border-b border-gray-200 bg-gray-50 px-5 py-4">

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">

              <div>
                <div className="text-base font-semibold">
                  AI 现金流分析
                </div>

                <div className="mt-1 text-xs text-gray-500">
                  把当前 CASHFLOW-PLANNING
                  的完整数据整理成 AI 可以直接分析的格式
                </div>
              </div>

              <button
                type="button"
                onClick={
                  handleGenerateAI
                }
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-100"
              >
                ✦ 生成 AI 分析数据
              </button>
            </div>
          </div>

          {/* AI 内容 */}

          <div className="p-5">

            {!aiGenerated ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-5 py-8 text-center">

                <div className="text-sm font-medium text-gray-700">
                  准备把这份现金流交给 AI 分析
                </div>

                <div className="mx-auto mt-2 max-w-xl text-xs leading-5 text-gray-500">
                  点击上面的「生成 AI 分析数据」，
                  系统会把全部年份、月份、收入、支出、
                  项目关系、现金余额和积累年金整理出来。
                </div>
              </div>
            ) : (
              <div className="space-y-3">

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">

                  <div className="text-xs text-gray-500">
                    已生成完整 AI 分析数据
                  </div>

                  <div className="flex gap-2">

                    <button
                      type="button"
                      onClick={
                        handleCopyAI
                      }
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium hover:bg-gray-100"
                    >
                      {copied
                        ? "✓ 已复制"
                        : "复制给 AI"}
                    </button>

                    <button
                      type="button"
                      onClick={
                        handleDownloadAI
                      }
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium hover:bg-gray-100"
                    >
                      下载 TXT
                    </button>
                  </div>
                </div>

                <textarea
                  value={
                    aiText
                  }
                  onChange={(e) =>
                    setAiText(
                      e.target.value
                    )
                  }
                  className="min-h-[500px] w-full resize-y rounded-xl border border-gray-300 bg-gray-50 p-4 font-mono text-xs leading-5 outline-none focus:border-gray-500"
                  spellCheck={
                    false
                  }
                />

                <div className="rounded-lg bg-gray-50 px-4 py-3 text-xs leading-5 text-gray-500">
                  <b className="text-gray-700">
                    使用方法：
                  </b>
                  点击「复制给 AI」→
                  回到 ChatGPT →
                  直接粘贴。
                  <br />
                  AI 会根据你的实际现金流数据进行分析，
                  而不是重新猜测你的家庭资金情况。
                </div>
              </div>
            )}
          </div>
        </section>

      </div>
    </main>
  );
}

// ============================================================
// 恢复项目关系
// ============================================================

function rebuildProjectLinks(
  years: YearData[],
  oldProjects: Project[]
) {
  const projects =
    clone(oldProjects);

  const map = new Map<
    string,
    string
  >();

  for (const year of years) {
    for (const month of year.months) {
      for (const item of [
        ...month.income,
        ...month.expense,
      ]) {
        if (
          item.independent
        ) {
          continue;
        }

        const key =
          `${item.role}::${normalizeName(
            item.name
          )}`;

        let projectId =
          map.get(key);

        if (!projectId) {
          const existing =
            findSharedProject(
              projects,
              item.role,
              item.name
            );

          if (existing) {
            projectId =
              existing.projectId;
          } else {
            projectId =
              projectUid(
                item.role
              );

            projects.push({
              projectId,

              role:
                item.role,

              name:
                item.name,

              custom: false,

              sourceOffset:
                item.sourceOffset,

              isAnnuityContribution:
                item.isAnnuityContribution,
            });
          }

          map.set(
            key,
            projectId
          );
        }

        item.projectId =
          projectId;
      }
    }
  }

  return {
    years,
    projects,
  };
}

