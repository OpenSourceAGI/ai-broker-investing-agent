# Lightweight Charts Tooltip Plugin

A custom tooltip plugin for Lightweight Charts that displays price, date, and time information when hovering over the chart.

## Usage

### Basic Usage

\`\`\`tsx
import { createChart } from 'lightweight-charts';
import { TooltipPrimitive } from '@/lib/lightweight-charts/plugins/tooltip';

// Create chart
const chart = createChart(container);

// Add candlestick series
const candlestickSeries = chart.addCandlestickSeries();

// Add tooltip primitive to the series
const tooltipPrimitive = new TooltipPrimitive({
  lineColor: 'rgba(0, 0, 0, 0.2)',
  tooltip: {
    title: 'AAPL',
    followMode: 'tracking', // or 'top'
  },
});

candlestickSeries.attachPrimitive(tooltipPrimitive);

// Set data
candlestickSeries.setData([
  { time: '2023-01-01', open: 100, high: 105, low: 95, close: 102 },
  // ... more data
]);
\`\`\`

### With Custom Price Extractor

\`\`\`tsx
const tooltipPrimitive = new TooltipPrimitive({
  lineColor: 'rgba(0, 0, 0, 0.2)',
  tooltip: {
    title: 'AAPL',
    followMode: 'top',
    topOffset: 10,
  },
  priceExtractor: (data) => {
    if ((data as any).close !== undefined) {
      return `$${(data as any).close.toFixed(2)}`;
    }
    return '';
  },
});
\`\`\`

## Options

### TooltipPrimitiveOptions

- `lineColor` (string): Color of the vertical crosshair line
- `tooltip` (Partial<TooltipOptions>): Tooltip display options
- `priceExtractor` (function): Custom function to extract price from data point

### TooltipOptions

- `title` (string): Title displayed at top of tooltip
- `followMode` ('top' | 'tracking'): Whether tooltip follows cursor or stays at top
- `horizontalDeadzoneWidth` (number): Horizontal padding from edge
- `verticalDeadzoneHeight` (number): Vertical deadzone for flip detection
- `verticalSpacing` (number): Spacing from cursor
- `topOffset` (number): Offset from top when in 'top' mode

## Features

- Custom vertical crosshair line
- Displays price, date, and time
- Follows cursor or stays at top
- Auto-flips to avoid clipping
- Customizable styling
- Works with candlestick and line series
