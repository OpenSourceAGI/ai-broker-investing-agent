---
title: Algorithmic Strategies
icon: Bot
---
# 📊 Complete Technical Indicators & Trading Strategies Guide

## IndicatorTS (cinar/indicatorts) Reference Manual

---

1. [📋 Strategy Framework](#strategy-framework)
2. [🤖 Built-in Trading Strategies](#built-in-trading-strategies)
3. [📊 Signal Quick Reference](#signal-quick-reference)

---

## 📋 Strategy Framework

The indicatorts library provides building blocks for building systematic trading strategies.

## Core LLM + Trading Books

Chan, E. P. (2024). *Generative AI for trading and asset management*. Wiley. https://www.wiley.com/en-us/Generative+AI+for+Trading+and+Asset+Management-p-00421846

Noguer i Alonso, M. (2024). *Large language models in finance: A hands-on guide to applying LLMs to trading, banking, and risk management*. https://www.barnesandnoble.com/w/large-language-models-in-finance-miquel-noguer-i-alonso/1148475633

López de Prado, M. (2018). *Advances in financial machine learning*. Wiley.

Hilpisch, Y. (2020). *Python for algorithmic trading* (2nd ed.). O'Reilly Media.

Chan, E. P. (2013). *Algorithmic trading: Winning strategies and their rationale*. Wiley.

### 🏗️ Core Components

#### 📊 Asset

The Asset interface represents price/volume data:
\`\`\`
interface Asset {
  dates: Date[]           // Trading dates
  openings: number[]      // Opening prices
  closings: number[]      // Closing prices
  highs: number[]         // Period highs
  lows: number[]          // Period lows
  volumes: number[]       // Trading volumes
}
\`\`\`

#### 🎯 Action

Trading signals:
\`\`\`
enum Action {
  SELL = -1              // Exit/short signal
  HOLD = 0               // No action
  BUY = 1                // Entry/long signal
}
\`\`\`

#### 🔄 Strategy Function

Converts indicators into actions:
\`\`\`
type StrategyFunction = (asset: Asset) => Action[]
\`\`\`

Takes price/volume data, applies indicators, returns buy/sell signals for each period.

#### 📈 Backtesting Metrics

- **Return**: Total % gain/loss
- **Win Rate**: % of profitable trades
- **Profit Factor**: Gross profit / Gross loss
- **Sharpe Ratio**: Risk-adjusted return (higher = better)
- **Max Drawdown**: Largest peak-to-trough decline
- **Avg Trade**: Average P&L per trade
- **Consecutive Losses**: Largest losing streak

---

## 🤖 Built-in Trading Strategies

### 🎯 Trend-Following Strategies (10 strategies)

#### 📊 1. MACD Strategy

- **Indicator**: MACD (12/26/9 EMA)
- **Entry Rules**:
  - 🟢 **BUY**: MACD crosses above Signal line OR above zero line
  - 🔴 **SELL**: MACD crosses below Signal line OR below zero line
- **Market conditions**: Best in strong trending markets
- **Win rate typical**: 40–50% (longer winners)
- **Use case**: Trend confirmation, momentum entry
- **Risk level**: Medium

#### 📈 2. Parabolic SAR Strategy

- **Indicator**: PSAR (dots above/below price)
- **Entry Rules**:
  - 🟢 **BUY**: SAR flips from above price to below (uptrend initiation)
  - 🔴 **SELL**: SAR flips from below price to above (downtrend initiation)
- **Market conditions**: Excellent in trending, whipsaws in ranges
- **Win rate typical**: 50–60%
- **Use case**: Trend following with mechanical stops
- **Risk level**: Low (built-in trailing stop)

#### 🎪 3. APO Strategy

- **Indicator**: Absolute Price Oscillator (14/30 EMA)
- **Entry Rules**:
  - 🟢 **BUY**: APO crosses above zero
  - 🔴 **SELL**: APO crosses below zero
- **Market conditions**: Trend-following, simpler than MACD
- **Win rate typical**: 45–55%
- **Use case**: Momentum crossover without signal line lag
- **Risk level**: Medium

#### 🔷 4. Aroon Strategy

- **Indicator**: Aroon Up/Down oscillator
- **Entry Rules**:
  - 🟢 **BUY**: Aroon Up crosses above Aroon Down, Aroon Up > 70
  - 🔴 **SELL**: Aroon Down crosses above Aroon Up, Aroon Down > 70
- **Market conditions**: Trend strength identification
- **Win rate typical**: 50–60%
- **Use case**: Trend reversal timing, strength confirmation
- **Risk level**: Medium

#### ⚫ 5. Vortex Strategy

- **Indicator**: +VI / -VI (14 period)
- **Entry Rules**:
  - 🟢 **BUY**: +VI crosses above -VI, +VI > 1.0
  - 🔴 **SELL**: -VI crosses above +VI, -VI > 1.0
- **Market conditions**: Swing trading, trend confirmation
- **Win rate typical**: 50–65%
- **Use case**: Trend direction clarity
- **Risk level**: Low-Medium

#### 🎯 6. BOP Strategy - Balance of Power

- **Indicator**: BOP ((C-O)/(H-L))
- **Entry Rules**:
  - 🟢 **BUY**: BOP crosses above 0 or reaches +0.5
  - 🔴 **SELL**: BOP crosses below 0 or reaches -0.5
- **Market conditions**: Short-term momentum
- **Win rate typical**: 45–55%
- **Use case**: Quick momentum gauge
- **Risk level**: Medium-High

#### 🟡 7. CFO Strategy - Chande Forecast Oscillator

- **Indicator**: CFO (linear regression deviation)
- **Entry Rules**:
  - 🟢 **BUY**: CFO crosses above 0 (price above forecast)
  - 🔴 **SELL**: CFO crosses below 0 (price below forecast)
- **Market conditions**: Mean reversion tendency
- **Win rate typical**: 50–60%
- **Use case**: Forecast-based reversal trading
- **Risk level**: Medium

#### 🔶 8. Typical Price Strategy

- **Indicator**: Typical Price ((H+L+C)/3) + Moving Average
- **Entry Rules**:
  - 🟢 **BUY**: Price crosses above Typical Price MA
  - 🔴 **SELL**: Price crosses below Typical Price MA
- **Market conditions**: Smoothed price trading
- **Win rate typical**: 50–55%
- **Use case**: Smooth trend following
- **Risk level**: Medium

#### 🌊 9. VWMA Strategy - Volume Weighted MA

- **Indicator**: VWMA (volume-weighted moving average)
- **Entry Rules**:
  - 🟢 **BUY**: Price crosses above VWMA with volume confirmation
  - 🔴 **SELL**: Price crosses below VWMA on declining volume
- **Market conditions**: Institutional trading flow
- **Win rate typical**: 50–60%
- **Use case**: Volume-confirmed trends
- **Risk level**: Medium

#### 📊 10. KDJ Strategy - Random Index

- **Indicator**: KDJ (K/D lines)
- **Entry Rules**:
  - 🟢 **BUY**: K crosses above D from oversold (< 20), K < 20
  - 🔴 **SELL**: K crosses below D from overbought (> 80), K > 80
- **Market conditions**: Mean reversion + momentum confirmation
- **Win rate typical**: 55–65%
- **Use case**: Oversold/overbought with confirmation
- **Risk level**: Medium

---

### ⚡ Momentum Strategies (5 strategies)

#### 🔴 1. RSI-2 Strategy

- **Indicator**: RSI (2 period) - extreme short-term momentum
- **Entry Rules**:
  - 🟢 **BUY**: RSI2 < 5 (extreme oversold) bounces above 5
  - 🔴 **SELL**: RSI2 > 95 (extreme overbought) falls below 95
- **Market conditions**: Mean reversion, intraday/daily bounces
- **Win rate typical**: **80%+** (highest win rate indicator)
- **Use case**: Quick bounce trading, scalping, tight stops
- **Risk level**: Low (mean reversion has high % winners but small size)

#### 🟠 2. Stochastic Oscillator Strategy

- **Indicator**: %K/%D (14/3/3)
- **Entry Rules**:
  - 🟢 **BUY**: %K crosses above %D from oversold (< 20)
  - 🔴 **SELL**: %K crosses below %D from overbought (> 80)
- **Market conditions**: Range-bound, mean reversion
- **Win rate typical**: 60–70%
- **Use case**: Momentum bounce trading
- **Risk level**: Medium

#### 🟡 3. Williams %R Strategy

- **Indicator**: %R (-100 to 0)
- **Entry Rules**:
  - 🟢 **BUY**: %R crosses above -80 (oversold)
  - 🔴 **SELL**: %R crosses below -20 (overbought)
- **Market conditions**: Oscillator trading, mean reversion
- **Win rate typical**: 60–65%
- **Use case**: Simple overbought/oversold trading
- **Risk level**: Medium

#### 🔷 4. Awesome Oscillator Strategy

- **Indicator**: AO (5-SMA vs 34-SMA of median price)
- **Entry Rules**:
  - 🟢 **BUY**: AO crosses above zero, bars turn green and rising
  - 🔴 **SELL**: AO crosses below zero, bars turn red and falling
- **Market conditions**: Intraday momentum, swing trading
- **Win rate typical**: 55–65%
- **Use case**: Momentum divergence, bar color patterns
- **Risk level**: Medium

#### 🌊 5. Ichimoku Cloud Strategy

- **Indicator**: Multi-line cloud system (Tenkan/Kijun/Cloud)
- **Entry Rules**:
  - 🟢 **BUY**: Price breaks above cloud + Tenkan > Kijun
  - 🔴 **SELL**: Price breaks below cloud + Tenkan < Kijun
- **Market conditions**: Complete system for all conditions
- **Win rate typical**: 50–60% (but risk-reward often 1:2+)
- **Use case**: Complete trading system, multi-timeframe
- **Risk level**: Low-Medium (cloud = dynamic S/R)

---

### 📊 Volatility Strategies (3 strategies)

#### 🟢 1. Bollinger Bands Strategy

- **Indicator**: BB (20-SMA ± 2 σ)
- **Entry Rules**:
  - 🟢 **BUY**: Price closes above upper band on volume OR bounces off lower band
  - 🔴 **SELL**: Price closes below lower band on volume OR bounces off upper band
- **Market conditions**: Breakouts AND mean reversion (context-dependent)
- **Win rate typical**: **77.8%** (one of most reliable)
- **Use case**: Volatility extremes, band breakouts, squeeze/expansion
- **Risk level**: Medium

#### 🔷 2. Acceleration Bands Strategy

- **Indicator**: Acceleration Bands (dynamic volatility bands)
- **Entry Rules**:
  - 🟢 **BUY**: Price breaks above upper band with volume
  - 🔴 **SELL**: Price breaks below lower band with volume
- **Market conditions**: Volatility acceleration, breakout confirmation
- **Win rate typical**: 55–65%
- **Use case**: Volatility-confirmed breakouts
- **Risk level**: Medium

#### 🟠 3. Projection Oscillator Strategy

- **Indicator**: PO (projection-based oscillator)
- **Entry Rules**:
  - 🟢 **BUY**: PO crosses above zero or bounces from low
  - 🔴 **SELL**: PO crosses below zero or bounces from high
- **Market conditions**: Advanced volatility analysis
- **Win rate typical**: 50–60%
- **Use case**: Projection-based mean reversion
- **Risk level**: Medium-High

---

### 💰 Volume Strategies (6 strategies)

#### 📊 1. CMF Strategy - Chaikin Money Flow

- **Indicator**: CMF (14 period money flow index)
- **Entry Rules**:
  - 🟢 **BUY**: CMF crosses above 0 (buying pressure > 50%)
  - 🔴 **SELL**: CMF crosses below 0 (selling pressure > 50%)
- **Market conditions**: Volume-based confirmation
- **Win rate typical**: 55–65%
- **Use case**: Volume trend confirmation, divergence trading
- **Risk level**: Medium

#### 💪 2. Force Index Strategy

- **Indicator**: FI (raw volume × price change)
- **Entry Rules**:
  - 🟢 **BUY**: FI crosses above 0 (volume supporting up)
  - 🔴 **SELL**: FI crosses below 0 (volume supporting down)
- **Market conditions**: Raw volume momentum
- **Win rate typical**: 55–65%
- **Use case**: Volume-driven momentum trading
- **Risk level**: Medium

#### 🎯 3. Money Flow Index Strategy

- **Indicator**: MFI (20 period, RSI using money flow)
- **Entry Rules**:
  - 🟢 **BUY**: MFI < 20 and crosses back above 20
  - 🔴 **SELL**: MFI > 80 and crosses back below 80
- **Market conditions**: Overbought/oversold with volume
- **Win rate typical**: 60–70%
- **Use case**: Volume-weighted momentum extremes
- **Risk level**: Medium

#### 🌊 4. Ease of Movement Strategy

- **Indicator**: EMV (price movement / range / volume)
- **Entry Rules**:
  - 🟢 **BUY**: EMV crosses above 0 (ease of upside movement)
  - 🔴 **SELL**: EMV crosses below 0 (ease of downside movement)
- **Market conditions**: Relative ease of movement
- **Win rate typical**: 50–60%
- **Use case**: Movement difficulty assessment
- **Risk level**: Medium

#### 🔷 5. Negative Volume Index Strategy

- **Indicator**: NVI (accumulation on down-volume)
- **Entry Rules**:
  - 🟢 **BUY**: NVI rising above its moving average (smart money buying)
  - 🔴 **SELL**: NVI falling below MA (smart money selling)
- **Market conditions**: Long-term accumulation/distribution
- **Win rate typical**: 50–60%
- **Use case**: Smart money detection, long-term trends
- **Risk level**: Low (position trading)

#### 📈 6. VWAP Strategy - Volume Weighted Average Price

- **Indicator**: VWAP (institutional fair price)
- **Entry Rules**:
  - 🟢 **BUY**: Price bounces above VWAP with volume
  - 🔴 **SELL**: Price breaks below VWAP on volume
- **Market conditions**: Intraday mean reversion, institutional trading
- **Win rate typical**: 55–65%
- **Use case**: Intraday support/resistance, institutional levels
- **Risk level**: Medium

---

## 📊 Signal Quick Reference

### ✅ Good Signal Examples by Category

| **Category**   | **Indicator** | **Good Signal**         | **Expected Setup**         |
| -------------------- | ------------------- | ----------------------------- | -------------------------------- |
| **Trend**      | MACD                | MACD > Signal + Histogram > 0 | Bullish momentum acceleration    |
| **Trend**      | EMA                 | Price > EMA50 > EMA200        | Strong uptrend alignment         |
| **Trend**      | PSAR                | SAR flips below price         | Uptrend initiation               |
| **Momentum**   | RSI                 | RSI 40–60 in trend           | Healthy momentum, not overbought |
| **Momentum**   | Stoch               | %K bounces from < 20          | Oversold bounce setup            |
| **Momentum**   | RSI-2               | RSI2 < 5 bouncing             | Extreme oversold mean reversion  |
| **Volatility** | BB                  | Price breaks upper band       | Volatility expansion breakout    |
| **Volatility** | ATR                 | ATR rising with breakout      | Legitimate volatility increase   |
| **Volume**     | OBV                 | OBV new high with price       | Volume confirms uptrend          |
| **Volume**     | CMF                 | CMF > 0.1                     | Buying pressure > 50%            |
| **Advanced**   | Ichimoku            | Price > Cloud, Tenkan > Kijun | Complete bullish alignment       |

### ❌ Bad Signal Examples by Category

| **Category**   | **Indicator** | **Bad Signal**              | **Warning**                  |
| -------------------- | ------------------- | --------------------------------- | ---------------------------------- |
| **Trend**      | MACD                | MACD > Signal but declining       | Momentum fading                    |
| **Trend**      | Price vs MA         | Price far above rising MA         | Overextension, mean reversion risk |
| **Momentum**   | RSI                 | RSI stuck > 70 vs your position   | Overbought against trade           |
| **Momentum**   | Divergence          | RSI higher high, price lower high | Bearish divergence, reversal risk  |
| **Volatility** | Squeeze             | BB bands compress then spike      | Volatile reversal probable         |
| **Volume**     | Divergence          | Price new high, OBV flat          | Weak uptrend, distribution likely  |

---

## 🎓 Strategy Selection by Market Regime

### 📈 Strong Trending Market

**Use Trend Strategies**: MACD, Parabolic SAR, Aroon, Vortex

- Focus on breakouts and continuation
- Use ATR for volatility-adjusted stops
- Ignore mean-reversion signals
- **Expect**: 40–50% win rate, large winners (risk/reward 1:2+)

### 📊 Range-Bound/Ranging Market

**Use Momentum Strategies**: RSI-2, Stochastic, Williams %R

- Focus on overbought/oversold fades
- Use Bollinger Bands for support/resistance
- Profit from bounces, not breakouts
- **Expect**: 70%+ win rate, small winners (risk/reward 1:0.5–1:1)

### 🌊 Volatile/Choppy Market

**Use Volume Strategies**: CMF, MFI, Force Index, VWAP

- Focus on volume confirmation
- Avoid large positions
- Use tighter stops
- **Expect**: 55–65% win rate, medium risk/reward

### 🔄 Reversal/Transition Market

**Use Oscillator + Divergence**: CCI extremes, CMO divergence, Ichimoku cloud

- Watch for indicators at extremes
- Confirm with volume
- Use multi-timeframe confirmation
- **Expect**: 50–60% win rate but high risk/reward 1:2–1:3

---

## 💡 Implementation Tips

1. **Combine Indicators**: Don't rely on single indicator

   - Trend (MACD) + Momentum (RSI) + Volume (OBV)
   - Example: "MACD > 0 AND RSI 40–70 AND OBV rising"
2. **Use Stops**: Position size = Account Risk / (Stop Loss Distance)

   - ATR-based: Stop = Entry ± (2 × ATR)
   - Support/Resistance-based: Stop = Recent swing low + buffer
   - Bollinger Bands: Stop = Outside band + ATR buffer
3. **Risk/Reward**: Exit targets should exceed stop loss

   - Trend strategies: 1:2 or 1:3 (larger winners)
   - Mean reversion: 1:0.5 to 1:1 (small winners, high frequency)
4. **Timeframe Alignment**: Confirm across multiple timeframes

   - Daily trend + 4H momentum + 1H entry
   - Weekly ADX > 25 (strong trend) filters out choppy daily
5. **Backtest**: Always backtest before live trading

   - Use `Strategy Stats` and `Compute Strategy Stats`
   - Track: Win Rate, Profit Factor, Sharpe Ratio, Max Drawdown
