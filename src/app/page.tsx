"use client";
import { useState, useEffect, FC, ReactNode } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  LayoutDashboard,
  Settings,
  DollarSign,
  Target,
  Activity,
  TrendingUp,
  Percent,
  CircleDollarSign,
  Scale,
  RefreshCw,
  Download,
  Zap,
  LucideIcon,
} from "lucide-react";
import { clsx, ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";


type SectionId = "overview" | "mcd" | "rcd" | "monitoring";

interface Config {
  mcd: {
    enabled: boolean;
    updateFrequency: string;
    sensitivityCoefficient: number;
    maxPriceIncrease: number;
    smoothingFactor: number;
    minimumSpendThreshold: number;
  };
  rcd: {
    enabled: boolean;
    maxDiscount: number;
    spendWeight: number;
    thresholds: {
      minimumSpend: number;
      minimumVisits: number;
    };
  };
}

interface AnalyticsData {
  currentMCDMultiplier: number;
  customers: { averageDiscount: number; total: number };
  revenue: { total: number };
  equilibriumScore: number;
  marketing: {
    byPlatform: { [key: string]: { amount: number } };
    totalSpend: number;
  };
}

interface TrendData {
  date: string;
  revenue: number;
  marketingSpend: number;
}

const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

//  Mock Data Calculation 
const calculateMockAnalytics = (config: Config): AnalyticsData => {
  const baseRevenue = 89543.5;
  const marketingSpend = 31000;

  let mcdMultiplier = 1.0;
  if (config.mcd.enabled && marketingSpend > config.mcd.minimumSpendThreshold) {
    mcdMultiplier = 1 + 0.05 * config.mcd.sensitivityCoefficient;
    mcdMultiplier = Math.min(mcdMultiplier, 1 + config.mcd.maxPriceIncrease);
  }

  let avgDiscount = 0;
  const avgCustomer = { spend: 1200, visits: 15 };
  if (
    config.rcd.enabled &&
    avgCustomer.spend >= config.rcd.thresholds.minimumSpend &&
    avgCustomer.visits >= config.rcd.thresholds.minimumVisits
  ) {
    avgDiscount = config.rcd.maxDiscount * 0.6 + config.rcd.spendWeight * 0.5;
    avgDiscount = Math.min(avgDiscount, config.rcd.maxDiscount);
  }

  return {
    currentMCDMultiplier: mcdMultiplier,
    customers: { averageDiscount: avgDiscount, total: 1245 },
    revenue: { total: baseRevenue * mcdMultiplier },
    equilibriumScore: Math.round(80 + mcdMultiplier * 5 - avgDiscount),
    marketing: {
      byPlatform: {
        Google: { amount: 12000 },
        Facebook: { amount: 8500 },
        "X (Twitter)": { amount: 4500 },
        Instagram: { amount: 6000 },
      },
      totalSpend: marketingSpend,
    },
  };
};

// UI Components 

interface StatCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  color: string;
}

const StatCard: FC<StatCardProps> = ({ title, value, icon: Icon, color }) => (
  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
    <div className="flex items-center justify-between">
      <div className="flex flex-col">
        <span className="text-sm font-medium text-slate-500">{title}</span>
        <span className="text-3xl font-bold text-slate-800 mt-1">{value}</span>
      </div>
      <div className={cn("rounded-full p-3", color)}>
        <Icon className="h-6 w-6" />
      </div>
    </div>
  </div>
);

interface SectionCardProps {
  children: ReactNode;
  title: string;
  description: string;
}

const SectionCard: FC<SectionCardProps> = ({
  children,
  title,
  description,
}) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
    <div className="p-6 border-b border-slate-200">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="text-sm text-slate-500 mt-1">{description}</p>
    </div>
    <div className="p-6 space-y-8">{children}</div>
  </div>
);

interface SettingRowProps {
  label: string;
  description: string;
  children: ReactNode;
}

const SettingRow: FC<SettingRowProps> = ({ label, description, children }) => (
  <div className="flex flex-col md:flex-row md:items-center md:justify-between">
    <div className="md:w-2/3">
      <h3 className="font-medium text-slate-800">{label}</h3>
      <p className="text-sm text-slate-500 mt-1">{description}</p>
    </div>
    <div className="mt-4 md:mt-0">{children}</div>
  </div>
);

interface ToggleSwitchProps {
  enabled: boolean;
  onChange: () => void;
}

const ToggleSwitch: FC<ToggleSwitchProps> = ({ enabled, onChange }) => (
  <button
    onClick={onChange}
    className={cn(
      "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
      enabled ? "bg-blue-600" : "bg-slate-300"
    )}
  >
    <span
      className={cn(
        "inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ease-in-out",
        enabled ? "translate-x-6" : "translate-x-1"
      )}
    />
  </button>
);

const Page = () => {
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [loading, setLoading] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<"saving" | "saved" | "">("");
  const [config, setConfig] = useState<Config>({
    mcd: {
      enabled: true,
      updateFrequency: "daily",
      sensitivityCoefficient: 1.0,
      maxPriceIncrease: 0.15,
      smoothingFactor: 0.3,
      minimumSpendThreshold: 100,
    },
    rcd: {
      enabled: true,
      maxDiscount: 20,
      spendWeight: 2.0,
      thresholds: { minimumSpend: 50, minimumVisits: 2 },
    },
  });
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [marketingTrends, setMarketingTrends] = useState<TrendData[]>([]);

  useEffect(() => {
    fetchAnalytics();
  }, [config]);

  useEffect(() => {
    loadCurrentConfig();
    generateTrendData();
  }, []);

  const loadCurrentConfig = () => {
    const savedConfig = localStorage.getItem("mcdRcdConfig");
    if (savedConfig) {
      try {
        setConfig(JSON.parse(savedConfig) as Config);
      } catch (error) {
        console.error("Failed to parse config from localStorage", error);
      }
    }
  };

  const fetchAnalytics = () => {
    const data = calculateMockAnalytics(config);
    setAnalytics(data);
  };

  const generateTrendData = () => {
    const trends: TrendData[] = Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (29 - i));
      return {
        date: date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        revenue: Math.random() * 5000 + 4000,
        marketingSpend: Math.random() * 1000 + 800,
      };
    });
    setMarketingTrends(trends);
  };

  const saveConfiguration = () => {
    setLoading(true);
    setSaveStatus("saving");
    localStorage.setItem("mcdRcdConfig", JSON.stringify(config));
    setTimeout(() => {
      setLoading(false);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(""), 3000);
    }, 1000);
  };

  const updateConfig = (path: string, value: string | number | boolean) => {
    setConfig((prev) => {
      const keys = path.split(".");
      const newConfig = JSON.parse(JSON.stringify(prev));

      // Use unknown instead of any, and add type guard
      let current: unknown = newConfig;
      for (let i = 0; i < keys.length - 1; i++) {
        if (
          typeof current === "object" &&
          current !== null &&
          keys[i] in current
        ) {
          // Type assertion is safe here due to the check above
          current = (current as Record<string, unknown>)[keys[i]];
        } else {
          throw new Error(`Invalid config path: ${path}`);
        }
      }
      if (
        typeof current === "object" &&
        current !== null
      ) {
        (current as Record<string, unknown>)[keys[keys.length - 1]] = value;
      } else {
        throw new Error(`Invalid config path: ${path}`);
      }
      return newConfig;
    });
  };

  const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444"];

  const sidebarItems: { id: SectionId; label: string; icon: LucideIcon }[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "mcd", label: "MCD Settings", icon: DollarSign },
    { id: "rcd", label: "RCD Settings", icon: Target },
    { id: "monitoring", label: "Live Monitoring", icon: Activity },
  ];

  return (
    <>
      <style>{`
        input[type="range"] { -webkit-appearance: none; appearance: none; width: 100%; height: 6px; background: #E2E8F0; border-radius: 9999px; outline: none; }
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 18px; height: 18px; background: #2563EB; border-radius: 9999px; cursor: pointer; border: 3px solid #FFFFFF; box-shadow: 0 0 0 1px rgba(0,0,0,0.1); }
        input[type="range"]::-moz-range-thumb { width: 18px; height: 18px; background: #2563EB; border-radius: 9999px; cursor: pointer; border: 3px solid #FFFFFF; box-shadow: 0 0 0 1px rgba(0,0,0,0.1); }
      `}</style>
      <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
        <div className="flex">          
          <aside className="w-64 bg-white border-r border-slate-200 h-screen sticky top-0 flex flex-col">
            <div className="flex items-center gap-3 px-6 h-16 border-b border-slate-200">
              <Settings className="text-blue-600 h-7 w-7" />
              <h1 className="text-lg font-bold text-slate-800">MCD-RCD</h1>
            </div>
            <nav className="p-4">
              {sidebarItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={cn(
                    "group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg w-full mb-1 transition-colors duration-200",
                    activeSection === item.id
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  )}
                >
                  <item.icon className="mr-3 h-5 w-5" />
                  {item.label}
                </button>
              ))}
            </nav>
          </aside>

          <main className="flex-1 p-8">
            <header className="flex justify-between items-center mb-8">
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
                <p className="text-slate-500 mt-1">
                  Configure algorithms and monitor performance.
                </p>
              </div>
              {saveStatus === "saved" && (
                <div className="bg-green-100 text-green-700 px-4 py-2 rounded-lg text-sm font-medium transition-opacity">
                  ✓ Configuration saved
                </div>
              )}
            </header>


            {activeSection === "overview" && (
              <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <StatCard
                    title="MCD Multiplier"
                    value={`${
                      analytics?.currentMCDMultiplier?.toFixed(3) || "1.000"
                    }x`}
                    icon={TrendingUp}
                    color="bg-blue-100 text-blue-600"
                  />
                  <StatCard
                    title="Avg. Discount"
                    value={`${
                      analytics?.customers?.averageDiscount?.toFixed(1) || "0.0"
                    }%`}
                    icon={Percent}
                    color="bg-green-100 text-green-600"
                  />
                  <StatCard
                    title="Total Revenue (30d)"
                    value={`$${
                      analytics?.revenue?.total?.toLocaleString("en-US", {
                        maximumFractionDigits: 0,
                      }) || "0"
                    }`}
                    icon={CircleDollarSign}
                    color="bg-purple-100 text-purple-600"
                  />
                  <StatCard
                    title="Equilibrium Score"
                    value={`${analytics?.equilibriumScore || 0}%`}
                    icon={Scale}
                    color="bg-amber-100 text-amber-600"
                  />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                  <div className="lg:col-span-3 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="text-lg font-semibold mb-4 text-slate-800">
                      30-Day Trends
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart
                        data={marketingTrends}
                        margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis
                          dataKey="date"
                          tick={{ fill: "#64748b", fontSize: 12 }}
                        />
                        {/* @ts-expect-error Recharts types may be incorrect in strict mode */}
                        <YAxis tick={{ fill: "#64748b", fontSize: 12 }} />
                        <Tooltip />
                        {/* @ts-expect-error Recharts types may be incorrect in strict mode */}
                        <Legend wrapperStyle={{ fontSize: "14px" }} />
                        <Line
                          type="monotone"
                          dataKey="revenue"
                          stroke="#3B82F6"
                          strokeWidth={2}
                          name="Revenue"
                        />
                        <Line
                          type="monotone"
                          dataKey="marketingSpend"
                          stroke="#10B981"
                          strokeWidth={2}
                          name="Marketing Spend"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="text-lg font-semibold mb-4 text-slate-800">
                      Marketing Spend
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={Object.entries(
                            analytics?.marketing?.byPlatform || {}
                          ).map(([name, { amount }]) => ({
                            name,
                            value: amount,
                          }))}
                          cx="50%"
                          cy="50%"
                          innerRadius={70}
                          outerRadius={100}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {Object.entries(
                            analytics?.marketing?.byPlatform || {}
                          ).map((_, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={COLORS[index % COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) =>
                            `$${value.toLocaleString()}`
                          }
                        />
                        <Legend wrapperStyle={{ fontSize: "14px" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {activeSection === "mcd" && (
              <SectionCard
                title="Marketing Cost Displacement (MCD)"
                description="Dynamically adjust prices based on marketing spend to protect profit margins."
              >
                <SettingRow
                  label="Enable MCD"
                  description="Turn on automatic price adjustments."
                >
                  <ToggleSwitch
                    enabled={config.mcd.enabled}
                    onChange={() =>
                      updateConfig("mcd.enabled", !config.mcd.enabled)
                    }
                  />
                </SettingRow>
                <SettingRow
                  label="Sensitivity Coefficient"
                  description="Controls how aggressively prices react to marketing spend changes."
                >
                  <div className="w-64">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-slate-500">Low</span>
                      <span className="font-semibold text-blue-600">
                        {config.mcd.sensitivityCoefficient.toFixed(1)}
                      </span>
                      <span className="text-sm text-slate-500">High</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="3"
                      step="0.1"
                      value={config.mcd.sensitivityCoefficient}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        updateConfig(
                          "mcd.sensitivityCoefficient",
                          parseFloat(e.target.value)
                        )
                      }
                      disabled={!config.mcd.enabled}
                    />
                  </div>
                </SettingRow>
                <SettingRow
                  label="Maximum Price Increase"
                  description="The highest percentage prices can be increased by the MCD model."
                >
                  <div className="w-64">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-slate-500">0%</span>
                      <span className="font-semibold text-blue-600">
                        {(config.mcd.maxPriceIncrease * 100).toFixed(0)}%
                      </span>
                      <span className="text-sm text-slate-500">50%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="0.5"
                      step="0.01"
                      value={config.mcd.maxPriceIncrease}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        updateConfig(
                          "mcd.maxPriceIncrease",
                          parseFloat(e.target.value)
                        )
                      }
                      disabled={!config.mcd.enabled}
                    />
                  </div>
                </SettingRow>
                <SettingRow
                  label="Minimum Spend Threshold"
                  description="MCD only activates when marketing spend for the period exceeds this value."
                >
                  <div className="relative w-48">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                      $
                    </span>
                    <input
                      type="number"
                      className="pl-7 w-full rounded-lg border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                      value={config.mcd.minimumSpendThreshold}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        updateConfig(
                          "mcd.minimumSpendThreshold",
                          parseFloat(e.target.value) || 0
                        )
                      }
                      disabled={!config.mcd.enabled}
                    />
                  </div>
                </SettingRow>
                <div className="flex justify-end pt-6 border-t border-slate-200 -mx-6 px-6 -mb-6 pb-6">
                  <button
                    onClick={saveConfiguration}
                    disabled={loading}
                    className="bg-blue-600 text-white px-5 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {loading ? "Saving..." : "Save MCD Settings"}
                  </button>
                </div>
              </SectionCard>
            )}

            {activeSection === "rcd" && (
              <SectionCard
                title="Returning Customer Discount (RCD)"
                description="Reward customer loyalty with personalized discounts based on purchase history."
              >
                <SettingRow
                  label="Enable RCD"
                  description="Activate automatic discounts for loyal customers."
                >
                  <ToggleSwitch
                    enabled={config.rcd.enabled}
                    onChange={() =>
                      updateConfig("rcd.enabled", !config.rcd.enabled)
                    }
                  />
                </SettingRow>
                <SettingRow
                  label="Maximum Discount"
                  description="The highest possible discount a customer can receive through this model."
                >
                  <div className="w-64">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-slate-500">0%</span>
                      <span className="font-semibold text-blue-600">
                        {config.rcd.maxDiscount}%
                      </span>
                      <span className="text-sm text-slate-500">50%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      step="1"
                      value={config.rcd.maxDiscount}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        updateConfig(
                          "rcd.maxDiscount",
                          parseInt(e.target.value)
                        )
                      }
                      disabled={!config.rcd.enabled}
                    />
                  </div>
                </SettingRow>
                <SettingRow
                  label="Spend Weight"
                  description="How much importance to give customer spend vs. visit frequency."
                >
                  <div className="w-64">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-slate-500">Low</span>
                      <span className="font-semibold text-blue-600">
                        {config.rcd.spendWeight.toFixed(1)}x
                      </span>
                      <span className="text-sm text-slate-500">High</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="5"
                      step="0.1"
                      value={config.rcd.spendWeight}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        updateConfig(
                          "rcd.spendWeight",
                          parseFloat(e.target.value)
                        )
                      }
                      disabled={!config.rcd.enabled}
                    />
                  </div>
                </SettingRow>

                <div className="pt-8 border-t border-slate-200">
                  <h3 className="font-medium text-slate-800">
                    Minimum Requirements
                  </h3>
                  <p className="text-sm text-slate-500 mt-1 mb-6">
                    Customers must meet these criteria to be eligible for RCD
                    discounts.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-1">
                        Minimum Spend
                      </label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                          $
                        </span>
                        <input
                          type="number"
                          className="pl-7 w-full rounded-lg border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                          value={config.rcd.thresholds.minimumSpend}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            updateConfig(
                              "rcd.thresholds.minimumSpend",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          disabled={!config.rcd.enabled}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-1">
                        Minimum Visits
                      </label>
                      <input
                        type="number"
                        className="w-full rounded-lg border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                        value={config.rcd.thresholds.minimumVisits}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          updateConfig(
                            "rcd.thresholds.minimumVisits",
                            parseInt(e.target.value) || 0
                          )
                        }
                        disabled={!config.rcd.enabled}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-6 border-t border-slate-200 -mx-6 px-6 -mb-6 pb-6">
                  <button
                    onClick={saveConfiguration}
                    disabled={loading}
                    className="bg-blue-600 text-white px-5 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {loading ? "Saving..." : "Save RCD Settings"}
                  </button>
                </div>
              </SectionCard>
            )}

            {activeSection === "monitoring" && (
              <div className="space-y-6">
                <SectionCard
                  title="Live System Monitoring"
                  description="Quick actions and real-time status of the pricing engine."
                >
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <button
                      onClick={fetchAnalytics}
                      className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 px-4 rounded-lg font-medium transition-colors"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Refresh Analytics
                    </button>
                    <button className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 px-4 rounded-lg font-medium transition-colors">
                      <Download className="h-4 w-4" />
                      Export Report
                    </button>
                    <button className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 px-4 rounded-lg font-medium transition-colors">
                      <Zap className="h-4 w-4" />
                      Force MCD Update
                    </button>
                  </div>
                </SectionCard>
              </div>
            )}
          </main>
        </div>
      </div>
    </>
  );
};

export default Page;
