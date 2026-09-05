"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "@/lib/supabase";


// =====================================================
// 类型
// =====================================================

type SortKey =
  | "name"
  | "market"
  | "category"
  | "platform"
  | "shares"
  | "nav"
  | "amount"
  | "cost"
  | "profit"
  | "profit_rate";

type SortDirection = "asc" | "desc";

type SortState = {
  key: SortKey | null;
  direction: SortDirection;
};

type Holding = {

  id: number;

  code: string;

  name: string;

  market: string;

  category: string;

  amount: number | null;

  updated_at?: string | null;

  cost: number | null;

  profit: number | null;

  profit_rate: number | null;

  currency: string;

  nav: number | null;

  shares: number | null;

  platform: string;

  active: boolean;

  // ===================================================
  // 是否停止自动更新
  //
  // false = 正常每天更新
  // true  = 每天跳过
  // ===================================================

  skip_update: boolean;

};


// =====================================================
// 空表单
// =====================================================

const emptyForm = {

  code: "",

  name: "",

  market: "",

  category: "",

  amount: "",

  cost: "",

  profit: "",

  profit_rate: "",

  currency: "",

  nav: "",

  shares: "",

  platform: "",

};


// =====================================================
// 下拉选项
// =====================================================

const MARKET_OPTIONS = [

  "CN",

  "HK",

  "US",

  "GLOBAL",

];


const CATEGORY_OPTIONS = [

  "fixed_income",

  "global_stock",

  "china_stock",

  "gold",

];


const CURRENCY_OPTIONS = [

  "CNY",

  "USD",

  "HKD",

  "EUR",

  "GBP",

  "JPY",

];


// =====================================================
// 工具
// =====================================================

function numberValue(
  value: any
) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {

    return null;

  }

  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : null;

}


function formatMoney(
  value: any
) {

  const n =
    Number(value);

  if (!Number.isFinite(n)) {

    return "—";

  }

  return n.toLocaleString(
    "zh-CN",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }
  );

}


function formatNumber(
  value: any
) {

  const n =
    Number(value);

  if (!Number.isFinite(n)) {

    return "—";

  }

  return n.toLocaleString(
    "zh-CN",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4,
    }
  );

}


function formatPercent(
  value: any
) {

  const n =
    Number(value);

  if (!Number.isFinite(n)) {

    return "—";

  }

  return `${n.toFixed(2)}%`;

}


function getProfitClass(
  value: any
) {

  const n =
    Number(value);

  if (n > 0) {

    return "text-emerald-600";

  }

  if (n < 0) {

    return "text-red-500";

  }

  return "text-gray-500";

}


// =====================================================
// 页面
// =====================================================

export default function AssetManagementPage() {


  // ===================================================
  // 数据
  // ===================================================

  const [
    holdings,
    setHoldings,
  ] = useState<Holding[]>([]);


  // ===================================================
  // 状态
  // ===================================================

  const [
    loading,
    setLoading,
  ] = useState(true);


  const [
    saving,
    setSaving,
  ] = useState(false);


  const [
    error,
    setError,
  ] = useState("");


  const [
    success,
    setSuccess,
  ] = useState("");


  const [
    modalOpen,
    setModalOpen,
  ] = useState(false);


  const [
    editingId,
    setEditingId,
  ] = useState<number | null>(
    null
  );


  const [
    form,
    setForm,
  ] = useState<any>(
    emptyForm
  );


  const [
    search,
    setSearch,
  ] = useState("");

  // ===================================================
  // 大陆 / 香港分别排序
  //
  // Mainland = market === CN
  // Hong Kong = HK / US / GLOBAL
  //
  // 两个区域各自保存排序状态，互不影响
  // ===================================================

  const [
    mainlandSort,
    setMainlandSort,
  ] = useState<SortState>({
    key: "amount",
    direction: "desc",
  });

  const [
    hongKongSort,
    setHongKongSort,
  ] = useState<SortState>({
    key: "amount",
    direction: "desc",
  });

  const [
    inactiveSort,
    setInactiveSort,
  ] = useState<SortState>({
    key: "amount",
    direction: "desc",
  });


  // ===================================================
  // 单独保存停止更新状态时
  // 防止重复点击
  // ===================================================

  const [
    updatingSkipId,
    setUpdatingSkipId,
  ] = useState<number | null>(
    null
  );


  // ===================================================
  // 加载 Holdings
  // ===================================================

  async function loadHoldings() {

    setLoading(true);

    setError("");

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
          nullsFirst: false,
        }
      );


    if (error) {

      console.error(
        "load holdings error:",
        error
      );

      setError(
        `读取资产失败：${error.message}`
      );

      setHoldings([]);

      setLoading(false);

      return;

    }


    setHoldings(
      (data || []) as Holding[]
    );

    setLoading(false);

  }


  // ===================================================
  // 初始加载
  // ===================================================

  useEffect(() => {

    loadHoldings();

  }, []);


  // ===================================================
  // 切换停止更新
  //
  // false：
  // 正常每天 UPDATE
  //
  // true：
  // 每天 UPDATE 跳过
  // ===================================================

  async function toggleSkipUpdate(
    item: Holding
  ) {

    if (
      updatingSkipId !== null
    ) {

      return;

    }


    const newValue =
      !Boolean(
        item.skip_update
      );


    setUpdatingSkipId(
      item.id
    );

    setError("");

    setSuccess("");


    // =================================================
    // 先更新页面状态
    // =================================================

    setHoldings(
      previous =>
        previous.map(
          holding =>
            holding.id === item.id

              ? {
                  ...holding,

                  skip_update:
                    newValue,
                }

              : holding
        )
    );


    // =================================================
    // 保存 Supabase
    // =================================================

    const {
      error,
    } = await supabase

      .from("holdings")

      .update({

        skip_update:
          newValue,

        updated_at:
          new Date()
            .toISOString(),

      })

      .eq(
        "id",
        item.id
      );


    // =================================================
    // 保存失败
    //
    // 回滚页面状态
    // =================================================

    if (error) {

      console.error(
        "toggle skip_update error:",
        error
      );


      setHoldings(
        previous =>
          previous.map(
            holding =>
              holding.id === item.id

                ? {
                    ...holding,

                    skip_update:
                      Boolean(
                        item.skip_update
                      ),
                  }

                : holding
          )
      );


      setError(
        `停止更新设置失败：${error.message}`
      );


      setUpdatingSkipId(
        null
      );

      return;

    }


    // =================================================
    // 成功提示
    // =================================================

    setSuccess(

      newValue

        ? `${item.name} 已设置为停止自动更新`

        : `${item.name} 已恢复自动更新`

    );


    setUpdatingSkipId(
      null
    );

  }


  // ===================================================
  // 当前资产
  // ===================================================

  const filteredActiveHoldings =
    useMemo(() => {

      const keyword =
        search
          .trim()
          .toLowerCase();

      return holdings

        .filter(
          item =>
            item.active === true
        )

        .filter(
          item => {

            if (!keyword) {
              return true;
            }

            return [
              item.code,
              item.name,
              item.market,
              item.category,
              item.platform,
              item.currency,
            ]
              .join(" ")
              .toLowerCase()
              .includes(keyword);

          }
        );

    }, [
      holdings,
      search,
    ]);

  // ===================================================
  // 大陆资产
  // CN = 中国大陆
  // ===================================================

  const mainlandHoldings =
    useMemo(
      () =>
        filteredActiveHoldings.filter(
          item =>
            String(item.market || "")
              .trim()
              .toUpperCase() === "CN"
        ),
      [filteredActiveHoldings]
    );

  // ===================================================
  // 香港资产
  //
  // 当前 holdings 没有单独的“账户所在地”字段，
  // 因此按现有 market 做分组：
  // CN -> 大陆
  // HK / US / GLOBAL -> 香港
  // ===================================================

  const hongKongHoldings =
    useMemo(
      () =>
        filteredActiveHoldings.filter(
          item =>
            String(item.market || "")
              .trim()
              .toUpperCase() !== "CN"
        ),
      [filteredActiveHoldings]
    );

  // ===================================================
  // 排序工具
  // ===================================================

  function compareHolding(
    a: Holding,
    b: Holding,
    key: SortKey
  ) {

    const numericKeys: SortKey[] = [
      "shares",
      "nav",
      "amount",
      "cost",
      "profit",
      "profit_rate",
    ];

    if (numericKeys.includes(key)) {

      const av =
        numberValue(a[key]);

      const bv =
        numberValue(b[key]);

      // 空值始终排在最后
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;

      return av - bv;
    }

    const av =
      String(a[key] ?? "")
        .toLowerCase();

    const bv =
      String(b[key] ?? "")
        .toLowerCase();

    return av.localeCompare(
      bv,
      "zh-CN",
      {
        numeric: true,
        sensitivity: "base",
      }
    );
  }

  function sortHoldings(
    items: Holding[],
    sort: SortState
  ) {

    if (!sort.key) {
      return items;
    }

    return [...items].sort(
      (a, b) => {

        const result =
          compareHolding(
            a,
            b,
            sort.key!
          );

        return sort.direction === "asc"
          ? result
          : -result;

      }
    );
  }

  const sortedMainlandHoldings =
    useMemo(
      () =>
        sortHoldings(
          mainlandHoldings,
          mainlandSort
        ),
      [
        mainlandHoldings,
        mainlandSort,
      ]
    );

  const sortedHongKongHoldings =
    useMemo(
      () =>
        sortHoldings(
          hongKongHoldings,
          hongKongSort
        ),
      [
        hongKongHoldings,
        hongKongSort,
      ]
    );

  // ===================================================
  // 已停用资产
  // ===================================================

  const inactiveHoldings =
    useMemo(() => {

      const keyword =
        search
          .trim()
          .toLowerCase();

      const filtered =
        holdings

          .filter(
            item =>
              item.active === false
          )

          .filter(
            item => {

              if (!keyword) {
                return true;
              }

              return [
                item.code,
                item.name,
                item.market,
                item.category,
                item.platform,
                item.currency,
              ]
                .join(" ")
                .toLowerCase()
                .includes(keyword);

            }
          );

      return sortHoldings(
        filtered,
        inactiveSort
      );

    }, [
      holdings,
      search,
      inactiveSort,
    ]);

  // ===================================================
  // 当前资产总市值
  // ===================================================

  const activeTotal =
    useMemo(() => {

      return filteredActiveHoldings.reduce(

        (
          total,
          item
        ) => {

          return (
            total +
            Number(
              item.amount ||
              0
            )
          );

        },

        0

      );

    }, [
      filteredActiveHoldings,
    ]);


  // ===================================================
  // 打开新增
  // ===================================================

  function openAdd() {

    setEditingId(null);

    setForm({
      ...emptyForm,
    });

    setError("");

    setSuccess("");

    setModalOpen(true);

  }


  // ===================================================
  // 打开编辑
  // ===================================================

  function openEdit(
    item: Holding
  ) {

    setEditingId(
      item.id
    );


    setForm({

      code:
        item.code ?? "",

      name:
        item.name ?? "",

      market:
        item.market ?? "",

      category:
        item.category ?? "",

      amount:
        item.amount ?? "",

      cost:
        item.cost ?? "",

      profit:
        item.profit ?? "",

      profit_rate:
        item.profit_rate ?? "",

      currency:
        item.currency ?? "",

      nav:
        item.nav ?? "",

      shares:
        item.shares ?? "",

      platform:
        item.platform ?? "",

    });


    setError("");

    setSuccess("");

    setModalOpen(true);

  }


  // ===================================================
  // 表单修改
  // ===================================================

  function updateForm(
    field: string,
    value: string
  ) {

    setForm(
      (
        previous: any
      ) => ({

        ...previous,

        [field]:
          value,

      })
    );

  }


  // ===================================================
  // 保存
  // ===================================================

  async function handleSave(
    e: React.FormEvent
  ) {

    e.preventDefault();


    setError("");

    setSuccess("");


    // -----------------------------------------------
    // 基础检查
    // -----------------------------------------------

    if (
      !form.code.trim()
    ) {

      setError(
        "请输入资产 Code"
      );

      return;

    }


    if (
      !form.name.trim()
    ) {

      setError(
        "请输入资产名称"
      );

      return;

    }


    if (
      !form.market.trim()
    ) {

      setError(
        "请选择 Market"
      );

      return;

    }


    if (
      !form.category.trim()
    ) {

      setError(
        "请选择 Category"
      );

      return;

    }


    if (
      !form.platform.trim()
    ) {

      setError(
        "请输入 Platform"
      );

      return;

    }


    if (
      !form.currency.trim()
    ) {

      setError(
        "请选择 Currency"
      );

      return;

    }


    setSaving(true);


    // -----------------------------------------------
    // 数据
    // -----------------------------------------------

    const payload = {

      code:
        form.code
          .trim(),

      name:
        form.name
          .trim(),

      market:
        form.market
          .trim(),

      category:
        form.category
          .trim(),

      amount:
        numberValue(
          form.amount
        ),

      cost:
        numberValue(
          form.cost
        ),

      profit:
        numberValue(
          form.profit
        ),

      profit_rate:
        numberValue(
          form.profit_rate
        ),

      currency:
        form.currency
          .trim(),

      nav:
        numberValue(
          form.nav
        ),

      shares:
        numberValue(
          form.shares
        ),

      platform:
        form.platform
          .trim(),

    };


    try {


      // =================================================
      // 编辑
      // =================================================

      if (
        editingId !== null
      ) {

        const {
          error,
        } = await supabase

          .from("holdings")

          .update({

            ...payload,

            updated_at:
              new Date()
                .toISOString(),

          })

          .eq(
            "id",
            editingId
          );


        if (error) {

          console.error(
            "update holding error:",
            error
          );

          setError(
            `保存失败：${error.message}`
          );

          setSaving(false);

          return;

        }


        setSuccess(
          "资产修改成功"
        );

      }


      // =================================================
      // 新增
      // =================================================

      else {

        const {
          error,
        } = await supabase

          .from("holdings")

          .insert({

            ...payload,

            active: true,

            // =========================================
            // 新资产默认正常自动更新
            // =========================================

            skip_update: false,

            updated_at:
              new Date()
                .toISOString(),

          });


        if (error) {

          console.error(
            "insert holding error:",
            error
          );

          setError(
            `保存失败：${error.message}`
          );

          setSaving(false);

          return;

        }


        setSuccess(
          "资产添加成功"
        );

      }


      // =================================================
      // 重新读取
      // =================================================

      await loadHoldings();


      setModalOpen(false);

      setEditingId(null);

      setForm({
        ...emptyForm,
      });


    } catch (
      err: any
    ) {

      console.error(
        err
      );

      setError(
        `保存失败：${
          err?.message ||
          "未知错误"
        }`
      );

    }


    setSaving(false);

  }


  // ===================================================
  // 停用资产
  // ===================================================

  async function deactivateAsset(
    item: Holding
  ) {

    const confirmed =
      window.confirm(

        `确定要停用「${item.name}」吗？\n\n` +

        `停用后它将从当前持仓中消失，` +

        `但历史记录不会删除。`

      );


    if (!confirmed) {

      return;

    }


    setError("");

    setSuccess("");


    const {
      error,
    } = await supabase

      .from("holdings")

      .update({

        active: false,

        amount: 0,

        updated_at:
          new Date()
            .toISOString(),

      })

      .eq(
        "id",
        item.id
      );


    if (error) {

      console.error(
        "deactivate error:",
        error
      );

      setError(
        `停用失败：${error.message}`
      );

      return;

    }


    setSuccess(
      `${item.name} 已停用`
    );


    await loadHoldings();

  }


  // ===================================================
  // 重新买入
  // ===================================================

  async function reactivateAsset(
    item: Holding
  ) {

    const confirmed =
      window.confirm(

        `确定重新买入「${item.name}」吗？\n\n` +

        `该资产会重新出现在当前持仓中。`

      );


    if (!confirmed) {

      return;

    }


    setError("");

    setSuccess("");


    const {
      error,
    } = await supabase

      .from("holdings")

      .update({

        active: true,

        updated_at:
          new Date()
            .toISOString(),

      })

      .eq(
        "id",
        item.id
      );


    if (error) {

      console.error(
        "reactivate error:",
        error
      );

      setError(
        `重新买入失败：${error.message}`
      );

      return;

    }


    setSuccess(
      `${item.name} 已重新激活`
    );


    await loadHoldings();

  }


  // ===================================================
  // 删除
  // ===================================================

  async function deleteAsset(
    item: Holding
  ) {

    const confirmed =
      window.confirm(

        `⚠️ 确定要永久删除「${item.name}」吗？\n\n` +

        `删除后数据库中的这条 holdings 记录将永久消失。\n` +

        `如果只是卖出，请使用「停用」，不要删除。`

      );


    if (!confirmed) {

      return;

    }


    setError("");

    setSuccess("");


    const {
      error,
    } = await supabase

      .from("holdings")

      .delete()

      .eq(
        "id",
        item.id
      );


    if (error) {

      console.error(
        "delete holding error:",
        error
      );

      setError(
        `删除失败：${error.message}`
      );

      return;

    }


    setSuccess(
      `${item.name} 已删除`
    );


    await loadHoldings();

  }


  // ===================================================
  // 渲染
  // ===================================================

  return (

    <div
      className="
        min-h-screen
        bg-gray-50
        px-6
        py-6
      "
    >

      <div
        className="
          mx-auto
          max-w-[1500px]
        "
      >

        {/* =================================================
            页面标题
        ================================================= */}

        <div
          className="
            mb-6
            flex
            items-center
            justify-between
          "
        >

          <div>

            <h1
              className="
                text-2xl
                font-semibold
                text-gray-900
              "
            >
              Asset Management
            </h1>


            <p
              className="
                mt-1
                text-sm
                text-gray-500
              "
            >
              管理当前持仓、已停用资产以及重新买入
            </p>

          </div>


          <button
            onClick={openAdd}
            className="
              rounded-lg
              bg-gray-900
              px-5
              py-2.5
              text-sm
              font-medium
              text-white
              shadow-sm
              transition
              hover:bg-gray-800
            "
          >
            + Add Asset
          </button>

        </div>


        {/* =================================================
            提示
        ================================================= */}

        {error && (

          <div
            className="
              mb-4
              rounded-lg
              border
              border-red-200
              bg-red-50
              px-4
              py-3
              text-sm
              text-red-600
            "
          >
            {error}
          </div>

        )}


        {success && (

          <div
            className="
              mb-4
              rounded-lg
              border
              border-emerald-200
              bg-emerald-50
              px-4
              py-3
              text-sm
              text-emerald-600
            "
          >
            {success}
          </div>

        )}


        {/* =================================================
            搜索
        ================================================= */}

        <div
          className="
            mb-5
            flex
            items-center
            justify-between
            gap-4
          "
        >

          <div
            className="
              relative
              w-full
              max-w-md
            "
          >

            <input

              value={search}

              onChange={
                e =>
                  setSearch(
                    e.target.value
                  )
              }

              placeholder="Search code / name / platform..."

              className="
                w-full
                rounded-lg
                border
                border-gray-200
                bg-white
                px-4
                py-2.5
                text-sm
                outline-none
                transition
                focus:border-gray-400
                focus:ring-2
                focus:ring-gray-100
              "

            />

          </div>


          <div
            className="
              text-sm
              text-gray-500
            "
          >

            Current Assets：

            <span
              className="
                ml-1
                font-semibold
                text-gray-900
              "
            >
              {filteredActiveHoldings.length}
            </span>

            <span
              className="
                mx-2
                text-gray-300
              "
            >
              |
            </span>

            Total：

            <span
              className="
                ml-1
                font-semibold
                text-gray-900
              "
            >
              ¥{formatMoney(activeTotal)}
            </span>

          </div>

        </div>


        {/* =================================================
            CURRENT HOLDINGS
        ================================================= */}

        <section
          className="
            overflow-hidden
            rounded-xl
            border
            border-gray-200
            bg-white
            shadow-sm
          "
        >

          <div
            className="
              flex
              items-center
              justify-between
              border-b
              border-gray-200
              px-5
              py-4
            "
          >

            <div>

              <h2
                className="
                  text-base
                  font-semibold
                  text-gray-900
                "
              >
                Current Holdings
              </h2>

              <p
                className="
                  mt-0.5
                  text-xs
                  text-gray-500
                "
              >
                当前正在持有的资产 · 大陆 / 香港分开管理
              </p>

            </div>

            <span
              className="
                rounded-full
                bg-emerald-50
                px-3
                py-1
                text-xs
                font-medium
                text-emerald-600
              "
            >
              {filteredActiveHoldings.length} Assets
            </span>

          </div>


          {loading ? (

            <div
              className="
                px-5
                py-12
                text-center
                text-sm
                text-gray-400
              "
            >
              Loading...
            </div>

          ) : filteredActiveHoldings.length === 0 ? (

            <div
              className="
                px-5
                py-14
                text-center
              "
            >

              <div
                className="
                  text-3xl
                "
              >
                📊
              </div>

              <div
                className="
                  mt-3
                  text-sm
                  font-medium
                  text-gray-700
                "
              >
                暂无当前持仓
              </div>

              <div
                className="
                  mt-1
                  text-xs
                  text-gray-400
                "
              >
                点击右上角 Add Asset 添加第一项资产
              </div>

            </div>

          ) : (

            <div className="space-y-6 p-4 md:p-5">

              {/* =================================================
                  大陆资产
              ================================================= */}

              <AssetRegionTable
                title="大陆资产"
                subtitle="Market = CN"
                badgeCount={mainlandHoldings.length}
                items={sortedMainlandHoldings}
                sort={mainlandSort}
                setSort={setMainlandSort}
                openEdit={openEdit}
                toggleSkipUpdate={toggleSkipUpdate}
                deactivateAsset={deactivateAsset}
                updatingSkipId={updatingSkipId}
                emptyText="暂无大陆资产"
              />


              {/* =================================================
                  香港资产
              ================================================= */}

              <AssetRegionTable
                title="香港资产"
                subtitle="Market = HK / US / GLOBAL"
                badgeCount={hongKongHoldings.length}
                items={sortedHongKongHoldings}
                sort={hongKongSort}
                setSort={setHongKongSort}
                openEdit={openEdit}
                toggleSkipUpdate={toggleSkipUpdate}
                deactivateAsset={deactivateAsset}
                updatingSkipId={updatingSkipId}
                emptyText="暂无香港资产"
              />

            </div>

          )}

        </section>


        {/* =================================================
            INACTIVE / SOLD ASSETS
        ================================================= */}

        <section
          className="
            mt-7
            overflow-hidden
            rounded-xl
            border
            border-gray-200
            bg-white
            shadow-sm
          "
        >

          <div
            className="
              flex
              items-center
              justify-between
              border-b
              border-gray-200
              px-5
              py-4
            "
          >

            <div>

              <h2
                className="
                  text-base
                  font-semibold
                  text-gray-900
                "
              >
                Inactive / Sold Assets
              </h2>


              <p
                className="
                  mt-0.5
                  text-xs
                  text-gray-500
                "
              >
                已卖出或暂时停用的历史资产
              </p>

            </div>


            <span
              className="
                rounded-full
                bg-gray-100
                px-3
                py-1
                text-xs
                font-medium
                text-gray-500
              "
            >
              {inactiveHoldings.length} Assets
            </span>

          </div>


          {inactiveHoldings.length === 0 ? (

            <div
              className="
                px-5
                py-12
                text-center
                text-sm
                text-gray-400
              "
            >
              暂无已停用资产
            </div>

          ) : (

            <div
              className="
                overflow-x-auto
              "
            >

              <table
                className="
                  min-w-[1250px]
                  w-full
                  text-sm
                "
              >

                <thead>

                  <tr
                    className="
                      border-b
                      border-gray-100
                      bg-gray-50/70
                      text-xs
                      text-gray-500
                    "
                  >

                    <SortableHeader
                      label="Asset"
                      sort={inactiveSort}
                      sortKey="name"
                      setter={setInactiveSort}
                    />

                    <SortableHeader
                      label="Market"
                      sort={inactiveSort}
                      sortKey="market"
                      setter={setInactiveSort}
                    />

                    <SortableHeader
                      label="Category"
                      sort={inactiveSort}
                      sortKey="category"
                      setter={setInactiveSort}
                    />

                    <SortableHeader
                      label="Platform"
                      sort={inactiveSort}
                      sortKey="platform"
                      setter={setInactiveSort}
                    />

                    <SortableHeader
                      label="Last Amount"
                      sort={inactiveSort}
                      sortKey="amount"
                      setter={setInactiveSort}
                      align="right"
                    />

                    <SortableHeader
                      label="Profit"
                      sort={inactiveSort}
                      sortKey="profit"
                      setter={setInactiveSort}
                      align="right"
                    />

                    <th className="px-4 py-3 text-center font-medium">
                      停止更新
                    </th>

                    <th className="px-5 py-3 text-right font-medium">
                      Actions
                    </th>

                  </tr>

                </thead>


                <tbody>

                  {inactiveHoldings.map(
                    item => (

                      <tr
                        key={item.id}
                        className="
                          border-b
                          border-gray-100
                          last:border-b-0
                          hover:bg-gray-50/60
                        "
                      >

                        <td className="px-5 py-4">

                          <div
                            className="
                              font-medium
                              text-gray-700
                            "
                          >
                            {item.name || "—"}
                          </div>

                          <div
                            className="
                              mt-0.5
                              text-xs
                              text-gray-400
                            "
                          >
                            {item.code || "—"}
                          </div>

                        </td>


                        <td className="px-4 py-4 text-gray-500">
                          {item.market || "—"}
                        </td>


                        <td className="px-4 py-4">

                          <span
                            className="
                              rounded-md
                              bg-gray-100
                              px-2
                              py-1
                              text-xs
                              text-gray-500
                            "
                          >
                            {item.category || "—"}
                          </span>

                        </td>


                        <td className="px-4 py-4 text-gray-500">
                          {item.platform || "—"}
                        </td>


                        <td
                          className="
                            px-4
                            py-4
                            text-right
                            tabular-nums
                            text-gray-500
                          "
                        >
                          ¥{formatMoney(item.amount)}
                        </td>


                        <td
                          className={`
                            px-4
                            py-4
                            text-right
                            font-medium
                            tabular-nums
                            ${getProfitClass(item.profit)}
                          `}
                        >
                          ¥{formatMoney(item.profit)}
                        </td>


                        {/* =================================================
                            停止更新
                        ================================================= */}

                        <td
                          className="
                            px-4
                            py-4
                            text-center
                          "
                        >

                          <input
                            type="checkbox"

                            checked={
                              Boolean(
                                item.skip_update
                              )
                            }

                            disabled={
                              updatingSkipId ===
                              item.id
                            }

                            onChange={() =>
                              toggleSkipUpdate(
                                item
                              )
                            }

                            className="
                              h-4
                              w-4
                              cursor-pointer
                              rounded
                              border-gray-300
                              text-gray-900
                              focus:ring-2
                              focus:ring-gray-300
                              disabled:cursor-not-allowed
                              disabled:opacity-50
                            "
                          />

                        </td>


                        <td className="px-5 py-4">

                          <div
                            className="
                              flex
                              justify-end
                              gap-2
                            "
                          >

                            <button
                              onClick={() =>
                                reactivateAsset(item)
                              }
                              className="
                                rounded-md
                                border
                                border-emerald-200
                                bg-emerald-50
                                px-3
                                py-1.5
                                text-xs
                                font-medium
                                text-emerald-700
                                hover:bg-emerald-100
                              "
                            >
                              重新买入
                            </button>


                            <button
                              onClick={() =>
                                openEdit(item)
                              }
                              className="
                                rounded-md
                                border
                                border-gray-200
                                bg-white
                                px-3
                                py-1.5
                                text-xs
                                font-medium
                                text-gray-600
                                hover:bg-gray-50
                              "
                            >
                              编辑
                            </button>


                            <button
                              onClick={() =>
                                deleteAsset(item)
                              }
                              className="
                                rounded-md
                                border
                                border-red-200
                                bg-red-50
                                px-3
                                py-1.5
                                text-xs
                                font-medium
                                text-red-600
                                hover:bg-red-100
                              "
                            >
                              删除
                            </button>

                          </div>

                        </td>

                      </tr>

                    )
                  )}

                </tbody>

              </table>

            </div>

          )}

        </section>

      </div>


      {/* =================================================
          ADD / EDIT MODAL
      ================================================= */}

      {modalOpen && (

        <div
          className="
            fixed
            inset-0
            z-50
            flex
            items-center
            justify-center
            bg-black/40
            px-4
            py-8
          "
          onMouseDown={
            e => {

              if (
                e.target === e.currentTarget
              ) {

                setModalOpen(false);

              }

            }
          }
        >

          <div
            className="
              max-h-[90vh]
              w-full
              max-w-4xl
              overflow-y-auto
              rounded-2xl
              bg-white
              shadow-2xl
            "
          >

            {/* Modal Header */}

            <div
              className="
                sticky
                top-0
                z-10
                flex
                items-center
                justify-between
                border-b
                border-gray-200
                bg-white
                px-6
                py-4
              "
            >

              <div>

                <h2
                  className="
                    text-lg
                    font-semibold
                    text-gray-900
                  "
                >
                  {editingId !== null
                    ? "Edit Asset"
                    : "Add Asset"}
                </h2>


                <p
                  className="
                    mt-0.5
                    text-xs
                    text-gray-500
                  "
                >
                  {editingId !== null
                    ? "修改资产信息"
                    : "添加新的投资资产"}
                </p>

              </div>


              <button
                onClick={() =>
                  setModalOpen(false)
                }
                className="
                  flex
                  h-8
                  w-8
                  items-center
                  justify-center
                  rounded-full
                  text-gray-400
                  hover:bg-gray-100
                  hover:text-gray-700
                "
              >
                ×
              </button>

            </div>


            {/* Form */}

            <form
              onSubmit={handleSave}
              className="
                p-6
              "
            >

              {/* =================================================
                  Basic Information
              ================================================= */}

              <div
                className="
                  mb-6
                "
              >

                <h3
                  className="
                    mb-4
                    text-sm
                    font-semibold
                    text-gray-900
                  "
                >
                  Basic Information
                </h3>


                <div
                  className="
                    grid
                    grid-cols-1
                    gap-4
                    md:grid-cols-2
                    lg:grid-cols-3
                  "
                >

                  <FormInput
                    label="Code"
                    value={form.code}
                    onChange={
                      value =>
                        updateForm(
                          "code",
                          value
                        )
                    }
                    placeholder="例如 VOO / 015736"
                    required
                  />


                  <FormInput
                    label="Name"
                    value={form.name}
                    onChange={
                      value =>
                        updateForm(
                          "name",
                          value
                        )
                    }
                    placeholder="资产名称"
                    required
                  />


                  <FormInput
                    label="Market"
                    value={form.market}
                    onChange={
                      value =>
                        updateForm(
                          "market",
                          value
                        )
                    }
                    options={MARKET_OPTIONS}
                    required
                  />


                  <FormInput
                    label="Category"
                    value={form.category}
                    onChange={
                      value =>
                        updateForm(
                          "category",
                          value
                        )
                    }
                    options={CATEGORY_OPTIONS}
                    required
                  />


                  <FormInput
                    label="Currency"
                    value={form.currency}
                    onChange={
                      value =>
                        updateForm(
                          "currency",
                          value
                        )
                    }
                    options={CURRENCY_OPTIONS}
                    required
                  />


                  <FormInput
                    label="Platform"
                    value={form.platform}
                    onChange={
                      value =>
                        updateForm(
                          "platform",
                          value
                        )
                    }
                    placeholder="券商 / 银行 / 平台"
                    required
                  />

                </div>

              </div>


              {/* =================================================
                  Position
              ================================================= */}

              <div
                className="
                  mb-6
                "
              >

                <h3
                  className="
                    mb-4
                    text-sm
                    font-semibold
                    text-gray-900
                  "
                >
                  Position
                </h3>


                <div
                  className="
                    grid
                    grid-cols-1
                    gap-4
                    md:grid-cols-2
                    lg:grid-cols-3
                  "
                >

                  <FormInput
                    label="Shares"
                    value={form.shares}
                    onChange={
                      value =>
                        updateForm(
                          "shares",
                          value
                        )
                    }
                    type="number"
                    step="0.000001"
                    placeholder="持有数量"
                  />


                  <FormInput
                    label="NAV / Price"
                    value={form.nav}
                    onChange={
                      value =>
                        updateForm(
                          "nav",
                          value
                        )
                    }
                    type="number"
                    step="0.000001"
                    placeholder="最新净值 / 价格"
                  />


                  <FormInput
                    label="Amount"
                    value={form.amount}
                    onChange={
                      value =>
                        updateForm(
                          "amount",
                          value
                        )
                    }
                    type="number"
                    step="0.01"
                    placeholder="当前市值"
                  />


                  <FormInput
                    label="Cost"
                    value={form.cost}
                    onChange={
                      value =>
                        updateForm(
                          "cost",
                          value
                        )
                    }
                    type="number"
                    step="0.01"
                    placeholder="持仓成本"
                  />


                  <FormInput
                    label="Profit"
                    value={form.profit}
                    onChange={
                      value =>
                        updateForm(
                          "profit",
                          value
                        )
                    }
                    type="number"
                    step="0.01"
                    placeholder="收益"
                  />


                  <FormInput
                    label="Profit Rate"
                    value={form.profit_rate}
                    onChange={
                      value =>
                        updateForm(
                          "profit_rate",
                          value
                        )
                    }
                    type="number"
                    step="0.0001"
                    placeholder="例如 12.35"
                  />

                </div>

              </div>


              {/* =================================================
                  Error
              ================================================= */}

              {error && (

                <div
                  className="
                    mb-4
                    rounded-lg
                    border
                    border-red-200
                    bg-red-50
                    px-4
                    py-3
                    text-sm
                    text-red-600
                  "
                >
                  {error}
                </div>

              )}


              {/* =================================================
                  Buttons
              ================================================= */}

              <div
                className="
                  flex
                  justify-end
                  gap-3
                  border-t
                  border-gray-100
                  pt-5
                "
              >

                <button
                  type="button"
                  onClick={() =>
                    setModalOpen(false)
                  }
                  className="
                    rounded-lg
                    border
                    border-gray-200
                    bg-white
                    px-5
                    py-2.5
                    text-sm
                    font-medium
                    text-gray-600
                    hover:bg-gray-50
                  "
                >
                  Cancel
                </button>


                <button
                  type="submit"
                  disabled={saving}
                  className="
                    rounded-lg
                    bg-gray-900
                    px-6
                    py-2.5
                    text-sm
                    font-medium
                    text-white
                    disabled:cursor-not-allowed
                    disabled:opacity-50
                    hover:bg-gray-800
                  "
                >
                  {saving
                    ? "Saving..."
                    : editingId !== null
                      ? "Save Changes"
                      : "Add Asset"}
                </button>

              </div>

            </form>

          </div>

        </div>

      )}

    </div>

  );

}


// ===================================================
// 排序按钮
//
// 第一次点击：升序
// 第二次点击：降序
// 第三次点击：恢复默认（Amount ↓）
// ===================================================

function toggleSort(
  setter: React.Dispatch<
    React.SetStateAction<SortState>
  >,
  key: SortKey
) {

  setter(previous => {

    if (previous.key !== key) {
      return {
        key,
        direction: "asc",
      };
    }

    if (previous.direction === "asc") {
      return {
        key,
        direction: "desc",
      };
    }

    return {
      key: "amount",
      direction: "desc",
    };

  });
}

function sortIcon(
  sort: SortState,
  key: SortKey
) {

  if (sort.key !== key) {
    return "↕";
  }

  return sort.direction === "asc"
    ? "↑"
    : "↓";
}

function SortableHeader({
  label,
  sort,
  sortKey,
  setter,
  align = "left",
}: {
  label: string;
  sort: SortState;
  sortKey: SortKey;
  setter: React.Dispatch<
    React.SetStateAction<SortState>
  >;
  align?: "left" | "right" | "center";
}) {

  const alignment =
    align === "right"
      ? "justify-end"
      : align === "center"
        ? "justify-center"
        : "justify-start";

  return (
    <th
      className={`
        px-4
        py-3
        ${align === "right" ? "text-right" : ""}
        ${align === "center" ? "text-center" : "text-left"}
        font-medium
      `}
    >
      <button
        type="button"
        onClick={() =>
          toggleSort(
            setter,
            sortKey
          )
        }
        title="点击排序：升序 → 降序 → 默认"
        className={`
          inline-flex
          w-full
          items-center
          ${alignment}
          gap-1
          rounded-md
          px-1
          py-1
          transition
          hover:bg-gray-100
          hover:text-gray-900
        `}
      >
        <span>{label}</span>

        <span
          className={`
            text-[11px]
            ${
              sort.key === sortKey
                ? "font-bold text-gray-900"
                : "text-gray-300"
            }
          `}
        >
          {sortIcon(
            sort,
            sortKey
          )}
        </span>
      </button>
    </th>
  );
}

// =====================================================
// 资产区域表格
//
// 大陆 / 香港使用同一套表格组件，
// 但 sorting state 完全独立。
// =====================================================

function AssetRegionTable({
  title,
  subtitle,
  badgeCount,
  items,
  sort,
  setSort,
  openEdit,
  toggleSkipUpdate,
  deactivateAsset,
  updatingSkipId,
  emptyText,
}: {
  title: string;
  subtitle: string;
  badgeCount: number;
  items: Holding[];
  sort: SortState;
  setSort: React.Dispatch<
    React.SetStateAction<SortState>
  >;
  openEdit: (
    item: Holding
  ) => void;
  toggleSkipUpdate: (
    item: Holding
  ) => void;
  deactivateAsset: (
    item: Holding
  ) => void;
  updatingSkipId: number | null;
  emptyText: string;
}) {

  return (
    <div
      className="
        overflow-hidden
        rounded-xl
        border
        border-gray-200
        bg-white
      "
    >

      <div
        className="
          flex
          items-center
          justify-between
          border-b
          border-gray-200
          bg-gray-50/60
          px-5
          py-4
        "
      >

        <div>

          <div
            className="
              flex
              items-center
              gap-3
            "
          >

            <h3
              className="
                text-base
                font-semibold
                text-gray-900
              "
            >
              {title}
            </h3>

            <span
              className="
                rounded-full
                bg-white
                px-2.5
                py-1
                text-xs
                font-medium
                text-gray-500
                ring-1
                ring-gray-200
              "
            >
              {badgeCount} Assets
            </span>

          </div>

          <p
            className="
              mt-1
              text-xs
              text-gray-500
            "
          >
            {subtitle}
          </p>

        </div>

        <div
          className="
            hidden
            text-xs
            text-gray-400
            sm:block
          "
        >
          点击表头可排序
        </div>

      </div>


      {items.length === 0 ? (

        <div
          className="
            px-5
            py-10
            text-center
            text-sm
            text-gray-400
          "
        >
          {emptyText}
        </div>

      ) : (

        <div className="overflow-x-auto">

          <table
            className="
              min-w-[1450px]
              w-full
              text-sm
            "
          >

            <thead>

              <tr
                className="
                  border-b
                  border-gray-100
                  bg-gray-50/70
                  text-xs
                  text-gray-500
                "
              >

                <SortableHeader
                  label="Asset"
                  sort={sort}
                  sortKey="name"
                  setter={setSort}
                />

                <SortableHeader
                  label="Market"
                  sort={sort}
                  sortKey="market"
                  setter={setSort}
                />

                <SortableHeader
                  label="Category"
                  sort={sort}
                  sortKey="category"
                  setter={setSort}
                />

                <SortableHeader
                  label="Platform"
                  sort={sort}
                  sortKey="platform"
                  setter={setSort}
                />

                <SortableHeader
                  label="Shares"
                  sort={sort}
                  sortKey="shares"
                  setter={setSort}
                  align="right"
                />

                <SortableHeader
                  label="NAV"
                  sort={sort}
                  sortKey="nav"
                  setter={setSort}
                  align="right"
                />

                <SortableHeader
                  label="Amount"
                  sort={sort}
                  sortKey="amount"
                  setter={setSort}
                  align="right"
                />

                <SortableHeader
                  label="Cost"
                  sort={sort}
                  sortKey="cost"
                  setter={setSort}
                  align="right"
                />

                <SortableHeader
                  label="Profit"
                  sort={sort}
                  sortKey="profit"
                  setter={setSort}
                  align="right"
                />

                <SortableHeader
                  label="Profit %"
                  sort={sort}
                  sortKey="profit_rate"
                  setter={setSort}
                  align="right"
                />

                <th
                  className="
                    px-4
                    py-3
                    text-center
                    font-medium
                  "
                >
                  停止更新
                </th>

                <th
                  className="
                    px-5
                    py-3
                    text-right
                    font-medium
                  "
                >
                  Actions
                </th>

              </tr>

            </thead>


            <tbody>

              {items.map(
                item => (

                  <tr
                    key={item.id}
                    className="
                      border-b
                      border-gray-100
                      last:border-b-0
                      hover:bg-gray-50/60
                    "
                  >

                    <td className="px-5 py-4">

                      <div
                        className="
                          font-medium
                          text-gray-900
                        "
                      >
                        {item.name || "—"}
                      </div>

                      <div
                        className="
                          mt-0.5
                          text-xs
                          text-gray-400
                        "
                      >
                        {item.code || "—"}
                      </div>

                      <div
                        className="
                          mt-0.5
                          text-[11px]
                          text-gray-400
                        "
                      >
                        {item.currency || "—"}
                      </div>

                    </td>


                    <td
                      className="
                        px-4
                        py-4
                        text-gray-600
                      "
                    >
                      {item.market || "—"}
                    </td>


                    <td className="px-4 py-4">

                      <span
                        className="
                          rounded-md
                          bg-gray-100
                          px-2
                          py-1
                          text-xs
                          text-gray-600
                        "
                      >
                        {item.category || "—"}
                      </span>

                    </td>


                    <td
                      className="
                        px-4
                        py-4
                        text-gray-600
                      "
                    >
                      {item.platform || "—"}
                    </td>


                    <td
                      className="
                        px-4
                        py-4
                        text-right
                        tabular-nums
                        text-gray-700
                      "
                    >
                      {formatNumber(item.shares)}
                    </td>


                    <td
                      className="
                        px-4
                        py-4
                        text-right
                        tabular-nums
                        text-gray-700
                      "
                    >
                      {formatNumber(item.nav)}
                    </td>


                    <td
                      className="
                        px-4
                        py-4
                        text-right
                        font-medium
                        tabular-nums
                        text-gray-900
                      "
                    >
                      ¥{formatMoney(item.amount)}
                    </td>


                    <td
                      className="
                        px-4
                        py-4
                        text-right
                        tabular-nums
                        text-gray-600
                      "
                    >
                      ¥{formatMoney(item.cost)}
                    </td>


                    <td
                      className={`
                        px-4
                        py-4
                        text-right
                        font-medium
                        tabular-nums
                        ${getProfitClass(item.profit)}
                      `}
                    >
                      ¥{formatMoney(item.profit)}
                    </td>


                    <td
                      className={`
                        px-4
                        py-4
                        text-right
                        font-medium
                        tabular-nums
                        ${getProfitClass(item.profit_rate)}
                      `}
                    >
                      {formatPercent(item.profit_rate)}
                    </td>


                    <td
                      className="
                        px-4
                        py-4
                        text-center
                      "
                    >

                      <label
                        className="
                          inline-flex
                          cursor-pointer
                          items-center
                          justify-center
                        "
                        title={
                          item.skip_update
                            ? "已停止自动更新，点击恢复"
                            : "当前正常自动更新，点击停止"
                        }
                      >

                        <input
                          type="checkbox"
                          checked={
                            Boolean(
                              item.skip_update
                            )
                          }
                          disabled={
                            updatingSkipId ===
                            item.id
                          }
                          onChange={() =>
                            toggleSkipUpdate(
                              item
                            )
                          }
                          className="
                            h-4
                            w-4
                            cursor-pointer
                            rounded
                            border-gray-300
                            text-gray-900
                            focus:ring-2
                            focus:ring-gray-300
                            disabled:cursor-not-allowed
                            disabled:opacity-50
                          "
                        />

                      </label>

                    </td>


                    <td className="px-5 py-4">

                      <div
                        className="
                          flex
                          justify-end
                          gap-2
                        "
                      >

                        <button
                          onClick={() =>
                            openEdit(item)
                          }
                          className="
                            rounded-md
                            border
                            border-gray-200
                            bg-white
                            px-3
                            py-1.5
                            text-xs
                            font-medium
                            text-gray-700
                            hover:bg-gray-50
                          "
                        >
                          编辑
                        </button>


                        <button
                          onClick={() =>
                            deactivateAsset(item)
                          }
                          className="
                            rounded-md
                            border
                            border-amber-200
                            bg-amber-50
                            px-3
                            py-1.5
                            text-xs
                            font-medium
                            text-amber-700
                            hover:bg-amber-100
                          "
                        >
                          停用
                        </button>

                      </div>

                    </td>

                  </tr>

                )
              )}

            </tbody>

          </table>

        </div>

      )}

    </div>
  );
}


// =====================================================
// Form Input
// 支持普通 Input + Select 下拉菜单
// =====================================================

function FormInput({

  label,

  value,

  onChange,

  type = "text",

  step,

  placeholder,

  required = false,

  options,

}: {

  label: string;

  value: any;

  onChange: (
    value: string
  ) => void;

  type?: string;

  step?: string;

  placeholder?: string;

  required?: boolean;

  options?: string[];

}) {

  return (

    <div>

      <label
        className="
          mb-1.5
          block
          text-xs
          font-medium
          text-gray-600
        "
      >

        {label}

        {required && (

          <span
            className="
              ml-1
              text-red-500
            "
          >
            *
          </span>

        )}

      </label>


      {options ? (

        <select

          value={
            value ?? ""
          }

          onChange={
            e =>
              onChange(
                e.target.value
              )
          }

          required={required}

          className="
            w-full
            rounded-lg
            border
            border-gray-200
            bg-white
            px-3.5
            py-2.5
            text-sm
            text-gray-900
            outline-none
            transition
            focus:border-gray-400
            focus:ring-2
            focus:ring-gray-100
          "
        >

          <option value="">
            请选择
          </option>

          {options.map(
            option => (

              <option
                key={option}
                value={option}
              >
                {option}
              </option>

            )
          )}

        </select>

      ) : (

        <input

          value={
            value ?? ""
          }

          onChange={
            e =>
              onChange(
                e.target.value
              )
          }

          type={type}

          step={step}

          required={required}

          placeholder={placeholder}

          className="
            w-full
            rounded-lg
            border
            border-gray-200
            bg-white
            px-3.5
            py-2.5
            text-sm
            text-gray-900
            outline-none
            transition
            placeholder:text-gray-300
            focus:border-gray-400
            focus:ring-2
            focus:ring-gray-100
          "

        />

      )}

    </div>

  );

}
