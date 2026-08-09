"use client";

import { useState, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useTheme } from "next-themes";

export interface MarketIndex {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  volume: number;
  chartData: number[];
  price: number;
  dailyChange: number;
  dailyChangePercent: number;
  monthlyChangePercent?: number;
  yearlyChangePercent?: number;
}

interface FinancialTableProps {
  title?: string;
  indices?: MarketIndex[];
  onIndexSelect?: (indexId: string) => void;
  className?: string;
}

const defaultIndices: MarketIndex[] = [
  {
    id: "1",
    name: "Dow Jones USA",
    country: "USA",
    countryCode: "US",
    volume: 1.7,
    chartData: [330.5, 331.2, 330.8, 331.5, 332.1, 331.8, 332.4, 333.2, 333.9, 333.7],
    price: 333.90,
    dailyChange: -0.20,
    dailyChangePercent: -0.06,
    monthlyChangePercent: 2.5,
    yearlyChangePercent: 12.3
  },
  {
    id: "2",
    name: "S&P 500 USA",
    country: "USA",
    countryCode: "US",
    volume: 24.6,
    chartData: [425.1, 426.3, 427.8, 428.1, 429.2, 428.9, 429.5, 429.1, 428.7, 428.9],
    price: 428.72,
    dailyChange: -0.82,
    dailyChangePercent: -0.19,
    monthlyChangePercent: 3.2,
    yearlyChangePercent: 15.8
  },
  {
    id: "3",
    name: "Nasdaq USA",
    country: "USA",
    countryCode: "US",
    volume: 18.9,
    chartData: [360.2, 361.8, 362.4, 363.1, 364.3, 363.8, 364.1, 363.5, 363.2, 362.97],
    price: 362.97,
    dailyChange: -1.73,
    dailyChangePercent: -0.47,
    monthlyChangePercent: 4.1,
    yearlyChangePercent: 22.5
  }
];

export function FinancialTable({
  title = "Index",
  indices: initialIndices = defaultIndices,
  onIndexSelect,
  className = ""
}: FinancialTableProps = {}) {
  const indices = initialIndices;
  const [selectedIndex, setSelectedIndex] = useState<string | null>("1");
  const [mounted, setMounted] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleIndexSelect = (indexId: string) => {
    setSelectedIndex(indexId);
    if (onIndexSelect) {
      onIndexSelect(indexId);
    }
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  const formatLargeNumber = (amount: number, unit: string) => {
    if (amount >= 1000) {
      return `${(amount / 1000).toFixed(1)}${unit}`;
    }
    return `${amount.toFixed(1)}${unit}`;
  };

  const formatPercentage = (value: number) => {
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(2)}%`;
  };

  const getPerformanceColor = (value: number) => {
    if (!mounted) {
      const isPositive = value >= 0;
      return {
        color: isPositive ? "#22c55e" : "#f87171",
        bgColor: isPositive ? "bg-green-500/10" : "bg-red-500/10",
        borderColor: isPositive ? "border-green-500/30" : "border-red-500/30",
        textColor: isPositive ? "text-green-400" : "text-red-400"
      };
    }

    const isPositive = value >= 0;
    const color = isPositive
      ? (isDark ? "#22c55e" : "#16a34a")
      : (isDark ? "#f87171" : "#dc2626");
    const bgColor = isPositive
      ? (isDark ? "bg-green-500/10" : "bg-green-50")
      : (isDark ? "bg-red-500/10" : "bg-red-50");
    const borderColor = isPositive
      ? (isDark ? "border-green-500/30" : "border-green-200")
      : (isDark ? "border-red-500/30" : "border-red-200");
    const textColor = isPositive
      ? (isDark ? "text-green-400" : "text-green-600")
      : (isDark ? "text-red-400" : "text-red-600");

    return { color, bgColor, borderColor, textColor };
  };

  const getCountryFlag = (countryCode: string) => {
    switch (countryCode) {
      case "US":
        return (
          <svg width="32" height="32" viewBox="0 0 130 120" fill="none" className="scale-125">
            <rect y="0" fill="#DC4437" width="130" height="13.3"/>
            <rect y="26.7" fill="#DC4437" width="130" height="13.3"/>
            <rect y="80" fill="#DC4437" width="130" height="13.3"/>
            <rect y="106.7" fill="#DC4437" width="130" height="13.3"/>
            <rect y="53.3" fill="#DC4437" width="130" height="13.3"/>
            <rect y="13.3" fill="#FFFFFF" width="130" height="13.3"/>
            <rect y="40" fill="#FFFFFF" width="130" height="13.3"/>
            <rect y="93.3" fill="#FFFFFF" width="130" height="13.3"/>
            <rect y="66.7" fill="#FFFFFF" width="130" height="13.3"/>
            <rect y="0" fill="#2A66B7" width="70" height="66.7"/>
            <polygon fill="#FFFFFF" points="13.5,4 15.8,8.9 21,9.7 17.2,13.6 18.1,19 13.5,16.4 8.9,19 9.8,13.6 6,9.7 11.2,8.9"/>
            <polygon fill="#FFFFFF" points="34,4 36.3,8.9 41.5,9.7 37.8,13.6 38.6,19 34,16.4 29.4,19 30.2,13.6 26.5,9.7 31.7,8.9"/>
            <polygon fill="#FFFFFF" points="54.5,4 56.8,8.9 62,9.7 58.2,13.6 59.1,19 54.5,16.4 49.9,19 50.8,13.6 47,9.7 52.2,8.9"/>
            <polygon fill="#FFFFFF" points="24,24 26.3,28.9 31.5,29.7 27.8,33.6 28.6,39 24,36.4 19.4,39 20.2,33.6 16.5,29.7 21.7,28.9"/>
            <polygon fill="#FFFFFF" points="44.5,24 46.8,28.9 52,29.7 48.2,33.6 49.1,39 44.5,36.4 39.9,39 40.8,33.6 37,29.7 42.2,28.9"/>
            <polygon fill="#FFFFFF" points="13.5,45.2 15.8,50.1 21,50.9 17.2,54.7 18.1,60.2 13.5,57.6 8.9,60.2 9.8,54.7 6,50.9 11.2,50.1"/>
            <polygon fill="#FFFFFF" points="34,45.2 36.3,50.1 41.5,50.9 37.8,54.7 38.6,60.2 34,57.6 29.4,60.2 30.2,54.7 26.5,50.9 31.7,50.1"/>
            <polygon fill="#FFFFFF" points="54.5,45.2 56.8,50.1 62,50.9 58.2,54.7 59.1,60.2 54.5,57.6 49.9,60.2 50.8,54.7 47,50.9 52.2,50.1"/>
          </svg>
        );
      case "CA":
        return (
          <svg width="32" height="32" viewBox="0 0 90 60" fill="none" className="scale-150">
            <rect width="90" height="60" fill="#FF0000"/>
            <rect x="30" width="30" height="60" fill="#FFFFFF"/>
            <polygon fill="#FF0000" points="45,15 50,20 45,25 40,20"/>
            <polygon fill="#FF0000" points="45,35 50,40 45,45 40,40"/>
          </svg>
        );
      case "MX":
        return (
          <svg width="32" height="32" viewBox="0 0 90 60" fill="none" className="scale-150">
            <rect width="30" height="60" fill="#006847"/>
            <rect x="30" width="30" height="60" fill="#FFFFFF"/>
            <rect x="60" width="30" height="60" fill="#CE1126"/>
          </svg>
        );
      case "BR":
        return (
          <svg width="32" height="32" viewBox="0 0 90 60" fill="none" className="scale-150">
            <rect width="90" height="60" fill="#009639"/>
            <polygon fill="#FEDD00" points="45,30 20,15 20,45"/>
            <circle cx="45" cy="30" r="8" fill="#002776"/>
          </svg>
        );
      default:
        return (
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="scale-125">
            <rect width="32" height="32" fill="#E5E7EB" rx="4"/>
            <text x="16" y="20" textAnchor="middle" fontSize="12" fill="#6B7280">?</text>
          </svg>
        );
    }
  };

  const renderSparkline = (data: number[], dailyChangePercent: number) => {
    if (!data || data.length < 2) {
      return <div className="w-16 h-6" />;
    }

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const createPath = (dataPoints: number[]) => {
      return dataPoints.map((value, index) => {
        const x = (index / (dataPoints.length - 1)) * 60;
        const y = 20 - ((value - min) / range) * 15;
        return `${x},${y}`;
      }).join(' ');
    };

    const fullPath = createPath(data);

    // Color based on performance - green for positive, red for negative
    const isPositive = dailyChangePercent >= 0;
    const strokeColor = isPositive ? "#22c55e" : "#ef4444";

    return (
      <div className="w-16 h-6">
        <motion.svg
          width="60"
          height="20"
          viewBox="0 0 60 20"
          className="overflow-visible"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 25,
            duration: shouldReduceMotion ? 0.2 : 0.5
          }}
        >
          {/* Performance-colored line */}
          {fullPath && (
            <motion.polyline
              points={fullPath}
              fill="none"
              stroke={strokeColor}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{
                duration: shouldReduceMotion ? 0.3 : 0.8,
                ease: "easeOut",
                delay: 0.2
              }}
            />
          )}
        </motion.svg>
      </div>
    );
  };

  const containerVariants = {
    visible: {
      transition: {
        staggerChildren: 0.04,
        delayChildren: 0.1,
      },
    }
  };

  const rowVariants = {
    hidden: {
      opacity: 0,
      y: 20,
      scale: 0.98,
      filter: "blur(4px)"
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: "blur(0px)",
      transition: {
        type: "spring",
        stiffness: 400,
        damping: 25,
        mass: 0.7,
      },
    },
  };

  return (
    <div className={`w-full max-w-full mx-auto ${className}`}>
      {/* Table Container with horizontal scroll */}
      <div className="bg-background border border-border/50 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto scrollbar-hide">
          <div className="min-w-[800px]">
            {/* Table Headers */}
            <div
              className="px-8 py-3 text-xs font-medium text-muted-foreground/70 uppercase tracking-wide bg-muted/15 border-b border-border/20 text-left"
              style={{
                display: 'grid',
                gridTemplateColumns: '250px minmax(80px, 1fr) minmax(60px, 1fr) minmax(100px, 1fr) minmax(100px, 1fr) minmax(100px, 1fr) minmax(120px, 1fr)',
                columnGap: '6px'
              }}
            >
              <div style={{ textAlign: 'left' }}>{title}</div>
              <div style={{ textAlign: 'left' }}>Chart</div>
              <div style={{ textAlign: 'left' }}>Price</div>
              <div style={{ textAlign: 'left' }}>Daily</div>
              <div style={{ textAlign: 'left' }}>Monthly</div>
              <div style={{ textAlign: 'left' }}>Yearly</div>
              <div style={{ textAlign: 'left' }} className="pr-4">Volume</div>
            </div>

            {/* Table Rows */}
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              {indices.map((index, indexNum) => (
                <motion.div key={index.id} variants={rowVariants}>
                  <div
                    className={`px-8 py-3 cursor-pointer group relative transition-all duration-200 ${
                      selectedIndex === index.id
                        ? "bg-muted/50 border-b border-border/30"
                        : "hover:bg-muted/30"
                    } ${indexNum < indices.length - 1 && selectedIndex !== index.id ? "border-b border-border/20" : ""}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '250px minmax(80px, 1fr) minmax(60px, 1fr) minmax(100px, 1fr) minmax(100px, 1fr) minmax(100px, 1fr) minmax(120px, 1fr)',
                      columnGap: '6px'
                    }}
                    onClick={() => handleIndexSelect(index.id)}
                  >
                {/* Market Info */}
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full overflow-hidden border border-border/30 flex items-center justify-center">
                    <div className="w-full h-full">
                      {getCountryFlag(index.countryCode)}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-foreground/90 truncate">{index.name}</div>
                    <div className="text-xs text-muted-foreground/70">{index.country}</div>
                  </div>
                </div>

                {/* Chart */}
                <div className="flex items-center">
                  {renderSparkline(index.chartData, index.dailyChangePercent)}
                </div>

                {/* Price */}
                <div className="flex items-center">
                  <span className="font-semibold text-foreground/90">
                    {formatCurrency(index.price)}
                  </span>
                </div>

                {/* Daily Performance */}
                <div className="flex items-center gap-2">
                  <span className={`font-semibold ${getPerformanceColor(index.dailyChange).textColor}`}>
                    {index.dailyChange >= 0 ? "+" : ""}{index.dailyChange.toFixed(2)}
                  </span>
                  {(() => {
                    const { bgColor, borderColor, textColor } = getPerformanceColor(index.dailyChangePercent);
                    return (
                      <div className={`px-2 py-1 rounded-lg text-xs font-medium border ${bgColor} ${borderColor} ${textColor}`}>
                        {formatPercentage(index.dailyChangePercent)}
                      </div>
                    );
                  })()}
                </div>

                {/* Monthly Performance */}
                <div className="flex items-center">
                  {(() => {
                    const monthlyChange = index.monthlyChangePercent ?? 0;
                    const { bgColor, borderColor, textColor } = getPerformanceColor(monthlyChange);
                    return (
                      <div className={`px-2 py-1 rounded-lg text-xs font-medium border ${bgColor} ${borderColor} ${textColor}`}>
                        {formatPercentage(monthlyChange)}
                      </div>
                    );
                  })()}
                </div>

                {/* Yearly Performance */}
                <div className="flex items-center">
                  {(() => {
                    const yearlyChange = index.yearlyChangePercent ?? 0;
                    const { bgColor, borderColor, textColor } = getPerformanceColor(yearlyChange);
                    return (
                      <div className={`px-2 py-1 rounded-lg text-xs font-medium border ${bgColor} ${borderColor} ${textColor}`}>
                        {formatPercentage(yearlyChange)}
                      </div>
                    );
                  })()}
                </div>

                {/* Volume */}
                <div className="flex items-center pr-4">
                  <span className="font-semibold text-foreground/90">
                    {index.volume >= 1 ? formatLargeNumber(index.volume, "M") : index.volume > 0 ? `${(index.volume * 1000).toFixed(1)}k` : "N/A"}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
