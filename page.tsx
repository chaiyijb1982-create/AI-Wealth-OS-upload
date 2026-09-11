"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
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
const EXCEL_END_YEAR = 2037;
const TARGET_END_YEAR = 2042;

// 2026 只从 9 月开始读取；2027–2037 保持全年。
const TARGET_2026_START_MONTH = 9;

const STORAGE_KEY =
  "ai-wealth-os-cashflow-planning-v12";

const EXCEL_FILE = "/NEW.xlsx";

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

type ExcelDiagnosticRow = {
  excelRow: number;
  c: string;
  d: string;
  e: string;
  eFormula: string;
};

type ExcelDiagnostics = {
  fetchedUrl: string;
  fetchedAt: string;
  responseSize: number;
  workbookSheetNames: string[];
  expectedSheetNames: string[];
  selectedSheet2026: string;
  selectedSheet2026Exists: boolean;
  sheet2026RowCount: number;
  sheet2026ColumnCount: number;
  janRows: ExcelDiagnosticRow[];
  janParsedIncome: Array<{ name: string; value: number; sourceRow: number }>;
  janParsedExpense: Array<{ name: string; value: number; sourceRow: number }>;
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

// ============================================================
// Excel
// ============================================================

const MONTH_BLOCKS = [
  {
    baseRow: 5,
    months: [1, 2, 3, 4],
  },
  {
    baseRow: 26,
    months: [5, 6, 7, 8],
  },
  {
    baseRow: 47,
    months: [9, 10, 11, 12],
  },
];

const MONTH_COLS = [
  {
    categoryCol: 2,
    labelCol: 3,
    valueCol: 4,
  },
  {
    categoryCol: 7,
    labelCol: 8,
    valueCol: 9,
  },
  {
    categoryCol: 12,
    labelCol: 13,
    valueCol: 14,
  },
  {
    categoryCol: 17,
    labelCol: 18,
    valueCol: 19,
  },
];

type ResolvedRowCells = {
  category: string;
  detail: string;
  value: unknown;
  valueCol: number;
  categoryCol: number;
  detailCol: number;
};

/**
 * 2026 的 NEW.xlsx 在不同 Excel/Sheet 版本中可能因为合并单元格、
 * 空列或列偏移，导致 sheet_to_json 的数组位置与肉眼看到的 C/D/E 不一致。
 *
 * 2027–2037 保持原来的固定 C/D/E、H/I/J、M/N/O、R/S/T 读取规则。
 * 只有 2026 使用这个自动识别器：
 *   1. 在目标组左右各扩 1 列寻找文字/金额；
 *   2. 优先把“最像金额”的单元格作为金额；
 *   3. 金额左侧最近的文字作为 detail；
 *   4. 如果还有更左侧文字，则作为 category；
 *   5. 如果目标 value 列有明确值，则优先使用目标 value 列。
 */
function isNumericLikeCell(value: unknown): boolean {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value !== "string") {
    return false;
  }

  const text = value.trim();

  if (!text || text.startsWith("#")) {
    return false;
  }

  if (text.startsWith("=")) {
    return false;
  }

  const normalized = text
    .replace(/[¥$,￥\s]/g, "")
    .replace(/,/g, "");

  return normalized !== "" && Number.isFinite(Number(normalized));
}

function isMeaningfulTextCell(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  const text = String(value).trim();

  if (!text) {
    return false;
  }

  if (text.startsWith("#")) {
    return false;
  }

  return !isNumericLikeCell(text);
}

function getSheetCellValue(
  sheet: XLSX.WorkSheet,
  rowIndex: number,
  colIndex: number
): unknown {
  const cell =
    sheet[
      XLSX.utils.encode_cell({
        r: rowIndex,
        c: colIndex,
      })
    ];

  if (!cell) {
    return "";
  }

  return cell.v ?? "";
}

function resolve2026RowCells(
  sheet: XLSX.WorkSheet,
  rowIndex: number,
  col: {
    categoryCol: number;
    labelCol: number;
    valueCol: number;
  }
): ResolvedRowCells {
  const startCol = Math.max(0, col.categoryCol - 1);
  const endCol = Math.min(
    64,
    col.valueCol + 1
  );

  const candidates: Array<{
    colIndex: number;
    value: unknown;
    cell: XLSX.CellObject | undefined;
  }> = [];

  for (
    let c = startCol;
    c <= endCol;
    c++
  ) {
    const cell =
      sheet[
        XLSX.utils.encode_cell({
          r: rowIndex,
          c,
        })
      ];

    candidates.push({
      colIndex: c,
      value: cell?.v ?? "",
      cell,
    });
  }

  // 优先使用模板定义的金额列，只要该格确实有内容。
  const expectedValue =
    candidates.find(
      (x) =>
        x.colIndex === col.valueCol &&
        x.value !== "" &&
        x.value !== null &&
        x.value !== undefined
    );

  let valueCandidate =
    expectedValue;

  // 如果模板金额列为空，则在相邻列寻找真正的数字。
  if (!valueCandidate) {
    const numericCandidates =
      candidates.filter((x) =>
        isNumericLikeCell(x.value)
      );

    if (numericCandidates.length > 0) {
      valueCandidate =
        numericCandidates.reduce(
          (best, current) =>
            Math.abs(
              current.colIndex -
                col.valueCol
            ) <
            Math.abs(
              best.colIndex -
                col.valueCol
            )
              ? current
              : best
        );
    }
  }

  const resolvedValueCol =
    valueCandidate?.colIndex ??
    col.valueCol;

  const textCandidates =
    candidates
      .filter(
        (x) =>
          x.colIndex !==
            resolvedValueCol &&
          isMeaningfulTextCell(x.value)
      )
      .sort(
        (a, b) =>
          Math.abs(
            a.colIndex -
              resolvedValueCol
          ) -
          Math.abs(
            b.colIndex -
              resolvedValueCol
          )
      );

  // 项目名优先选择金额左边的最近文字。
  const beforeValue =
    textCandidates.filter(
      (x) =>
        x.colIndex <
        resolvedValueCol
    );

  const afterValue =
    textCandidates.filter(
      (x) =>
        x.colIndex >
        resolvedValueCol
    );

  const orderedTexts =
    beforeValue.length > 0
      ? beforeValue
      : textCandidates;

  const nearestText =
    orderedTexts[0];

  // 如果同一行存在两个文字单元格，例如：
  // C=还信用卡 / D=招行朝朝宝还差 / E=2000
  // 则更左边的是 category，更靠近金额的是 detail。
  const leftTexts =
    textCandidates
      .filter(
        (x) =>
          x.colIndex <
          resolvedValueCol
      )
      .sort(
        (a, b) =>
          a.colIndex -
          b.colIndex
      );

  let category = "";
  let detail = "";

 if (leftTexts.length >= 2) {
  category = String(leftTexts[0].value ?? "");
  detail = String(
    leftTexts[leftTexts.length - 1].value ?? ""
  );
} else if (leftTexts.length === 1) {
  category = String(leftTexts[0].value ?? "");
} else if (nearestText) {
  category = String(nearestText.value ?? "");
}

// 收入区典型结构可能只有：
// D=LP / E=15000
// 自动识别器会得到 category=LP。
//
// 如果存在金额右侧文字，则只在 category/detail 都为空时使用。
if (
  !category &&
  !detail &&
  afterValue.length > 0
) {
  category = String(afterValue[0].value ?? "");
}

  return {
    category,
    detail,
    value:
      valueCandidate?.value ?? "",
    valueCol: resolvedValueCol,
    categoryCol:
      leftTexts[0]?.colIndex ??
      nearestText?.colIndex ??
      col.categoryCol,
    detailCol:
      leftTexts.length >= 2
        ? leftTexts[
            leftTexts.length - 1
          ].colIndex
        : nearestText?.colIndex ??
          col.labelCol,
  };
}

function getRoleFromOffset(
  offset: number
): Role | null {
  if (offset >= 2 && offset <= 5) {
    return "income";
  }

  if (offset >= 7 && offset <= 16) {
    return "expense";
  }

  return null;
}

function getAnnuityFlag(offset: number) {
  return offset === 12;
}

const PENSION_PAYMENT_SCHEDULE: Record<number, { july?: number; october?: number }> = {
  2026: { july: 503000, october: 221000 },
  2027: { july: 503000, october: 221000 },
  2028: { july: 393000, october: 221000 },
  2029: { july: 393000, october: 221000 },
  2030: { july: 393000, october: 221000 },
  2031: { july: 393000, october: 221000 },
  2032: { july: 393000, october: 221000 },
  2033: { july: 130000, october: 221000 },
  2034: { july: 130000, october: 129000 },
  2035: { july: 130000, october: 129000 },
  2036: { july: 130000, october: 129000 },
  2037: { july: 130000, october: 129000 },
  2038: { october: 129000 },
  2039: { october: 39000 },
  2040: { october: 39000 },
  2041: { october: 39000 },
  2042: { october: 39000 },
};

function getPensionPayment(year: number, month: number) {
  const schedule = PENSION_PAYMENT_SCHEDULE[year];
  if (!schedule) return 0;
  if (month === 7) return schedule.july ?? 0;
  if (month === 10) return schedule.october ?? 0;
  return 0;
}

function ensurePensionPaymentItems(years: YearData[], projects: Project[]) {
  const projectId = "fixed:pension-payment";
  let project = projects.find((item) => item.projectId === projectId);

  if (!project) {
    project = {
      projectId,
      role: "expense",
      name: "本月交养老保险",
      custom: false,
      isAnnuityContribution: false,
      isPensionPayment: true,
    };
    projects.push(project);
  }

  for (const year of years) {
    for (const month of year.months) {
      const amount = getPensionPayment(year.year, month.month);

      // 清理历史版本可能已经生成的重复“本月交养老保险”项目。
      // 同一个月份只允许存在一个固定养老保险项目。
      const pensionItems = month.expense.filter(
        (item) =>
          item.isPensionPayment === true ||
          (
            item.name.trim() === "本月交养老保险" &&
            item.projectId === projectId
          )
      );

      const existing = pensionItems[0];

      // 删除同月多余的养老保险项目，避免 221000 / 221000 重复显示和重复扣年金。
      for (const duplicate of pensionItems.slice(1)) {
        const index = month.expense.indexOf(duplicate);
        if (index >= 0) {
          month.expense.splice(index, 1);
        }
      }

      if (amount > 0) {
        // 养老保险缴费直接从“积累年金”扣除。
        // 清除旧的 manualAnnuity，确保新的扣款能够真正进入计算。
        delete month.manualAnnuity;

        if (existing) {
          existing.name = "本月交养老保险";
          existing.projectId = projectId;
          existing.role = "expense";
          existing.value = amount;
          existing.independent = false;
          existing.fromExcel = false;
          existing.isPensionPayment = true;
          existing.isAnnuityContribution = false;
          existing.deleted = false;
        } else {
          month.expense.push({
            id: uid("pension"),
            year: year.year,
            month: month.month,
            role: "expense",
            projectId,
            name: "本月交养老保险",
            value: amount,
            independent: false,
            fromExcel: false,
            isAnnuityContribution: false,
            isPensionPayment: true,
          });
        }
      } else if (existing) {
        const index = month.expense.indexOf(existing);
        if (index >= 0) {
          month.expense.splice(index, 1);
        }
      }
    }
  }

  return { years, projects };
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
// 读取 Excel
// ============================================================

async function loadExcel(): Promise<ParsedExcel> {
  const cacheBuster = `?t=${Date.now()}`;
  const fetchedUrl = `${EXCEL_FILE}${cacheBuster}`;

  const response = await fetch(
    fetchedUrl,
    {
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      `无法读取 ${EXCEL_FILE}`
    );
  }

  const buffer =
    await response.arrayBuffer();

  const workbook = XLSX.read(buffer, {
    type: "array",
    cellFormula: true,
    cellNF: true,
    cellStyles: true,
  });

  // ============================================================
  // 年度 Sheet 选择：严格使用固定 Sheet 名。
  // 2026：2026每月估算111
  // 2027–2037：{年份}每月估算(3)
  // 不自动寻找其它版本，也不接受空格/其它括号版本。
  // ============================================================
  function pickYearSheet(year: number): string | null {
    const exactName =
      year === 2026
        ? "2026每月估算111"
        : `${year}每月估算(3)`;

    return workbook.SheetNames.includes(exactName)
      ? exactName
      : null;
  }

  const sheetNames: string[] = [];
  for (let year = TARGET_START_YEAR; year <= EXCEL_END_YEAR; year++) {
    const selectedName = pickYearSheet(year);
    if (!selectedName) {
      throw new Error(
        `NEW.xlsx 缺少严格指定的 Sheet：${
          year === 2026
            ? "2026每月估算111"
            : `${year}每月估算(3)`
        }\n请不要使用其它版本的“每月估算”Sheet。`
      );
    }
    sheetNames.push(selectedName);
  }

  const diagnostics: ExcelDiagnostics = {
    fetchedUrl: response.url || fetchedUrl,
    fetchedAt: new Date().toISOString(),
    responseSize: buffer.byteLength,
    workbookSheetNames: [...workbook.SheetNames],
    expectedSheetNames: [...sheetNames],
    selectedSheet2026: "2026每月估算111",
    selectedSheet2026Exists: workbook.SheetNames.includes("2026每月估算111"),
    sheet2026RowCount: 0,
    sheet2026ColumnCount: 0,
    janRows: [],
    janParsedIncome: [],
    janParsedExpense: [],
  };

  const projects: Project[] = [];

  const projectMap = new Map<
    string,
    string
  >();

  const years: YearData[] = [];

  for (const sheetName of sheetNames) {
    const year = Number(
      sheetName.slice(0, 4)
    );

    const sheet =
      workbook.Sheets[sheetName];

    const rows =
      XLSX.utils.sheet_to_json(
        sheet,
        {
          header: 1,
          raw: true,
          defval: "",
        }
      ) as unknown[][];

    if (year === 2026) {
      diagnostics.sheet2026RowCount = rows.length;
      diagnostics.sheet2026ColumnCount = Math.max(
        0,
        ...rows.map((row) => row.length)
      );

      // 2026 年 1 月的 Excel 原始 C/D/E 数据。
      // Excel 行号 5–24 对应 rows[4]–rows[23]。
      const diagnosticStartRow =
        MONTH_BLOCKS[2].baseRow + 2 - 1;

      diagnostics.janRows = Array.from(
        { length: 20 },
        (_, index) => {
          const rowIndex = diagnosticStartRow + index;
          const excelRow = rowIndex + 1;
          const row = rows[rowIndex] ?? [];
          const resolved =
            resolve2026RowCells(
              sheet,
              rowIndex,
              MONTH_COLS[2]
            );

          const cCell =
            sheet[
              XLSX.utils.encode_cell({
                r: rowIndex,
                c: 2,
              })
            ];

          const dCell =
            sheet[
              XLSX.utils.encode_cell({
                r: rowIndex,
                c: 3,
              })
            ];

          const eCell =
            sheet[
              XLSX.utils.encode_cell({
                r: rowIndex,
                c: 4,
              })
            ];

          const valueCell =
            sheet[
              XLSX.utils.encode_cell({
                r: rowIndex,
                c: resolved.valueCol,
              })
            ];

          return {
            excelRow,
            c: String(cCell?.v ?? ""),
            d: String(dCell?.v ?? ""),
            e: String(eCell?.v ?? ""),
            eFormula: String(eCell?.f ?? ""),
            detectedProject: String(
              resolved.category ?? ""
            ),
            detectedDetail: String(
              resolved.detail ?? ""
            ),
            detectedValue: String(
              resolved.value ?? ""
            ),
            detectedValueColumn:
              XLSX.utils.encode_col(
                resolved.valueCol
              ),
            detectedValueFormula:
              String(valueCell?.f ?? ""),
          };
        }
      );
    }

    const months: MonthData[] = [];

    const monthAnnuityAdjustments =
      new Map<number, number>();

    for (const block of MONTH_BLOCKS) {
      for (let i = 0; i < 4; i++) {
        const month =
          block.months[i];

        // 2026 从 9 月开始使用 Excel 数据；1–8 月完全忽略。
        // 2027–2037 保持原来的全年读取逻辑。
        if (year === 2026 && month < TARGET_2026_START_MONTH) {
          continue;
        }

        const col =
          MONTH_COLS[i];

        const income: CellItem[] =
          [];

        const expense: CellItem[] =
          [];

        for (
          let offset = 2;
          offset <= 16;
          offset++
        ) {
          const rowIndex =
            block.baseRow +
            offset -
            1;

          const row =
            rows[rowIndex] ?? [];

          /*
           * 2027–2037：继续严格按原来的固定列读取。
           *
           * 2026：使用自动识别器，避免 2026 Sheet 因合并单元格/
           * 空列/列偏移导致“金额跑到项目名称”的问题。
           */
          const resolved =
            year === 2026
              ? resolve2026RowCells(
                  sheet,
                  rowIndex,
                  col
                )
              : null;

          const rawCategory =
            resolved?.category ??
            row[col.categoryCol] ??
            "";

          const rawDetail =
            resolved?.detail ??
            row[col.labelCol] ??
            "";

          const rawValue =
            resolved?.value ??
            row[col.valueCol] ??
            "";

          const categoryLabel =
            String(rawCategory ?? "").trim();

          const detailLabel =
            String(rawDetail ?? "").trim();

          let label =
            categoryLabel || detailLabel;

          // NEW.xlsx 中的 JJ 对应页面项目“买入基金 015736”。
          if (normalizeName(label) === "jj") {
            label = "买入基金 015736";
          }

          // NEW.xlsx 中的“转去养老保险”直接进入积累年金滚动。
          const isTransferToPension =
            normalizeName(label) === "转去养老保险";

          if (
            !label &&
            rawValue === ""
          ) {
            continue;
          }

          const excludedNames =
            new Set([
              "收入",
              "本月剩下",
              "总现金剩下",
              "积累年金",
            ]);

          if (
            excludedNames.has(
              label
            )
          ) {
            continue;
          }

          const role =
            getRoleFromOffset(
              offset
            );

          if (!role) {
            continue;
          }

          if (!isValidName(label)) {
            label = `项目${offset}`;
          }

          const key =
            `${role}::${normalizeName(
              label
            )}`;

          let pid =
            projectMap.get(key);

          if (!pid) {
            pid =
              projectUid(role);

            projectMap.set(
              key,
              pid
            );

            projects.push({
              projectId: pid,
              role,
              name: label,
              custom: false,
              sourceOffset:
                offset,
              isAnnuityContribution:
                isTransferToPension ||
                getAnnuityFlag(offset),
            });
          }

          const item: CellItem = {
            id: uid("cell"),

            year,

            month,

            role,

            projectId: pid,

            name: label,

            value:
              numberValue(
                rawValue
              ),

            independent: false,

            fromExcel: true,

            sourceRow:
              rowIndex,

            sourceCol:
              resolved?.valueCol ??
              col.valueCol,

            sourceOffset:
              offset,

            isAnnuityContribution:
              isTransferToPension ||
              getAnnuityFlag(offset),
          };

          if (role === "income") {
            income.push(item);
          } else {
            expense.push(item);
          }

          if (
            offset === 12
          ) {
            const formulaCell =
              sheet[
                XLSX.utils.encode_cell(
                  {
                    r: rowIndex,
                    c:
                      resolved?.valueCol ??
                      col.valueCol,
                  }
                )
              ];

            const formula =
              formulaCell?.f;

            const adjustment =
              extractFormulaAdjustment(
                formula
              );

            monthAnnuityAdjustments.set(
              month,
              adjustment
            );
          }
        }

        months.push({
          year,
          month,
          income,
          expense,
        });
      }
    }

    let originalOpeningCash = 0;

    let originalOpeningAnnuity = 0;

    const firstMonth =
      months[0];

    if (firstMonth) {
      // 2026 从 9 月开始，因此 opening cash / annuity 也必须从 9 月对应的
      // Excel 月块读取；2027–2037 继续使用原来的 1 月起点。
      const firstBlockIndex =
        year === 2026
          ? MONTH_BLOCKS.findIndex((block) =>
              block.months.includes(firstMonth.month)
            )
          : 0;

      const safeFirstBlockIndex =
        firstBlockIndex >= 0
          ? firstBlockIndex
          : 0;

      const firstBlock =
        MONTH_BLOCKS[safeFirstBlockIndex];

      const firstCol =
        MONTH_COLS[firstMonth.month >= 1 && firstMonth.month <= 4
          ? 0
          : firstMonth.month <= 8
          ? 1
          : firstMonth.month <= 12
          ? 2
          : 0];

      const baseRow =
        firstBlock.baseRow;

      const remainingRow =
        baseRow + 17 - 1;

      const totalCashRow =
        baseRow + 18 - 1;

      const annuityRow =
        baseRow + 19 - 1;

      const remainingCell =
        sheet[
          XLSX.utils.encode_cell(
            {
              r: remainingRow,
              c: firstCol.valueCol,
            }
          )
        ];

      const totalCashCell =
        sheet[
          XLSX.utils.encode_cell(
            {
              r: totalCashRow,
              c: firstCol.valueCol,
            }
          )
        ];

      const annuityCell =
        sheet[
          XLSX.utils.encode_cell(
            {
              r: annuityRow,
              c: firstCol.valueCol,
            }
          )
        ];

      const remainingValue =
        numberValue(
          remainingCell?.v
        );

      const totalCashValue =
        numberValue(
          totalCashCell?.v
        );

      const annuityValue =
        numberValue(
          annuityCell?.v
        );

      originalOpeningCash =
        totalCashValue -
        remainingValue;

      const annuityItem =
        firstMonth.expense.find(
          (item) =>
            item.isAnnuityContribution
        );

      const contribution =
        annuityItem?.value ?? 0;

      const adjustment =
        monthAnnuityAdjustments.get(
          1
        ) ?? 0;

      originalOpeningAnnuity =
        annuityValue -
        contribution -
        adjustment;
    }

    if (year === 2026) {
      const september = months.find((m) => m.month === 9);

      diagnostics.janParsedIncome =
        (september?.income ?? []).map((item) => ({
          name: item.name,
          value: item.value,
          sourceRow: (item.sourceRow ?? 0) + 1,
        }));

      diagnostics.janParsedExpense =
        (september?.expense ?? []).map((item) => ({
          name: item.name,
          value: item.value,
          sourceRow: (item.sourceRow ?? 0) + 1,
        }));
    }

    years.push({
      year,
      months,
      originalOpeningCash,
      originalOpeningAnnuity,
    });
  }

  ensurePensionPaymentItems(years, projects);

  return {
    years,
    projects,
    diagnostics,
  };
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

  const [quickSeeded, setQuickSeeded] =
    useState(false);

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
  // NEW.xlsx 项目标准化 / 云端缺失年份补齐
  // ==========================================================
  function normalizeImportedExcelSource(source: ParsedExcel) {
    const importedYears = clone(source.years);
    const importedProjects = clone(source.projects);

    for (const project of importedProjects) {
      if (normalizeName(project.name) === "jj") {
        project.name = "买入基金 015736";
      }
      if (normalizeName(project.name) === "转去养老保险") {
        project.isAnnuityContribution = true;
      }
    }

    for (const year of importedYears) {
      for (const month of year.months) {
        for (const item of [...month.income, ...month.expense]) {
          if (normalizeName(item.name) === "jj") {
            item.name = "买入基金 015736";
          }
          if (normalizeName(item.name) === "转去养老保险") {
            item.isAnnuityContribution = true;
          }
        }
      }
    }

    return { years: importedYears, projects: importedProjects };
  }

  function mergeExcelIntoStoredState(
    storedYears: YearData[],
    storedProjects: Project[],
    source: ParsedExcel
  ) {
    const imported = normalizeImportedExcelSource(source);
    const nextYears = clone(storedYears);
    const nextProjects = clone(storedProjects);
    const existingYears = new Set(nextYears.map((year) => year.year));

    // 云端已有年份保留；NEW.xlsx 负责补齐 2031–2037 等缺失年份。
    for (const excelYear of imported.years) {
      if (excelYear.year < TARGET_START_YEAR || excelYear.year > EXCEL_END_YEAR) continue;
      if (!existingYears.has(excelYear.year)) {
        nextYears.push(excelYear);
      }
    }

    for (const excelProject of imported.projects) {
      const existing = nextProjects.find(
        (project) =>
          project.role === excelProject.role &&
          normalizeName(project.name) === normalizeName(excelProject.name)
      );
      if (existing) {
        if (excelProject.isAnnuityContribution) {
          existing.isAnnuityContribution = true;
        }
      } else {
        nextProjects.push(excelProject);
      }
    }

    return {
      years: sanitizeYears(nextYears),
      projects: nextProjects,
    };
  }

  // ==========================================================
  // 初始化
  // ==========================================================

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        setLoading(true);

        const source =
          await loadExcel();

        if (!mounted) {
          return;
        }

        setExcelDiagnostics(source.diagnostics);

        // Supabase 优先；没有云端数据时兼容旧 localStorage 并自动迁移。
        let cloudLoaded = false;

        try {
          const cloud = await loadCashflowPlanning();

          if (cloud.hasData && cloud.state) {
            const merged = mergeExcelIntoStoredState(
              sanitizeYears(cloud.state.years),
              cloud.state.projects,
              source
            );

            const rebuilt = rebuildProjectLinks(
              merged.years,
              merged.projects
            );

            const withPension = ensurePensionPaymentItems(
              rebuilt.years,
              rebuilt.projects
            );

            if (withPension.years.length > 0) {
              setYears(withPension.years);
              setProjects(withPension.projects);
              localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({ years: withPension.years, projects: withPension.projects })
              );
              setSelectedYear(
                withPension.years.find((x) => x.year === 2026)?.year ??
                  withPension.years[0]?.year ??
                  null
              );

              // 把 NEW.xlsx 补进来的 2031–2037 一并保存到云端。
              try {
                await saveCashflowPlanning({
                  years: withPension.years,
                  projects: withPension.projects,
                } as CashflowState);
              } catch (mergeSaveError) {
                console.warn("NEW.xlsx 新增年份同步到 Supabase 失败：", mergeSaveError);
              }

              cloudLoaded = true;
            }
          }
        } catch (cloudError) {
          console.warn("Supabase 读取失败，暂时使用本地缓存：", cloudError);
        }

        if (cloudLoaded) {
          setLoading(false);
          return;
        }

        const stored = localStorage.getItem(STORAGE_KEY);

        if (stored) {
          try {
            const parsed = JSON.parse(stored);

            if (parsed?.years && parsed?.projects) {
              const storedYears = sanitizeYears(parsed.years);

              if (storedYears.length > 0) {
                const merged = mergeExcelIntoStoredState(
                  storedYears,
                  parsed.projects,
                  source
                );

                const rebuilt = rebuildProjectLinks(
                  merged.years,
                  merged.projects
                );

                const withPension = ensurePensionPaymentItems(
                  rebuilt.years,
                  rebuilt.projects
                );

                setYears(withPension.years);
                setProjects(withPension.projects);
                setSelectedYear(
                  rebuilt.years.find((x) => x.year === 2026)?.year ??
                    rebuilt.years[0]?.year ??
                    null
                );

                try {
                  await saveCashflowPlanning({
                    years: withPension.years,
                    projects: withPension.projects,
                  } as CashflowState);
                } catch (migrationError) {
                  console.warn("旧数据迁移到 Supabase 失败，继续使用 localStorage：", migrationError);
                }

                setLoading(false);
                return;
              }
            }
          } catch {
            localStorage.removeItem(STORAGE_KEY);
          }
        }

        const normalizedSource = normalizeImportedExcelSource(source);

        const withPension = ensurePensionPaymentItems(
          normalizedSource.years,
          normalizedSource.projects
        );

        setYears(
          withPension.years
        );

        setProjects(
          withPension.projects
        );

        setSelectedYear(
          withPension.years[0]
            ?.year ?? null
        );
      } catch (err) {
        console.error(err);

        if (mounted) {
          setError(
            err instanceof Error
              ? err.message
              : "读取现金流模板失败"
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
  // 自动保存：localStorage 缓存 + Supabase 正式数据
  // ==========================================================

  useEffect(() => {
    if (loading || years.length === 0) return;

    const state = { years, projects };

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(state)
    );

    setSaved(true);

    const savedTimer = window.setTimeout(() => {
      setSaved(false);
    }, 1000);

    const saveTimer = window.setTimeout(async () => {
      try {
        await saveCashflowPlanning(state as CashflowState);
      } catch (saveError) {
        console.error(
          "CASHFLOW-PLANNING Supabase 保存失败：",
          saveError
        );
      }
    }, 700);

    return () => {
      window.clearTimeout(savedTimer);
      window.clearTimeout(saveTimer);
    };
  }, [years, projects, loading]);

  // ==========================================================
  // 默认快速填写：按用户当前要求首次自动写入
  // 2026 只有 9-12 月，因此 2026 年只会实际填写可见月份。
  // 后续年份按完整 1-12 月填写。
  // ==========================================================

  useEffect(() => {
    if (loading || years.length === 0 || quickSeeded) return;

    const seedKey =
      "ai-wealth-os-cashflow-quick-seed-v2";

    if (localStorage.getItem(seedKey) === "1") {
      setQuickSeeded(true);
      return;
    }

    const nextYears = clone(years);
    const nextProjects = clone(projects);
    const result = applyQuickEntry(
      nextYears,
      nextProjects,
      DEFAULT_QUICK_ENTRY
    );

    if (result.count > 0) {
      setYears(result.years);
      setProjects(result.projects);
      setQuickEntryMessage(
        "已按你的规则自动填写：报销 1-11 月 4596、12 月 6396；房租 1/4/7/10 月 6000。"
      );
    }

    localStorage.setItem(seedKey, "1");
    setQuickSeeded(true);
  }, [loading, years, projects, quickSeeded]);

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
  // 恢复当前年份
  // ==========================================================

  async function restoreCurrentYear() {
    if (
      selectedYear ==
      null
    ) {
      return;
    }

    const source =
      await loadExcel();

    const original =
      source.years.find(
        (x) =>
          x.year ===
          selectedYear
      );

    if (!original) {
      return;
    }

    const nextYears =
      clone(years);

    const index =
      nextYears.findIndex(
        (x) =>
          x.year ===
          selectedYear
      );

    if (index >= 0) {
      nextYears[index] =
        original;
    }

    const rebuilt =
      rebuildProjectLinks(
        nextYears,
        projects
      );

    setYears(
      rebuilt.years
    );

    setProjects(
      rebuilt.projects
    );

    setAiGenerated(
      false
    );

    setAiText("");
  }

  // ==========================================================
  // 恢复全部
  // ==========================================================

  async function restoreAll() {
    const source =
      await loadExcel();

    setExcelDiagnostics(source.diagnostics);

    setYears(
      source.years
    );

    setProjects(
      source.projects
    );

    localStorage.removeItem(
      STORAGE_KEY
    );

    setAiGenerated(
      false
    );

    setAiText("");
  }

  // ==========================================================
  // 清除保存
  // ==========================================================

  async function clearSaved() {
    try {
      await clearCashflowPlanning();
    } catch (clearError) {
      console.error(
        "清除 Supabase CASHFLOW-PLANNING 失败：",
        clearError
      );
    }

    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  }

  // ==========================================================
  // Loading
  // ==========================================================

  if (loading) {
    return (
      <main className="min-h-screen bg-white p-6">
        <div className="text-sm text-gray-500">
          正在读取现金流模板……
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
                restoreCurrentYear
              }
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
            >
              恢复当前年份
            </button>

            <button
              type="button"
              onClick={
                restoreAll
              }
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
            >
              恢复全部
            </button>

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
            Excel 数据源诊断模式
        ==================================================== */}

        <section className="mb-5 rounded-xl border border-gray-200 bg-white">
          <button
            type="button"
            onClick={() =>
              setShowExcelDiagnostics((value) => !value)
            }
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <div>
              <div className="text-sm font-semibold">
                Excel 数据源诊断
              </div>
              <div className="mt-0.5 text-xs text-gray-500">
                用来确认页面到底读取了哪个 NEW.xlsx、哪个 Sheet，以及 2026 年 1 月原始数据是否正确。
              </div>
            </div>
            <span className="text-xs text-gray-400">
              {showExcelDiagnostics ? "收起" : "展开"}
            </span>
          </button>

          {showExcelDiagnostics && excelDiagnostics && (
            <div className="border-t border-gray-200 px-4 py-4 text-xs">
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="mb-2 font-semibold text-gray-700">
                    ① 实际数据源
                  </div>
                  <div>文件：{EXCEL_FILE}</div>
                  <div>实际 URL：{excelDiagnostics.fetchedUrl}</div>
                  <div>读取时间：{excelDiagnostics.fetchedAt}</div>
                  <div>文件大小：{excelDiagnostics.responseSize.toLocaleString()} bytes</div>
                  <div className="mt-2 font-medium">
                    2026 Sheet：{excelDiagnostics.selectedSheet2026}
                  </div>
                  <div>
                    是否存在：{excelDiagnostics.selectedSheet2026Exists ? "YES" : "NO"}
                  </div>
                  <div>
                    行数：{excelDiagnostics.sheet2026RowCount}　列数：{excelDiagnostics.sheet2026ColumnCount}
                  </div>
                </div>

                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="mb-2 font-semibold text-gray-700">
                    ② 程序实际选择的 Sheet
                  </div>
                  <div className="break-all">
                    {excelDiagnostics.expectedSheetNames.join(" / ")}
                  </div>
                  <div className="mt-2 text-gray-500">
                    规则：2026 必须是 2026每月估算111；2027–2037 必须是 {"{年份}每月估算(3)"}。
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-lg bg-gray-50 p-3">
                <div className="mb-2 font-semibold text-gray-700">
                  ③ 2026 年 9 月 Excel 原始 C / D / E
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-[760px] border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200 text-left">
                        <th className="px-2 py-1">Excel行</th>
                        <th className="px-2 py-1">C 主项目</th>
                        <th className="px-2 py-1">D 说明/收入项目</th>
                        <th className="px-2 py-1">E 金额</th>
                        <th className="px-2 py-1">E公式</th>
                      </tr>
                    </thead>
                    <tbody>
                      {excelDiagnostics.janRows.map((row) => (
                        <tr key={row.excelRow} className="border-b border-gray-100">
                          <td className="px-2 py-1">{row.excelRow}</td>
                          <td className="px-2 py-1 whitespace-pre-wrap">{row.c || "—"}</td>
                          <td className="px-2 py-1 whitespace-pre-wrap">{row.d || "—"}</td>
                          <td className="px-2 py-1 whitespace-pre-wrap">{row.e || "—"}</td>
                          <td className="px-2 py-1 whitespace-pre-wrap text-gray-500">{row.eFormula || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="mb-2 font-semibold text-gray-700">
                    ④ 程序解析后的 2026/9 收入
                  </div>
                  {excelDiagnostics.janParsedIncome.length === 0 ? (
                    <div className="text-red-600">没有解析到收入项目</div>
                  ) : (
                    excelDiagnostics.janParsedIncome.map((item) => (
                      <div key={`${item.sourceRow}-${item.name}`} className="flex justify-between gap-3 border-b border-gray-100 py-1">
                        <span>{item.name} <span className="text-gray-400">(第{item.sourceRow}行)</span></span>
                        <span>{formatMoney(item.value)}</span>
                      </div>
                    ))
                  )}
                </div>

                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="mb-2 font-semibold text-gray-700">
                    ⑤ 程序解析后的 2026/9 支出
                  </div>
                  {excelDiagnostics.janParsedExpense.length === 0 ? (
                    <div className="text-red-600">没有解析到支出项目</div>
                  ) : (
                    excelDiagnostics.janParsedExpense.map((item) => (
                      <div key={`${item.sourceRow}-${item.name}`} className="flex justify-between gap-3 border-b border-gray-100 py-1">
                        <span>{item.name} <span className="text-gray-400">(第{item.sourceRow}行)</span></span>
                        <span>{formatMoney(item.value)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-dashed border-gray-300 bg-white p-3 text-gray-500">
                <b>判断方法：</b>如果这里的“③ Excel 原始 C/D/E”已经是你现在的正确数据，说明 Excel 读取正确，问题在后面的页面状态/计算；如果这里仍然出现旧数据，说明浏览器/Vercel 实际拿到的仍是旧版 NEW.xlsx。
              </div>
            </div>
          )}
        </section>

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

