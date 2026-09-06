"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import TopBar from "@/components/TopBar";

import {
  getInvestmentTransactions,
  type InvestmentTransaction,
} from "@/lib/investment-transactions";

import { supabase } from "@/lib/supabase";

// =====================================================
// 类型
// =====================================================

type Region = "CN" | "HK";

type TransactionScenario = "HOLDING" | "NEW";

type TransactionType = "BUY" | "SELL";

type SellMode = "SHARES" | "AMOUNT";

type Currency = "CNY" | "USD" | "HKD";

type InvestmentCategory =
  | "fixed_income"
  | "global_stock"
  | "china_stock"
  | "gold";

type Holding = {
  id: number;

  code: string;
  name: string;

  market: string;
  category: string | null;

  amount: number;
  cost: number;
  fee_cost: number;

  profit: number;
  profit_rate: number;

  currency: string | null;

  nav: number | null;
  shares: number | null;

  platform: string | null;

  active: boolean | null;
  skip_update: boolean | null;

  updated_at: string | null;

  native_currency?: Currency | null;
  native_amount?: number | null;
  native_cost?: number | null;
  native_fee_cost?: number | null;
};

type HoldingNativeCurrency = {
  id: number;
  holding_id: number;
  native_currency: Currency;
  native_amount: number | null;
  native_cost: number | null;
  fee_cost: number | null;
  updated_at: string | null;
};

type HoldingBalanceRow = {
  id: number;
  amount: number | null;
  cost: number | null;
  active: boolean | null;
  shares: number | null;
};

// =====================================================
// 工具函数
// =====================================================

function toNumber(value: unknown): number {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return 0;
  }

  return n;
}

function formatNumber(
  value: number,
  digits = 2
): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(
  value: string | null | undefined
): string {
  if (!value) {
    return "";
  }

  return value.slice(0, 10);
}

function getCategoryLabel(
  category: string | null | undefined
): string {
  switch (category) {
    case "fixed_income":
      return "固定收益";

    case "global_stock":
      return "全球股票";

    case "china_stock":
      return "中国股票";

    case "gold":
      return "黄金";

    default:
      return category || "";
  }
}

function getCashPrefix(
  region: Region
): string {
  return region === "CN"
    ? "CASH_CN_卖出暂存"
    : "CASH_HK_卖出暂存";
}

function getCashDefaultCode(
  region: Region,
  platform: string
): string {
  return `${getCashPrefix(region)}_${
    platform || "未指定平台"
  }`;
}

function getCashName(
  region: Region,
  platform: string
): string {
  return region === "CN"
    ? `人民币卖出暂存现金 - ${
        platform || "未指定平台"
      }`
    : `港美股卖出暂存现金 - ${
        platform || "未指定平台"
      }`;
}

// =====================================================
// 页面
// =====================================================

export default function InvestmentTransactionsPage() {
  // ===================================================
  // Loading / data
  // ===================================================

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [holdings, setHoldings] =
    useState<Holding[]>([]);

  const [transactions, setTransactions] =
    useState<InvestmentTransaction[]>([]);

  const [message, setMessage] =
    useState("");

  const [error, setError] =
    useState("");

  // ===================================================
  // Cash Holding 写入结果
  // ===================================================

  const [
    cashHoldingResult,
    setCashHoldingResult,
  ] = useState<{
    cnyAmount: number;
    nativeCurrency: Currency;
    nativeAmount: number;
    holdingCreated: boolean;
    nativeCreated: boolean;

    securityCostBasisCny: number;
    securityNativeAmount: number;
    securityNativeCostBasis: number;
    securityNativeCurrency: Currency | null;
  } | null>(null);

  // ===================================================
  // 基础选择
  // ===================================================

  const [region, setRegion] =
    useState<Region>("CN");

  const [scenario, setScenario] =
    useState<TransactionScenario>(
      "HOLDING"
    );

  const [transactionType, setTransactionType] =
    useState<TransactionType>("BUY");

  const [selectedHoldingId, setSelectedHoldingId] =
    useState<string>("");

  // ===================================================
  // 资产信息
  // ===================================================

  const [assetCode, setAssetCode] =
    useState("");

  const [assetName, setAssetName] =
    useState("");

  const [platform, setPlatform] =
    useState("");

  const [category, setCategory] =
    useState<
      InvestmentCategory | ""
    >("");

  // ===================================================
  // 交易信息
  // ===================================================

  const [transactionDate, setTransactionDate] =
    useState(getToday());

  const [currency, setCurrency] =
    useState<Currency>("CNY");

  const [tradeAmount, setTradeAmount] =
    useState("");

  const [tradePrice, setTradePrice] =
    useState("");

  const [shares, setShares] =
    useState("");

  const [fee, setFee] =
    useState("");

  // ===================================================
  // 汇率
  // ===================================================

  const [fxRate, setFxRate] =
    useState<number | null>(null);

  const [fxLoading, setFxLoading] =
    useState(false);

  // ===================================================
  // SELL
  // ===================================================

  const [sellMode, setSellMode] =
    useState<SellMode>("SHARES");

  const [cashAssetCode, setCashAssetCode] =
    useState("");

  // SELL → Cash Holding_native_currency 可人工调整的原币金额/成本
  // 空值时默认使用「卖出成交金额 - 手续费」。
  const [cashNativeAmount, setCashNativeAmount] =
    useState("");

  const [cashNativeCost, setCashNativeCost] =
    useState("");

  // CNY SELL → Cash Holding.amount / cost 可人工调整。
  // 非 CNY SELL 时由 Cash Holding_native_currency × FX 自动计算。
  const [cashCnyAmount, setCashCnyAmount] =
    useState("");

  const [cashCnyCost, setCashCnyCost] =
    useState("");

  // ===================================================
  // 备注
  // ===================================================

  const [remark, setRemark] =
    useState("");

  // ===================================================
  // 加载数据
  // ===================================================

  const loadData = useCallback(
    async () => {
      try {
        setLoading(true);
        setError("");

        const [
          holdingsResult,
          transactionsResult,
        ] = await Promise.all([
          supabase
            .from("holdings")
            .select(
              [
                "id",
                "code",
                "name",
                "market",
                "category",
                "amount",
                "cost",
                "fee_cost",
                "profit",
                "profit_rate",
                "currency",
                "nav",
                "shares",
                "platform",
                "active",
                "skip_update",
                "updated_at",
              ].join(",")
            )
            .eq("active", true)
            .order("name"),

          getInvestmentTransactions(),
        ]);

        if (holdingsResult.error) {
          throw holdingsResult.error;
        }

        const rawHoldings =
          (holdingsResult.data ??
            []) as unknown as Holding[];

        const holdingIds =
          rawHoldings.map(
            (holding) => holding.id
          );

        let nativeRows: HoldingNativeCurrency[] =
          [];

        if (holdingIds.length > 0) {
          const {
            data,
            error: nativeError,
          } = await supabase
            .from("holding_native_currency")
            .select(
              [
                "id",
                "holding_id",
                "native_currency",
                "native_amount",
                "native_cost",
                "fee_cost",
                "updated_at",
              ].join(",")
            )
            .in(
              "holding_id",
              holdingIds
            );

          if (nativeError) {
            throw nativeError;
          }

          nativeRows =
            (data ??
              []) as unknown as HoldingNativeCurrency[];
        }

        const nativeMap =
          new Map<
            number,
            HoldingNativeCurrency
          >();

        for (const row of nativeRows) {
          nativeMap.set(
            row.holding_id,
            row
          );
        }

        const enrichedHoldings =
          rawHoldings.map(
            (holding) => {
              const native =
                nativeMap.get(
                  holding.id
                );

              return {
                ...holding,
                native_currency:
                  native?.native_currency ??
                  null,
                native_amount:
                  native?.native_amount ??
                  null,
                native_cost:
                  native?.native_cost ??
                  null,
                fee_cost:
                  holding.fee_cost ??
                  0,
                native_fee_cost:
                  native?.fee_cost ??
                  0,
              };
            }
          );

        setHoldings(
          enrichedHoldings
        );

        setTransactions(
          transactionsResult || []
        );
      } catch (err) {
        console.log(err);

        setError(
          err instanceof Error
            ? err.message
            : "加载数据失败"
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // ===================================================
  // Region Holdings
  // ===================================================

  const regionHoldings = useMemo(() => {
    return holdings.filter(
      (holding) => {
        if (region === "CN") {
          return (
            holding.market === "CN"
          );
        }

        return holding.market !== "CN";
      }
    );
  }, [holdings, region]);

  // ===================================================
  // Selected Holding
  // ===================================================

  const selectedHolding = useMemo(() => {
    if (!selectedHoldingId) {
      return null;
    }

    return (
      holdings.find(
        (holding) =>
          String(holding.id) ===
          selectedHoldingId
      ) || null
    );
  }, [
    holdings,
    selectedHoldingId,
  ]);

  // ===================================================
  // Holding 当前 Shares
  // ===================================================

  const currentShares = useMemo(() => {
    return toNumber(
      selectedHolding?.shares
    );
  }, [selectedHolding]);

  // ===================================================
  // Holding 当前 Cost
  // ===================================================

  const currentCostCny = useMemo(() => {
    return toNumber(
      selectedHolding?.cost
    );
  }, [selectedHolding]);

  // ===================================================
  // Holding 当前平均成本
  // ===================================================

  const currentAvgCostCny =
    useMemo(() => {
      if (
        currentShares <= 0 ||
        currentCostCny <= 0
      ) {
        return 0;
      }

      return (
        currentCostCny /
        currentShares
      );
    }, [
      currentShares,
      currentCostCny,
    ]);

  // ===================================================
  // Holding 选择
  // ===================================================

  const handleHoldingChange = (
    value: string
  ) => {
    setSelectedHoldingId(value);

    const holding =
      holdings.find(
        (item) =>
          String(item.id) === value
      ) || null;

    if (!holding) {
      return;
    }

    setAssetCode(
      holding.code || ""
    );

    setAssetName(
      holding.name || ""
    );

    setPlatform(
      holding.platform || ""
    );

    if (region === "CN") {
      setCurrency("CNY");
    } else if (
      holding.native_currency ===
        "USD" ||
      holding.native_currency ===
        "HKD"
    ) {
      setCurrency(
        holding.native_currency
      );
    } else {
      setCurrency("USD");
    }

    if (
      holding.category ===
        "fixed_income" ||
      holding.category ===
        "global_stock" ||
      holding.category ===
        "china_stock" ||
      holding.category === "gold"
    ) {
      setCategory(
        holding.category
      );
    } else {
      setCategory("");
    }

    setTradeAmount("");
    setShares("");
    setFee("");
    setCashHoldingResult(null);

    if (
      transactionType === "SELL"
    ) {
      const currentNav =
        toNumber(holding.nav);

      setTradePrice(
        currentNav > 0
          ? String(currentNav)
          : ""
      );
    } else {
      setTradePrice("");
    }

    setFxRate(null);
  };

  // ===================================================
  // Region 切换
  // ===================================================

  const handleRegionChange = (
    value: Region
  ) => {
    setRegion(value);

    setSelectedHoldingId("");

    setAssetCode("");
    setAssetName("");
    setPlatform("");
    setCategory("");

    setTradeAmount("");
    setTradePrice("");
    setShares("");
    setFee("");

    setCashNativeAmount("");
    setCashNativeCost("");
    setCashCnyAmount("");
    setCashCnyCost("");

    setFxRate(null);

    setCashHoldingResult(null);

    if (value === "CN") {
      setCurrency("CNY");
    } else {
      setCurrency("USD");
    }

    setCashAssetCode("");
  };

  // ===================================================
  // Scenario 切换
  // ===================================================

  const handleScenarioChange = (
    value: TransactionScenario
  ) => {
    setScenario(value);

    setSelectedHoldingId("");

    setAssetCode("");
    setAssetName("");
    setPlatform("");
    setCategory("");

    setTradeAmount("");
    setTradePrice("");
    setShares("");
    setFee("");

    setCashNativeAmount("");
    setCashNativeCost("");
    setCashCnyAmount("");
    setCashCnyCost("");

    setFxRate(null);

    setCashHoldingResult(null);

    if (value === "NEW") {
      setTransactionType("BUY");
    }
  };

  // ===================================================
  // BUY / SELL 切换
  // ===================================================

  const handleTransactionTypeChange = (
    value: TransactionType
  ) => {
    setTransactionType(value);

    setTradeAmount("");
    setTradePrice("");
    setShares("");
    setFee("");

    setCashNativeAmount("");
    setCashNativeCost("");
    setCashCnyAmount("");
    setCashCnyCost("");

    setCashHoldingResult(null);

    if (value === "SELL") {
      setSellMode("SHARES");

      const currentNav =
        toNumber(
          selectedHolding?.nav
        );

      setTradePrice(
        currentNav > 0
          ? String(currentNav)
          : ""
      );

      setCashAssetCode(
        getCashDefaultCode(
          region,
          platform
        )
      );
    } else {
      setCashAssetCode("");
    }
  };

  // ===================================================
  // Currency
  // ===================================================

  const handleCurrencyChange = (
    value: Currency
  ) => {
    if (region === "CN") {
      setCurrency("CNY");
      return;
    }

    setCurrency(value);
    setFxRate(null);
  };

  // ===================================================
  // FX
  // ===================================================

  const fetchFxRate = useCallback(
    async (
      requestedCurrency: Currency = currency,
      requestedDate: string =
        transactionDate
    ) => {
      if (
        region === "CN" ||
        requestedCurrency === "CNY"
      ) {
        setFxRate(1);
        return;
      }

      try {
        setFxLoading(true);
        setError("");

        const response =
          await fetch(
            `/api/exchange-rate?date=${encodeURIComponent(
              requestedDate
            )}&currency=${encodeURIComponent(
              requestedCurrency
            )}`,
            {
              cache: "no-store",
            }
          );

        const data =
          await response.json();

        const rate = Number(
          data?.rate
        );

        if (
          !response.ok ||
          !data?.success ||
          !Number.isFinite(rate) ||
          rate <= 0
        ) {
          throw new Error(
            `${requestedCurrency} 汇率获取失败`
          );
        }

        if (
          (requestedCurrency ===
            "USD" ||
            requestedCurrency ===
              "HKD") &&
          rate === 1
        ) {
          throw new Error(
            `${requestedCurrency} 汇率异常：API 返回 1，请检查汇率接口`
          );
        }

        setFxRate(rate);
      } catch (err) {
        console.log(
          "FX 获取失败",
          err
        );

        setFxRate(null);

        setError(
          err instanceof Error
            ? err.message
            : "获取汇率失败"
        );
      } finally {
        setFxLoading(false);
      }
    },
    [
      currency,
      transactionDate,
      region,
    ]
  );

  // ===================================================
  // FX 自动获取
  // ===================================================

  useEffect(() => {
    let cancelled = false;

    if (
      region !== "HK" ||
      currency === "CNY"
    ) {
      setFxLoading(false);
      setFxRate(1);

      return () => {
        cancelled = true;
      };
    }

    if (
      currency !== "USD" &&
      currency !== "HKD"
    ) {
      setFxLoading(false);
      setFxRate(null);

      return () => {
        cancelled = true;
      };
    }

    setFxRate(null);
    setFxLoading(true);

    void (async () => {
      try {
        setError("");

        const response =
          await fetch(
            `/api/exchange-rate?date=${encodeURIComponent(
              transactionDate
            )}&currency=${encodeURIComponent(
              currency
            )}`,
            {
              cache: "no-store",
            }
          );

        const data =
          await response.json();

        const rate = Number(
          data?.rate
        );

        if (
          !response.ok ||
          !data?.success ||
          !Number.isFinite(rate) ||
          rate <= 0
        ) {
          throw new Error(
            `${currency} 汇率获取失败`
          );
        }

        if (rate === 1) {
          throw new Error(
            `${currency} 汇率异常：API 返回 1，请检查汇率接口`
          );
        }

        if (!cancelled) {
          setFxRate(rate);
        }
      } catch (err) {
        if (cancelled) {
          return;
        }

        console.log(
          "FX 获取失败",
          err
        );

        setFxRate(null);

        setError(
          err instanceof Error
            ? err.message
            : "获取汇率失败"
        );
      } finally {
        if (!cancelled) {
          setFxLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    region,
    currency,
    transactionDate,
    selectedHoldingId,
  ]);

  // ===================================================
  // BUY 自动计算交易金额
  //
  // 交易金额 = 买入单价 × Shares
  // 手续费单独记录，不计入成交金额。
  //
  // 用户仍然可以手动修改交易金额。
  // ===================================================

  useEffect(() => {
    if (
      transactionType !== "BUY"
    ) {
      return;
    }

    const price =
      toNumber(tradePrice);

    const shareNumber =
      toNumber(shares);

    if (
      price > 0 &&
      shareNumber > 0
    ) {
      const calculatedAmount =
        price * shareNumber;

      setTradeAmount(
        String(
          Number(
            calculatedAmount.toFixed(
              8
            )
          )
        )
      );
    }
  }, [
    tradePrice,
    shares,
    fee,
    transactionType,
  ]);

  // ===================================================
  // SELL 自动计算
  // ===================================================

  useEffect(() => {
    if (
      transactionType !== "SELL"
    ) {
      return;
    }

    const price =
      toNumber(tradePrice);

    if (price <= 0) {
      return;
    }

    if (
      sellMode === "SHARES"
    ) {
      const shareNumber =
        toNumber(shares);

      if (shareNumber > 0) {
        const amount =
          shareNumber * price;

        setTradeAmount(
          String(
            Number(
              amount.toFixed(8)
            )
          )
        );
      }
    }

    if (
      sellMode === "AMOUNT"
    ) {
      const amount =
        toNumber(tradeAmount);

      if (amount > 0) {
        const calculatedShares =
          amount / price;

        setShares(
          String(
            Number(
              calculatedShares.toFixed(
                8
              )
            )
          )
        );
      }
    }
  }, [
    transactionType,
    sellMode,
    shares,
    tradePrice,
    tradeAmount,
  ]);

  // ===================================================
  // CNY 交易金额
  // ===================================================

  const tradeValueCny =
    useMemo(() => {
      const amount =
        toNumber(tradeAmount);

      if (amount <= 0) {
        return 0;
      }

      if (currency === "CNY") {
        return amount;
      }

      if (
        !fxRate ||
        fxRate <= 0
      ) {
        return 0;
      }

      return amount * fxRate;
    }, [
      tradeAmount,
      currency,
      fxRate,
    ]);

  // ===================================================
  // SELL 扣减成本
  // ===================================================

  const sellCostBasisCny =
    useMemo(() => {
      if (
        transactionType !== "SELL"
      ) {
        return 0;
      }

      const shareNumber =
        toNumber(shares);

      if (
        shareNumber <= 0 ||
        currentAvgCostCny <= 0
      ) {
        return 0;
      }

      return (
        shareNumber *
        currentAvgCostCny
      );
    }, [
      transactionType,
      shares,
      currentAvgCostCny,
    ]);

  // ===================================================
  // SELL 剩余 Shares
  // ===================================================

  const remainingShares =
    useMemo(() => {
      if (
        transactionType !== "SELL"
      ) {
        return currentShares;
      }

      return Math.max(
        0,
        currentShares -
          toNumber(shares)
      );
    }, [
      transactionType,
      currentShares,
      shares,
    ]);

  // ===================================================
  // SELL 剩余 Cost
  // ===================================================

  const remainingCostCny =
    useMemo(() => {
      if (
        transactionType !== "SELL"
      ) {
        return currentCostCny;
      }

      return Math.max(
        0,
        currentCostCny -
          sellCostBasisCny
      );
    }, [
      transactionType,
      currentCostCny,
      sellCostBasisCny,
    ]);

  // ===================================================
  // SELL 后剩余持仓市值预览
  // ===================================================

  const sellMarketPriceNative =
    useMemo(() => {
      if (transactionType !== "SELL") {
        return 0;
      }

      return (
        toNumber(selectedHolding?.nav) ||
        toNumber(tradePrice)
      );
    }, [
      transactionType,
      selectedHolding,
      tradePrice,
    ]);

  const remainingMarketValueNative =
    useMemo(() => {
      if (transactionType !== "SELL") {
        return 0;
      }

      return Math.max(
        0,
        remainingShares *
          sellMarketPriceNative
      );
    }, [
      transactionType,
      remainingShares,
      sellMarketPriceNative,
    ]);

  const defaultCashNativeValuePreview =
    Math.max(
      0,
      toNumber(tradeAmount) - toNumber(fee)
    );

  const finalCashNativeAmountPreview =
    Math.max(
      0,
      toNumber(cashNativeAmount) > 0
        ? toNumber(cashNativeAmount)
        : defaultCashNativeValuePreview
    );

  const defaultCashCnyValuePreview = Math.max(
    0,
    tradeValueCny - toNumber(fee)
  );

  const finalCashCnyAmountPreview =
    currency === "CNY"
      ? Math.max(
          0,
          cashCnyAmount !== ""
            ? toNumber(cashCnyAmount)
            : defaultCashCnyValuePreview
        )
      : Math.max(
          0,
          finalCashNativeAmountPreview *
            (fxRate || 0)
        );

  const finalCashCnyCostPreview =
    currency === "CNY"
      ? Math.max(
          0,
          cashCnyCost !== ""
            ? toNumber(cashCnyCost)
            : defaultCashCnyValuePreview
        )
      : Math.max(
          0,
          (cashNativeCost !== ""
            ? toNumber(cashNativeCost)
            : defaultCashNativeValuePreview) *
            (fxRate || 0)
        );

  // ===================================================
  // SELL 后剩余持仓市值预览
  // ===================================================

  const remainingMarketValueCny =
    useMemo(() => {
      if (transactionType !== "SELL") {
        return 0;
      }

      if (currency === "CNY") {
        return remainingMarketValueNative;
      }

      return Math.max(
        0,
        remainingMarketValueNative *
          (fxRate || 0)
      );
    }, [
      transactionType,
      currency,
      remainingMarketValueNative,
      fxRate,
    ]);

  // ===================================================
  // SELL 默认 Cash Holding
  // ===================================================

  useEffect(() => {
    if (
      transactionType !== "SELL"
    ) {
      return;
    }

    const defaultCode =
      getCashDefaultCode(
        region,
        platform
      );

    const previousDefaultPrefix =
      `${getCashPrefix(region)}_`;

    if (
      !cashAssetCode ||
      cashAssetCode.startsWith(
        previousDefaultPrefix
      )
    ) {
      setCashAssetCode(
        defaultCode
      );
    }
  }, [
    transactionType,
    region,
    platform,
    cashAssetCode,
  ]);

  // ===================================================
  // 是否真正写入 Security Holding
  // ===================================================

  const writesSecurityHolding =
    scenario === "HOLDING" ||
    (
      scenario === "NEW" &&
      transactionType === "BUY"
    );

  // ===================================================
  // 是否写入 Cash Holding
  // ===================================================

  const writesCashHolding =
    scenario === "HOLDING" &&
    transactionType === "SELL";

  // ===================================================
  // 更新 Security Holding
  // ===================================================

  const updateSecurityHolding =
    async ({
      holding,
      type,
      shareCount,
      tradeAmountNative,
      grossTradeAmountNative,
      grossTradeValueCny,
      tradeValueCny,
      sellCostBasisCny,
      feeNative,
      feeCny,
      currency,
    }: {
      holding: Holding;
      type: TransactionType;
      shareCount: number;
      tradeAmountNative: number;
      grossTradeAmountNative: number;
      grossTradeValueCny: number;
      tradeValueCny: number;
      sellCostBasisCny: number;
      feeNative: number;
      feeCny: number;
      currency: Currency;
    }) => {
      const oldShares =
        toNumber(holding.shares);

      const oldCostCny =
        toNumber(holding.cost);

      const oldAmountCny =
        toNumber(holding.amount);

      if (oldShares < 0) {
        throw new Error(
          `Holding ${holding.code} 的 Shares 已经小于 0`
        );
      }

      if (
        type === "SELL" &&
        shareCount >
          oldShares +
            0.00000001
      ) {
        throw new Error(
          `Holding ${holding.code} 可卖 Shares 不足`
        );
      }

      // -------------------------------------------------
      // 非 CNY Holding
      // -------------------------------------------------

      let native:
        | HoldingNativeCurrency
        | null = null;

      if (
        currency !== "CNY"
      ) {
        if (
          tradeAmountNative <=
          0
        ) {
          throw new Error(
            `${currency} 原币交易金额必须大于 0`
          );
        }

        const {
          data: nativeRaw,
          error: nativeFindError,
        } = await supabase
          .from(
            "holding_native_currency"
          )
          .select(
            [
              "id",
              "holding_id",
              "native_currency",
              "native_amount",
              "native_cost",
              "fee_cost",
              "updated_at",
            ].join(",")
          )
          .eq(
            "holding_id",
            holding.id
          )
          .maybeSingle();

        if (nativeFindError) {
          throw nativeFindError;
        }

        native =
          nativeRaw as unknown as HoldingNativeCurrency | null;

        if (!native) {
          throw new Error(
            `Holding ${holding.code} 缺少 holding_native_currency 记录，不能进行 ${currency} ${type}`
          );
        }

        if (
          native.native_currency !==
          currency
        ) {
          throw new Error(
            `Holding ${holding.code} 的原币是 ${native.native_currency}，当前交易币种为 ${currency}`
          );
        }
      }

      let newShares =
        oldShares;

      let newCostCny =
        oldCostCny;

      let newAmountCny =
        oldAmountCny;

      let active =
        holding.active !== false;

      let sellMarketPriceNative = 0;

      // -------------------------------------------------
      // BUY
      // -------------------------------------------------

      if (type === "BUY") {
        newShares =
          oldShares +
          shareCount;

        newCostCny =
          oldCostCny +
          grossTradeValueCny;

        newAmountCny =
          oldAmountCny +
          grossTradeValueCny;

        active = true;
      } else {
        // -------------------------------------------------
        // SELL
        // -------------------------------------------------
        //
        // Shares / Cost / FeeCost 与市值 Amount 分开处理：
        //
        // 1. Shares：减去本次卖出 Shares
        // 2. Cost：减去本次卖出 Shares 对应的历史成本
        // 3. fee_cost：累计本次手续费，永不因为 Shares 清零而重置
        // 4. Amount：SELL 后不再用「旧 Amount - 卖出成交金额」
        //    而是用「SELL 后剩余 Shares × 最近价格」重新计算
        //
        // 最近价格优先读取数据库中当前 Holding.nav。
        // Holding.nav 是 update-market/route 最近一次更新的市场价格。
        // 如果数据库 nav 暂不可用，则退回页面当前 Holding.nav，
        // 最后再退回本次 SELL 成交价，避免 Amount 被错误清零。
        // -------------------------------------------------

        newShares =
          oldShares -
          shareCount;

        newCostCny =
          oldCostCny -
          sellCostBasisCny;

        if (
          Math.abs(newShares) <
          0.00000001
        ) {
          newShares = 0;
        }

        const {
          data: latestHoldingPriceRow,
          error: latestHoldingPriceError,
        } = await supabase
          .from("holdings")
          .select("nav")
          .eq("id", holding.id)
          .maybeSingle();

        if (latestHoldingPriceError) {
          throw latestHoldingPriceError;
        }

        sellMarketPriceNative =
          toNumber(
            latestHoldingPriceRow?.nav
          ) ||
          toNumber(holding.nav) ||
          (shareCount > 0
            ? grossTradeAmountNative /
              shareCount
            : 0);

        if (
          newShares > 0 &&
          sellMarketPriceNative <= 0
        ) {
          throw new Error(
            `Holding ${holding.code} SELL 后无法取得有效的最近价格，不能重新计算剩余市值`
          );
        }

        // 非 CNY 时，grossTradeValueCny / grossTradeAmountNative
        // 就是本次交易使用的 native → CNY 汇率。
        const cnyPerNative =
          currency === "CNY"
            ? 1
            : grossTradeAmountNative > 0
              ? grossTradeValueCny /
                grossTradeAmountNative
              : 0;

        const remainingMarketValueNativeAfterSell =
          newShares > 0
            ? newShares *
              sellMarketPriceNative
            : 0;

        newAmountCny =
          currency === "CNY"
            ? remainingMarketValueNativeAfterSell
            : remainingMarketValueNativeAfterSell *
              cnyPerNative;

        if (
          Math.abs(newShares) <
          0.00000001
        ) {
          newShares = 0;
        }

        if (
          Math.abs(newCostCny) <
          0.01
        ) {
          newCostCny = 0;
        }

        if (
          Math.abs(newAmountCny) <
          0.01
        ) {
          newAmountCny = 0;
        }

        if (newShares <= 0) {
          newShares = 0;
          newCostCny = 0;
          newAmountCny = 0;
          active = false;
        }
      }

      if (
        newShares <
        -0.00000001
      ) {
        throw new Error(
          "Holding Shares 不能小于 0"
        );
      }

      if (
        newCostCny <
        -0.01
      ) {
        throw new Error(
          "Holding Cost 不能小于 0"
        );
      }

      if (
        newAmountCny <
        -0.01
      ) {
        throw new Error(
          "Holding Amount 不能小于 0"
        );
      }

      const roundedCost =
        Math.max(
          0,
          Math.round(newCostCny)
        );

      const roundedAmount =
        Math.max(
          0,
          Math.round(newAmountCny)
        );

      const oldFeeCny =
        toNumber(holding.fee_cost);

      const newFeeCny =
        oldFeeCny + feeCny;

      const profit =
        roundedAmount -
        roundedCost;

      const profitRate =
        roundedCost > 0
          ? (profit /
              roundedCost) *
            100
          : 0;

      const holdingPayload = {
        shares:
          Math.max(
            0,
            newShares
          ),

        cost: roundedCost,

        fee_cost: newFeeCny,

        amount:
          roundedAmount,

        profit:
          Math.round(profit),

        profit_rate:
          profitRate,

        currency: "CNY",

        active,

        updated_at:
          new Date().toISOString(),
      };

      const {
        error: holdingError,
      } = await supabase
        .from("holdings")
        .update(
          holdingPayload
        )
        .eq(
          "id",
          holding.id
        );

      if (holdingError) {
        throw holdingError;
      }

      // CNY Holding 不写 native table
      if (
        currency === "CNY"
      ) {
        return;
      }

      if (!native) {
        throw new Error(
          "内部错误：native row 未加载"
        );
      }

      const oldNativeAmount =
        toNumber(
          native.native_amount
        );

      const oldNativeCost =
        toNumber(
          native.native_cost
        );

      let newNativeAmount =
        oldNativeAmount;

      let newNativeCost =
        oldNativeCost;

      const oldNativeFeeCost =
        toNumber(native.fee_cost);

      const newNativeFeeCost =
        oldNativeFeeCost + feeNative;

      if (
        type === "BUY"
      ) {
        newNativeAmount =
          oldNativeAmount +
          grossTradeAmountNative;

        newNativeCost =
          oldNativeCost +
          grossTradeAmountNative;
      } else {
        // -------------------------------------------------
        // SELL native_amount
        // -------------------------------------------------
        //
        // SELL 后 native_amount 表示「剩余持仓的当前/最近市值」，
        // 因此不能继续用 oldNativeAmount - 本次卖出成交金额。
        //
        // 与 holdings.amount 使用完全相同的最近价格逻辑：
        // remaining Shares × Holding.nav。
        // -------------------------------------------------

        newNativeAmount =
          newShares > 0
            ? newShares *
              sellMarketPriceNative
            : 0;

        // -------------------------------------------------
        // SELL native_cost
        //
        // 按卖出 Shares / 原持仓 Shares
        // 比例扣减历史原币成本。
        // 这里绝对不能使用市场价格重新计算 cost。
        // -------------------------------------------------

        const nativeCostBasis =
          oldShares > 0
            ? oldNativeCost *
              (shareCount /
                oldShares)
            : oldNativeCost;

        newNativeCost =
          oldNativeCost -
          nativeCostBasis;

        if (
          Math.abs(
            newNativeAmount
          ) <
          0.00000001
        ) {
          newNativeAmount = 0;
        }

        if (
          Math.abs(
            newNativeCost
          ) <
          0.00000001
        ) {
          newNativeCost = 0;
        }

        if (
          newNativeAmount <
          -0.00000001
        ) {
          throw new Error(
            `${currency} native_amount 不足，不能完成 SELL`
          );
        }

        if (
          newNativeCost <
          -0.00000001
        ) {
          throw new Error(
            `${currency} native_cost 不足，不能完成 SELL`
          );
        }
      }

      const {
        error:
          nativeUpdateError,
      } = await supabase
        .from(
          "holding_native_currency"
        )
        .update({
          native_amount:
            Math.max(
              0,
              newNativeAmount
            ),

          native_cost:
            Math.max(
              0,
              newNativeCost
            ),

          fee_cost:
            newNativeFeeCost,

          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          native.id
        );

      if (
        nativeUpdateError
      ) {
        // -------------------------------------------------
        // 回滚 holdings
        // -------------------------------------------------

        await supabase
          .from("holdings")
          .update({
            shares:
              oldShares,

            cost:
              Math.max(
                0,
                Math.round(
                  oldCostCny
                )
              ),

            fee_cost:
              oldFeeCny,

            amount:
              Math.max(
                0,
                Math.round(
                  oldAmountCny
                )
              ),

            profit:
              Math.round(
                oldAmountCny
              ) -
              Math.round(
                oldCostCny
              ),

            profit_rate:
              oldCostCny > 0
                ? ((oldAmountCny -
                    oldCostCny) /
                    oldCostCny) *
                  100
                : 0,

            currency: "CNY",

            active:
              holding.active !==
              false,

            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            holding.id
          );

        throw nativeUpdateError;
      }
    };

  // ===================================================
  // 回滚 Security Holding
  // ===================================================

  const restoreSecurityHolding =
    async (
      holding: Holding
    ) => {
      const {
        error,
      } = await supabase
        .from("holdings")
        .update({
          shares:
            holding.shares,

          amount:
            Math.max(
              0,
              Math.round(
                toNumber(
                  holding.amount
                )
              )
            ),

          cost:
            Math.max(
              0,
              Math.round(
                toNumber(
                  holding.cost
                )
              )
            ),

          fee_cost:
            toNumber(
              holding.fee_cost
            ),

          profit:
            Math.round(
              toNumber(
                holding.profit
              )
            ),

          profit_rate:
            toNumber(
              holding.profit_rate
            ),

          currency: "CNY",

          active:
            holding.active !==
            false,

          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          holding.id
        );

      if (error) {
        console.log(
          "Security Holding 回滚失败",
          error
        );
      }

      // -------------------------------------------------
      // 非 CNY SELL：
      // 同时恢复 native
      // -------------------------------------------------

      if (
        holding.native_currency !==
          "CNY" &&
        holding.native_currency
      ) {
        const {
          error:
            nativeError,
        } = await supabase
          .from(
            "holding_native_currency"
          )
          .update({
            native_amount:
              toNumber(
                holding.native_amount
              ),

            native_cost:
              toNumber(
                holding.native_cost
              ),

            fee_cost:
              toNumber(
                holding.native_fee_cost
              ),

            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "holding_id",
            holding.id
          );

        if (nativeError) {
          console.log(
            "Security Holding_native_currency 回滚失败",
            nativeError
          );
        }
      }
    };

  // ===================================================
  // 创建 NEW Security Holding
  // ===================================================

  const createNewSecurityHolding =
    async ({
      code,
      name,
      market,
      category,
      amountCny,
      costCny,
      shares,
      currency,
      nav,
      platform,
      nativeAmount,
      feeNative,
      feeCny,
    }: {
      code: string;
      name: string;
      market: string;
      category: string;
      amountCny: number;
      costCny: number;
      shares: number;
      currency: Currency;
      nav: number;
      platform: string;
      nativeAmount: number;
      feeNative: number;
      feeCny: number;
    }) => {
      if (!code.trim()) {
        throw new Error(
          "NEW BUY 缺少资产代码"
        );
      }

      if (!name.trim()) {
        throw new Error(
          "NEW BUY 缺少资产名称"
        );
      }

      if (!category) {
        throw new Error(
          "NEW BUY 缺少资产类别"
        );
      }

      if (amountCny <= 0) {
        throw new Error(
          "NEW BUY CNY 金额必须大于 0"
        );
      }

      if (costCny <= 0) {
        throw new Error(
          "NEW BUY CNY 成本必须大于 0"
        );
      }

      if (shares <= 0) {
        throw new Error(
          "NEW BUY Shares 必须大于 0"
        );
      }

      const {
        data: existingRaw,
        error: existingError,
      } = await supabase
        .from("holdings")
        .select(
          "id, code, name, platform, active"
        )
        .eq(
          "code",
          code.trim()
        )
        .eq(
          "platform",
          platform.trim()
        )
        .eq(
          "active",
          true
        )
        .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      if (existingRaw) {
        throw new Error(
          `Holding 已存在：${code.trim()}（${platform.trim()}），请使用「已有 Holding」进行 BUY`
        );
      }

      const {
        data: insertedRaw,
        error: insertError,
      } = await supabase
        .from("holdings")
        .insert({
          code:
            code.trim(),

          name:
            name.trim(),

          market,

          category,

          amount:
            Math.round(
              amountCny
            ),

          cost:
            Math.round(
              costCny
            ),

          fee_cost:
            feeCny,

          profit: 0,

          profit_rate: 0,

          currency: "CNY",

          nav,

          shares,

          platform:
            platform.trim(),

          active: true,

          skip_update: false,

          updated_at:
            new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insertError) {
        throw insertError;
      }

      if (
        currency === "CNY"
      ) {
        return;
      }

      const holdingId =
        Number(
          (
            insertedRaw as unknown as {
              id: number;
            }
          ).id
        );

      if (!holdingId) {
        throw new Error(
          "NEW BUY 创建 Holding 后没有取得 holding_id"
        );
      }

      const {
        error:
          nativeInsertError,
      } = await supabase
        .from(
          "holding_native_currency"
        )
        .insert({
          holding_id:
            holdingId,

          native_currency:
            currency,

          native_amount:
            nativeAmount,

          native_cost:
            nativeAmount,

          fee_cost:
            feeNative,

          updated_at:
            new Date().toISOString(),
        });

      if (
        nativeInsertError
      ) {
        await supabase
          .from("holdings")
          .delete()
          .eq(
            "id",
            holdingId
          );

        throw nativeInsertError;
      }
    };

  // ===================================================
  // Cash Holding + holding_native_currency
  // ===================================================

  const updateCashHolding =
    async ({
      code,
      currency,
      market,
      platform,
      cnyAmount,
      cnyCost,
      nativeAmount,
      nativeCost,
      fxRate,
    }: {
      code: string;
      currency: Currency;
      market: string;
      platform: string;
      cnyAmount: number;
      cnyCost: number;
      nativeAmount: number;
      nativeCost: number;
      fxRate: number;
    }) => {
      if (
        !code ||
        cnyAmount <= 0
      ) {
        throw new Error(
          "Cash Holding 参数无效"
        );
      }

      // =================================================
      // CNY Cash
      // =================================================

      if (
        currency === "CNY"
      ) {
        const {
          data: existingRaw,
          error: findError,
        } = await supabase
          .from("holdings")
          .select(
            "id, amount, cost, active"
          )
          .eq(
            "code",
            code
          )
          .maybeSingle();

        if (findError) {
          throw findError;
        }

        const existing =
          existingRaw as unknown as HoldingBalanceRow | null;

        if (existing) {
          const {
            error,
          } = await supabase
            .from("holdings")
            .update({
              amount:
                Math.round(
                  toNumber(
                    existing.amount
                  ) +
                    cnyAmount
                ),

              cost:
                Math.round(
                  toNumber(
                    existing.cost
                  ) +
                    cnyCost
                ),

              currency: "CNY",

              active: true,

              updated_at:
                new Date().toISOString(),
            })
            .eq(
              "id",
              existing.id
            );

          if (error) {
            throw error;
          }
        } else {
          const {
            error,
          } = await supabase
            .from("holdings")
            .insert({
              code,

              name:
                getCashName(
                  market === "CN"
                    ? "CN"
                    : "HK",
                  platform
                ),

              market,

              category: "fixed_income",

              amount:
                Math.round(
                  cnyAmount
                ),

              cost:
                Math.round(
                  cnyCost
                ),

              fee_cost: 0,

              profit: 0,

              profit_rate: 0,

              currency: "CNY",

              shares: null,

              nav: null,

              platform,

              active: true,

              skip_update: true,

              updated_at:
                new Date().toISOString(),
            });

          if (error) {
            throw error;
          }
        }

        return {
          cnyAmount,

          nativeCurrency:
            "CNY" as Currency,

          nativeAmount,

          holdingCreated:
            !existing,

          nativeCreated: false,

          securityCostBasisCny: 0,

          securityNativeAmount: 0,

          securityNativeCostBasis: 0,

          securityNativeCurrency:
            null,
        };
      }

      // =================================================
      // 非 CNY Cash
      // =================================================

      if (
        !fxRate ||
        fxRate <= 0
      ) {
        throw new Error(
          `${currency} Cash Holding 缺少有效汇率`
        );
      }

      if (
        nativeAmount <= 0
      ) {
        throw new Error(
          `${currency} Cash Holding 原币金额必须大于 0`
        );
      }

      const {
        data: existingRaw,
        error:
          findHoldingError,
      } = await supabase
        .from("holdings")
        .select(
          "id, amount, cost, active"
        )
        .eq(
          "code",
          code
        )
        .maybeSingle();

      if (findHoldingError) {
        throw findHoldingError;
      }

      const existing =
        existingRaw as unknown as HoldingBalanceRow | null;

      let holdingId: number;

      let holdingCreated =
        false;

      if (existing) {
        holdingId =
          existing.id;

        const {
          error,
        } = await supabase
          .from("holdings")
          .update({
            amount:
              Math.round(
                toNumber(
                  existing.amount
                ) +
                  cnyAmount
              ),

            cost:
              Math.round(
                toNumber(
                  existing.cost
                ) +
                  cnyCost
              ),

            currency: "CNY",

            active: true,

            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            existing.id
          );

        if (error) {
          throw error;
        }
      } else {
        const {
          data: insertedRaw,
          error,
        } = await supabase
          .from("holdings")
          .insert({
            code,

            name:
              getCashName(
                market === "CN"
                  ? "CN"
                  : "HK",
                platform
              ),

            market,

            category: "fixed_income",

            amount:
              Math.round(
                cnyAmount
              ),

            cost:
              Math.round(
                cnyCost
              ),

            profit: 0,

            profit_rate: 0,

            currency: "CNY",

            shares: null,

            nav: null,

            platform,

            active: true,

            skip_update: true,

            updated_at:
              new Date().toISOString(),
          })
          .select("id")
          .single();

        if (error) {
          throw error;
        }

        holdingId =
          Number(
            (
              insertedRaw as unknown as {
                id: number;
              }
            ).id
          );

        holdingCreated =
          true;
      }

      // =================================================
      // 找 native row
      // =================================================

      const {
        data: nativeRaw,
        error:
          nativeFindError,
      } = await supabase
        .from(
          "holding_native_currency"
        )
        .select(
          "id, holding_id, native_currency, native_amount, native_cost, fee_cost, updated_at"
        )
        .eq(
          "holding_id",
          holdingId
        )
        .maybeSingle();

      if (nativeFindError) {
        throw nativeFindError;
      }

      const native =
        nativeRaw as unknown as HoldingNativeCurrency | null;

      if (
        native &&
        native.native_currency !==
          currency
      ) {
        throw new Error(
          `Cash Holding ${code} 已存在 ${native.native_currency} 原币记录，不能写入 ${currency}`
        );
      }

      let nativeCreated =
        false;

      // =================================================
      // native 已存在
      // =================================================

      if (native) {
        const {
          error,
        } = await supabase
          .from(
            "holding_native_currency"
          )
          .update({
            native_amount:
              toNumber(
                native.native_amount
              ) +
              nativeAmount,

            native_cost:
              toNumber(
                native.native_cost
              ) +
              nativeCost,

            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            native.id
          );

        if (error) {
          await supabase
            .from("holdings")
            .update({
              amount:
                Math.max(
                  0,
                  Math.round(
                    toNumber(
                      existing?.amount
                    )
                  )
                ),

              cost:
                Math.max(
                  0,
                  Math.round(
                    toNumber(
                      existing?.cost
                    )
                  )
                ),

              active:
                existing?.active !==
                false,

              currency: "CNY",

              updated_at:
                new Date().toISOString(),
            })
            .eq(
              "id",
              holdingId
            );

          throw error;
        }
      } else {
        // =================================================
        // native 不存在 → 创建
        // =================================================

        const {
          error,
        } = await supabase
          .from(
            "holding_native_currency"
          )
          .insert({
            holding_id:
              holdingId,

            native_currency:
              currency,

            native_amount:
              nativeAmount,

            native_cost:
              nativeCost,

            updated_at:
              new Date().toISOString(),
          });

        if (error) {
          if (holdingCreated) {
            await supabase
              .from("holdings")
              .delete()
              .eq(
                "id",
                holdingId
              );
          } else if (existing) {
            await supabase
              .from("holdings")
              .update({
                amount:
                  Math.max(
                    0,
                    Math.round(
                      toNumber(
                        existing.amount
                      )
                    )
                  ),

                cost:
                  Math.max(
                    0,
                    Math.round(
                      toNumber(
                        existing.cost
                      )
                    )
                  ),

                active:
                  existing.active !==
                  false,

                currency: "CNY",

                updated_at:
                  new Date().toISOString(),
              })
              .eq(
                "id",
                holdingId
              );
          }

          throw error;
        }

        nativeCreated =
          true;
      }

      return {
        cnyAmount,

        nativeCurrency:
          currency,

        nativeAmount,

        holdingCreated,

        nativeCreated,

        securityCostBasisCny: 0,

        securityNativeAmount: 0,

        securityNativeCostBasis: 0,

        securityNativeCurrency:
          null,
      };
    };

  // ===================================================
  // 验证
  // ===================================================

  const validate = () => {
    if (!transactionDate) {
      throw new Error(
        "请选择交易日期"
      );
    }

    if (!assetCode.trim()) {
      throw new Error(
        "请输入资产代码"
      );
    }

    if (!assetName.trim()) {
      throw new Error(
        "请输入资产名称"
      );
    }

    if (!platform.trim()) {
      throw new Error(
        "请输入平台"
      );
    }

    if (
      scenario === "HOLDING" &&
      !selectedHolding
    ) {
      throw new Error(
        "HOLDING 交易必须选择 Holding"
      );
    }

    if (
      scenario === "NEW" &&
      transactionType !== "BUY"
    ) {
      throw new Error(
        "NEW 交易目前只能使用 BUY"
      );
    }

    if (
      scenario === "NEW" &&
      !category
    ) {
      throw new Error(
        "NEW 买入必须手动选择资产类别"
      );
    }

    if (
      scenario === "HOLDING" &&
      !selectedHolding?.category
    ) {
      throw new Error(
        "当前 Holding 没有 category"
      );
    }

    const amount =
      toNumber(tradeAmount);

    const price =
      toNumber(tradePrice);

    const shareNumber =
      toNumber(shares);

    if (amount <= 0) {
      throw new Error(
        "交易金额必须大于 0"
      );
    }

    if (price <= 0) {
      throw new Error(
        "交易单价必须大于 0"
      );
    }

    if (shareNumber <= 0) {
      throw new Error(
        "Shares 必须大于 0"
      );
    }

    // -------------------------------------------------
    // SELL
    // -------------------------------------------------

    if (
      transactionType === "SELL"
    ) {
      if (!selectedHolding) {
        throw new Error(
          "SELL 必须选择 Holding"
        );
      }

      if (
        currentShares <= 0
      ) {
        throw new Error(
          "当前 Holding 没有可卖 Shares"
        );
      }

      if (
        shareNumber >
        currentShares +
          0.00000001
      ) {
        throw new Error(
          `卖出 Shares 不能超过当前持有数量 ${formatNumber(
            currentShares,
            8
          )}`
        );
      }

      if (
        sellCostBasisCny >
        currentCostCny +
          0.01
      ) {
        throw new Error(
          "卖出扣减成本不能超过当前 Holding 成本"
        );
      }
    }

    // -------------------------------------------------
    // FX
    // -------------------------------------------------

    if (
      currency !== "CNY"
    ) {
      if (
        !fxRate ||
        fxRate <= 0
      ) {
        throw new Error(
          `当前 ${currency} 交易需要有效汇率`
        );
      }

      if (
        (currency === "USD" ||
          currency === "HKD") &&
        fxRate === 1
      ) {
        throw new Error(
          `${currency} 汇率不能为 1`
        );
      }
    }

    if (
      tradeValueCny <= 0
    ) {
      throw new Error(
        "CNY 交易金额必须大于 0"
      );
    }
  };

  // ===================================================
  // 保存
  // ===================================================

  const handleSave = async () => {
    try {
      setSaving(true);

      setMessage("");
      setError("");
      setCashHoldingResult(null);

      validate();

      const priceNumber =
        toNumber(tradePrice);

      const shareNumber =
        toNumber(shares);

      const feeNumber =
        toNumber(fee);

      const grossTradeAmountNative =
        priceNumber * shareNumber;

      // BUY 的交易金额永远以「单价 × Shares」为准，
      // 不读取可能曾经包含手续费的 tradeAmount 状态。
      const amountNumber =
        transactionType === "BUY"
          ? grossTradeAmountNative
          : toNumber(tradeAmount);

      const grossTradeValueCny =
        currency === "CNY"
          ? grossTradeAmountNative
          : grossTradeAmountNative *
            (fxRate || 0);

      const feeCny =
        currency === "CNY"
          ? feeNumber
          : feeNumber *
            (fxRate || 0);

      const finalCny =
        currency === "CNY"
          ? amountNumber
          : amountNumber * (fxRate || 0);

      const finalCostBasis =
        transactionType === "SELL"
          ? sellCostBasisCny
          : 0;

      const finalCategory =
        scenario === "HOLDING"
          ? selectedHolding?.category ||
            null
          : category || null;

      const market =
        region === "CN"
          ? "CN"
          : "HK";

      const finalCashAssetCode =
        transactionType === "SELL"
          ? cashAssetCode.trim() ||
            getCashDefaultCode(
              region,
              platform
            )
          : null;

      // SELL → Cash Holding_native_currency
      // 原币金额/成本允许人工调整；未调整时默认净卖出金额。
      const defaultCashNativeValue = Math.max(
        0,
        amountNumber - feeNumber
      );

      const finalCashNativeAmount =
        transactionType === "SELL" &&
        currency !== "CNY"
          ? Math.max(
              0,
              cashNativeAmount !== ""
                ? toNumber(cashNativeAmount)
                : defaultCashNativeValue
            )
          : defaultCashNativeValue;

      const finalCashNativeCost =
        transactionType === "SELL" &&
        currency !== "CNY"
          ? Math.max(
              0,
              cashNativeCost !== ""
                ? toNumber(cashNativeCost)
                : defaultCashNativeValue
            )
          : defaultCashNativeValue;

      // Cash Holding.amount / cost：
      // CNY SELL → 用户可直接修改 CNY amount / cost；这里就是最终写入值。
      // 非 CNY SELL → 不允许直接修改 CNY amount / cost；
      //              最终值严格来自 Cash Holding_native_currency.native_amount / native_cost × FX。
      const defaultCashCnyValue = Math.max(
        0,
        finalCny - feeCny
      );

      const finalCashCnyAmount =
        currency === "CNY"
          ? Math.max(
              0,
              toNumber(cashCnyAmount) > 0
                ? toNumber(cashCnyAmount)
                : defaultCashCnyValue
            )
          : Math.max(
              0,
              finalCashNativeAmount * (fxRate || 0)
            );

      const finalCashCnyCost =
        currency === "CNY"
          ? Math.max(
              0,
              toNumber(cashCnyCost) > 0
                ? toNumber(cashCnyCost)
                : defaultCashCnyValue
            )
          : Math.max(
              0,
              finalCashNativeCost * (fxRate || 0)
            );

      // =================================================
      // 1. 写 investment_transactions
      //
      // 重要：
      // investment_transactions 没有：
      //   region
      //   holding_id
      //
      // 所以这里绝对不能写这两个字段。
      // =================================================

      const {
        data: insertedTransaction,
        error:
          transactionError,
      } = await supabase
        .from(
          "investment_transactions"
        )
        .insert({
          transaction_date:
            transactionDate,

          transaction_type:
            transactionType,


          market,

          // 注意：
          // 这里没有 region

          asset_code:
            assetCode.trim(),

          asset_name:
            assetName.trim(),

          platform:
            platform.trim(),

          category:
            finalCategory,

          currency,

          trade_amount:
            amountNumber,

          trade_price:
            priceNumber,

          shares:
            shareNumber,

          fee:
            feeNumber,

          fx_rate:
            currency === "CNY"
              ? 1
              : fxRate,

          trade_value_cny:
            finalCny,

          cost_basis_cny:
            transactionType === "SELL"
              ? finalCostBasis
              : grossTradeValueCny,

          cash_asset_code:
            finalCashAssetCode,

          remark:
            remark.trim() ||
            null,
        })
        .select("id")
        .single();

      if (transactionError) {
        throw transactionError;
      }

      const transactionId =
        insertedTransaction?.id;

      try {
        // =================================================
        // 2. HOLDING BUY
        // =================================================

        if (
          scenario === "HOLDING" &&
          transactionType === "BUY" &&
          selectedHolding
        ) {
          await updateSecurityHolding({
            holding:
              selectedHolding,

            type: "BUY",

            shareCount:
              shareNumber,

            tradeAmountNative:
              amountNumber,

            grossTradeAmountNative:
              grossTradeAmountNative,

            grossTradeValueCny:
              grossTradeValueCny,

            tradeValueCny:
              finalCny,

            sellCostBasisCny:
              0,

            feeNative:
              feeNumber,

            feeCny:
              feeCny,

            currency,
          });
        }

        // =================================================
        // 3. NEW BUY
        // =================================================

        if (
          scenario === "NEW" &&
          transactionType === "BUY"
        ) {
          await createNewSecurityHolding({
            code:
              assetCode.trim(),

            name:
              assetName.trim(),

            market,

            category:
              finalCategory!,

            amountCny:
              grossTradeValueCny,

            costCny:
              grossTradeValueCny,

            shares:
              shareNumber,

            currency,

            nav:
              priceNumber,

            platform:
              platform.trim(),

            nativeAmount:
              grossTradeAmountNative,

            feeNative:
              feeNumber,

            feeCny:
              feeCny,
          });
        }

        // =================================================
        // 4. HOLDING SELL
        // =================================================

        if (
          scenario === "HOLDING" &&
          transactionType === "SELL" &&
          selectedHolding
        ) {
          // -----------------------------------------------
          // 4.1 Security Holding
          // -----------------------------------------------

          const securityNativeAmount =
            currency !== "CNY"
              ? amountNumber
              : 0;

          const securityNativeCostBasis =
            currency !== "CNY" &&
            toNumber(
              selectedHolding.native_cost
            ) > 0 &&
            toNumber(
              selectedHolding.shares
            ) > 0
              ? toNumber(
                  selectedHolding.native_cost
                ) *
                (shareNumber /
                  toNumber(
                    selectedHolding.shares
                  ))
              : 0;

          await updateSecurityHolding({
            holding:
              selectedHolding,

            type: "SELL",

            shareCount:
              shareNumber,

            tradeAmountNative:
              amountNumber,

            grossTradeAmountNative:
              grossTradeAmountNative,

            grossTradeValueCny:
              grossTradeValueCny,

            tradeValueCny:
              finalCny,

            sellCostBasisCny:
              finalCostBasis,

            feeNative:
              feeNumber,

            feeCny:
              feeCny,

            currency,
          });

          // -----------------------------------------------
          // 4.2 Cash Holding
          // -----------------------------------------------

          let cashResult:
            Awaited<
              ReturnType<
                typeof updateCashHolding
              >
            >;

          try {
            cashResult =
              await updateCashHolding({
                code:
                  finalCashAssetCode!,

                currency,

                market,

                platform:
                  platform.trim(),

                cnyAmount:
                  finalCashCnyAmount,

                cnyCost:
                  finalCashCnyCost,

                nativeAmount:
                  finalCashNativeAmount,

                nativeCost:
                  finalCashNativeCost,

                fxRate:
                  currency === "CNY"
                    ? 1
                    : fxRate!,
              });
          } catch (cashError) {
            // Cash 写入失败：
            // Security Holding + native 一起恢复
            await restoreSecurityHolding(
              selectedHolding
            );

            throw cashError;
          }

          setCashHoldingResult({
            ...cashResult,

            securityCostBasisCny:
              finalCostBasis,

            securityNativeAmount,

            securityNativeCostBasis,

            securityNativeCurrency:
              currency !== "CNY"
                ? currency
                : null,
          });
        }
      } catch (holdingError) {
        // =================================================
        // Holding 更新失败
        // 删除 transaction
        // =================================================

        if (transactionId) {
          await supabase
            .from(
              "investment_transactions"
            )
            .delete()
            .eq(
              "id",
              transactionId
            );
        }

        throw holdingError;
      }

      // =================================================
      // 5. 成功消息
      // =================================================

      if (
        scenario === "NEW"
      ) {
        setMessage(
          "NEW BUY 已保存，交易记录和新的 Holding 都已创建"
        );
      } else if (
        transactionType === "BUY"
      ) {
        setMessage(
          "BUY 已保存，Holding 已更新"
        );
      } else {
        setMessage(
          "SELL 已保存，Holding 与 Cash Holding 已同步更新"
        );
      }

      // =================================================
      // 6. 清空表单
      // =================================================

      setSelectedHoldingId("");

      setAssetCode("");
      setAssetName("");
      setPlatform("");
      setCategory("");

      setTradeAmount("");
      setTradePrice("");
      setShares("");
      setFee("");

      setFxRate(
        currency === "CNY"
          ? 1
          : null
      );

      setCashAssetCode("");

      setRemark("");

      await loadData();
    } catch (err: any) {
      const errorInfo = {
        message:
          err?.message ?? null,

        details:
          err?.details ?? null,

        hint:
          err?.hint ?? null,

        code:
          err?.code ?? null,

        name:
          err?.name ?? null,

        status:
          err?.status ?? null,
      };

      // 不使用 console.error，
      // 避免 Next.js / Turbopack Console Error
      console.log(
        "=== INVESTMENT SAVE ERROR ==="
      );

      console.log(
        errorInfo
      );

      const message =
        [
          errorInfo.message,

          errorInfo.details,

          errorInfo.hint,

          errorInfo.code
            ? `code=${errorInfo.code}`
            : "",
        ]
          .filter(Boolean)
          .join(" | ") ||
        "保存交易失败";

      setError(message);
    } finally {
      setSaving(false);
    }
  };

  // ===================================================
  // 当前交易币种
  // ===================================================

  const nativeCurrency =
    region === "CN"
      ? "CNY"
      : currency;

  // ===================================================
  // UI
  // ===================================================

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <TopBar title="投资交易" />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* ================================================= */}
        {/* Header */}
        {/* ================================================= */}

        <div className="mb-6">
          <h1 className="text-2xl font-bold">
            投资交易
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            记录 BUY / SELL，并根据交易类型更新或创建 Holding。
          </p>
        </div>

        {/* ================================================= */}
        {/* Message */}
        {/* ================================================= */}

        {message && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {message}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ================================================= */}
        {/* Cash Holding Result */}
        {/* ================================================= */}

        {cashHoldingResult && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="mb-3 text-sm font-semibold text-emerald-900">
              SELL → Cash Holding 写入结果
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg border border-emerald-200 bg-white p-4">
                <div className="text-xs text-emerald-700">
                  Cash Holding 增加（写入 Holding）
                </div>

                <div className="mt-1 text-xl font-bold text-emerald-800">
                  +¥
                  {formatNumber(
                    cashHoldingResult.cnyAmount,
                    2
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-emerald-200 bg-white p-4">
                <div className="text-xs text-emerald-700">
                  {cashHoldingResult.nativeCreated
                    ? "新建（Holding_native_currency）"
                    : "写入（Holding_native_currency）"}
                </div>

                <div className="mt-1 text-xl font-bold text-emerald-800">
                  +
                  {
                    cashHoldingResult.nativeCurrency
                  }{" "}
                  {formatNumber(
                    cashHoldingResult.nativeAmount,
                    2
                  )}
                </div>

                {cashHoldingResult.nativeCurrency !==
                  "CNY" && (
                  <div className="mt-2 text-sm font-semibold text-emerald-800">
                    native_cost +
                    {
                      cashHoldingResult.nativeCurrency
                    }{" "}
                    {formatNumber(
                      cashHoldingResult.nativeAmount,
                      2
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-amber-200 bg-white p-4">
                <div className="text-xs text-amber-700">
                  证券 Holding SELL 扣减成本
                </div>

                <div className="mt-1 text-lg font-bold text-amber-800">
                  -¥
                  {formatNumber(
                    cashHoldingResult.securityCostBasisCny,
                    2
                  )}
                </div>

                {cashHoldingResult.securityNativeCurrency && (
                  <>
                    <div className="mt-2 text-sm font-semibold text-amber-800">
                      Holding_native_currency.native_amount：
                      {
                        cashHoldingResult.securityNativeCurrency
                      }{" "}
                      -
                      {formatNumber(
                        cashHoldingResult.securityNativeAmount,
                        2
                      )}
                    </div>

                    <div className="mt-1 text-sm font-semibold text-amber-800">
                      Holding_native_currency.native_cost：
                      {
                        cashHoldingResult.securityNativeCurrency
                      }{" "}
                      -
                      {formatNumber(
                        cashHoldingResult.securityNativeCostBasis,
                        2
                      )}
                    </div>
                  </>
                )}

                <div className="mt-2 text-xs leading-5 text-slate-500">
                  native_amount 按本次卖出成交金额扣减；
                  native_cost 按卖出 Shares 对应的历史成本扣减，
                  不按卖出成交金额扣减。
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================= */}
        {/* 主表单 */}
        {/* ================================================= */}

        <div className="grid gap-6 lg:grid-cols-3">
          {/* ================================================= */}
          {/* 左侧 */}
          {/* ================================================= */}

          <section className="rounded-xl border bg-white p-5 shadow-sm lg:col-span-2">
            <div className="mb-5">
              <h2 className="text-lg font-semibold">
                交易信息
              </h2>

              <p className="mt-1 text-xs text-slate-500">
                带“写入 Holding”的项目会实际修改或创建 holdings 表记录。
              </p>
            </div>

            {/* ================================================= */}
            {/* Region */}
            {/* ================================================= */}

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  市场
                </label>

                <select
                  value={region}
                  onChange={(e) =>
                    handleRegionChange(
                      e.target
                        .value as Region
                    )
                  }
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="CN">
                    中国大陆
                  </option>

                  <option value="HK">
                    港美股
                  </option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  交易场景
                </label>

                <select
                  value={scenario}
                  onChange={(e) =>
                    handleScenarioChange(
                      e.target
                        .value as TransactionScenario
                    )
                  }
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="HOLDING">
                    已有 Holding
                  </option>

                  <option value="NEW">
                    新买入
                  </option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  交易类型
                </label>

                <select
                  value={
                    transactionType
                  }
                  onChange={(e) =>
                    handleTransactionTypeChange(
                      e.target
                        .value as TransactionType
                    )
                  }
                  disabled={
                    scenario === "NEW"
                  }
                  className="w-full rounded-lg border px-3 py-2 text-sm disabled:bg-slate-100"
                >
                  <option value="BUY">
                    BUY 买入
                  </option>

                  <option value="SELL">
                    SELL 卖出
                  </option>
                </select>
              </div>
            </div>

            {/* ================================================= */}
            {/* Holding */}
            {/* ================================================= */}

            {scenario ===
              "HOLDING" && (
              <div className="mt-5">
                <label className="mb-1 block text-sm font-medium">
                  选择 Holding
                </label>

                <select
                  value={
                    selectedHoldingId
                  }
                  onChange={(e) =>
                    handleHoldingChange(
                      e.target.value
                    )
                  }
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="">
                    -- 请选择 Holding --
                  </option>

                  {regionHoldings.map(
                    (holding) => (
                      <option
                        key={
                          holding.id
                        }
                        value={
                          holding.id
                        }
                      >
                        {holding.name}（
                        {holding.code}）
                      </option>
                    )
                  )}
                </select>
              </div>
            )}

            {/* ================================================= */}
            {/* Holding 当前信息 */}
            {/* ================================================= */}

            {scenario ===
              "HOLDING" &&
              selectedHolding && (
                <div className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-4">
                  <div>
                    <div className="text-xs text-slate-500">
                      当前 Shares
                    </div>

                    <div className="mt-1 font-semibold">
                      {formatNumber(
                        currentShares,
                        2
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500">
                      当前成本
                    </div>

                    <div className="mt-1 font-semibold">
                      ¥
                      {formatNumber(
                        currentCostCny,
                        2
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500">
                      平均成本
                    </div>

                    <div className="mt-1 font-semibold">
                      ¥
                      {formatNumber(
                        currentAvgCostCny,
                        2
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500">
                      Category
                    </div>

                    <div className="mt-1 font-semibold">
                      {getCategoryLabel(
                        selectedHolding.category
                      )}
                    </div>
                  </div>

                  {selectedHolding.native_currency && (
                    <div>
                      <div className="text-xs text-slate-500">
                        原币 Holding
                      </div>

                      <div className="mt-1 font-semibold">
                        {
                          selectedHolding.native_currency
                        }{" "}
                        {formatNumber(
                          toNumber(
                            selectedHolding.native_amount
                          ),
                          2
                        )}
                      </div>

                      <div className="text-xs text-slate-500">
                        native_cost{" "}
                        {formatNumber(
                          toNumber(
                            selectedHolding.native_cost
                          ),
                          2
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

            {/* ================================================= */}
            {/* NEW Category */}
            {/* ================================================= */}

            {scenario ===
              "NEW" && (
              <div className="mt-5">
                <label className="mb-1 block text-sm font-medium">
                  资产类别
                  <span className="ml-1 text-red-500">
                    （新买入必须手动选择）
                  </span>
                </label>

                <select
                  value={category}
                  onChange={(e) =>
                    setCategory(
                      e.target
                        .value as
                        | InvestmentCategory
                        | ""
                    )
                  }
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="">
                    -- 请选择 --
                  </option>

                  <option value="fixed_income">
                    固定收益
                  </option>

                  <option value="global_stock">
                    全球股票
                  </option>

                  <option value="china_stock">
                    中国股票
                  </option>

                  <option value="gold">
                    黄金
                  </option>
                </select>
              </div>
            )}

            {/* ================================================= */}
            {/* Asset */}
            {/* ================================================= */}

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  资产代码
                </label>

                <input
                  value={assetCode}
                  onChange={(e) =>
                    setAssetCode(
                      e.target.value
                    )
                  }
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder="例如 VOO / 002849"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  资产名称
                </label>

                <input
                  value={assetName}
                  onChange={(e) =>
                    setAssetName(
                      e.target.value
                    )
                  }
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  平台
                </label>

                <input
                  value={platform}
                  onChange={(e) =>
                    setPlatform(
                      e.target.value
                    )
                  }
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder="例如 IBKR"
                />
              </div>
            </div>

            {/* ================================================= */}
            {/* Date / Currency / FX */}
            {/* ================================================= */}

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  交易日期
                </label>

                <input
                  type="date"
                  value={
                    transactionDate
                  }
                  onChange={(e) =>
                    setTransactionDate(
                      e.target.value
                    )
                  }
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  交易币种
                </label>

                <select
                  value={
                    nativeCurrency
                  }
                  onChange={(e) =>
                    handleCurrencyChange(
                      e.target
                        .value as Currency
                    )
                  }
                  disabled={
                    region === "CN"
                  }
                  className="w-full rounded-lg border px-3 py-2 text-sm disabled:bg-slate-100"
                >
                  {region ===
                  "CN" ? (
                    <option value="CNY">
                      CNY
                    </option>
                  ) : (
                    <>
                      <option value="USD">
                        USD
                      </option>

                      <option value="HKD">
                        HKD
                      </option>
                    </>
                  )}
                </select>
              </div>

              {region ===
                "HK" && (
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    {nativeCurrency} 汇率
                  </label>

                  <div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm font-semibold">
                    {fxLoading
                      ? "获取中..."
                      : fxRate &&
                        fxRate > 0
                      ? `1 ${nativeCurrency} = ${formatNumber(
                          fxRate,
                          6
                        )} CNY`
                      : `暂无 ${nativeCurrency} 汇率`}
                  </div>

                  <p className="mt-1 text-xs text-slate-500">
                    汇率方向：1{" "}
                    {nativeCurrency} =
                    X CNY
                  </p>
                </div>
              )}
            </div>

            {/* ================================================= */}
            {/* SELL Mode */}
            {/* ================================================= */}

            {transactionType ===
              "SELL" && (
              <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="mb-2 text-sm font-semibold">
                  SELL 计算方式
                </div>

                <div className="flex gap-5 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={
                        sellMode ===
                        "SHARES"
                      }
                      onChange={() =>
                        setSellMode(
                          "SHARES"
                        )
                      }
                    />

                    按 Shares 卖出
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={
                        sellMode ===
                        "AMOUNT"
                      }
                      onChange={() =>
                        setSellMode(
                          "AMOUNT"
                        )
                      }
                    />

                    按金额卖出
                  </label>
                </div>
              </div>
            )}

            {/* ================================================= */}
            {/* Price / Shares / Fee */}
            {/* ================================================= */}

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  {transactionType ===
                  "BUY"
                    ? `买入单价（${nativeCurrency}，交易记录）`
                    : `卖出单价（${nativeCurrency}，交易记录）`}
                </label>

                <input
                  type="number"
                  min="0"
                  step="any"
                  value={
                    tradePrice
                  }
                  onChange={(e) =>
                    setTradePrice(
                      e.target.value
                    )
                  }
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Shares
                  {writesSecurityHolding
                    ? "（写入 Holding）"
                    : "（交易记录）"}
                </label>

                <input
                  type="number"
                  min="0"
                  step="any"
                  value={shares}
                  onChange={(e) =>
                    setShares(
                      e.target.value
                    )
                  }
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  手续费（
                  {
                    nativeCurrency
                  }
                  ，交易记录）
                </label>

                <input
                  type="number"
                  min="0"
                  step="any"
                  value={fee}
                  onChange={(e) =>
                    setFee(
                      e.target.value
                    )
                  }
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
            </div>

            {/* ================================================= */}
            {/* Trade Amount */}
            {/* ================================================= */}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  交易金额（
                  {
                    nativeCurrency
                  }
                  ，交易记录）
                </label>

                <input
                  type="number"
                  min="0"
                  step="any"
                  value={tradeAmount}
                  readOnly={
                    transactionType === "BUY"
                  }
                  onChange={(e) => {
                    if (
                      transactionType !==
                      "BUY"
                    ) {
                      setTradeAmount(
                        e.target.value
                      );
                    }
                  }}
                  className={`w-full rounded-lg border px-3 py-2 text-sm ${
                    transactionType === "BUY"
                      ? "bg-slate-50"
                      : ""
                  }`}
                />

                {transactionType ===
                "BUY" ? (
                  <p className="mt-1 text-xs text-slate-500">
                    自动计算：买入单价 × Shares（不含手续费）。
                    手续费单独记录。
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">
                    本次实际卖出所得的本币金额，仅记录交易。
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  CNY 交易金额（交易记录）
                </label>

                <div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm font-semibold">
                  ¥
                  {formatNumber(
                    tradeValueCny,
                    2
                  )}
                </div>

                <p className="mt-1 text-xs text-slate-500">
                  {nativeCurrency ===
                  "CNY"
                    ? "CNY 原币金额。"
                    : `${nativeCurrency} 金额 × ${nativeCurrency}→CNY 汇率。此字段只记录在 investment_transactions。`}
                </p>
              </div>
            </div>

            {/* ================================================= */}
            {/* BUY Holding Update */}
            {/* ================================================= */}

            {transactionType ===
              "BUY" &&
              scenario ===
                "HOLDING" &&
              selectedHolding && (
                <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <div className="mb-3 text-sm font-semibold text-blue-900">
                    BUY → Holding 更新
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="text-xs text-blue-700">
                        Shares（写入 Holding）
                      </div>

                      <div className="mt-1 text-lg font-semibold">
                        +
                        {formatNumber(
                          toNumber(
                            shares
                          ),
                          8
                        )}
                      </div>

                      <div className="text-xs text-slate-500">
                        Holding.shares：
                        {formatNumber(
                          currentShares,
                          8
                        )}
                        {" → "}
                        {formatNumber(
                          currentShares +
                            toNumber(
                              shares
                            ),
                          8
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-blue-700">
                        CNY 成本增加（写入 Holding）
                      </div>

                      <div className="mt-1 text-lg font-semibold">
                        +¥
                        {formatNumber(
                          tradeValueCny,
                          2
                        )}
                      </div>

                      <div className="text-xs text-slate-500">
                        Holding.cost：¥
                        {formatNumber(
                          currentCostCny,
                          2
                        )}
                        {" → "}
                        ¥
                        {formatNumber(
                          currentCostCny +
                            tradeValueCny,
                          2
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

            {/* ================================================= */}
            {/* NEW BUY */}
            {/* ================================================= */}

            {transactionType ===
              "BUY" &&
              scenario ===
                "NEW" && (
                <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <div className="mb-3 text-sm font-semibold text-blue-900">
                    NEW BUY → 创建 Holding
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <div className="text-xs text-blue-700">
                        Shares（写入 Holding）
                      </div>

                      <div className="mt-1 text-lg font-semibold">
                        +
                        {formatNumber(
                          toNumber(
                            shares
                          ),
                          8
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-blue-700">
                        CNY 成本（写入 Holding）
                      </div>

                      <div className="mt-1 text-lg font-semibold">
                        ¥
                        {formatNumber(
                          tradeValueCny,
                          2
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-blue-700">
                        Category（写入 Holding）
                      </div>

                      <div className="mt-1 text-lg font-semibold">
                        {getCategoryLabel(
                          category
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 rounded-lg border border-blue-200 bg-white p-3 text-xs text-slate-600">
                    <div>
                      Holding.amount = ¥
                      {formatNumber(
                        tradeValueCny,
                        2
                      )}
                    </div>

                    <div className="mt-1">
                      Holding.cost = ¥
                      {formatNumber(
                        tradeValueCny,
                        2
                      )}
                    </div>

                    <div className="mt-1">
                      Holding.shares ={" "}
                      {formatNumber(
                        toNumber(
                          shares
                        ),
                        8
                      )}
                    </div>

                    <div className="mt-1">
                      Holding.currency = CNY
                    </div>

                    <div className="mt-1">
                      Holding.active = true
                    </div>
                  </div>

                  <p className="mt-3 text-xs text-slate-500">
                    NEW BUY 会同时写入 investment_transactions，
                    并创建新的 Security Holding。
                  </p>
                </div>
              )}

            {/* ================================================= */}
            {/* SELL Holding Update */}
            {/* ================================================= */}

            {transactionType ===
              "SELL" &&
              scenario ===
                "HOLDING" &&
              selectedHolding && (
                <div className="mt-5 space-y-4">
                  {/* Security Holding */}

                  <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                    <div className="mb-3 text-sm font-semibold text-red-900">
                      SELL → 证券 Holding 更新
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <div className="text-xs text-red-700">
                          Shares（写入 Holding）
                        </div>

                        <div className="mt-1 text-lg font-semibold">
                          -
                          {formatNumber(
                            toNumber(
                              shares
                            ),
                            8
                          )}
                        </div>

                        <div className="text-xs text-slate-500">
                          {formatNumber(
                            currentShares,
                            8
                          )}
                          {" → "}
                          {formatNumber(
                            remainingShares,
                            8
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs text-red-700">
                          卖出扣减成本（写入 Holding）
                        </div>

                        <div className="mt-1 text-lg font-semibold">
                          -¥
                          {formatNumber(
                            sellCostBasisCny,
                            2
                          )}
                        </div>

                        <div className="text-xs text-slate-500">
                          ¥
                          {formatNumber(
                            currentCostCny,
                            2
                          )}
                          {" → "}
                          ¥
                          {formatNumber(
                            remainingCostCny,
                            2
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs text-red-700">
                          卖出后状态
                        </div>

                        <div className="mt-1 text-lg font-semibold">
                          {remainingShares <=
                          0
                            ? "active = false"
                            : "active = true"}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs text-red-700">
                          卖出后 Amount（按最近价格）
                        </div>

                        <div className="mt-1 text-lg font-semibold">
                          ¥
                          {formatNumber(
                            remainingMarketValueCny,
                            2
                          )}
                        </div>

                        <div className="text-xs text-slate-500">
                          最近价格：{nativeCurrency} {formatNumber(
                            sellMarketPriceNative,
                            4
                          )}
                          <br />
                          剩余 Shares × 最近价格；
                          Cost / fee_cost 不受市场价格影响。
                        </div>
                      </div>
                    </div>

                    <p className="mt-3 text-xs text-slate-500">
                      注意：这里扣减的是历史持仓成本，
                      不是本次卖出的成交金额。
                    </p>
                  </div>

                  {/* Security Native */}

                  {currency !==
                    "CNY" && (
                    <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
                      <div className="mb-3 text-sm font-semibold text-orange-900">
                        SELL → 证券 Holding_native_currency 更新
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <div className="text-xs text-orange-700">
                            native_amount（写入 Holding_native_currency）
                          </div>

                          <div className="mt-1 text-lg font-semibold text-orange-800">
                            -
                            {
                              nativeCurrency
                            }{" "}
                            {formatNumber(
                              remainingMarketValueNative,
                              2
                            )}
                          </div>

                          <div className="text-xs text-slate-500">
                            原币市值按 SELL 后剩余 Shares × 最近价格重新计算。
                          </div>
                        </div>

                        <div>
                          <div className="text-xs text-orange-700">
                            native_cost（写入 Holding_native_currency）
                          </div>

                          <div className="mt-1 text-lg font-semibold text-orange-800">
                            -
                            {
                              nativeCurrency
                            }{" "}
                            {formatNumber(
                              selectedHolding &&
                                currentShares >
                                  0
                                ? toNumber(
                                    selectedHolding.native_cost
                                  ) *
                                  (toNumber(
                                    shares
                                  ) /
                                    currentShares)
                                : 0,
                              2
                            )}
                          </div>

                          <div className="text-xs text-slate-500">
                            原币历史成本按卖出 Shares / 卖出前 Shares 比例扣减，
                            不按卖出成交金额扣减。
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Cash Holding */}

                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                    <div className="mb-3 text-sm font-semibold text-emerald-900">
                      SELL → Cash Holding
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-sm font-medium">
                          Cash Holding Code
                        </label>

                        <input
                          value={cashAssetCode}
                          onChange={(e) =>
                            setCashAssetCode(e.target.value)
                          }
                          className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                        />
                      </div>

                      <div>
                        <div className="mb-1 text-sm font-medium">
                          本币卖出成交金额（交易记录）
                        </div>

                        <div className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold">
                          {nativeCurrency}{" "}
                          {formatNumber(toNumber(tradeAmount), 2)}
                        </div>
                      </div>
                    </div>

                    {/* 先写 Cash Holding_native_currency */}
                    {currency !== "CNY" && (
                      <div className="mt-4 rounded-lg border border-emerald-300 bg-white p-4">
                        <div className="text-xs text-emerald-700">
                          SELL → Cash Holding_native_currency
                        </div>

                        <div className="mt-3 grid gap-4 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-xs text-slate-500">
                              Holding_native_currency.native_amount
                            </label>

                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                {nativeCurrency}
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={
                                  cashNativeAmount ||
                                  String(defaultCashNativeValuePreview)
                                }
                                onChange={(e) =>
                                  setCashNativeAmount(e.target.value)
                                }
                                className="w-full rounded-lg border bg-white px-3 py-2 text-sm font-semibold"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="mb-1 block text-xs text-slate-500">
                              Holding_native_currency.native_cost
                            </label>

                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                {nativeCurrency}
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={
                                  cashNativeCost ||
                                  String(defaultCashNativeValuePreview)
                                }
                                onChange={(e) =>
                                  setCashNativeCost(e.target.value)
                                }
                                className="w-full rounded-lg border bg-white px-3 py-2 text-sm font-semibold"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="mt-2 text-xs text-slate-500">
                          这两个原币数字可以直接修改；保存时会写入 Cash Holding_native_currency。
                        </div>
                      </div>
                    )}

                    {/* Cash Holding 增加 */}
                    <div className="mt-4 rounded-lg border border-emerald-300 bg-white p-4">
                      <div className="text-xs text-emerald-700">
                        Cash Holding 增加（写入 Holding）
                      </div>

                      <div className="mt-3 grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs text-slate-500">
                            Cash Holding.amount +（扣除手续费）
                          </label>
                          {currency === "CNY" ? (
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">¥</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={
                                  cashCnyAmount ||
                                  String(defaultCashCnyValuePreview)
                                }
                                onChange={(e) =>
                                  setCashCnyAmount(e.target.value)
                                }
                                className="w-full rounded-lg border bg-white px-3 py-2 text-sm font-semibold"
                              />
                            </div>
                          ) : (
                            <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xl font-bold text-emerald-800">
                              +¥{formatNumber(finalCashCnyAmountPreview, 2)}
                            </div>
                          )}
                        </div>

                        <div>
                          <label className="mb-1 block text-xs text-slate-500">
                            Cash Holding.cost +（扣除手续费）
                          </label>
                          {currency === "CNY" ? (
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">¥</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={
                                  cashCnyCost ||
                                  String(defaultCashCnyValuePreview)
                                }
                                onChange={(e) =>
                                  setCashCnyCost(e.target.value)
                                }
                                className="w-full rounded-lg border bg-white px-3 py-2 text-sm font-semibold"
                              />
                            </div>
                          ) : (
                            <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xl font-bold text-emerald-800">
                              +¥{formatNumber(finalCashCnyCostPreview, 2)}
                            </div>
                          )}
                        </div>
                      </div>

                      {currency === "CNY" ? (
                        <div className="mt-2 text-xs text-slate-500">
                          CNY SELL 时，Cash Holding.amount / cost 可以直接修改；默认值为卖出成交金额扣除手续费。
                        </div>
                      ) : (
                        <div className="mt-2 text-xs text-slate-500">
                          非 CNY SELL 时，这两个 CNY 数字不可直接修改，分别由上面的 Cash Holding_native_currency.native_amount / native_cost × 汇率换算得到。
                        </div>
                      )}
                    </div>

                    {currency === "CNY" && (
                      <div className="mt-4 rounded-lg border border-emerald-300 bg-white p-4">
                        <div className="text-xs text-emerald-700">
                          本次为 CNY Cash Holding
                        </div>
                        <div className="mt-1 text-sm font-semibold text-emerald-800">
                          不写入 Holding_native_currency
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

            {/* ================================================= */}
            {/* Remark */}
            {/* ================================================= */}

            <div className="mt-5">
              <label className="mb-1 block text-sm font-medium">
                备注
                <span className="ml-1 text-xs font-normal text-slate-400">
                  （交易记录）
                </span>
              </label>

              <textarea
                value={remark}
                onChange={(e) =>
                  setRemark(
                    e.target.value
                  )
                }
                rows={3}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="可选"
              />
            </div>

            {/* ================================================= */}
            {/* Save */}
            {/* ================================================= */}

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving
                  ? "保存中..."
                  : "保存交易"}
              </button>
            </div>
          </section>

          {/* ================================================= */}
          {/* 右侧规则 */}
          {/* ================================================= */}

          <aside className="h-fit rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">
              Holding 更新规则
            </h2>

            <div className="mt-4 space-y-4 text-sm">
              {/* BUY HOLDING */}

              <div>
                <div className="font-semibold text-blue-700">
                  BUY · HOLDING
                </div>

                <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
                  <li>
                    Shares ↑
                    <span className="font-medium">
                      （写入 Holding）
                    </span>
                  </li>

                  <li>
                    Cost ↑
                    <span className="font-medium">
                      （写入 Holding）
                    </span>
                  </li>

                  <li>
                    active = true
                  </li>
                </ul>
              </div>

              {/* SELL HOLDING */}

              <div>
                <div className="font-semibold text-red-700">
                  SELL · HOLDING
                </div>

                <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
                  <li>
                    Shares ↓
                    <span className="font-medium">
                      （写入 Holding）
                    </span>
                  </li>

                  <li>
                    Cost ↓
                    <span className="font-medium">
                      （写入 Holding）
                    </span>
                  </li>

                  <li>
                    USD / HKD Security 同步更新
                    holding_native_currency.native_amount / native_cost
                  </li>

                  <li>
                    卖出成交金额扣除手续费后进入 Cash Holding
                  </li>

                  <li>
                    USD / HKD Cash 同步写入
                    Holding_native_currency
                  </li>

                  <li>
                    全部卖出 → active = false
                  </li>
                </ul>
              </div>

              {/* NEW BUY */}

              <div>
                <div className="font-semibold text-emerald-700">
                  NEW · BUY
                </div>

                <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
                  <li>
                    创建新的 Security Holding
                  </li>

                  <li>
                    Shares
                    <span className="font-medium">
                      （写入 Holding）
                    </span>
                  </li>

                  <li>
                    CNY Cost
                    <span className="font-medium">
                      （写入 Holding）
                    </span>
                  </li>

                  <li>
                    Category
                    <span className="font-medium">
                      （写入 Holding）
                    </span>
                  </li>

                  <li>
                    active = true
                  </li>

                  <li>
                    Category 必须手动选择
                  </li>
                </ul>
              </div>

              {/* CASH */}

              <div>
                <div className="font-semibold text-emerald-700">
                  Cash Holding
                </div>

                <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
                  <li>
                    holdings.amount = CNY
                  </li>

                  <li>
                    holdings.cost = CNY
                  </li>

                  <li>
                    holdings.currency = CNY
                  </li>

                  <li>
                    USD / HKD 原币余额存入
                    holding_native_currency
                  </li>

                  <li>
                    CNY Cash 不写 native table
                  </li>
                </ul>
              </div>
            </div>

            {/* ================================================= */}
            {/* 重要区别 */}
            {/* ================================================= */}

            <div className="mt-5 rounded-lg bg-slate-50 p-4 text-xs leading-5 text-slate-500">
              <div className="font-semibold text-slate-700">
                一个重要区别
              </div>

              <p className="mt-2">
                「CNY 交易金额」
                是 investment_transactions
                中的成交金额记录。
              </p>

              <p className="mt-2">
                BUY 时：
                CNY 交易金额同时作为
                Holding 成本增加值。
              </p>

              <p className="mt-2">
                NEW BUY 时：
                CNY 交易金额用于创建新的
                Security Holding 的 amount
                和 cost。
              </p>

              <p className="mt-2">
                SELL 时：
                CNY 交易金额是卖出所得，
                进入 Cash Holding。
              </p>

              <p className="mt-2">
                SELL 的证券 Holding
                扣减的是历史成本
                （cost_basis），
                不是卖出所得。
              </p>

              <p className="mt-2">
                USD / HKD SELL：
                原币金额另外进入
                holding_native_currency，
                不改变 holdings 使用 CNY
                的原则。
              </p>
            </div>
          </aside>
        </div>

        {/* ================================================= */}
        {/* 最近交易 */}
        {/* ================================================= */}

        <section className="mt-6 rounded-xl border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">
                最近投资交易
              </h2>

              <p className="mt-1 text-xs text-slate-500">
                共{" "}
                {
                  transactions.length
                }{" "}
                笔
              </p>
            </div>
          </div>

          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">
              加载中...
            </div>
          ) : transactions.length ===
            0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              暂无交易记录
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-slate-500">
                    <th className="px-3 py-3">
                      日期
                    </th>

                    <th className="px-3 py-3">
                      类型
                    </th>

                    <th className="px-3 py-3">
                      场景
                    </th>

                    <th className="px-3 py-3">
                      资产
                    </th>

                    <th className="px-3 py-3">
                      Category
                    </th>

                    <th className="px-3 py-3 text-right">
                      Shares
                    </th>

                    <th className="px-3 py-3 text-right">
                      本币成交金额
                    </th>

                    <th className="px-3 py-3 text-right">
                      CNY 金额
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {transactions
                    .slice(0, 100)
                    .map(
                      (
                        transaction,
                        index
                      ) => {
                        const transactionCurrency =
                          transaction.currency ||
                          "CNY";

                        return (
                          <tr
                            key={
                              transaction.id ??
                              index
                            }
                            className="border-b last:border-0"
                          >
                            <td className="whitespace-nowrap px-3 py-3">
                              {formatDate(
                                transaction.transaction_date
                              )}
                            </td>

                            <td className="px-3 py-3">
                              <span
                                className={
                                  transaction.transaction_type ===
                                  "BUY"
                                    ? "font-semibold text-emerald-600"
                                    : "font-semibold text-red-600"
                                }
                              >
                                {
                                  transaction.transaction_type
                                }
                              </span>
                            </td>

                            <td className="px-3 py-3">
                              {
                                transaction.scenario
                              }
                            </td>

                            <td className="px-3 py-3">
                              <div className="font-medium">
                                {
                                  transaction.asset_name
                                }
                              </div>

                              <div className="text-xs text-slate-500">
                                {
                                  transaction.asset_code
                                }
                              </div>
                            </td>

                            <td className="px-3 py-3">
                              {getCategoryLabel(
                                transaction.category
                              )}
                            </td>

                            <td className="px-3 py-3 text-right">
                              {formatNumber(
                                toNumber(
                                  transaction.shares
                                ),
                                8
                              )}
                            </td>

                            <td className="px-3 py-3 text-right">
                              {
                                transactionCurrency
                              }{" "}
                              {formatNumber(
                                toNumber(
                                  transaction.trade_amount
                                ),
                                2
                              )}
                            </td>

                            <td className="px-3 py-3 text-right">
                              ¥
                              {formatNumber(
                                toNumber(
                                  transaction.trade_value_cny
                                ),
                                2
                              )}
                            </td>
                          </tr>
                        );
                      }
                    )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
