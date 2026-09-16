"use client";

import {
  useEffect,
  useState,
} from "react";

import TopBar from "@/components/TopBar";

import {
  getLatestAsset,
} from "@/lib/asset";

import {
  getInsuranceSummary,
  getInsuranceCashValueHistory,
} from "@/lib/insurance";

import {
  getAnnualLoanPressure,
  getFinancialFreedomLoanPayment,
  getFinancialFreedomLoans,
} from "@/lib/loan";

import {
  supabase,
} from "@/lib/supabase";


// =====================================================
// 参数
// =====================================================

const FORECAST_BASE_YEAR = 2026;

const END_YEAR = 2042;

const FREEDOM_END_YEAR = 2042;

const RETIREMENT_AGE = 60;

const CURRENT_YEAR = new Date().getFullYear();


// =====================================================
// 备用资产
// =====================================================

const START_ASSET = 1600000;


// =====================================================
// 默认年收入
// =====================================================
//
// 单位：元
//

const ANNUAL_INCOME = 1100000;


// =====================================================
// 默认资产增长率
// =====================================================
//
// 单位：%
//

const DEFAULT_GROWTH_RATE = 5;


// =====================================================
// 年度预测输入类型
// =====================================================
//
// 所有金额：万元
//
// 可编辑：
// income
// expense
// annuity
// hkInvestment
// mainlandInvestment
// growthRate
//
// 自动计算：
// remainingCash
// newAsset
//
// 不再保存 remainingCash。
// =====================================================

type ForecastInput = {
  income: number;
  expense: number;
  annuity: number;
  hkInvestment: number;
  mainlandInvestment: number;
  growthRate: number;
};

type ForecastInputs = Record<number, ForecastInput>;


// =====================================================
// 每年生活费
// =====================================================
//
// 单位：元
//

const BASE_EXPENSE: Record<number, number> = {
  2026: 0,

  2027: 370000,
  2028: 370000,
  2029: 370000,
  2030: 370000,
  2031: 370000,

  2032: 320000,
  2033: 320000,
  2034: 320000,
  2035: 320000,
  2036: 320000,
  2037: 320000,
  2038: 320000,
  2039: 320000,
  2040: 320000,
  2041: 320000,
  2042: 320000,
};


// =====================================================
// 年金支出
// =====================================================
//
// 单位：元
//

const ANNUITY: Record<number, number> = {
  2026: 0,

  2027: 724000,

  2028: 614000,
  2029: 614000,
  2030: 614000,
  2031: 614000,
  2032: 614000,

  2033: 351000,

  2034: 259000,
  2035: 259000,
  2036: 259000,
  2037: 259000,

  2038: 129000,

  2039: 39000,
  2040: 39000,
  2041: 39000,
  2042: 39000,
};


// =====================================================
// 默认年度输入
// =====================================================
//
// 单位：万元
//
// 2026：当前资产基准年
//
// 2027：
// 收入 110
// 生活费 37
// 年金 72.4
// 香港投资 6
// 大陆投资 0
// 剩余现金 -5.4
// 新增资产 0
//
// 其余年份按既定规划。
// =====================================================

const DEFAULT_FORECAST_INPUTS: ForecastInputs = {
  2026: {
    income: 0,
    expense: 0,
    annuity: 0,
    hkInvestment: 0,
    mainlandInvestment: 0,
    growthRate: DEFAULT_GROWTH_RATE,
  },

  2027: {
    income: 110,
    expense: 37,
    annuity: 72.4,
    hkInvestment: 6,
    mainlandInvestment: 0,
    growthRate: DEFAULT_GROWTH_RATE,
  },

  2028: {
    income: 110,
    expense: 37,
    annuity: 61.4,
    hkInvestment: 6,
    mainlandInvestment: 0,
    growthRate: DEFAULT_GROWTH_RATE,
  },

  2029: {
    income: 110,
    expense: 37,
    annuity: 61.4,
    hkInvestment: 6,
    mainlandInvestment: 0,
    growthRate: DEFAULT_GROWTH_RATE,
  },

  2030: {
    income: 110,
    expense: 37,
    annuity: 61.4,
    hkInvestment: 6,
    mainlandInvestment: 0,
    growthRate: DEFAULT_GROWTH_RATE,
  },

  2031: {
    income: 110,
    expense: 37,
    annuity: 61.4,
    hkInvestment: 6,
    mainlandInvestment: 0,
    growthRate: DEFAULT_GROWTH_RATE,
  },

  2032: {
    income: 110,
    expense: 32,
    annuity: 61.4,
    hkInvestment: 6,
    mainlandInvestment: 0,
    growthRate: DEFAULT_GROWTH_RATE,
  },

  2033: {
    income: 110,
    expense: 32,
    annuity: 35.1,
    hkInvestment: 12,
    mainlandInvestment: 0,
    growthRate: DEFAULT_GROWTH_RATE,
  },

  2034: {
    income: 110,
    expense: 32,
    annuity: 25.9,
    hkInvestment: 12,
    mainlandInvestment: 0,
    growthRate: DEFAULT_GROWTH_RATE,
  },

  2035: {
    income: 110,
    expense: 32,
    annuity: 25.9,
    hkInvestment: 12,
    mainlandInvestment: 0,
    growthRate: DEFAULT_GROWTH_RATE,
  },

  2036: {
    income: 110,
    expense: 32,
    annuity: 25.9,
    hkInvestment: 12,
    mainlandInvestment: 0,
    growthRate: DEFAULT_GROWTH_RATE,
  },

  2037: {
    income: 110,
    expense: 32,
    annuity: 25.9,
    hkInvestment: 12,
    mainlandInvestment: 0,
    growthRate: DEFAULT_GROWTH_RATE,
  },

  2038: {
    income: 110,
    expense: 32,
    annuity: 12.9,
    hkInvestment: 12,
    mainlandInvestment: 0,
    growthRate: DEFAULT_GROWTH_RATE,
  },

  2039: {
    income: 110,
    expense: 32,
    annuity: 3.9,
    hkInvestment: 12,
    mainlandInvestment: 0,
    growthRate: DEFAULT_GROWTH_RATE,
  },

  2040: {
    income: 110,
    expense: 32,
    annuity: 3.9,
    hkInvestment: 12,
    mainlandInvestment: 0,
    growthRate: DEFAULT_GROWTH_RATE,
  },

  2041: {
    income: 110,
    expense: 32,
    annuity: 3.9,
    hkInvestment: 12,
    mainlandInvestment: 0,
    growthRate: DEFAULT_GROWTH_RATE,
  },

  2042: {
    income: 110,
    expense: 32,
    annuity: 3.9,
    hkInvestment: 12,
    mainlandInvestment: 0,
    growthRate: DEFAULT_GROWTH_RATE,
  },
};


// =====================================================
// 获取默认输入
// =====================================================

function getDefaultForecastInput(
  year: number
): ForecastInput {

  return (
    DEFAULT_FORECAST_INPUTS[year] ?? {
      income:
        ANNUAL_INCOME / 10000,

      expense:
        Number(
          BASE_EXPENSE[year] || 0
        ) / 10000,

      annuity:
        Number(
          ANNUITY[year] || 0
        ) / 10000,

      hkInvestment: 0,

      mainlandInvestment: 0,

      growthRate:
        DEFAULT_GROWTH_RATE,
    }
  );
}


// =====================================================
// 初始输入
// =====================================================

function getInitialForecastInputs(): ForecastInputs {

  const result: ForecastInputs = {};

  for (
    let year = FORECAST_BASE_YEAR;
    year <= END_YEAR;
    year++
  ) {

    result[year] = {
      ...getDefaultForecastInput(year),
    };

  }

  return result;
}


// =====================================================
// 自动计算：当年剩余现金
// =====================================================
//
// 当年剩余现金
// = 当年收入
// - 当年年金支出
// - 香港投资
// - 大陆投资
// - 当年生活费
//

function getAnnualRemainingCash(
  input: ForecastInput
): number {

  return (
    Number(input.income || 0)
    -
    Number(input.annuity || 0)
    -
    Number(input.hkInvestment || 0)
    -
    Number(input.mainlandInvestment || 0)
    -
    Number(input.expense || 0)
  );
}


// =====================================================
// 自动计算：每年新增资产
// =====================================================
//
// 每年新增资产
// = 香港投资
// + 大陆投资
// + 当年剩余现金
//
// 代数上等于：
// 当年收入 - 年金支出 - 生活费
//
// 香港投资 / 大陆投资只是现金流的资产配置。
// =====================================================

function getAnnualNewAsset(
  input: ForecastInput
): number {

  return (
    Number(input.hkInvestment || 0)
    +
    Number(input.mainlandInvestment || 0)
    +
    getAnnualRemainingCash(input)
  );
}


// =====================================================
// 财务自由目标
// =====================================================
//
// 从指定年份开始一直加到 2042。
// 只计算生活费。
// 不加入年金。
// 不加入投资。
// 不加入贷款压力。
// =====================================================

function getFinancialFreedomTarget(
  year: number,
  inputs?: ForecastInputs
): number {

  let target = 0;

  for (
    let y = year;
    y <= FREEDOM_END_YEAR;
    y++
  ) {

    const expense =
      inputs?.[y]?.expense ??
      getDefaultForecastInput(y).expense;

    target +=
      Number(expense || 0) *
      10000;

  }

  return target;
}


// =====================================================
// 页面
// =====================================================

export default function FinancialFreedomPage() {


  // ===================================================
  // 当前家庭净资产
  // ===================================================

  const [
    currentFamilyAsset,
    setCurrentFamilyAsset,
  ] = useState(0);


  // ===================================================
  // Dashboard Total Wealth
  // ===================================================

  const [
    dashboardTotalWealth,
    setDashboardTotalWealth,
  ] = useState(0);


  // ===================================================
  // 固收资产
  // ===================================================

  const [
    fixedIncomeTotal,
    setFixedIncomeTotal,
  ] = useState(0);


  // ===================================================
  // Financial Freedom 贷款
  // ===================================================

  const [
    financialFreedomLoan,
    setFinancialFreedomLoan,
  ] = useState(0);


  // ===================================================
  // 保险
  // ===================================================

  const [
    insurance,
    setInsurance,
  ] = useState<any>(null);


  const [
    insuranceHistory,
    setInsuranceHistory,
  ] = useState<any[]>([]);


  // ===================================================
  // 贷款年度模型
  // ===================================================

  const [
    loanPressure,
    setLoanPressure,
  ] = useState<
    Record<
      number,
      {
        payment: number;
        pressure: number;
      }
    >
  >({});


  // ===================================================
  // 年度预测结果
  // ===================================================

  const [
    rows,
    setRows,
  ] = useState<any[]>([]);


  // ===================================================
  // Loading
  // ===================================================

  const [
    loading,
    setLoading,
  ] = useState(true);


  // ===================================================
  // 年度预测输入
  // ===================================================

  const [
    forecastInputs,
    setForecastInputs,
  ] = useState<ForecastInputs>(
    getInitialForecastInputs()
  );


  // ===================================================
  // 是否已经从 Supabase 恢复
  // ===================================================

  const [
    forecastInputsLoaded,
    setForecastInputsLoaded,
  ] = useState(false);


  // ===================================================
  // 数据加载
  // ===================================================

  useEffect(() => {

    async function load() {

      try {

        setLoading(true);


        // =================================================
        // 1. 获取 Dashboard 最新资产
        // =================================================

        const latest =
          await getLatestAsset();

        const originalAsset =
          Number(
            latest?.total_asset
          ) ||
          START_ASSET;


        // =================================================
        // 2. 获取固收资产
        // =================================================

        const {
          data: fixedIncomeData,
          error: fixedIncomeError,
        } =
          await supabase
            .from(
              "fixed_income_assets"
            )
            .select(
              "amount"
            );


        if (
          fixedIncomeError
        ) {

          console.error(
            "Financial Freedom fixed income loading error:",
            fixedIncomeError
          );

        }


        // =================================================
        // 3. 固收合计
        // =================================================

        const fixedIncomeSum =
          (
            Array.isArray(
              fixedIncomeData
            )
              ? fixedIncomeData
              : []
          )
            .reduce(
              (
                sum: number,
                item: any
              ) => {

                const amount =
                  Number(
                    item?.amount ?? 0
                  );

                return (
                  sum +
                  (
                    Number.isFinite(
                      amount
                    )
                      ? amount
                      : 0
                  )
                );

              },
              0
            );


        // =================================================
        // 4. Dashboard Total Wealth
        // =================================================

        const totalWealth =
          originalAsset +
          fixedIncomeSum;


        setDashboardTotalWealth(
          totalWealth
        );


        setFixedIncomeTotal(
          fixedIncomeSum
        );


        // =================================================
        // 5. Financial Freedom 贷款
        // =================================================

        const ffLoans =
          await getFinancialFreedomLoans();


        const loanBalance =
          (
            Array.isArray(
              ffLoans
            )
              ? ffLoans
              : []
          )
            .reduce(
              (
                sum: number,
                loan: any
              ) => {

                const remaining =
                  Number(
                    loan?.remaining_amount ??
                    loan?.balance ??
                    loan?.amount ??
                    0
                  );

                return (
                  sum +
                  (
                    Number.isFinite(
                      remaining
                    )
                      ? remaining
                      : 0
                  )
                );

              },
              0
            );


        setFinancialFreedomLoan(
          loanBalance
        );


        // =================================================
        // 6. 当前家庭净资产
        // =================================================

        const netAsset =
          totalWealth -
          loanBalance;


        setCurrentFamilyAsset(
          netAsset
        );


        // =================================================
        // 7. 从 Supabase 恢复年度预测输入
        // =================================================

        const {
          data: savedForecastHistory,
          error: savedForecastHistoryError,
        } =
          await supabase
            .from(
              "financial_freedom_history"
            )
            .select(
              "snapshot_date, forecast_inputs"
            )
            .not(
              "forecast_inputs",
              "is",
              null
            )
            .order(
              "snapshot_date",
              {
                ascending: false,
              }
            )
            .limit(1);


        if (
          savedForecastHistoryError
        ) {

          console.error(
            "Financial Freedom forecast inputs loading error:",
            savedForecastHistoryError
          );

        }


        // =================================================
        // 无论新旧数据，都先建立完整默认结构
        // =================================================

        const restored =
          getInitialForecastInputs();


        const saved =
          savedForecastHistory?.[0]
            ?.forecast_inputs;


        // =================================================
        // 兼容旧数据
        // =================================================
        //
        // 旧数据可能只有：
        // expense
        // growthRate
        // hkInvestment
        // remainingCash
        //
        // 新数据需要：
        // income
        // expense
        // annuity
        // hkInvestment
        // mainlandInvestment
        // growthRate
        //
        // remainingCash 不再读取。
        // =================================================

        if (
          saved &&
          typeof saved === "object" &&
          !Array.isArray(saved)
        ) {

          for (
            let year = FORECAST_BASE_YEAR;
            year <= END_YEAR;
            year++
          ) {

            const savedInput =
              (
                saved as Record<
                  string,
                  any
                >
              )[
                String(year)
              ];


            if (
              savedInput &&
              typeof savedInput === "object"
            ) {

              restored[year] = {

                ...restored[year],

                income:
                  Number.isFinite(
                    Number(
                      savedInput.income
                    )
                  )
                    ? Number(
                        savedInput.income
                      )
                    : restored[year].income,

                expense:
                  Number.isFinite(
                    Number(
                      savedInput.expense
                    )
                  )
                    ? Number(
                        savedInput.expense
                      )
                    : restored[year].expense,

                annuity:
                  Number.isFinite(
                    Number(
                      savedInput.annuity
                    )
                  )
                    ? Number(
                        savedInput.annuity
                      )
                    : restored[year].annuity,

                hkInvestment:
                  Number.isFinite(
                    Number(
                      savedInput.hkInvestment
                    )
                  )
                    ? Number(
                        savedInput.hkInvestment
                      )
                    : restored[year].hkInvestment,

                mainlandInvestment:
                  Number.isFinite(
                    Number(
                      savedInput.mainlandInvestment
                    )
                  )
                    ? Number(
                        savedInput.mainlandInvestment
                      )
                    : restored[year].mainlandInvestment,

                growthRate:
                  Number.isFinite(
                    Number(
                      savedInput.growthRate
                    )
                  )
                    ? Number(
                        savedInput.growthRate
                      )
                    : restored[year].growthRate,

              };

            }

          }

        }


        setForecastInputs(
          restored
        );


        // =================================================
        // localStorage 同步为新结构
        // =================================================

        try {

          window.localStorage.setItem(
            "financial_freedom_forecast_inputs_v1",
            JSON.stringify(
              restored
            )
          );

        }
        catch (
          localStorageError
        ) {

          console.warn(
            "Financial Freedom local forecast inputs initial save failed:",
            localStorageError
          );

        }


        setForecastInputsLoaded(
          true
        );


        // =================================================
        // 8. 保险
        // =================================================

        const ins =
          await getInsuranceSummary();

        setInsurance(
          ins
        );


        // =================================================
        // 9. 保险现金价值历史
        // =================================================

        const cashHistory =
          await getInsuranceCashValueHistory();

        setInsuranceHistory(
          Array.isArray(
            cashHistory
          )
            ? cashHistory
            : []
        );


        // =================================================
        // 10. 年度贷款模型
        // =================================================

        const loans:
          Record<
            number,
            {
              payment: number;
              pressure: number;
            }
          > = {};


        for (
          let year = FORECAST_BASE_YEAR;
          year <= END_YEAR;
          year++
        ) {

          const payment =
            await getFinancialFreedomLoanPayment(
              year
            );

          const pressure =
            await getAnnualLoanPressure(
              year
            );


          loans[year] = {

            payment:
              Number(
                payment || 0
              ),

            pressure:
              Number(
                pressure || 0
              ),

          };

        }


        setLoanPressure(
          loans
        );


      }
      catch (
        error
      ) {

        console.error(
          "Financial Freedom loading error:",
          error
        );

      }
      finally {

        setLoading(
          false
        );

      }

    }


    void load();

  }, []);


  // =====================================================
  // 保存年度预测输入
  // =====================================================

  useEffect(() => {

    if (
      !forecastInputsLoaded
    ) {

      return;

    }


    const saveForecastInputs =
      async () => {

        const currentYearForTarget =
          Math.max(
            FORECAST_BASE_YEAR,
            Math.min(
              CURRENT_YEAR,
              END_YEAR
            )
          );


        const freedomTarget =
          getFinancialFreedomTarget(
            currentYearForTarget,
            forecastInputs
          );


        const freedomGap =
          Math.max(
            0,
            freedomTarget -
            currentFamilyAsset
          );


        const freedomRate =
          freedomTarget > 0
            ? (
                currentFamilyAsset /
                freedomTarget
              ) *
              100
            : 0;


        const today =
          new Date()
            .toISOString()
            .split("T")[0];


        const {
          error: historyError,
        } =
          await supabase
            .from(
              "financial_freedom_history"
            )
            .upsert(
              {
                snapshot_date:
                  today,

                total_asset:
                  currentFamilyAsset,

                freedom_target:
                  freedomTarget,

                freedom_gap:
                  freedomGap,

                freedom_rate:
                  freedomRate,

                forecast_inputs:
                  forecastInputs,
              },
              {
                onConflict:
                  "snapshot_date",
              }
            );


        if (
          historyError
        ) {

          console.error(
            "Financial Freedom history save error:",
            {
              message:
                historyError.message,

              details:
                historyError.details,

              hint:
                historyError.hint,

              code:
                historyError.code,
            }
          );

        }
        else {

          try {

            window.localStorage.setItem(
              "financial_freedom_forecast_inputs_v1",
              JSON.stringify(
                forecastInputs
              )
            );

          }
          catch (
            localStorageError
          ) {

            console.warn(
              "Financial Freedom local forecast inputs save failed:",
              localStorageError
            );

          }

        }

      };


    void saveForecastInputs();

  }, [
    forecastInputs,
    forecastInputsLoaded,
    currentFamilyAsset,
  ]);


  // =====================================================
  // 年度资产预测
  // =====================================================

  useEffect(() => {

    const calculationStartYear =
      Math.max(
        FORECAST_BASE_YEAR,
        Math.min(
          CURRENT_YEAR,
          END_YEAR
        )
      );


    let previousAsset =
      currentFamilyAsset;


    const result: any[] = [];


    for (
      let year = calculationStartYear;
      year <= END_YEAR;
      year++
    ) {

      const input =
        forecastInputs[year] ??
        getDefaultForecastInput(
          year
        );


      const income =
        Number(
          input.income || 0
        );


      const expense =
        Number(
          input.expense || 0
        );


      const annuity =
        Number(
          input.annuity || 0
        );


      const growthRate =
        Number(
          input.growthRate || 0
        );


      const hkInvestment =
        Number(
          input.hkInvestment || 0
        );


      const mainlandInvestment =
        Number(
          input.mainlandInvestment || 0
        );


      // =================================================
      // 自动计算
      // =================================================

      const remainingCash =
        getAnnualRemainingCash(
          input
        );


      const newAsset =
        getAnnualNewAsset(
          input
        );


      // =================================================
      // 2026 当前资产基准
      // =================================================

      const isCurrentBaseYear =
        year ===
        FORECAST_BASE_YEAR &&
        calculationStartYear ===
        FORECAST_BASE_YEAR;


      const beginningAsset =
        previousAsset;


      let currentAsset =
        currentFamilyAsset;


      let investmentReturn =
        0;


      if (
        !isCurrentBaseYear
      ) {

        investmentReturn =
          beginningAsset *
          growthRate /
          100;


        currentAsset =
          beginningAsset *
          (
            1 +
            growthRate /
            100
          )
          +
          newAsset *
          10000;

      }


      previousAsset =
        currentAsset;


      // =================================================
      // 财务自由目标
      // =================================================

      const freedomTarget =
        getFinancialFreedomTarget(
          year,
          forecastInputs
        );


      const freedomGap =
        Math.max(
          0,
          freedomTarget -
          currentAsset
        );


      const remainingYears =
        END_YEAR -
        year +
        1;


      result.push({

        year,

        remainingYears,

        asset:
          currentAsset,

        income:
          income *
          10000,

        expense:
          expense *
          10000,

        annuity:
          annuity *
          10000,

        loan:
          Number(
            loanPressure[
              year
            ]?.pressure || 0
          ),

        investmentReturn,

        cashFlow:
          newAsset *
          10000,

        growthRate,

        hkInvestment,

        mainlandInvestment,

        remainingCash,

        newAsset,

        freedomTarget,

        freedomGap,

        isBaseYear:
          isCurrentBaseYear,

      });

    }


    setRows(
      result
    );

  }, [
    currentFamilyAsset,
    forecastInputs,
    loanPressure,
  ]);


  // =====================================================
  // 金额格式
  // =====================================================

  function money(
    num: number
  ) {

    const value =
      Number(
        num || 0
      );


    return (
      "¥ " +
      value.toLocaleString(
        "zh-CN",
        {
          maximumFractionDigits: 0,
        }
      )
    );

  }


  // =====================================================
  // 万元格式
  // =====================================================

  function wan(
    num: number
  ) {

    return Number(
      num || 0
    ).toLocaleString(
      "zh-CN",
      {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }
    );

  }


  // =====================================================
  // 更新年度输入
  // =====================================================

  function updateForecastInput(
    year: number,
    field: keyof ForecastInput,
    value: number
  ) {

    setForecastInputs(
      (
        prev
      ) => ({

        ...prev,

        [year]: {

          ...(
            prev[year] ??
            getDefaultForecastInput(
              year
            )
          ),

          [field]:
            Number.isFinite(
              value
            )
              ? value
              : 0,

        },

      })
    );

  }


  // =====================================================
  // 当前财务自由目标
  // =====================================================

  const currentForecastStartYear =
    Math.max(
      FORECAST_BASE_YEAR,
      Math.min(
        CURRENT_YEAR,
        END_YEAR
      )
    );


  const currentFreedomTarget =
    getFinancialFreedomTarget(
      currentForecastStartYear,
      forecastInputs
    );


  // =====================================================
  // 当前财务自由差额
  // =====================================================

  const currentFreedomGap =
    Math.max(
      0,
      currentFreedomTarget -
      currentFamilyAsset
    );


  // =====================================================
  // 保险数据
  // =====================================================

  const totalUnpaidPremium =
    Number(
      insurance?.unpaidPremium ??
      insurance?.unpaid_premium ??
      insurance?.remainingPremium ??
      insurance?.remaining_premium ??
      insurance?.totalUnpaidPremium ??
      insurance?.total_unpaid_premium ??
      0
    );


  const totalPremium =
    Number(
      insurance?.premiumTotal ??
      insurance?.premium_total ??
      insurance?.totalPremium ??
      insurance?.total_premium ??
      0
    );


  const paidPremium =
    Number(
      insurance?.paidPremium ??
      insurance?.paid_premium ??
      0
    );


  const insuranceCashValue =
    Number(
      insurance?.cashValue ??
      insurance?.cash_value ??
      0
    );


  const sonCashValue =
    Number(
      insurance?.sonCashValue ??
      insurance?.son_cash_value ??
      0
    );


  const insuranceCount =
    Number(
      insurance?.count ??
      insurance?.policyCount ??
      insurance?.policy_count ??
      0
    );


  // =====================================================
  // 天天向上1
  // =====================================================

  const tiantianUp1 =
    currentFreedomGap +
    totalUnpaidPremium;


  // =====================================================
  // 页面
  // =====================================================

  return (

    <>

      <TopBar
        title="Financial Freedom"
      />


      <main
        className="
          w-full
          max-w-[1600px]
          mx-auto
          px-6
          py-8
          space-y-8
        "
      >


        {/* =================================================
            页面标题
            ================================================= */}

        <div>

          <h1
            className="
              text-3xl
              font-bold
              text-gray-900
            "
          >

            🚀 Financial Freedom

          </h1>


          <p
            className="
              mt-2
              text-gray-500
            "
          >

            财务自由进度、家庭净资产与 2042 年退休规划

          </p>

        </div>


        {/* =================================================
            顶部核心指标
            ================================================= */}

        <section
          className="
            grid
            grid-cols-1
            md:grid-cols-2
            xl:grid-cols-3
            gap-6
          "
        >

          <div
            className="
              bg-white
              border
              border-gray-100
              rounded-2xl
              p-6
              shadow-sm
            "
          >

            <div
              className="
                text-gray-500
                text-sm
              "
            >

              当前家庭净资产

            </div>


            <div
              className="
                text-3xl
                font-bold
                mt-3
                text-gray-900
              "
            >

              {
                money(
                  currentFamilyAsset
                )
              }

            </div>


            <div
              className="
                text-xs
                text-gray-400
                mt-2
              "
            >

              Dashboard Total Wealth − Financial Freedom贷款

            </div>

          </div>


          <div
            className="
              bg-white
              border
              border-gray-100
              rounded-2xl
              p-6
              shadow-sm
            "
          >

            <div
              className="
                text-gray-500
                text-sm
              "
            >

              当前财务自由目标

            </div>


            <div
              className="
                text-3xl
                font-bold
                mt-3
                text-blue-700
              "
            >

              {
                money(
                  currentFreedomTarget
                )
              }

            </div>


            <div
              className="
                text-xs
                text-gray-400
                mt-2
              "
            >

              {currentForecastStartYear}–{END_YEAR} 剩余生活费总和

            </div>

          </div>


          <div
            className="
              bg-white
              border
              border-gray-100
              rounded-2xl
              p-6
              shadow-sm
            "
          >

            <div
              className="
                text-gray-500
                text-sm
              "
            >

              当前财务自由差额

            </div>


            <div
              className={`
                text-3xl
                font-bold
                mt-3
                ${
                  currentFreedomGap > 0
                    ? "text-orange-600"
                    : "text-green-600"
                }
              `}
            >

              {
                currentFreedomGap > 0
                  ? money(
                      currentFreedomGap
                    )
                  : "已达成"
              }

            </div>


            <div
              className="
                text-xs
                text-gray-400
                mt-2
              "
            >

              当前财务自由目标 − 当前家庭净资产

            </div>

          </div>

        </section>


        {/* =================================================
            当前财务自由计算
            ================================================= */}

        <section
          className="
            bg-white
            border
            border-gray-100
            rounded-2xl
            p-6
            shadow-sm
          "
        >

          <h2
            className="
              text-lg
              font-bold
              text-gray-900
            "
          >

            🎯 当前财务自由计算

          </h2>


          <div
            className="
              mt-5
              grid
              grid-cols-1
              md:grid-cols-3
              gap-4
            "
          >

            <div
              className="
                rounded-xl
                bg-green-50
                p-5
              "
            >

              <div
                className="
                  text-sm
                  text-gray-500
                "
              >

                当前家庭净资产

              </div>


              <div
                className="
                  text-2xl
                  font-bold
                  mt-2
                  text-green-700
                "
              >

                {
                  money(
                    currentFamilyAsset
                  )
                }

              </div>

            </div>


            <div
              className="
                rounded-xl
                bg-blue-50
                p-5
              "
            >

              <div
                className="
                  text-sm
                  text-gray-500
                "
              >

                当前财务自由目标

              </div>


              <div
                className="
                  text-2xl
                  font-bold
                  mt-2
                  text-blue-800
                "
              >

                {
                  money(
                    currentFreedomTarget
                  )
                }

              </div>


              <div
                className="
                  text-xs
                  text-gray-400
                  mt-2
                "
              >

                {currentForecastStartYear}–{END_YEAR} 所有未来生活费

              </div>

            </div>


            <div
              className="
                rounded-xl
                bg-orange-50
                p-5
              "
            >

              <div
                className="
                  text-sm
                  text-gray-500
                "
              >

                当前财务自由差额

              </div>


              <div
                className="
                  text-2xl
                  font-bold
                  mt-2
                  text-orange-700
                "
              >

                {
                  currentFreedomGap > 0
                    ? money(
                        currentFreedomGap
                      )
                    : "已达成"
                }

              </div>


              <div
                className="
                  text-xs
                  text-gray-400
                  mt-2
                "
              >

                目标 − 当前净资产

              </div>

            </div>

          </div>


          <div
            className="
              mt-5
              rounded-xl
              bg-blue-50
              border
              border-blue-100
              p-5
              text-sm
              text-blue-800
              leading-7
            "
          >

            <p>
              <b>当前财务自由目标：</b>
            </p>

            <p>
              {currentForecastStartYear}–{END_YEAR} 每年的预计生活费全部加总。
            </p>

            <p>
              当前财务自由目标 =
              {currentForecastStartYear} 生活费 + …… + 2042 生活费
            </p>

            <p>
              当前财务自由差额 =
              max(当前财务自由目标 − 当前家庭净资产, 0)
            </p>

            <p>
              随着时间进入下一年，剩余生活费减少，所以财务自由目标也会逐年下降。
            </p>

          </div>

        </section>


        {/* =================================================
            ★ 年度资产预测
            ================================================= */}

        <section
          className="
            w-full
            bg-white
            border
            border-gray-100
            rounded-2xl
            p-6
            shadow-sm
          "
        >

          <div
            className="
              mb-5
            "
          >

            <h2
              className="
                text-xl
                font-bold
                text-gray-900
              "
            >

              📊 年度资产预测

            </h2>


            <p
              className="
                text-sm
                text-gray-400
                mt-2
              "
            >

              页面只显示当前年份及以后；修改任意可编辑输入后，后续年份会自动重新计算。

            </p>

          </div>


          {/* =================================================
              公式说明
              ================================================= */}

          <div
            className="
              mb-5
              rounded-xl
              bg-blue-50
              border
              border-blue-100
              p-5
              text-sm
              text-blue-800
              leading-7
            "
          >

            <p>
              <b>📐 资产预测公式：</b>
            </p>

            <p>
              当年剩余现金 =
              当年收入 − 当年年金支出 − 香港投资 − 大陆投资 − 当年生活费
            </p>

            <p>
              每年新增资产 =
              香港投资 + 大陆投资 + 当年剩余现金
            </p>

            <p>
              当年预计资产(年末) =
              去年预计资产(年末) × (1 + 资产增长率)
              + 每年新增资产 × 10000
            </p>

            <p>
              所有金额单位均为“万元”，资产增长率单位为“%”。
            </p>

            <p>
              <b>
                当年剩余现金、每年新增资产均为自动计算，不可手动修改。
              </b>
            </p>

            <p>
              香港投资和大陆投资属于当年现金流中的资产配置，不是额外增加的钱。
            </p>

          </div>


          {/* =================================================
              年度表
              ================================================= */}

          <div
            className="
              w-full
            "
          >

            <table
              className="
                w-full
                table-fixed
                border-collapse
                text-sm
                leading-tight
              "
            >

              <colgroup>

                <col style={{ width: "6%" }} />

                <col style={{ width: "8%" }} />

                <col style={{ width: "8%" }} />

                <col style={{ width: "8%" }} />

                <col style={{ width: "8%" }} />

                <col style={{ width: "8%" }} />

                <col style={{ width: "8%" }} />

                <col style={{ width: "8%" }} />

                <col style={{ width: "7%" }} />

                <col style={{ width: "10.5%" }} />

                <col style={{ width: "10.5%" }} />

                <col style={{ width: "10.5%" }} />

              </colgroup>


              <thead>

                <tr
                  className="
                    border-b
                    border-gray-200
                    bg-gray-50
                    text-gray-600
                  "
                >

                  {/* 年份 */}

                  <th
                    className="
                      px-2
                      py-3
                      text-center
                      text-sm
                      font-bold
                      whitespace-normal
                    "
                  >
                    年份
                  </th>


                  {/* 当年收入 */}

                  <th
                    className="
                      px-2
                      py-3
                      text-center
                      text-sm
                      font-bold
                      whitespace-normal
                    "
                  >
                    当年收入
                    <br />
                    <span className="text-xs font-medium">
                      (万元)
                    </span>
                  </th>


                  {/* 当年生活费 */}

                  <th
                    className="
                      px-2
                      py-3
                      text-center
                      text-sm
                      font-bold
                      whitespace-normal
                    "
                  >
                    当年生活费
                    <br />
                    <span className="text-xs font-medium">
                      (万元)
                    </span>
                  </th>


                  {/* 当年年金支出 */}

                  <th
                    className="
                      px-2
                      py-3
                      text-center
                      text-sm
                      font-bold
                      whitespace-normal
                    "
                  >
                    当年年金支出
                    <br />
                    <span className="text-xs font-medium">
                      (万元)
                    </span>
                  </th>


                  {/* 香港投资 */}

                  <th
                    className="
                      px-2
                      py-3
                      text-center
                      text-sm
                      font-bold
                      whitespace-normal
                    "
                  >
                    香港投资
                    <br />
                    <span className="text-xs font-medium">
                      (万元)
                    </span>
                  </th>


                  {/* 大陆投资 */}

                  <th
                    className="
                      px-2
                      py-3
                      text-center
                      text-sm
                      font-bold
                      whitespace-normal
                    "
                  >
                    大陆投资
                    <br />
                    <span className="text-xs font-medium">
                      (万元)
                    </span>
                  </th>


                  {/* 当年剩余现金 */}

                  <th
                    className="
                      px-2
                      py-3
                      text-center
                      text-sm
                      font-bold
                      whitespace-normal
                    "
                  >
                    当年剩余现金
                    <br />
                    <span className="text-xs font-medium">
                      (万元)
                    </span>
                  </th>


                  {/* 每年新增资产 */}

                  <th
                    className="
                      px-2
                      py-3
                      text-center
                      text-sm
                      font-bold
                      whitespace-normal
                    "
                  >
                    每年新增资产
                    <br />
                    <span className="text-xs font-medium">
                      (万元)
                    </span>
                  </th>


                  {/* 资产增长率 */}

                  <th
                    className="
                      px-2
                      py-3
                      text-center
                      text-sm
                      font-bold
                      whitespace-normal
                    "
                  >
                    资产增长率
                    <br />
                    <span className="text-xs font-medium">
                      (%)
                    </span>
                  </th>


                  {/* 年末预计资产 */}

                  <th
                    className="
                      px-2
                      py-3
                      text-center
                      text-sm
                      font-bold
                      whitespace-normal
                    "
                  >
                    年末预计资产
                  </th>


                  {/* 财务自由目标 */}

                  <th
                    className="
                      px-2
                      py-3
                      text-center
                      text-sm
                      font-bold
                      whitespace-normal
                    "
                  >
                    财务自由目标
                  </th>


                  {/* 财务自由差额 */}

                  <th
                    className="
                      px-2
                      py-3
                      text-center
                      text-sm
                      font-bold
                      whitespace-normal
                    "
                  >
                    财务自由差额
                  </th>

                </tr>

              </thead>


              <tbody>

                {
                  rows.map(
                    (
                      row: any
                    ) => {

                      const year =
                        Number(
                          row.year
                        );


                      const input =
                        forecastInputs[
                          year
                        ] ??
                        getDefaultForecastInput(
                          year
                        );


                      const remainingCash =
                        getAnnualRemainingCash(
                          input
                        );


                      const newAsset =
                        getAnnualNewAsset(
                          input
                        );


                      return (

                        <tr
                          key={
                            year
                          }
                          className="
                            border-b
                            border-gray-100
                            hover:bg-gray-50
                          "
                        >

                          {/* =================================================
                              年份
                              ================================================= */}

                          <td
                            className="
                              px-2
                              py-4
                              text-center
                              text-sm
                              font-bold
                              text-gray-800
                              align-middle
                            "
                          >

                            <div>
                              {year}
                            </div>


                            {
                              row.isBaseYear
                                ? (
                                  <div
                                    className="
                                      mt-1
                                      text-xs
                                      font-normal
                                      text-gray-400
                                      whitespace-normal
                                    "
                                  >
                                    当前资产基准
                                  </div>
                                )
                                : null
                            }

                          </td>


                          {/* =================================================
                              当年收入
                              ================================================= */}

                          <td
                            className="
                              px-2
                              py-3
                              align-middle
                            "
                          >

                            <input
                              type="number"
                              step="0.1"
                              value={
                                input.income
                              }
                              onChange={
                                (
                                  e
                                ) =>
                                  updateForecastInput(
                                    year,
                                    "income",
                                    Number(
                                      e.target.value
                                    )
                                  )
                              }
                              className="
                                w-full
                                min-w-0
                                rounded-lg
                                border
                                border-gray-200
                                bg-white
                                px-2
                                py-2.5
                                text-right
                                text-sm
                                font-medium
                                text-gray-800
                                outline-none
                                focus:border-blue-400
                                focus:ring-2
                                focus:ring-blue-100
                              "
                            />

                          </td>


                          {/* =================================================
                              当年生活费
                              ================================================= */}

                          <td
                            className="
                              px-2
                              py-3
                              align-middle
                            "
                          >

                            <input
                              type="number"
                              step="0.1"
                              value={
                                input.expense
                              }
                              onChange={
                                (
                                  e
                                ) =>
                                  updateForecastInput(
                                    year,
                                    "expense",
                                    Number(
                                      e.target.value
                                    )
                                  )
                              }
                              className="
                                w-full
                                min-w-0
                                rounded-lg
                                border
                                border-gray-200
                                bg-white
                                px-2
                                py-2.5
                                text-right
                                text-sm
                                font-medium
                                text-gray-800
                                outline-none
                                focus:border-blue-400
                                focus:ring-2
                                focus:ring-blue-100
                              "
                            />

                          </td>


                          {/* =================================================
                              当年年金支出
                              ================================================= */}

                          <td
                            className="
                              px-2
                              py-3
                              align-middle
                            "
                          >

                            <input
                              type="number"
                              step="0.1"
                              value={
                                input.annuity
                              }
                              onChange={
                                (
                                  e
                                ) =>
                                  updateForecastInput(
                                    year,
                                    "annuity",
                                    Number(
                                      e.target.value
                                    )
                                  )
                              }
                              className="
                                w-full
                                min-w-0
                                rounded-lg
                                border
                                border-gray-200
                                bg-white
                                px-2
                                py-2.5
                                text-right
                                text-sm
                                font-medium
                                text-gray-800
                                outline-none
                                focus:border-blue-400
                                focus:ring-2
                                focus:ring-blue-100
                              "
                            />

                          </td>


                          {/* =================================================
                              香港投资
                              ================================================= */}

                          <td
                            className="
                              px-2
                              py-3
                              align-middle
                            "
                          >

                            <input
                              type="number"
                              step="0.1"
                              value={
                                input.hkInvestment
                              }
                              onChange={
                                (
                                  e
                                ) =>
                                  updateForecastInput(
                                    year,
                                    "hkInvestment",
                                    Number(
                                      e.target.value
                                    )
                                  )
                              }
                              className="
                                w-full
                                min-w-0
                                rounded-lg
                                border
                                border-gray-200
                                bg-white
                                px-2
                                py-2.5
                                text-right
                                text-sm
                                font-medium
                                text-gray-800
                                outline-none
                                focus:border-blue-400
                                focus:ring-2
                                focus:ring-blue-100
                              "
                            />

                          </td>


                          {/* =================================================
                              大陆投资
                              ================================================= */}

                          <td
                            className="
                              px-2
                              py-3
                              align-middle
                            "
                          >

                            <input
                              type="number"
                              step="0.1"
                              value={
                                input.mainlandInvestment
                              }
                              onChange={
                                (
                                  e
                                ) =>
                                  updateForecastInput(
                                    year,
                                    "mainlandInvestment",
                                    Number(
                                      e.target.value
                                    )
                                  )
                              }
                              className="
                                w-full
                                min-w-0
                                rounded-lg
                                border
                                border-gray-200
                                bg-white
                                px-2
                                py-2.5
                                text-right
                                text-sm
                                font-medium
                                text-gray-800
                                outline-none
                                focus:border-blue-400
                                focus:ring-2
                                focus:ring-blue-100
                              "
                            />

                          </td>


                          {/* =================================================
                              当年剩余现金
                              自动
                              ================================================= */}

                          <td
                            className={`
                              px-2
                              py-4
                              text-right
                              text-sm
                              font-semibold
                              align-middle
                              ${
                                remainingCash >= 0
                                  ? "text-green-700"
                                  : "text-red-600"
                              }
                            `}
                          >

                            {wan(
                              remainingCash
                            )}

                          </td>


                          {/* =================================================
                              每年新增资产
                              自动
                              ================================================= */}

                          <td
                            className={`
                              px-2
                              py-4
                              text-right
                              text-sm
                              font-bold
                              align-middle
                              ${
                                newAsset >= 0
                                  ? "text-green-700"
                                  : "text-red-600"
                              }
                            `}
                          >

                            {wan(
                              newAsset
                            )}

                          </td>


                          {/* =================================================
                              资产增长率
                              ================================================= */}

                          <td
                            className="
                              px-2
                              py-3
                              align-middle
                            "
                          >

                            <input
                              type="number"
                              step="0.1"
                              value={
                                input.growthRate
                              }
                              onChange={
                                (
                                  e
                                ) =>
                                  updateForecastInput(
                                    year,
                                    "growthRate",
                                    Number(
                                      e.target.value
                                    )
                                  )
                              }
                              className="
                                w-full
                                min-w-0
                                rounded-lg
                                border
                                border-gray-200
                                bg-white
                                px-2
                                py-2.5
                                text-right
                                text-sm
                                font-medium
                                text-gray-800
                                outline-none
                                focus:border-blue-400
                                focus:ring-2
                                focus:ring-blue-100
                              "
                            />

                          </td>


                          {/* =================================================
                              年末预计资产
                              ================================================= */}

                          <td
                            className="
                              px-2
                              py-4
                              text-right
                              text-sm
                              font-bold
                              text-gray-900
                              whitespace-nowrap
                              align-middle
                            "
                          >

                            {
                              money(
                                row.asset
                              )
                            }

                          </td>


                          {/* =================================================
                              财务自由目标
                              ================================================= */}

                          <td
                            className="
                              px-2
                              py-4
                              text-right
                              text-sm
                              font-bold
                              text-blue-700
                              whitespace-nowrap
                              align-middle
                            "
                          >

                            {
                              money(
                                row.freedomTarget
                              )
                            }

                          </td>


                          {/* =================================================
                              财务自由差额
                              ================================================= */}

                          <td
                            className={`
                              px-2
                              py-4
                              text-right
                              text-sm
                              font-bold
                              whitespace-nowrap
                              align-middle
                              ${
                                row.freedomGap > 0
                                  ? "text-orange-600"
                                  : "text-green-600"
                              }
                            `}
                          >

                            {
                              row.freedomGap > 0
                                ? money(
                                    row.freedomGap
                                  )
                                : "已达成"
                            }

                          </td>

                        </tr>

                      );

                    }
                  )
                }

              </tbody>

            </table>

          </div>

        </section>


        {/* =================================================
            ★ 年度财务自由目标变化
            ================================================= */}

        <section
          className="
            bg-white
            border
            border-gray-100
            rounded-2xl
            p-6
            shadow-sm
          "
        >

          <div
            className="
              mb-5
            "
          >

            <h2
              className="
                text-xl
                font-bold
                text-gray-900
              "
            >

              📉 年度财务自由目标变化

            </h2>


            <p
              className="
                text-sm
                text-gray-400
                mt-2
              "
            >

              随着年份推进，剩余需要覆盖的生活费逐年减少，因此财务自由目标也逐年下降。

            </p>

          </div>


          <table
            className="
              w-full
              table-fixed
              border-collapse
              text-sm
            "
          >

            <colgroup>

              <col style={{ width: "12%" }} />

              <col style={{ width: "17%" }} />

              <col style={{ width: "12%" }} />

              <col style={{ width: "20%" }} />

              <col style={{ width: "20%" }} />

              <col style={{ width: "19%" }} />

            </colgroup>


            <thead>

              <tr
                className="
                  border-b
                  border-gray-200
                  bg-gray-50
                  text-gray-600
                "
              >

                <th
                  className="
                    px-3
                    py-3
                    text-left
                    text-sm
                    font-bold
                  "
                >
                  年份
                </th>

                <th
                  className="
                    px-3
                    py-3
                    text-right
                    text-sm
                    font-bold
                  "
                >
                  当年生活费
                </th>

                <th
                  className="
                    px-3
                    py-3
                    text-right
                    text-sm
                    font-bold
                  "
                >
                  剩余年份
                </th>

                <th
                  className="
                    px-3
                    py-3
                    text-right
                    text-sm
                    font-bold
                  "
                >
                  财务自由目标(年末)
                </th>

                <th
                  className="
                    px-3
                    py-3
                    text-right
                    text-sm
                    font-bold
                  "
                >
                  当年预计资产(年末)
                </th>

                <th
                  className="
                    px-3
                    py-3
                    text-right
                    text-sm
                    font-bold
                  "
                >
                  财务自由差额(年末)
                </th>

              </tr>

            </thead>


            <tbody>

              {
                rows.map(
                  (
                    row: any
                  ) => {

                    const year =
                      Number(
                        row.year
                      );


                    const yearlyFreedomTarget =
                      getFinancialFreedomTarget(
                        year,
                        forecastInputs
                      );


                    const yearlyAsset =
                      Number(
                        row.asset || 0
                      );


                    const yearlyFreedomGap =
                      Math.max(
                        0,
                        yearlyFreedomTarget -
                        yearlyAsset
                      );


                    const remainingYears =
                      END_YEAR -
                      year +
                      1;


                    return (

                      <tr
                        key={
                          `freedom-${year}`
                        }
                        className="
                          border-b
                          border-gray-100
                          hover:bg-gray-50
                        "
                      >

                        <td
                          className="
                            px-3
                            py-4
                            text-sm
                            font-bold
                            text-gray-800
                          "
                        >
                          {year}
                        </td>


                        <td
                          className="
                            px-3
                            py-4
                            text-right
                            text-sm
                            font-medium
                            text-gray-700
                          "
                        >
                          {
                            money(
                              row.expense
                            )
                          }
                        </td>


                        <td
                          className="
                            px-3
                            py-4
                            text-right
                            text-sm
                            text-gray-500
                          "
                        >
                          {remainingYears} 年
                        </td>


                        <td
                          className="
                            px-3
                            py-4
                            text-right
                            text-sm
                            font-bold
                            text-blue-700
                            whitespace-nowrap
                          "
                        >
                          {
                            money(
                              yearlyFreedomTarget
                            )
                          }
                        </td>


                        <td
                          className="
                            px-3
                            py-4
                            text-right
                            text-sm
                            font-bold
                            text-gray-900
                            whitespace-nowrap
                          "
                        >
                          {
                            money(
                              yearlyAsset
                            )
                          }
                        </td>


                        <td
                          className={`
                            px-3
                            py-4
                            text-right
                            text-sm
                            font-bold
                            whitespace-nowrap
                            ${
                              yearlyFreedomGap > 0
                                ? "text-orange-600"
                                : "text-green-600"
                            }
                          `}
                        >
                          {
                            yearlyFreedomGap > 0
                              ? money(
                                  yearlyFreedomGap
                                )
                              : "已达成"
                          }
                        </td>

                      </tr>

                    );

                  }
                )
              }

            </tbody>

          </table>


          {/* =================================================
              目标说明
              ================================================= */}

          <div
            className="
              mt-5
              rounded-xl
              bg-indigo-50
              border
              border-indigo-100
              p-5
              text-sm
              text-indigo-800
              leading-7
            "
          >

            <p>
              <b>📐 财务自由目标计算方法：</b>
            </p>

            <p>
              每一年的财务自由目标 =
              从该年开始到 2042 年的所有剩余生活费总和。
            </p>

            <p>
              2027 财务自由目标 =
              2027 + 2028 + …… + 2042 生活费
            </p>

            <p>
              2028 财务自由目标 =
              2028 + 2029 + …… + 2042 生活费
            </p>

            <p>
              ……
            </p>

            <p>
              2042 财务自由目标 =
              2042 年生活费
            </p>

            <p>
              <b>
                财务自由差额 =
                max(财务自由目标 − 当年预计资产, 0)
              </b>
            </p>

          </div>

        </section>


        {/* =================================================
            Financial Freedom 贷款
            ================================================= */}

        <section
          className="
            bg-white
            border
            border-gray-100
            rounded-2xl
            p-6
            shadow-sm
          "
        >

          <h2
            className="
              text-xl
              font-bold
              text-gray-900
              mb-4
            "
          >

            💳 Financial Freedom 已关联贷款

          </h2>


          <p
            className="
              text-gray-500
              leading-7
            "
          >

            勾选「计入 Financial Freedom」的贷款，会自动计入当前家庭净资产。
            年度资产预测中的新增资产则按照“收入 − 年金支出 − 生活费”的现金流模型计算，
            不再单独重复扣除贷款压力。

          </p>


          <div
            className="
              mt-5
              grid
              grid-cols-1
              md:grid-cols-2
              gap-4
            "
          >

            <div
              className="
                rounded-xl
                bg-gray-50
                border
                border-gray-100
                p-5
              "
            >

              <div
                className="
                  font-semibold
                  text-gray-800
                "
              >

                🏠 房贷

              </div>


              <div
                className="
                  text-sm
                  text-gray-500
                  mt-2
                "
              >

                按月供 × 12 计算年度贷款压力。

              </div>

            </div>


            <div
              className="
                rounded-xl
                bg-gray-50
                border
                border-gray-100
                p-5
              "
            >

              <div
                className="
                  font-semibold
                  text-gray-800
                "
              >

                💳 信用卡分期

              </div>


              <div
                className="
                  text-sm
                  text-gray-500
                  mt-2
                "
              >

                按月供 × 12 计算年度贷款压力。

              </div>

            </div>


            <div
              className="
                rounded-xl
                bg-gray-50
                border
                border-gray-100
                p-5
              "
            >

              <div
                className="
                  font-semibold
                  text-gray-800
                "
              >

                🛡️ 保险贷款

              </div>


              <div
                className="
                  text-sm
                  text-gray-500
                  mt-2
                "
              >

                根据贷款开始日期计算年度压力及累计利息。

              </div>

            </div>


            <div
              className="
                rounded-xl
                bg-gray-50
                border
                border-gray-100
                p-5
              "
            >

              <div
                className="
                  font-semibold
                  text-gray-800
                "
              >

                🏦 银行信用贷

              </div>


              <div
                className="
                  text-sm
                  text-gray-500
                  mt-2
                "
              >

                后续可以继续增加利息及还款模型。

              </div>

            </div>

          </div>


          <div
            className="
              mt-5
              rounded-xl
              bg-red-50
              border
              border-red-100
              p-5
            "
          >

            <div
              className="
                flex
                items-center
                justify-between
                gap-4
              "
            >

              <div>

                <div
                  className="
                    text-sm
                    text-gray-500
                  "
                >

                  当前 Financial Freedom 贷款余额

                </div>


                <div
                  className="
                    text-xs
                    text-gray-400
                    mt-1
                  "
                >

                  已从当前家庭净资产中扣除

                </div>

              </div>


              <div
                className="
                  text-2xl
                  font-bold
                  text-red-700
                "
              >

                − {money(
                  financialFreedomLoan
                )}

              </div>

            </div>

          </div>

        </section>


        {/* =================================================
            当前家庭资产构成
            ================================================= */}

        <section
          className="
            bg-white
            border
            border-gray-100
            rounded-2xl
            p-6
            shadow-sm
          "
        >

          <h2
            className="
              text-xl
              font-bold
              text-gray-900
              mb-5
            "
          >

            💰 当前家庭资产构成

          </h2>


          <div
            className="
              grid
              grid-cols-1
              md:grid-cols-2
              xl:grid-cols-4
              gap-4
            "
          >

            <div
              className="
                rounded-xl
                bg-gray-50
                border
                border-gray-100
                p-5
              "
            >

              <div
                className="
                  text-sm
                  text-gray-500
                "
              >

                Dashboard 原始资产

              </div>


              <div
                className="
                  text-2xl
                  font-bold
                  mt-2
                  text-gray-900
                "
              >

                {
                  money(
                    dashboardTotalWealth -
                    fixedIncomeTotal
                  )
                }

              </div>


              <div
                className="
                  text-xs
                  text-gray-400
                  mt-2
                "
              >

                asset_history.total_asset

              </div>

            </div>


            <div
              className="
                rounded-xl
                bg-blue-50
                border
                border-blue-100
                p-5
              "
            >

              <div
                className="
                  text-sm
                  text-gray-500
                "
              >

                固收资产

              </div>


              <div
                className="
                  text-2xl
                  font-bold
                  mt-2
                  text-blue-700
                "
              >

                {
                  money(
                    fixedIncomeTotal
                  )
                }

              </div>


              <div
                className="
                  text-xs
                  text-gray-400
                  mt-2
                "
              >

                fixed_income_assets

              </div>

            </div>


            <div
              className="
                rounded-xl
                bg-indigo-50
                border
                border-indigo-100
                p-5
              "
            >

              <div
                className="
                  text-sm
                  text-gray-500
                "
              >

                Dashboard Total Wealth

              </div>


              <div
                className="
                  text-2xl
                  font-bold
                  mt-2
                  text-indigo-700
                "
              >

                {
                  money(
                    dashboardTotalWealth
                  )
                }

              </div>


              <div
                className="
                  text-xs
                  text-gray-400
                  mt-2
                "
              >

                原始资产 + 固收

              </div>

            </div>


            <div
              className="
                rounded-xl
                bg-red-50
                border
                border-red-100
                p-5
              "
            >

              <div
                className="
                  text-sm
                  text-gray-500
                "
              >

                Financial Freedom贷款

              </div>


              <div
                className="
                  text-2xl
                  font-bold
                  mt-2
                  text-red-700
                "
              >

                − {
                  money(
                    financialFreedomLoan
                  )
                }

              </div>


              <div
                className="
                  text-xs
                  text-gray-400
                  mt-2
                "
              >

                当前负债

              </div>

            </div>

          </div>


          <div
            className="
              mt-5
              rounded-2xl
              bg-green-50
              border
              border-green-100
              p-6
            "
          >

            <div
              className="
                flex
                flex-col
                md:flex-row
                md:items-center
                md:justify-between
                gap-4
              "
            >

              <div>

                <div
                  className="
                    text-sm
                    text-gray-500
                  "
                >

                  当前家庭净资产

                </div>


                <div
                  className="
                    text-xs
                    text-gray-400
                    mt-2
                  "
                >

                  Dashboard Total Wealth − Financial Freedom贷款

                </div>

              </div>


              <div
                className="
                  text-3xl
                  font-bold
                  text-green-700
                "
              >

                {
                  money(
                    currentFamilyAsset
                  )
                }

              </div>

            </div>

          </div>


          <div
            className="
              mt-5
              rounded-xl
              bg-blue-50
              border
              border-blue-100
              p-5
              text-sm
              text-blue-800
              leading-7
            "
          >

            <p>
              <b>资产统计规则：</b>
            </p>

            <p>
              • Dashboard 原始资产 = asset_history.total_asset。
            </p>

            <p>
              • 固收资产 = fixed_income_assets.amount 合计。
            </p>

            <p>
              • Dashboard Total Wealth = Dashboard 原始资产 + 固收资产。
            </p>

            <p>
              • 当前家庭净资产 = Dashboard Total Wealth − Financial Freedom贷款。
            </p>

            <p>
              • 保险现金价值不重复加入当前家庭净资产。
            </p>

          </div>

        </section>


        {/* =================================================
            当前财务自由结果
            ================================================= */}

        <section
          className="
            grid
            grid-cols-1
            md:grid-cols-3
            gap-6
          "
        >

          <div
            className="
              bg-white
              border
              border-gray-100
              rounded-2xl
              p-6
              shadow-sm
            "
          >

            <h3
              className="
                font-bold
                text-xl
                text-gray-900
              "
            >

              🎯 当前财务自由目标

            </h3>


            <div
              className="
                text-3xl
                font-bold
                mt-4
                text-blue-700
              "
            >

              {
                money(
                  currentFreedomTarget
                )
              }

            </div>


            <p
              className="
                text-sm
                text-gray-500
                mt-3
              "
            >

              {currentForecastStartYear}–{END_YEAR} 剩余生活费总和

            </p>

          </div>


          <div
            className="
              bg-white
              border
              border-gray-100
              rounded-2xl
              p-6
              shadow-sm
            "
          >

            <h3
              className="
                font-bold
                text-xl
                text-gray-900
              "
            >

              💰 当前家庭净资产

            </h3>


            <div
              className="
                text-3xl
                font-bold
                mt-4
                text-green-700
              "
            >

              {
                money(
                  currentFamilyAsset
                )
              }

            </div>


            <p
              className="
                text-sm
                text-gray-500
                mt-3
              "
            >

              当前家庭全部资产减去 Financial Freedom 贷款

            </p>

          </div>


          <div
            className="
              bg-white
              border
              border-gray-100
              rounded-2xl
              p-6
              shadow-sm
            "
          >

            <h3
              className="
                font-bold
                text-xl
                text-gray-900
              "
            >

              📌 当前财务自由差额

            </h3>


            <div
              className={`
                text-3xl
                font-bold
                mt-4
                ${
                  currentFreedomGap > 0
                    ? "text-orange-600"
                    : "text-green-600"
                }
              `}
            >

              {
                currentFreedomGap > 0
                  ? money(
                      currentFreedomGap
                    )
                  : "已达成"
              }

            </div>


            <p
              className="
                text-sm
                text-gray-500
                mt-3
              "
            >

              当前财务自由目标 − 当前家庭净资产

            </p>

          </div>

        </section>


        {/* =================================================
            退休计划
            ================================================= */}

        <section
          className="
            bg-white
            border
            border-gray-100
            rounded-2xl
            p-6
            shadow-sm
          "
        >

          <div
            className="
              flex
              flex-col
              md:flex-row
              md:items-center
              md:justify-between
              gap-6
            "
          >

            <div>

              <h3
                className="
                  font-bold
                  text-xl
                  text-gray-900
                "
              >

                🎂 退休计划

              </h3>


              <p
                className="
                  text-gray-500
                  mt-2
                "
              >

                目标退休年份：2042

              </p>


              <p
                className="
                  text-sm
                  text-gray-400
                  mt-2
                "
              >

                退休年龄：{RETIREMENT_AGE} 岁

              </p>

            </div>


            <div
              className="
                text-right
              "
            >

              <div
                className="
                  text-5xl
                  font-bold
                  text-gray-900
                "
              >

                {RETIREMENT_AGE}

                <span
                  className="
                    text-xl
                    ml-2
                    font-medium
                  "
                >

                  岁

                </span>

              </div>

            </div>

          </div>


          <div
            className="
              mt-6
              rounded-xl
              p-5
              border
              border-gray-100
              bg-gray-50
            "
          >

            <div
              className="
                flex
                flex-col
                md:flex-row
                md:items-center
                md:justify-between
                gap-4
              "
            >

              <div>

                <div
                  className="
                    text-sm
                    text-gray-500
                  "
                >

                  当前财务自由状态

                </div>


                <div
                  className="
                    text-lg
                    font-bold
                    mt-1
                  "
                >

                  {
                    currentFreedomGap > 0
                      ? "距离财务自由仍有资金缺口"
                      : "🎉 已达到财务自由目标"
                  }

                </div>

              </div>


              <div
                className={`
                  text-xl
                  font-bold
                  ${
                    currentFreedomGap > 0
                      ? "text-orange-600"
                      : "text-green-600"
                  }
                `}
              >

                {
                  currentFreedomGap > 0
                    ? money(
                        currentFreedomGap
                      )
                    : "目标已达成"
                }

              </div>

            </div>

          </div>

        </section>

      </main>

    </>

  );

}
