import { supabase } from "./supabase";


// =====================================
// 类型
// =====================================

export type AssetHistory = {

  id?: number;

  snapshot_date?: string;

  created_at?: string;

  total_asset?: number;

  total_wealth?: number;

  // ===================================
  // 数据库真实字段
  // ===================================

  cn_asset?: number;

  cn_rate?: number;

  cn_profit?: number;

  hk_asset?: number;

  hk_rate?: number;

  hk_profit?: number;

  total_profit?: number;

  usd_cny?: number;

  [key: string]: any;

};


// =====================================
// Holding
// =====================================

export type Holding = {

  id?: number;

  code?: string;

  name?: string;

  market?: string;

  category?: string;

  amount?: number;

  cost?: number;

  profit?: number;

  profit_rate?: number;

  currency?: string;

  nav?: number;

  shares?: number;

  platform?: string;

  active?: boolean;

  updated_at?: string;

  [key: string]: any;

};


// =====================================
// Fixed Income
// =====================================

export type FixedIncomeAsset = {

  id: string;

  type: string;

  name: string;

  institution?: string | null;

  amount: number;

  interest_rate?: number | null;

  auto_interest?: boolean;

  interest_date?: string | null;

  updated_at?: string | null;

  note?: string | null;

  created_at?: string | null;

  [key: string]: any;

};


// =====================================
// Performance 类型
// =====================================

export type PerformancePoint = {

  date: string;

  profit: number;

  profitRate: number;

};


export type PerformanceHistory = {

  mainland: {

    daily: PerformancePoint[];

    weekly: PerformancePoint[];

    monthly: PerformancePoint[];

    yearly: PerformancePoint[];

  };

  hk: {

    daily: PerformancePoint[];

    weekly: PerformancePoint[];

    monthly: PerformancePoint[];

    yearly: PerformancePoint[];

  };

  total: {

    daily: PerformancePoint[];

    weekly: PerformancePoint[];

    monthly: PerformancePoint[];

    yearly: PerformancePoint[];

  };

};


// =====================================
// 工具
// =====================================

function toNumber(
  value: any
): number {

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : 0;

}


// =====================================
// 获取最新资产
// =====================================

export async function getLatestAsset(): Promise<AssetHistory | null> {

  const {
    data,
    error,
  } = await supabase

    .from("asset_history")

    .select("*")

    .order(
      "id",
      {
        ascending: false,
      }
    )

    .limit(1);


  if (error) {

    console.error(
      "getLatestAsset error:",
      error
    );

    return null;

  }


  return data?.[0] ?? null;

}


// =====================================
// 获取财富历史曲线
// =====================================

export async function getAssetHistory(): Promise<AssetHistory[]> {

  const {
    data,
    error,
  } = await supabase

    .from("asset_history")

    .select("*")

    .order(
      "snapshot_date",
      {
        ascending: true,
      }
    );


  if (error) {

    console.error(
      "getAssetHistory error:",
      error
    );

    return [];

  }


  return data ?? [];

}


// =====================================================
// 获取 Holdings History 最近更新时间
// =====================================================

export async function getLatestHoldingsHistoryUpdatedAt(): Promise<string | null> {

  const {
    data,
    error,
  } = await supabase

    .from("holdings_history")

    .select("updated_at")

    .not(
      "updated_at",
      "is",
      null
    )

    .order(
      "updated_at",
      {
        ascending: false,
      }
    )

    .limit(1)

    .maybeSingle();


  if (error) {

    console.error(
      "getLatestHoldingsHistoryUpdatedAt error:",
      error
    );

    return null;

  }


  return (
    data?.updated_at ??
    null
  );

}


// =====================================================
// 获取 Dashboard 当前持仓
// =====================================================

export async function getHoldings(): Promise<Holding[]> {

  const {
    data,
    error,
  } = await supabase

    .from("holdings")

    .select("*")

    .eq(
      "active",
      true
    )

    .order(
      "amount",
      {
        ascending: false,
      }
    );


  if (error) {

    console.error(
      "getHoldings error:",
      error
    );

    return [];

  }


  return data ?? [];

}


// =====================================================
// 获取全部 Holdings
// =====================================================

export async function getAllHoldings(): Promise<Holding[]> {

  const {
    data,
    error,
  } = await supabase

    .from("holdings")

    .select("*")

    .order(
      "active",
      {
        ascending: false,
      }
    )

    .order(
      "amount",
      {
        ascending: false,
      }
    );


  if (error) {

    console.error(
      "getAllHoldings error:",
      error
    );

    return [];

  }


  return data ?? [];

}


// =====================================================
// 获取已启用资产
// =====================================================

export async function getActiveHoldings(): Promise<Holding[]> {

  const {
    data,
    error,
  } = await supabase

    .from("holdings")

    .select("*")

    .eq(
      "active",
      true
    )

    .order(
      "amount",
      {
        ascending: false,
      }
    );


  if (error) {

    console.error(
      "getActiveHoldings error:",
      error
    );

    return [];

  }


  return data ?? [];

}


// =====================================================
// 获取已停用资产
// =====================================================

export async function getInactiveHoldings(): Promise<Holding[]> {

  const {
    data,
    error,
  } = await supabase

    .from("holdings")

    .select("*")

    .eq(
      "active",
      false
    )

    .order(
      "updated_at",
      {
        ascending: false,
      }
    );


  if (error) {

    console.error(
      "getInactiveHoldings error:",
      error
    );

    return [];

  }


  return data ?? [];

}


// =====================================================
// 获取单个 Holding
// =====================================================

export async function getHoldingById(
  id: number
): Promise<Holding | null> {

  const {
    data,
    error,
  } = await supabase

    .from("holdings")

    .select("*")

    .eq(
      "id",
      id
    )

    .maybeSingle();


  if (error) {

    console.error(
      "getHoldingById error:",
      error
    );

    return null;

  }


  return data ?? null;

}


// =====================================================
// 获取单个资产
// =====================================================

export async function getHoldingByCodePlatform(
  code: string,
  platform: string
): Promise<Holding | null> {

  const {
    data,
    error,
  } = await supabase

    .from("holdings")

    .select("*")

    .eq(
      "code",
      code
    )

    .eq(
      "platform",
      platform
    )

    .maybeSingle();


  if (error) {

    console.error(
      "getHoldingByCodePlatform error:",
      error
    );

    return null;

  }


  return data ?? null;

}


// =====================================================
// 新增资产
// =====================================================

export async function createHolding(
  holding: Omit<
    Holding,
    "id" | "updated_at"
  >
): Promise<Holding | null> {

  const payload = {

    code:
      String(
        holding.code ?? ""
      ).trim(),

    name:
      String(
        holding.name ?? ""
      ).trim(),

    market:
      String(
        holding.market ?? ""
      ).trim(),

    category:
      String(
        holding.category ?? ""
      ).trim(),

    amount:
      toNumber(
        holding.amount
      ),

    cost:
      Math.round(
        toNumber(
          holding.cost
        )
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

    currency:
      String(
        holding.currency ?? ""
      ).trim(),

    nav:
      toNumber(
        holding.nav
      ),

    shares:
      toNumber(
        holding.shares
      ),

    platform:
      String(
        holding.platform ?? ""
      ).trim(),

    active:
      holding.active !== false,

  };


  if (!payload.code) {

    console.error(
      "createHolding: code 不能为空"
    );

    return null;

  }


  if (!payload.platform) {

    console.error(
      "createHolding: platform 不能为空"
    );

    return null;

  }


  const {
    data,
    error,
  } = await supabase

    .from("holdings")

    .insert(
      payload
    )

    .select("*")

    .single();


  if (error) {

    console.error(
      "createHolding error:",
      error
    );

    return null;

  }


  return data;

}


// =====================================================
// 编辑资产
// =====================================================

export async function updateHolding(
  id: number,
  holding: Partial<Holding>
): Promise<Holding | null> {

  const payload: Record<
    string,
    any
  > = {};


  if (holding.code !== undefined) {

    payload.code =
      String(
        holding.code
      ).trim();

  }


  if (holding.name !== undefined) {

    payload.name =
      String(
        holding.name
      ).trim();

  }


  if (holding.market !== undefined) {

    payload.market =
      String(
        holding.market
      ).trim();

  }


  if (holding.category !== undefined) {

    payload.category =
      String(
        holding.category
      ).trim();

  }


  if (holding.amount !== undefined) {

    payload.amount =
      toNumber(
        holding.amount
      );

  }


  if (holding.cost !== undefined) {

    payload.cost =
      Math.round(
        toNumber(
          holding.cost
        )
      );

  }


  if (holding.profit !== undefined) {

    payload.profit =
      Math.round(
        toNumber(
          holding.profit
        )
      );

  }


  if (holding.profit_rate !== undefined) {

    payload.profit_rate =
      toNumber(
        holding.profit_rate
      );

  }


  if (holding.currency !== undefined) {

    payload.currency =
      String(
        holding.currency
      ).trim();

  }


  if (holding.nav !== undefined) {

    payload.nav =
      toNumber(
        holding.nav
      );

  }


  if (holding.shares !== undefined) {

    payload.shares =
      toNumber(
        holding.shares
      );

  }


  if (holding.platform !== undefined) {

    payload.platform =
      String(
        holding.platform
      ).trim();

  }


  if (holding.active !== undefined) {

    payload.active =
      Boolean(
        holding.active
      );

  }


  if (
    Object.keys(
      payload
    ).length === 0
  ) {

    return getHoldingById(
      id
    );

  }


  const {
    data,
    error,
  } = await supabase

    .from("holdings")

    .update(
      payload
    )

    .eq(
      "id",
      id
    )

    .select("*")

    .single();


  if (error) {

    console.error(
      "updateHolding error:",
      error
    );

    return null;

  }


  return data;

}


// =====================================================
// 停用资产
// =====================================================

export async function deactivateHolding(
  id: number
): Promise<boolean> {

  const {
    error,
  } = await supabase

    .from("holdings")

    .update({
      active: false,
    })

    .eq(
      "id",
      id
    );


  if (error) {

    console.error(
      "deactivateHolding error:",
      error
    );

    return false;

  }


  return true;

}


// =====================================================
// 重新买入 / 激活资产
// =====================================================

export async function reactivateHolding(
  id: number,
  values?: Partial<Holding>
): Promise<Holding | null> {

  const payload: Record<
    string,
    any
  > = {

    active:
      true,

  };


  if (values?.amount !== undefined) {

    payload.amount =
      toNumber(
        values.amount
      );

  }


  if (values?.cost !== undefined) {

    payload.cost =
      Math.round(
        toNumber(
          values.cost
        )
      );

  }


  if (values?.profit !== undefined) {

    payload.profit =
      Math.round(
        toNumber(
          values.profit
        )
      );

  }


  if (values?.profit_rate !== undefined) {

    payload.profit_rate =
      toNumber(
        values.profit_rate
      );

  }


  if (values?.nav !== undefined) {

    payload.nav =
      toNumber(
        values.nav
      );

  }


  if (values?.shares !== undefined) {

    payload.shares =
      toNumber(
        values.shares
      );

  }


  const {
    data,
    error,
  } = await supabase

    .from("holdings")

    .update(
      payload
    )

    .eq(
      "id",
      id
    )

    .select("*")

    .single();


  if (error) {

    console.error(
      "reactivateHolding error:",
      error
    );

    return null;

  }


  return data;

}


// =====================================================
// 永久删除资产
// =====================================================

export async function deleteHolding(
  id: number
): Promise<boolean> {

  const {
    error,
  } = await supabase

    .from("holdings")

    .delete()

    .eq(
      "id",
      id
    );


  if (error) {

    console.error(
      "deleteHolding error:",
      error
    );

    return false;

  }


  return true;

}


// =====================================================
// 获取固收资产
// =====================================================

export async function getFixedIncomeAssets(): Promise<FixedIncomeAsset[]> {

  const {
    data,
    error,
  } = await supabase

    .from("fixed_income_assets")

    .select("*")

    .order(
      "created_at",
      {
        ascending: false,
      }
    );


  if (error) {

    console.error(
      "getFixedIncomeAssets error:",
      error
    );

    return [];

  }


  return data ?? [];

}


// =====================================================
// 获取固收总资产
// =====================================================

export async function getFixedIncomeTotal(): Promise<number> {

  const assets =
    await getFixedIncomeAssets();


  return assets.reduce(
    (
      total,
      asset
    ) => {

      return (
        total +
        toNumber(
          asset.amount
        )
      );

    },
    0
  );

}


// =====================================================
// 计算真实资产配置比例
// =====================================================

export async function getHoldingsAllocation() {

  const {
    data,
    error,
  } = await supabase

    .from("holdings")

    .select(
      "category, amount"
    )

    .eq(
      "active",
      true
    );


  if (error) {

    console.error(
      "getHoldingsAllocation error:",
      error
    );

    return null;

  }


  const result: {

    fixed_income: number;

    global_stock: number;

    china_stock: number;

    gold: number;

  } = {

    fixed_income: 0,

    global_stock: 0,

    china_stock: 0,

    gold: 0,

  };


  (data ?? []).forEach(
    (
      item: any
    ) => {

      const category =
        item.category;


      if (
        category &&
        result[
          category as keyof typeof result
        ] !== undefined
      ) {

        result[
          category as keyof typeof result
        ] +=
          toNumber(
            item.amount
          );

      }

    }
  );


  const total =
    Object.values(
      result
    ).reduce(
      (
        sum,
        value
      ) =>
        sum + value,
      0
    );


  if (total === 0) {

    return null;

  }


  return {

    fixed_income:
      Number(
        (
          result.fixed_income /
          total *
          100
        ).toFixed(2)
      ),

    global_stock:
      Number(
        (
          result.global_stock /
          total *
          100
        ).toFixed(2)
      ),

    china_stock:
      Number(
        (
          result.china_stock /
          total *
          100
        ).toFixed(2)
      ),

    gold:
      Number(
        (
          result.gold /
          total *
          100
        ).toFixed(2)
      ),

    total_amount:
      total,

  };

}


// =====================================================
// Dashboard Total Wealth
// =====================================================

export async function getDashboardTotalWealth(): Promise<number> {

  const asset =
    await getLatestAsset();


  if (!asset) {

    return 0;

  }


  return toNumber(
    asset.total_asset
  );

}


// =====================================================
// 获取包含固收后的家庭总资产
// =====================================================

export async function getTotalWealthWithFixedIncome(): Promise<number> {

  const asset =
    await getLatestAsset();


  if (!asset) {

    return 0;

  }


  const baseAsset =
    toNumber(
      asset.total_asset
    );


  const fixedIncome =
    await getFixedIncomeTotal();


  return (
    baseAsset +
    fixedIncome
  );

}


// =====================================================
// 获取资产平台汇总
// =====================================================

export async function getHoldingsPlatformAllocation() {

  const {
    data,
    error,
  } = await supabase

    .from("holdings")

    .select(
      "platform, amount"
    )

    .eq(
      "active",
      true
    );


  if (error) {

    console.error(
      "getHoldingsPlatformAllocation error:",
      error
    );

    return [];

  }


  const platformMap: Record<
    string,
    {
      amount: number;
      count: number;
    }
  > = {};


  (data || []).forEach(
    (
      item: any
    ) => {

      const platform =
        String(
          item.platform ||
          "未设置"
        ).trim();


      const amount =
        Number(
          item.amount
        ) || 0;


      if (!platformMap[platform]) {

        platformMap[platform] = {
          amount: 0,
          count: 0,
        };

      }


      platformMap[platform].amount +=
        amount;


      platformMap[platform].count +=
        1;

    }
  );


  const total =
    Object.values(
      platformMap
    ).reduce(
      (
        sum,
        item
      ) =>
        sum +
        item.amount,
      0
    );


  const result =
    Object.entries(
      platformMap
    )
      .map(
        ([
          platform,
          item,
        ]) => ({
          platform,
          amount:
            item.amount,
          count:
            item.count,
          rate:
            total > 0
              ? item.amount /
                total
              : 0,
        })
      )
      .sort(
        (
          a,
          b
        ) =>
          b.amount -
          a.amount
      );


  return result;

}


// =====================================================
// 检查资产是否已经存在
// =====================================================

export async function holdingExists(
  code: string,
  platform: string
): Promise<boolean> {

  const {
    data,
    error,
  } = await supabase

    .from("holdings")

    .select("id")

    .eq(
      "code",
      code
    )

    .eq(
      "platform",
      platform
    )

    .limit(1);


  if (error) {

    console.error(
      "holdingExists error:",
      error
    );

    return false;

  }


  return (
    (data?.length ?? 0) > 0
  );

}


// =====================================================
// 获取 Holdings History 最近两个不同 snapshot
// =====================================================

export async function getHoldingsHistoryComparison() {

  const {
    data,
    error,
  } = await supabase

    .from("holdings_history")

    .select(
      `
        code,
        name,
        market,
        category,
        amount,
        cost,
        profit,
        profit_rate,
        currency,
        nav,
        shares,
        snapshot_date
      `
    )

    .order(
      "snapshot_date",
      {
        ascending: false,
      }
    )

    .order(
      "code",
      {
        ascending: true,
      }
    );


  if (error) {

    console.error(
      "getHoldingsHistoryComparison error:",
      error
    );

    return {

      latestDate:
        null,

      previousDate:
        null,

      latest:
        [],

      previous:
        [],

    };

  }


  const rows =
    data ?? [];


  if (rows.length === 0) {

    return {

      latestDate:
        null,

      previousDate:
        null,

      latest:
        [],

      previous:
        [],

    };

  }


  const dates =
    Array.from(
      new Set(
        rows
          .map(
            (row: any) =>
              row?.snapshot_date
                ? String(
                    row.snapshot_date
                  ).trim()
                : ""
          )
          .filter(Boolean)
      )
    );


  dates.sort(
    (
      a,
      b
    ) =>
      String(b).localeCompare(
        String(a)
      )
  );


  const latestDate =
    dates[0] ?? null;


  const previousDate =
    dates[1] ?? null;


  const latest =
    latestDate
      ? rows.filter(
          (row: any) =>
            String(
              row?.snapshot_date ??
              ""
            ).trim() ===
            latestDate
        )
      : [];


  const previous =
    previousDate
      ? rows.filter(
          (row: any) =>
            String(
              row?.snapshot_date ??
              ""
            ).trim() ===
            previousDate
        )
      : [];


  return {

    latestDate,

    previousDate,

    latest,

    previous,

  };

}


// =====================================================
// Performance
//
// 历史收益使用 asset_history
//
// 大陆：market = CN
// 香港：market = HK / US / LU
//
// 注意：
// asset_history 本身已经记录：
// cn_profit
// hk_profit
// total_profit
//
// 每一期的收益额：
// 当前累计 profit - 上一期累计 profit
//
// 收益率：
// 本期收益额 / 上一期资产成本
// =====================================================


// =====================================================
// 日期工具
// =====================================================

function parseLocalDate(
  value: string
): Date {

  const [
    year,
    month,
    day,
  ] =
    value
      .slice(
        0,
        10
      )
      .split("-")
      .map(Number);


  return new Date(
    year,
    month - 1,
    day
  );

}


function dateKey(
  date: Date
): string {

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(
      2,
      "0"
    );

  const day =
    String(
      date.getDate()
    ).padStart(
      2,
      "0"
    );


  return (
    `${year}-${month}-${day}`
  );

}


function startOfWeek(
  date: Date
): Date {

  const result =
    new Date(
      date
    );

  const day =
    result.getDay();

  const diff =
    day === 0
      ? -6
      : 1 - day;


  result.setDate(
    result.getDate() +
    diff
  );


  result.setHours(
    0,
    0,
    0,
    0
  );


  return result;

}


function endOfWeek(
  date: Date
): Date {

  const result =
    startOfWeek(
      date
    );


  result.setDate(
    result.getDate() +
    6
  );


  return result;

}


// =====================================================
// 根据日期选择每个周期最后一个 snapshot
// =====================================================

function groupLastSnapshots(
  history: AssetHistory[],
  type:
    | "weekly"
    | "monthly"
    | "yearly"
): AssetHistory[] {

  const map =
    new Map<
      string,
      AssetHistory
    >();


  for (
    const row of history
  ) {

    if (
      !row.snapshot_date
    ) {

      continue;

    }


    const date =
      parseLocalDate(
        row.snapshot_date
      );


    let key = "";


    if (
      type === "weekly"
    ) {

      const weekStart =
        startOfWeek(
          date
        );


      key =
        dateKey(
          weekStart
        );

    }
    else if (
      type === "monthly"
    ) {

      key =
        `${date.getFullYear()}-${String(
          date.getMonth() + 1
        ).padStart(
          2,
          "0"
        )}`;

    }
    else {

      key =
        String(
          date.getFullYear()
        );

    }


    const existing =
      map.get(
        key
      );


    if (
      !existing ||
      String(
        existing.snapshot_date
      ) <
      String(
        row.snapshot_date
      )
    ) {

      map.set(
        key,
        row
      );

    }

  }


  return Array
    .from(
      map.values()
    )
    .sort(
      (
        a,
        b
      ) =>
        String(
          b.snapshot_date
        )
        .localeCompare(
          String(
            a.snapshot_date
          )
        )
    );

}


// =====================================================
// 计算 Performance
// =====================================================

function calculatePerformancePoints(
  snapshots: AssetHistory[],
  profitField:
    | "cn_profit"
    | "hk_profit"
    | "total_profit",
  assetField:
    | "cn_asset"
    | "hk_asset"
    | "total_asset"
): PerformancePoint[] {

  const sorted =
    [...snapshots]
      .filter(
        row =>
          Boolean(
            row.snapshot_date
          )
      )
      .sort(
        (
          a,
          b
        ) =>
          String(
            a.snapshot_date
          )
          .localeCompare(
            String(
              b.snapshot_date
            )
          )
      );


  const result:
    PerformancePoint[] = [];


  for (
    let i = 1;
    i < sorted.length;
    i++
  ) {

    const previous =
      sorted[i - 1];


    const current =
      sorted[i];


    const currentProfit =
      toNumber(
        current[
          profitField
        ]
      );


    const previousProfit =
      toNumber(
        previous[
          profitField
        ]
      );


    const profit =
      currentProfit -
      previousProfit;


    const previousAsset =
      toNumber(
        previous[
          assetField
        ]
      );


    const previousCumulativeProfit =
      previousProfit;


    const previousCost =
      previousAsset -
      previousCumulativeProfit;


    const profitRate =
      previousCost > 0
        ? (
            profit /
            previousCost
          ) *
          100
        : 0;


    result.push({

      date:
        String(
          current.snapshot_date
        ).slice(
          0,
          10
        ),

      profit:
        Math.round(
          profit
        ),

      profitRate,

    });

  }


  return result.reverse();

}


// =====================================================
// 获取 Performance 历史
// =====================================================

export async function getPerformanceHistory(): Promise<PerformanceHistory> {

  const history =
    await getAssetHistory();


  if (
    history.length === 0
  ) {

    return {

      mainland: {
        daily: [],
        weekly: [],
        monthly: [],
        yearly: [],
      },

      hk: {
        daily: [],
        weekly: [],
        monthly: [],
        yearly: [],
      },

      total: {
        daily: [],
        weekly: [],
        monthly: [],
        yearly: [],
      },

    };

  }


  const weekly =
    groupLastSnapshots(
      history,
      "weekly"
    );


  const monthly =
    groupLastSnapshots(
      history,
      "monthly"
    );


  const yearly =
    groupLastSnapshots(
      history,
      "yearly"
    );


  return {

    mainland: {

      daily:
        calculatePerformancePoints(
          history,
          "cn_profit",
          "cn_asset"
        ),

      weekly:
        calculatePerformancePoints(
          weekly,
          "cn_profit",
          "cn_asset"
        ),

      monthly:
        calculatePerformancePoints(
          monthly,
          "cn_profit",
          "cn_asset"
        ),

      yearly:
        calculatePerformancePoints(
          yearly,
          "cn_profit",
          "cn_asset"
        ),

    },


    hk: {

      daily:
        calculatePerformancePoints(
          history,
          "hk_profit",
          "hk_asset"
        ),

      weekly:
        calculatePerformancePoints(
          weekly,
          "hk_profit",
          "hk_asset"
        ),

      monthly:
        calculatePerformancePoints(
          monthly,
          "hk_profit",
          "hk_asset"
        ),

      yearly:
        calculatePerformancePoints(
          yearly,
          "hk_profit",
          "hk_asset"
        ),

    },


    total: {

      daily:
        calculatePerformancePoints(
          history,
          "total_profit",
          "total_asset"
        ),

      weekly:
        calculatePerformancePoints(
          weekly,
          "total_profit",
          "total_asset"
        ),

      monthly:
        calculatePerformancePoints(
          monthly,
          "total_profit",
          "total_asset"
        ),

      yearly:
        calculatePerformancePoints(
          yearly,
          "total_profit",
          "total_asset"
        ),

    },

  };

}
