---
title: Technical Indicators
icon: Activity
---
## 📍 Table of Contents

1. [🎯 Trend Indicators](#trend-indicators)
2. [⚡ Momentum Indicators](#momentum-indicators)
3. [📈 Volatility Indicators](#volatility-indicators)
4. [💰 Volume Indicators](#volume-indicators)
5. [🔄 Oscillators & Special Indicators](#oscillators--special-indicators)

---

## 📖 Quick Reference

### Moving Averages
\`\`\`
SMA(N) = SUM(Close, N) / N
EMA(N) = (Close × α) + (Previous EMA × (1-α)), α = 2/(N+1)
DEMA = (2 × EMA) - EMA(EMA)
TEMA = (3 × EMA1) - (3 × EMA2) + EMA3
VWMA(N) = SUM(Close × Volume, N) / SUM(Volume, N)
\`\`\`

### Momentum
\`\`\`
RSI(14) = 100 - (100 / (1 + RS)), RS = Avg Gain / Avg Loss
MACD = EMA(12) - EMA(26), Signal = EMA(9, MACD)
APO = EMA(14) - EMA(30)
Stochastic %K = ((C - LOW14) / (HIGH14 - LOW14)) × 100
%D = SMA(%K, 3)
\`\`\`

### Volatility
\`\`\`
ATR(14) = SMA(True Range, 14)
TR = MAX(H-L, |H-C_prev|, |L-C_prev|)
BB Upper = SMA(20) + (2 × STDEV)
BB Lower = SMA(20) - (2 × STDEV)
Keltner = EMA ± (2 × ATR)
\`\`\`

### Volume
\`\`\`
OBV = Previous OBV ± Volume (+ if close > prev, - if close < prev)
CMF = SUM((CLR × Volume), 14) / SUM(Volume, 14)
AD = Previous AD + (CLR × Volume)
CLR = ((C-L) - (H-C)) / (H-L)
MFI = 100 - (100 / (1 + Money Ratio))
\`\`\`


## 🎯 Trend Indicators

Trend indicators identify **direction and persistence** of price movement. [file:21]

### 📍 Moving Averages (MA)

#### 🟢 SMA - Simple Moving Average
- **What**: Arithmetic average of last N price points equally weighted
- **Why it matters**: Identifies trend direction, reduces noise
- **Good signal**: Price above rising SMA (uptrend), SMA above price (downtrend)
- **Bad signal**: Price oscillating around SMA without clear direction
- **Formula**: `SMA = Sum(Closing, period) / period`
- **Use case**: Long-term trend confirmation, support/resistance levels

#### 🟡 EMA - Exponential Moving Average
- **What**: Weighted average giving more weight to recent prices
- **Why it matters**: Responds faster to price changes than SMA
- **Good signal**: Price above rising EMA, faster reaction in strong trends
- **Bad signal**: Whipsaws in choppy markets, lag in reversals
- **Formula**: `EMA = (Close × α) + (Previous EMA × (1 - α))`, where α = 2/(period+1)
- **Use case**: Short-term trading, trend confirmation, scalping

#### 🟣 DEMA - Double Exponential Moving Average
- **What**: Combination of two EMAs reducing lag further
- **Why it matters**: Tracks price action faster with less delay for quick decisions
- **Good signal**: Earlier crossovers than SMA/EMA, better trend following
- **Bad signal**: False signals in ranging markets
- **Formula**: `DEMA = (2 × EMA) - EMA(EMA)`
- **Use case**: Active trading, quick reversals, scalping with lower lag

#### 🔵 TEMA - Triple Exponential Moving Average
- **What**: Three layers of exponential smoothing for even faster response
- **Why it matters**: Minimizes lag significantly while maintaining smoothness
- **Good signal**: First to identify trend changes, aggressive trend followers
- **Bad signal**: Prone to whipsaws in choppy conditions
- **Formula**: `TEMA = (3 × EMA1) - (3 × EMA2) + EMA3`
- **Use case**: Aggressive day trading, scalping, fast-moving markets

#### ⚪ TRIMA - Triangular Moving Average
- **What**: Average of an average, giving center bars more weight
- **Why it matters**: Creates very smooth trend line, emphasizes middle prices
- **Good signal**: Smoothest trends with lag, good for breakouts
- **Bad signal**: Late entries and exits due to extreme smoothing
- **Use case**: Longer-term trends, institutional patterns

#### 🟠 RMA - Rolling Moving Average
- **What**: Hybrid of SMA and recursive weighted average
- **Why it matters**: Balances responsiveness with smoothing
- **Good signal**: Smooth trends without excessive lag
- **Bad signal**: Still lags in sharp reversals
- **Use case**: Scalping, intraday trading, medium-term positioning

#### 🟢 VWMA - Volume Weighted Moving Average
- **What**: Average price weighted by trading volume
- **Why it matters**: Institutions often pay attention to VWAP/VWMA as fair price
- **Good signal**: Price above VWMA with rising volume = strong uptrend
- **Bad signal**: Price far above VWMA with declining volume = overextension
- **Formula**: `VWMA = Sum(Price × Volume, period) / Sum(Volume, period)`
- **Use case**: Institutional trading, breakout validation, stop placement

---

### 📊 MACD Family (Momentum Convergence)

#### 🟦 MACD - Moving Average Convergence Divergence
- **What**: Difference between 12-EMA and 26-EMA with 9-EMA signal line
- **Why it matters**: **Most widely used** momentum indicator, shows convergence/divergence
- **Good signal**: MACD > Signal (bullish), crosses above zero (strong buy), positive divergence
- **Bad signal**: MACD < Signal (bearish), crosses below zero (sell), negative divergence
- **Formula**: `MACD = EMA(12) - EMA(26)` | `Signal = EMA(9, MACD)` | `Histogram = MACD - Signal`
- **Use case**: Trend confirmation, momentum strength, entry/exit timing

#### 🟦 APO - Absolute Price Oscillator
- **What**: MACD without signal line (just the difference between two EMAs)
- **Why it matters**: Simpler MACD alternative, better for divergence analysis
- **Good signal**: APO > 0 (uptrend), positive divergence, rising peaks
- **Bad signal**: APO < 0 (downtrend), negative divergence, lower lows
- **Formula**: `APO = Fast EMA(14) - Slow EMA(30)`
- **Use case**: Divergence trading, momentum pure plays

#### 🟪 PPO - Percentage Price Oscillator
- **What**: APO expressed as percentage of 12-period EMA
- **Why it matters**: Normalized momentum, comparable across different price levels
- **Good signal**: PPO > 0% with rising signal, percentage magnitude increases
- **Bad signal**: PPO < 0% with declining signal, shrinking magnitude
- **Use case**: Multi-symbol comparisons, normalized momentum analysis

#### 🔶 TRIX - Triple Exponential Moving Average Oscillator
- **What**: 1-day rate of change of a triple-smoothed EMA
- **Why it matters**: Extremely smooth momentum, filters out small price moves
- **Good signal**: TRIX > 0 (momentum up), crosses above zero from below
- **Bad signal**: TRIX < 0 (momentum down), prolonged negative without reversal
- **Formula**: `TRIX = (EMA3 - Previous EMA3) / Previous EMA3 × 10000`
- **Use case**: Noise filtering, smooth trend identification, lag tolerance

---

### 🎪 Aroon & Directional Movement

#### 🎯 Aroon (Up/Down)
- **What**: Two lines measuring periods since highest high and lowest low
- **Why it matters**: Identifies trend strength and potential reversals
- **Good signal**: Aroon Up near 100, Aroon Down near 0 (strong uptrend), lines crossing
- **Bad signal**: Both near 50 (no clear direction), convergence suggests reversal
- **Formula**: 
  - `Aroon Up = ((Period - Periods Since High) / Period) × 100`
  - `Aroon Down = ((Period - Periods Since Low) / Period) × 100`
- **Use case**: Trend strength assessment, crossover trading, reversal timing

#### 📊 Aroon Oscillator
- **What**: Difference between Aroon Up and Aroon Down
- **Why it matters**: Single oscillator showing trend direction
- **Good signal**: Positive = uptrend favor, negative = downtrend favor
- **Bad signal**: Near zero = ranging/indecision
- **Formula**: `Aroon Oscillator = Aroon Up - Aroon Down`

#### 🔷 ADX - Average Directional Index
- **What**: Measures trend strength 0–50 scale regardless of direction
- **Why it matters**: Values > 25 = strong trends, < 20 = ranging markets
- **Good signal**: ADX rising above 25 with +DI > -DI (strong uptrend)
- **Bad signal**: ADX < 20 (weak/range), conflicting DI signals
- **Formula**: `ADX = SMA(14, DX)` | `DX = (|+DI - -DI| / |+DI + -DI|) × 100`
- **Use case**: Trend qualification, strategy selection (trend vs range)

#### 🔶 +DI / -DI (Plus/Minus Directional Indicator)
- **What**: Measures uptrend/downtrend strength respectively
- **Why it matters**: Shows when bulls (+DI) or bears (-DI) control price
- **Good signal**: +DI > -DI (bulls strong), +DI rising (improving uptrend)
- **Bad signal**: -DI > +DI (bears strong), lines converging (weakness)
- **Use case**: Directional confirmation, entry/exit with ADX filter

#### ⚫ Vortex Indicator
- **What**: Two oscillators capturing positive and negative trend movement
- **Why it matters**: Identifies trend direction and strength via price swings
- **Good signal**: +VI > -VI (uptrend), +VI crossing above -VI
- **Bad signal**: -VI > +VI (downtrend), VI lines near equal (indecision)
- **Formula**: 
  - `+VI = SUM(|High - Low(prior)|, 14) / TR14`
  - `-VI = SUM(|Low - High(prior)|, 14) / TR14`
- **Use case**: Swing trading, trend confirmation, momentum trades

---

### 🎪 Additional Trend Indicators

#### 🟡 BOP - Balance of Power
- **What**: Ratio of buying to selling pressure
- **Why it matters**: Quick gauge of bull/bear dominance
- **Good signal**: BOP > 0.5 (strong buy pressure), rising trend
- **Bad signal**: BOP < -0.5 (strong sell pressure), declining trend
- **Formula**: `BOP = (Close - Open) / (High - Low)`
- **Use case**: Quick momentum gauge, scalping signals

#### 🟢 Qstick
- **What**: Simple moving average of (Close - Open)
- **Why it matters**: Measures average body size, trend momentum
- **Good signal**: Qstick > 0 with rising (bullish bars), positive divergence
- **Bad signal**: Qstick < 0 with declining (bearish bars), negative divergence
- **Formula**: `Qstick = SMA(Close - Open, period)`

#### 🔵 CCI - Commodity Channel Index
- **What**: Measures deviation of price from its simple moving average
- **Why it matters**: Identifies cyclical trends, overbought/oversold extremes
- **Good signal**: CCI > +100 (strong up-momentum), crossing above 100
- **Bad signal**: CCI < -100 (strong down-momentum), prolonged extremes
- **Formula**: `CCI = (Typical Price - SMA) / (0.015 × Mean Deviation)`
- **Use case**: Cycle trading, mean reversion, momentum extremes

#### 🟣 KDJ - Random Index (Stochastic variant)
- **What**: Three-line indicator (K, D, J) comparing close to high-low range
- **Why it matters**: Identifies momentum reversals and overbought/oversold
- **Good signal**: K crosses above D with both < 20 (oversold bounce), J divergence
- **Bad signal**: K/D stuck above 80 without follow-through (exhaustion), false breakouts
- **Formula**: `RSV = ((C - MIN) / (MAX - MIN)) × 100` | `K = SMA(RSV, 3)` | `D = SMA(K, 3)` | `J = 3K - 2D`
- **Use case**: Short-term timing, mean reversion, overbought/oversold fades

#### 🎯 Parabolic SAR (PSAR)
- **What**: Trailing stop level that rises/falls with price trend acceleration
- **Why it matters**: Provides entry/exit signals and mechanical trailing stops
- **Good signal**: SAR flips from above to below price (uptrend start), dots rising
- **Bad signal**: SAR flips from below to above (downtrend start/exit), whipsaws in ranges
- **Formula**: `SAR[i] = SAR[i-1] + AF × (EP - SAR[i-1])`
- **Use case**: Trend trading, stop-loss placement, trend reversals

#### ⚪ Mass Index (MI)
- **What**: Range expansion identification using high-low volatility
- **Why it matters**: Identifies trend reversals when range contracts then expands
- **Good signal**: MI crosses below 27 (potential reversal), bullish signal if followed by expansion
- **Bad signal**: MI stays high (strong trend continues), breakout false signals

#### 🔷 Typical Price
- **What**: Average of high, low, and close: (H+L+C)/3
- **Why it matters**: Better price representative for moving averages
- **Good signal**: Used with moving averages above it (uptrend)
- **Bad signal**: Price below typical price MA (downtrend)
- **Use case**: Price filtering, equilibrium levels

#### 📊 Since Change
- **What**: Number of periods since last value change
- **Why it matters**: Identifies stalled indicators or prolonged levels
- **Good signal**: Low "since change" = dynamic indicator, trend confirmation
- **Bad signal**: High "since change" = indicator stuck, reversal warning

#### 📈 Moving Extremes (MMAX, MMIN, MSUM)
- **What**: Maximum/minimum/sum values within rolling period
- **Why it matters**: Identifies recent highs/lows for breakout and range trading
- **Good signal**: Price breaks MMAX (bullish), MMIN rising (support holding)
- **Bad signal**: Price breaks MMIN (bearish), MMAX falling (resistance breaking)
- **Use case**: Breakout trading, volatility analysis, range identification

---

## ⚡ Momentum Indicators

Momentum indicators focus on **speed of price changes** and overbought/oversold zones.

### 🟥 RSI - Relative Strength Index

- **What**: Oscillator measuring speed/magnitude of price changes (0–100 scale)
- **Why it matters**: **Most widely used** overbought/oversold indicator
- **Good signal**: RSI 40–60 in strong trend (healthy momentum), bounces from 30, exits at 70
- **Bad signal**: Prolonged > 70 (overbought against your position), divergence at 70, < 30 with strength
- **Threshold values**:
  - RSI > 70 = Overbought (potential reversal)
  - RSI < 30 = Oversold (potential bounce)
  - RSI 40–60 = Healthy momentum in trend
- **Formula**: `RSI = 100 - (100 / (1 + RS))` | `RS = Avg Gain / Avg Loss over 14 periods`
- **Use case**: Mean reversion, overbought/oversold fades, divergence trading, trend confirmation

### 🟧 Stochastic Oscillator (STOCH)

- **What**: Compares closing price to recent high-low range with smoothing
- **Why it matters**: Identifies momentum reversals and overbought/oversold with dual lines
- **Good signal**: %K crosses above %D from below 20 (oversold bounce), slow stoch > fast
- **Bad signal**: %K stuck above 80 without follow-through (exhaustion), divergence at extremes
- **Threshold values**:
  - %K > 80 = Overbought
  - %K < 20 = Oversold
  - Golden cross: K > D = bullish
  - Death cross: K < D = bearish
- **Formula**: `RSV = ((C - LOW14) / (HIGH14 - LOW14)) × 100` | `%K = SMA(RSV, 3)` | `%D = SMA(%K, 3)`
- **Use case**: Mean reversion, momentum confirmation, divergence signals

### 🟦 Williams %R (WILLR)

- **What**: Stochastic-like indicator on 0 to -100 scale
- **Why it matters**: Values near -100 show oversold, near 0 show overbought
- **Good signal**: %R near -100 (oversold, bounce setup), crosses up from oversold
- **Bad signal**: %R stuck near 0 without reversal (strong trend), doesn't reach oversold
- **Threshold values**:
  - %R > -20 = Overbought
  - %R < -80 = Oversold
  - %R between -20 and -80 = Neutral
- **Formula**: `WILLR = (HIGHEST - CLOSE) / (HIGHEST - LOWEST) × -100`
- **Use case**: Overbought/oversold trading, quick entry signals, mean reversion

### 🟩 MFI - Money Flow Index

- **What**: RSI-like oscillator using price AND volume (0–100)
- **Why it matters**: Shows strength of buying/selling pressure combined
- **Good signal**: MFI 50–80 in uptrend with rising (strong bull flow)
- **Bad signal**: MFI > 80 with price divergence (distribution), < 20 with strength (accumulation)
- **Threshold values**:
  - MFI > 80 = Overbought
  - MFI < 20 = Oversold
  - MFI rising = Buying pressure increasing
  - MFI falling = Selling pressure increasing
- **Formula**: `MFI = 100 - (100 / (1 + Money Ratio))` | `Money Ratio = Positive MF / Negative MF`
- **Use case**: Volume confirmation, divergence trading, institutional flow detection

### 📊 ROC - Rate of Change

- **What**: Percentage change in price over N periods
- **Why it matters**: Normalized momentum measure showing acceleration/deceleration
- **Good signal**: ROC > 0 and rising (accelerating uptrend), positive divergence
- **Bad signal**: ROC < 0 and falling (accelerating downtrend), negative divergence
- **Formula**: `ROC = ((Close - Close[N periods ago]) / Close[N periods ago]) × 100`
- **Use case**: Momentum strength, divergence detection, trend exhaustion

### ⚫ Momentum (MOM)

- **What**: Simple difference between current and past price
- **Why it matters**: Raw momentum without normalization
- **Good signal**: MOM > 0 (upside), increasing (accelerating)
- **Bad signal**: MOM < 0 (downside), decreasing (decelerating)
- **Formula**: `MOM = Close - Close[N periods ago]`

### 🔶 CMO - Chande Momentum Oscillator

- **What**: Measures difference between up and down price movements (0–100)
- **Why it matters**: Identifies momentum strength with extremes
- **Good signal**: CMO > 50 with rising (strong up-momentum)
- **Bad signal**: CMO < -50 with falling (strong down-momentum)
- **Formula**: `CMO = ((Up Sum - Down Sum) / (Up Sum + Down Sum)) × 100`

### 🟡 CFO - Chande Forecast Oscillator

- **What**: Percentage difference between close and linear regression forecast
- **Why it matters**: Identifies when price deviates from trend (mean reversion setup)
- **Good signal**: CFO extreme then crosses back (mean reversion), price vs forecast divergence
- **Bad signal**: CFO flat (no momentum), stays extreme without reversal (trend strength)

### 🌊 Ichimoku Cloud

- **What**: Multi-line system encoding trend, support/resistance, and momentum
- **Why it matters**: Complete trading system in one indicator
- **Good signal**: Price > cloud with bullish line ordering (strong uptrend), cloud support hold
- **Bad signal**: Price < cloud with bearish ordering (downtrend), price inside cloud (indecision)
- **Formula**:
  - `Tenkan = (9-high + 9-low) / 2`
  - `Kijun = (26-high + 26-low) / 2`
  - `Senkou A = (Tenkan + Kijun) / 2`
  - `Senkou B = (52-high + 52-low) / 2`
- **Use case**: Trend system, support/resistance, lagging span confirmation

### 🎯 Awesome Oscillator (AO)

- **What**: Difference between 5-SMA and 34-SMA of median price (H+L)/2
- **Why it matters**: Captures short-term momentum vs longer trend
- **Good signal**: AO > 0 with green bars increasing (upside momentum)
- **Bad signal**: AO < 0 with red bars decreasing (downside momentum)
- **Use case**: Momentum divergence, continuation signals

---

## 📈 Volatility Indicators

Volatility indicators address **"how much the price is moving"** and risk/stop placement.

### 📊 ATR - Average True Range

- **What**: Average of true range (largest of: H-L, |H-C prev|, |L-C prev|) over N periods
- **Why it matters**: Measures volatility independent of direction, key for stop placement
- **Good signal**: ATR rising with breakout (increasing risk, trend strength)
- **Bad signal**: ATR spike after extended move (blow-off top), then collapse (reversal warning)
- **Threshold**: 
  - Low ATR (< historical avg) = tighter stops, range potential
  - High ATR (> historical avg) = wider stops, trend potential
- **Formula**: `ATR = SMA(True Range, 14)` | `TR = MAX(H-L, |H-C prev|, |L-C prev|)`
- **Use case**: Stop-loss sizing, position sizing, volatility-adjusted entries

### 🟢 Bollinger Bands (BB)

- **What**: SMA with upper/lower bands set N standard deviations away
- **Why it matters**: **One of top 3 most reliable** indicators; identifies overbought/oversold
- **Good signal**: Price break band with volume + trend (continuation), touch with bounce (mean reversion)
- **Bad signal**: Repeated band touches without progress (range-bound), low volume tags (fakeout)
- **Threshold**:
  - Upper band tag with volume = Overbought if against you, continuation if with trend
  - Lower band tag with volume = Oversold if against you, support if with trend
  - Band squeeze (low BandWidth) = volatility contraction, breakout coming
- **Formula**: `Upper Band = SMA + (2 × STDEV)` | `Lower Band = SMA - (2 × STDEV)` | `Middle = SMA(20)`
- **Use case**: Breakout trading, mean reversion, volatility extremes, support/resistance

### 🔷 Keltner Channel (KC)

- **What**: EMA with bands based on ATR (more volatile than BB)
- **Why it matters**: ATR-based bands adjust for actual volatility
- **Good signal**: Price breaks KC with ATR rising (genuine breakout)
- **Bad signal**: KC bands widen (increasing volatility), breaks false
- **Formula**: `Upper = EMA + (2 × ATR)` | `Lower = EMA - (2 × ATR)`
- **Use case**: Volatility-adjusted breakouts, trend trading

### 📉 MSTD - Moving Standard Deviation

- **What**: Standard deviation of prices over N periods
- **Why it matters**: Raw volatility metric for custom band construction
- **Good signal**: MSTD increasing (volatility rising), supports trend strength
- **Bad signal**: MSTD at extremes without movement (dead market), excessive spikes
- **Use case**: Volatility quantification, custom indicator construction

### 🎪 Donchian Channel (DC)

- **What**: Highest high and lowest low over N periods (no smoothing)
- **Why it matters**: Pure price-based channels, good for breakouts
- **Good signal**: Price breaks above DC high with volume (bullish breakout)
- **Bad signal**: Price breaks DC low (bearish), false breakouts without follow-through
- **Use case**: Breakout trading, support/resistance, turtle strategy base

### 🟠 Acceleration Bands (AB)

- **What**: Dynamic bands based on high-low range acceleration
- **Why it matters**: Tighter bands during calm, wider during volatile
- **Good signal**: Price breaks bands with increasing acceleration (strong move)
- **Bad signal**: Bands converge (calm), breakout false if volume drops
- **Use case**: Volatility confirmation, breakout validation

### 🔶 Chandelier Exit (CE)

- **What**: Volatility-adjusted trailing stop using ATR
- **Why it matters**: Mechanical exit based on price action and volatility
- **Good signal**: Price respects Chandelier (orderly trend), stops protect gains
- **Bad signal**: Whipsawed by CE in choppy markets (volatility too high)
- **Formula**: `CE Long = HIGH[N] - ATR × Multiple` | `CE Short = LOW[N] + ATR × Multiple`
- **Use case**: Trailing stops, trend protection, exit timing

### ⚪ Projection Oscillator (PO)

- **What**: Linear regression-based oscillator of price projections
- **Why it matters**: Advanced volatility measure for prediction
- **Good signal**: PO at extremes then reverting (mean reversion), divergence signals
- **Bad signal**: PO flat (no volatility or trending), extremes without reversal
- **Use case**: Projection-based trading, advanced volatility analysis

### 🟡 NATR - Normalized Average True Range

- **What**: ATR expressed as percentage of current price
- **Why it matters**: Compares volatility across different price levels/symbols
- **Good signal**: NATR at historical highs (maximum volatility environment)
- **Bad signal**: NATR at historic lows (subdued volatility, range potential)
- **Formula**: `NATR = (ATR / Close) × 100`
- **Use case**: Cross-symbol volatility comparison, relative risk assessment

### 🔷 Ulcer Index (UI)

- **What**: Measures depth and duration of drawdowns
- **Why it matters**: Risk metric capturing pain of prolonged declines
- **Good signal**: UI low (shallow drawdowns, healthy trend)
- **Bad signal**: UI rising sharply (deep drawdown building), sustained high UI (downtrend)
- **Use case**: Risk management, drawdown tracking, strategy stress testing

---

## 💰 Volume Indicators

Volume indicators measure **whether volume supports the price move**.

### 📊 OBV - On-Balance Volume

- **What**: Cumulative volume added on up days, subtracted on down days
- **Why it matters**: Identifies volume strength behind moves, divergences predict reversals
- **Good signal**: OBV rising with price (bullish confirmation), new highs
- **Bad signal**: Price makes new high but OBV doesn't (divergence = weak), OBV declining
- **Formula**: 
  - If Close > Previous Close: OBV = Previous OBV + Volume
  - If Close < Previous Close: OBV = Previous OBV - Volume
  - If Close = Previous Close: OBV = Previous OBV
- **Use case**: Volume confirmation, accumulation/distribution, divergence trading

### 💵 CMF - Chaikin Money Flow

- **What**: Combines price position in range with volume
- **Why it matters**: Shows if volume follows bulls or bears
- **Good signal**: CMF > 0 and rising (buying pressure), confirms uptrend
- **Bad signal**: CMF < 0 and falling (selling pressure), price divergence at CMF extremes
- **Threshold**:
  - CMF > 0.1 = Moderate buying pressure
  - CMF < -0.1 = Moderate selling pressure
  - CMF between ±0.1 = Neutral flow
- **Formula**: `CMF = SUM((CLR × Volume), N) / SUM(Volume, N)` | `CLR = ((C-L) - (H-C)) / (H-L)`

### 📈 AD - Accumulation/Distribution (Chaikin AD Line)

- **What**: Cumulative line combining price range with volume
- **Why it matters**: Measures money flow in/out, shows if volume confirms trends
- **Good signal**: AD rising with price (bullish), AD at new highs (distribution complete)
- **Bad signal**: AD declining while price rising (divergence = weak), AD new lows (dumping)
- **Formula**: `AD = Previous AD + (CLR × Volume)` | `CLR = ((C-L) - (H-C)) / (H-L)`

### 🔄 ADOSC - Chaikin A/D Oscillator

- **What**: Difference between fast and slow EMAs of AD line
- **Why it matters**: Identifies momentum shifts in money flow
- **Good signal**: ADOSC crosses above zero (buying momentum), positive divergence
- **Bad signal**: ADOSC crosses below zero (selling momentum), negative divergence
- **Formula**: `ADOSC = EMA(3, AD) - EMA(10, AD)`

### 🎯 MFI - Money Flow Index

*Note: Listed under Momentum but is volume-aware*

- **What**: RSI-like but using price range and volume
- **Why it matters**: Combines momentum with volume for stronger signals
- **Good signal**: MFI 50–80 in uptrend (strong buying)
- **Bad signal**: MFI > 80 with divergence (distribution), < 20 with strength (accumulation)
- **Use case**: Volume-weighted momentum, divergence trading

### 🟢 VWAP - Volume Weighted Average Price

- **What**: Average price weighted by intraday volume
- **Why it matters**: Institutional fair price, key reference level
- **Good signal**: Price above VWAP with rising volume (bullish), price bouncing off VWAP
- **Bad signal**: Price far above VWAP with declining volume (overextension), breaks below VWAP support
- **Formula**: `VWAP = SUM(Price × Volume) / SUM(Volume)` (intraday)
- **Use case**: Institutional entry/exit levels, intraday support/resistance

### 💪 Force Index (FI)

- **What**: Raw price movement × volume
- **Why it matters**: Raw volume-adjusted momentum
- **Good signal**: FI > 0 and rising (strong volume behind upside)
- **Bad signal**: FI < 0 and falling (strong volume behind downside)
- **Formula**: `FI = (Close - Previous Close) × Volume`

### 📍 Ease of Movement (EMV)

- **What**: Distance moved relative to range and volume
- **Why it matters**: Shows ease of price movement (low volume = harder to move)
- **Good signal**: EMV positive and rising (price moving up with ease)
- **Bad signal**: EMV negative or flat (difficulty moving in either direction)
- **Formula**: `EMV = (Distance Moved / (High - Low)) / (Volume / Scale)`

### 🔷 NVI - Negative Volume Index

- **What**: Cumulative index only advancing on down-volume days
- **Why it matters**: Shows "smart money" moves on declining volume
- **Good signal**: NVI rising (smart money buying accumulation)
- **Bad signal**: NVI declining (smart money distributing)
- **Use case**: Long-term accumulation/distribution, smart money tracking

### 📊 VPT - Volume Price Trend

- **What**: Volume adjusted by percentage price change
- **Why it matters**: Combines volume and momentum in single line
- **Good signal**: VPT rising (volume supporting uptrend)
- **Bad signal**: VPT declining despite rising price (weak volume)
- **Formula**: `VPT = Previous VPT + (Volume × ROC)` | `ROC = (C - C prev) / C prev`

---

## 🔄 Oscillators & Special Indicators

### 🟠 Hilbert Transform Indicators (Advanced)

#### 🔶 HTTRENDLINE - Hilbert Transform Instantaneous Trendline
- **What**: Mathematical lag-free trendline using Hilbert transform
- **Why it matters**: Follows price closely while removing noise
- **Good signal**: Price above line (uptrend), crosses above from below
- **Bad signal**: Price below line (downtrend), whipsaws in choppy markets
- **Use case**: Advanced technical traders, lag-free analysis

#### 🌊 HTSINE - Hilbert Transform Sine Wave
- **What**: Generates sine wave showing dominant cycle phase
- **Why it matters**: Identifies market cycles for timing entries/exits
- **Good signal**: Sine at trough (bottom of cycle, bounce), rising phase (uptrend probable)
- **Bad signal**: Sine at peak (top of cycle, pullback), declining phase (downtrend probable)
- **Use case**: Cycle-based trading, bottom/top picking

#### 📊 HTDCPERIOD - Hilbert Transform Dominant Cycle Period
- **What**: Calculates dominant cycle length in current price data
- **Why it matters**: Shows market periodicity, helps choose indicator periods
- **Good signal**: Clear dominant period (cyclic market), use it for MA periods
- **Bad signal**: Shifting periods (choppy, ranging market)
- **Use case**: Parameter optimization, cycle strength assessment

#### 🔄 HTDCPHASE - Hilbert Transform Dominant Cycle Phase
- **What**: Position within dominant cycle
- **Why it matters**: Timing indicator for cycle-based entries/exits
- **Good signal**: Phase at lows (bounce setup), rising phase (uptrend continuation)
- **Bad signal**: Phase at highs (pullback risk), phase unreliable in non-cyclic markets
- **Use case**: Precise entry/exit timing, cycle-based systems

#### 🎯 HTTRENDMODE - Hilbert Transform Trend vs Cycle
- **What**: Binary indicator (trending vs cycling mode)
- **Why it matters**: Tells you which strategy to use (trend-following vs oscillator)
- **Good signal**: TRENDING mode = use trend-following strategies, Bollinger Bands, MACD
- **Bad signal**: CYCLING mode = avoid trend-following, use mean-reversion oscillators
- **Use case**: Strategy mode selection, adaptive trading systems

### 📍 Additional Oscillators

#### 🟣 ROCR - Rate of Change Ratio
- **What**: Ratio form of ROC rather than percentage
- **Why it matters**: Alternative calculation method for ROC analysis
- **Good signal**: ROCR > 1 (price up), rising (acceleration)
- **Bad signal**: ROCR < 1 (price down), falling (deceleration)
- **Use case**: Ratio-based momentum, mathematical alternatives

#### 📊 MIDPOINT / MIDPRICE
- **What**: Average of recent highs and lows (or close prices)
- **Why it matters**: Shows center price range for equilibrium levels
- **Good signal**: Price above midpoint (bullish bias), below midpoint (bearish bias)
- **Bad signal**: Price oscillating around midpoint (balanced, no edge)
- **Use case**: Center line identification, mean-reversion levels

---
