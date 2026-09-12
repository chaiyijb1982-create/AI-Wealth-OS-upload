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

const START_YEAR = 2027;

const END_YEAR = 2042;

const FREEDOM_END_YEAR = 2041;

const RETIREMENT_AGE = 60;


// =====================================================
// 备用资产
// =====================================================
//
// 只有 Dashboard 没有读取到资产时才使用。
// 正常情况下不会使用。
// =====================================================

const START_ASSET = 1600000;


// =====================================================
// 年收入
// =====================================================

const ANNUAL_INCOME = 1100000;


// =====================================================
// 投资收益率
// =====================================================

const RETURN_RATE = 0.05;


// =====================================================
// 生活费用
// =====================================================
//
// 2027 - 2031：37万 / 年
// 2032 - 2042：32万 / 年
//
// 注意：
// 2042 也包含在财务自由目标中。
// =====================================================

const BASE_EXPENSE: Record<
  number,
  number
> = {

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
// 年金缴费
// =====================================================

const ANNUITY: Record<
  number,
  number
> = {

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
// ★ 剩余财务自由目标
// =====================================================
//
// 定义：
//
// 从某一年开始，直到 2042 年，
// 剩余所有生活费的总和。
//
// 例如：
//
// 2027
// = 2027 ~ 2042 全部生活费
//
// 2028
// = 2028 ~ 2042 全部生活费
//
// 2029
// = 2029 ~ 2042 全部生活费
//
// 所以随着年份增加，目标会逐年下降。
//
// 2027：
// 37万 × 5
// +
// 32万 × 11
// = 537万
//
// 2028：
// 37万 × 4
// +
// 32万 × 11
// = 500万
//
// ...
//
// 2042：
// 32万
// =====================================================

function getFinancialFreedomTarget(
  year: number
) {

  let target = 0;


  for (
    let y = year;
    y <= FREEDOM_END_YEAR;
    y++
  ) {

    target += Number(
      BASE_EXPENSE[y] || 0
    );

  }


  return target;

}


// =====================================================
// 当前模型起始财务自由目标
// =====================================================
//
// 因为当前 Financial Freedom 模型从 2027 年开始，
// 所以当前目标按照 2027 ~ 2042 剩余生活费计算。
//
// = 537万
// =====================================================

const CURRENT_FINANCIAL_FREEDOM_TARGET =
  getFinancialFreedomTarget(
    START_YEAR
  );


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
        //
        // Dashboard Total Wealth
        // =
        // asset_history.total_asset
        // +
        // fixed_income_assets
        //
        // 固收只加一次。
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
        // 5. 获取 Financial Freedom 贷款
        // =================================================
        //
        // getFinancialFreedomLoans()
        // 本身应该只返回：
        //
        // include_in_financial_freedom = true
        //
        // 的贷款。
        //
        // 因此这里绝对不能再读取全部 loans。
        // =================================================

        const ffLoans =
          await getFinancialFreedomLoans();


        // =================================================
        // 贷款余额
        // =================================================

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
        //
        // 当前家庭净资产
        // =
        // Dashboard Total Wealth
        // -
        // Financial Freedom 贷款
        //
        // 注意：
        //
        // fixedIncomeSum 已经包含在 totalWealth 中。
        //
        // 所以这里绝对不能再：
        //
        // totalWealth + fixedIncomeSum
        //
        // =================================================

        const netAsset =
          totalWealth -
          loanBalance;


        setCurrentFamilyAsset(
          netAsset
        );
   
        

        // =================================================
        // Debug
        // =================================================

        console.log(
          "========================================"
        );

        console.log(
          "Financial Freedom Asset Calculation"
        );

        console.log(
          "Original Asset:",
          originalAsset
        );

        console.log(
          "Fixed Income:",
          fixedIncomeSum
        );

        console.log(
          "Dashboard Total Wealth:",
          totalWealth
        );

        console.log(
          "Financial Freedom Loan:",
          loanBalance
        );

        console.log(
          "Current Family Net Asset:",
          netAsset
        );

        console.log(
          "Current Financial Freedom Target:",
          CURRENT_FINANCIAL_FREEDOM_TARGET
        );

        console.log(
          "Current Financial Freedom Gap:",
          Math.max(
            0,
            CURRENT_FINANCIAL_FREEDOM_TARGET -
            netAsset
          )
        );

        console.log(
          "========================================"
        );


        // =================================================
        // 7. 获取保险数据
        // =================================================

        const ins =
          await getInsuranceSummary();


        setInsurance(
          ins
        );


        // =================================================
        // 8. 获取保险现金价值历史
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
        // 9. 年度贷款模型
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
          let year = START_YEAR;
          year <= END_YEAR;
          year++
        ) {

          // =================================================
          // 年度贷款支付
          // =================================================

          const payment =
            await getFinancialFreedomLoanPayment(
              year
            );


          // =================================================
          // 年度贷款压力
          // =================================================

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


        // =================================================
        // 10. 年度资产预测
        // =================================================
        //
        // 注意：
        //
        // 使用刚刚计算出来的 netAsset，
        // 不使用 currentFamilyAsset state。
        //
        // 因为 setState 是异步的。
        // =================================================

        let currentAsset =
          netAsset;


        const result: any[] = [];


        // =================================================
        // 2027 → 2042
        // =================================================

        for (
          let year = START_YEAR;
          year <= END_YEAR;
          year++
        ) {

          // =================================================
          // 生活费
          // =================================================

          const expense =
            Number(
              BASE_EXPENSE[year] || 0
            );


          // =================================================
          // 年金缴费
          // =================================================

          const pension =
            Number(
              ANNUITY[year] || 0
            );


          // =================================================
          // Financial Freedom 贷款年度压力
          // =================================================

          const loan =
            Number(
              loans[year]?.pressure || 0
            );


          // =================================================
          // 年度现金流
          // =================================================
          //
          // 年收入
          // -
          // 生活费
          // -
          // 年金
          // -
          // 贷款压力
          // =================================================

          const cashFlow =
            ANNUAL_INCOME
            -
            expense
            -
            pension
            -
            loan;


          // =================================================
          // 投资收益
          // =================================================
          //
          // 年初资产 × 5%
          // =================================================

          const investmentReturn =
            currentAsset *
            RETURN_RATE;


          // =================================================
          // 年末资产
          // =================================================

          currentAsset =
            currentAsset
            +
            investmentReturn
            +
            cashFlow;


          // =================================================
          // ★ 当年剩余财务自由目标
          // =================================================
          //
          // 例如：
          //
          // 2027：
          // 2027~2042 全部生活费
          //
          // 2028：
          // 2028~2042 全部生活费
          //
          // ...
          //
          // 2042：
          // 2042 年生活费
          // =================================================

          const freedomTarget =
            getFinancialFreedomTarget(
              year
            );


          // =================================================
          // ★ 当年财务自由差额
          // =================================================
          //
          // 当年剩余财务自由目标
          // -
          // 当年预计资产
          //
          // 如果资产已经超过目标，
          // 差额显示 0。
          // =================================================

          const freedomGap =
            Math.max(
              0,
              freedomTarget -
              currentAsset
            );


          // =================================================
          // 剩余年份
          // =================================================

          const remainingYears =
            END_YEAR -
            year +
            1;


          // =================================================
          // 保存年度结果
          // =================================================

          result.push({

            year,

            remainingYears,

            asset:
              currentAsset,

            income:
              ANNUAL_INCOME,

            expense,

            annuity:
              pension,

            loan,

            investmentReturn,

            cashFlow,

            freedomTarget,

            freedomGap,

          });

        }


        // =================================================
        // 11. 保存年度预测
        // =================================================

        setRows(
          result
        );


        // =================================================
        // Debug：检查年度目标
        // =================================================

        console.log(
          "========================================"
        );

        console.log(
          "Financial Freedom Annual Targets"
        );


        result.forEach(
          (
            row
          ) => {

            console.log(
              row.year,
              {
                remainingYears:
                  row.remainingYears,

                expense:
                  row.expense,

                freedomTarget:
                  row.freedomTarget,

                asset:
                  row.asset,

                freedomGap:
                  row.freedomGap,
              }
            );

          }
        );


        console.log(
          "========================================"
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


    load();

  }, []);
    // =====================================================
  // 金额格式
  // =====================================================

  function money(
    num: number
  ) {

    const value =
      Number(num || 0);

    return (
      "¥ " +
      value.toLocaleString(
        "zh-CN",
        {
          maximumFractionDigits: 0
        }
      )
    );

  }


  // =====================================================
  // ★ 财务自由目标计算
  // =====================================================
  //
  // 新逻辑：
  //
  // 财务自由目标不再使用：
  //
  // 当年生活费 × 25
  //
  // 而是：
  //
  // 从指定年份开始
  // 一直到 2042 年
  // 剩余所有生活费的总和。
  //
  // 例如：
  //
  // 2027：
  // 2027 + 2028 + ... + 2042
  //
  // 2028：
  // 2028 + 2029 + ... + 2042
  //
  // ...
  //
  // 2042：
  // 2042
  //
  // 所以财务自由目标会随着年份
  // 自动逐年下降。
  // =====================================================

  function getFreedomTarget(
    startYear: number
  ) {

    let total = 0;

    for (
      let year = startYear;
      year <= FREEDOM_END_YEAR;
      year++
    ) {

      total +=
        Number(
          BASE_EXPENSE[year] || 0
        );

    }

    return total;

  }


  // =====================================================
  // ★ 当前财务自由目标
  // =====================================================
  //
  // 当前时间点是进入 2027 年前的规划状态，
  // 所以当前目标按照：
  //
  // 2027 - 2042
  //
  // 所有未来生活费计算。
  // =====================================================

  const currentFreedomTarget =
    getFreedomTarget(
      START_YEAR
    );


  // =====================================================
  // ★ 当前财务自由差额
  // =====================================================
  //
  // 当前家庭净资产
  // 对比当前财务自由目标。
  //
  // 如果已经超过目标，
  // 差额显示 0。
  // =====================================================

  const currentFreedomGap =
    Math.max(
      0,
      currentFreedomTarget
      -
      currentFamilyAsset
    );


  // =====================================================
  // 保险数据
  // =====================================================
  //
  // 兼容 insurance.ts 当前可能存在的字段。
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


  // =====================================================
  // 保险总保费
  // =====================================================

  const totalPremium =
    Number(
      insurance?.premiumTotal ??
      insurance?.premium_total ??
      insurance?.totalPremium ??
      insurance?.total_premium ??
      0
    );


  // =====================================================
  // 保险已缴保费
  // =====================================================

  const paidPremium =
    Number(
      insurance?.paidPremium ??
      insurance?.paid_premium ??
      0
    );


  // =====================================================
  // 当前保险现金价值
  // =====================================================

  const insuranceCashValue =
    Number(
      insurance?.cashValue ??
      insurance?.cash_value ??
      0
    );


  // =====================================================
  // 儿子现金价值
  // =====================================================

  const sonCashValue =
    Number(
      insurance?.sonCashValue ??
      insurance?.son_cash_value ??
      0
    );


  // =====================================================
  // 保险保单数量
  // =====================================================

  const insuranceCount =
    Number(
      insurance?.count ??
      insurance?.policyCount ??
      insurance?.policy_count ??
      0
    );


  // =====================================================
  // ★ 天天向上1
  // =====================================================
  //
  // 新定义：
  //
  // 当前财务自由差额
  // +
  // 未来还要交的总保费
  //
  // 注意：
  // 这里不再使用 2042 财务自由差额。
  // =====================================================

  const tiantianUp1 =
    currentFreedomGap
    +
    totalUnpaidPremium;


  // =====================================================
  // 页面开始
  // =====================================================

  return (

    <>

      <TopBar
        title="Financial Freedom"
      />


      <main
        className="
          max-w-[1400px]
          mx-auto
          p-8
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


          {/* =============================================
              1. 当前家庭净资产
              ============================================= */}

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


          {/* =============================================
              2. 当前财务自由目标
              ============================================= */}

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

              2027–2041 剩余生活费总和

            </div>

          </div>


          {/* =============================================
              3. 当前财务自由差额
              ============================================= */}

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
            当前财务自由计算说明
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


            {/* 当前家庭净资产 */}

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


            {/* 当前财务自由目标 */}

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

                2027–2041 所有未来生活费

              </div>

            </div>


            {/* 当前财务自由差额 */}

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

              <b>
                当前财务自由目标：
              </b>

            </p>


            <p>

              2027–2042 每年的预计生活费全部加总。

            </p>


            <p>

              当前财务自由目标 =
              2027生活费 + 2028生活费 + …… + 2041生活费

            </p>


            <p>

              当前财务自由差额 =
              max(当前财务自由目标 − 当前家庭净资产, 0)

            </p>


            <p>

              随着时间进入下一年，
              剩余生活费减少，
              所以财务自由目标也会逐年下降。

            </p>

          </div>

        </section>

                {/* =================================================
            年度现金流预测
            ================================================= */}

        <section
          className="
            bg-white
            border
            border-gray-100
            rounded-2xl
            p-6
            shadow-sm
            overflow-auto
          "
        >

          <div
            className="
              flex
              items-center
              justify-between
              gap-4
              mb-5
            "
          >

            <div>

              <h2
                className="
                  text-xl
                  font-bold
                  text-gray-900
                "
              >

                📊 年度现金流预测

              </h2>


              <p
                className="
                  text-sm
                  text-gray-400
                  mt-2
                "
              >

                2027–2042 年家庭资产变化预测

              </p>

            </div>

          </div>


          <table
            className="
              w-full
              text-sm
              min-w-[1100px]
            "
          >

            <thead>

              <tr
                className="
                  border-b
                  border-gray-200
                  text-gray-500
                "
              >

                <th
                  className="
                    p-3
                    text-left
                    font-medium
                  "
                >
                  年份
                </th>


                <th
                  className="
                    p-3
                    text-right
                    font-medium
                  "
                >
                  年末资产
                </th>


                <th
                  className="
                    p-3
                    text-right
                    font-medium
                  "
                >
                  年收入
                </th>


                <th
                  className="
                    p-3
                    text-right
                    font-medium
                  "
                >
                  生活费
                </th>


                <th
                  className="
                    p-3
                    text-right
                    font-medium
                  "
                >
                  年金
                </th>


                <th
                  className="
                    p-3
                    text-right
                    font-medium
                  "
                >
                  当年还贷
                </th>


                <th
                  className="
                    p-3
                    text-right
                    font-medium
                  "
                >
                  投资收益(年末)
                </th>


                <th
                  className="
                    p-3
                    text-right
                    font-medium
                  "
                >
                  年度现金流(年末)
                </th>

              </tr>

            </thead>


            <tbody>

              {
                rows.map(
                  (
                    row: any
                  ) => {

                    return (

                      <tr
                        key={
                          row.year
                        }
                        className="
                          border-b
                          border-gray-100
                          hover:bg-gray-50
                        "
                      >

                        {/* 年份 */}

                        <td
                          className="
                            p-3
                            font-semibold
                            text-gray-700
                          "
                        >

                          {row.year}

                        </td>


                        {/* 年末资产 */}

                        <td
                          className="
                            p-3
                            text-right
                            font-bold
                            text-gray-900
                          "
                        >

                          {
                            money(
                              row.asset
                            )
                          }

                        </td>


                        {/* 年收入 */}

                        <td
                          className="
                            p-3
                            text-right
                          "
                        >

                          {
                            money(
                              row.income
                            )
                          }

                        </td>


                        {/* 生活费 */}

                        <td
                          className="
                            p-3
                            text-right
                          "
                        >

                          {
                            money(
                              row.expense
                            )
                          }

                        </td>


                        {/* 年金 */}

                        <td
                          className="
                            p-3
                            text-right
                          "
                        >

                          {
                            money(
                              row.annuity
                            )
                          }

                        </td>


                        {/* 贷款压力 */}

                        <td
                          className="
                            p-3
                            text-right
                          "
                        >

                          {
                            Number(
                              row.loan || 0
                            ) > 0
                              ? money(
                                  row.loan
                                )
                              : "-"
                          }

                        </td>


                        {/* 投资收益 */}

                        <td
                          className="
                            p-3
                            text-right
                            text-green-700
                          "
                        >

                          {
                            money(
                              row.investmentReturn
                            )
                          }

                        </td>


                        {/* 年度现金流 */}

                        <td
                          className={`
                            p-3
                            text-right
                            font-medium
                            ${
                              Number(
                                row.cashFlow || 0
                              ) >= 0
                                ? "text-green-700"
                                : "text-red-600"
                            }
                          `}
                        >

                          {
                            money(
                              row.cashFlow
                            )
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
              计算说明
              ================================================= */}

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

              <b>
                年度资产计算：
              </b>

            </p>


            <p>

              年末资产 = 年初资产 + 投资收益 + 年度现金流

            </p>


            <p>

              投资收益 = 年初资产 × 5%

            </p>


            <p>

              年度现金流 = 年收入 − 生活费 − 年金 − 贷款压力

            </p>

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
            overflow-auto
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

              随着年份推进，剩余需要覆盖的生活费逐年减少，
              因此财务自由目标也逐年下降。

            </p>

          </div>


          <table
            className="
              w-full
              text-sm
              min-w-[950px]
            "
          >

            <thead>

              <tr
                className="
                  border-b
                  border-gray-200
                  text-gray-500
                "
              >

                <th
                  className="
                    p-3
                    text-left
                    font-medium
                  "
                >
                  年份
                </th>


                <th
                  className="
                    p-3
                    text-right
                    font-medium
                  "
                >
                  当年生活费
                </th>


                <th
                  className="
                    p-3
                    text-right
                    font-medium
                  "
                >
                  剩余年份
                </th>


                <th
                  className="
                    p-3
                    text-right
                    font-medium
                  "
                >
                  财务自由目标(年末)
                </th>


                <th
                  className="
                    p-3
                    text-right
                    font-medium
                  "
                >
                  当年预计资产(年末)
                </th>


                <th
                  className="
                    p-3
                    text-right
                    font-medium
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


                    // =================================================
                    // 从当前年份开始，到 2042 年剩余所有生活费
                    // =================================================

                    const yearlyFreedomTarget =
                      getFreedomTarget(
                        year
                      );


                    // =================================================
                    // 当年预计资产
                    // =================================================

                    const yearlyAsset =
                      Number(
                        row.asset || 0
                      );


                    // =================================================
                    // 当年财务自由差额
                    // =================================================

                    const yearlyFreedomGap =
                      Math.max(
                        0,
                        yearlyFreedomTarget
                        -
                        yearlyAsset
                      );


                    // =================================================
                    // 剩余年份数量
                    // =================================================

                    const remainingYears =
                      END_YEAR
                      -
                      year
                      +
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

                        {/* 年份 */}

                        <td
                          className="
                            p-3
                            font-semibold
                            text-gray-700
                          "
                        >

                          {year}

                        </td>


                        {/* 当年生活费 */}

                        <td
                          className="
                            p-3
                            text-right
                            text-gray-700
                          "
                        >

                          {
                            money(
                              row.expense
                            )
                          }

                        </td>


                        {/* 剩余年份 */}

                        <td
                          className="
                            p-3
                            text-right
                            text-gray-500
                          "
                        >

                          {remainingYears} 年

                        </td>


                        {/* 财务自由目标 */}

                        <td
                          className="
                            p-3
                            text-right
                            font-bold
                            text-blue-700
                          "
                        >

                          {
                            money(
                              yearlyFreedomTarget
                            )
                          }

                        </td>


                        {/* 当年预计资产 */}

                        <td
                          className="
                            p-3
                            text-right
                            font-bold
                            text-gray-900
                          "
                        >

                          {
                            money(
                              yearlyAsset
                            )
                          }

                        </td>


                        {/* 财务自由差额 */}

                        <td
                          className={`
                            p-3
                            text-right
                            font-bold
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
              财务自由目标计算说明
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

              <b>
                📐 财务自由目标计算方法：
              </b>

            </p>


            <p>

              每一年的财务自由目标 =
              从该年开始到 2041 年的所有剩余生活费总和。

            </p>


            <p>

              2027 财务自由目标 =
              2027 + 2028 + …… + 2041 生活费

            </p>


            <p>

              2028 财务自由目标 =
              2028 + 2029 + …… + 2041 生活费

            </p>


            <p>

              ……

            </p>


            <p>

              2041 财务自由目标 =
              2041 年生活费

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

            勾选「计入 Financial Freedom」的贷款，
            会自动计入当前家庭净资产与未来年度现金流预测。

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


            {/* 房贷 */}

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


            {/* 信用卡分期 */}

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


            {/* 保险贷款 */}

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


            {/* 银行信用贷 */}

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


          {/* =================================================
              当前贷款余额
              ================================================= */}

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

                − {
                  money(
                    financialFreedomLoan
                  )
                }

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

            {/* =================================================
                Dashboard 原始资产
                ================================================= */}

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


            {/* =================================================
                固收资产
                ================================================= */}

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


            {/* =================================================
                Dashboard Total Wealth
                ================================================= */}

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


            {/* =================================================
                Financial Freedom 贷款
                ================================================= */}

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


          {/* =================================================
              当前家庭净资产
              ================================================= */}

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


          {/* =================================================
              资产统计规则
              ================================================= */}

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

              <b>
                资产统计规则：
              </b>

            </p>


            <p>

              • Dashboard 原始资产 =
              asset_history.total_asset。

            </p>


            <p>

              • 固收资产 =
              fixed_income_assets.amount 合计。

            </p>


            <p>

              • Dashboard Total Wealth =
              Dashboard 原始资产 + 固收资产。

            </p>


            <p>

              • 当前家庭净资产 =
              Dashboard Total Wealth − Financial Freedom贷款。

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

          {/* =================================================
              当前财务自由目标
              ================================================= */}

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

              2027–2042 剩余生活费总和

            </p>

          </div>


          {/* =================================================
              当前家庭净资产
              ================================================= */}

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


          {/* =================================================
              当前财务自由差额
              ================================================= */}

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

                {
                  RETIREMENT_AGE
                }

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


          {/* =================================================
              退休状态
              ================================================= */}

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


        {/* =================================================
            页面结束
            ================================================= */}

      </main>

    </>

  );

}