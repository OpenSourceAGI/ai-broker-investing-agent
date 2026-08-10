---
title: Debate Agents System 
icon: Users
---
# Multi-Agent Debate System - Agent Prompts

This document describes all agents in the multi-agent debate trading system, their roles, and how they contribute to investment analysis.

## System Architecture

The debate system uses a multi-stage analysis pipeline:

1. **Data Collection Phase**: Market, News, Sentiment, and Fundamentals Analysts
2. **Investment Debate Phase**: Bull vs Bear Researchers moderated by Research Manager
3. **Trading Decision**: Trader makes action decision
4. **Risk Management**: Conservative, Neutral, and Aggressive Risk Managers debate
5. **Final Decision**: Portfolio Manager and External Consultant validate

---

## Data Collection Agents

### Market Analyst

**Role**: Technical market analysis and indicator calculation

**Key Responsibilities**:

- Fetch OHLCV (Open, High, Low, Close, Volume) data
- Calculate technical indicators (RSI, MACD, Bollinger Bands, Moving Averages)
- Identify chart patterns and trends
- Assess momentum and volatility

**Tools Used**:

- `get_stock_data_tool`: Historical price data
- `get_technical_indicators_tool`: Technical analysis metrics

**Output**: Technical market report with actionable indicators and trend analysis

---

### News Analyst

**Role**: News sentiment analysis and event monitoring

**Version**: 2.0

**Key Responsibilities**:

- Search and analyze recent news articles about the stock
- Extract multilingual news from local markets
- Identify significant corporate events (earnings, M&A, regulatory)
- Assess sentiment and potential market impact

**Tools Used**:

- `tavily_search_tool`: Web search for news articles
- `get_multilingual_sentiment_search`: Local language news sources

**Output**: News sentiment report with key events, sentiment score, and market impact assessment

**Special Features**:

- Multilingual news analysis for international stocks
- Focus on local-language sources (e.g., Nikkei for Japanese stocks)
- Identifies "undiscovered" status based on coverage gaps

---

### Sentiment Analyst (Social Analyst)

**Role**: Social media and retail investor sentiment tracking

**Key Responsibilities**:

- Analyze social media discussions (StockTwits, Reddit, Twitter)
- Gauge retail investor sentiment
- Identify trending topics and concerns
- Detect sentiment shifts and momentum

**Tools Used**:

- `get_stocktwits_sentiment`: StockTwits message analysis
- Social media aggregation tools

**Output**: Social sentiment report with bullish/bearish ratio, trending topics, and sentiment trends

---

### Fundamentals Analyst

**Role**: Financial statement analysis and fundamental metrics calculation

**Version**: 2.5

**Key Responsibilities**:

- Analyze balance sheet, income statement, cash flow
- Calculate financial health score (Piotroski F-Score)
- Evaluate growth metrics
- Assess valuation ratios (P/E, PEG, P/B, EV/EBITDA)
- Check ADR status and analyst coverage
- Calculate liquidity metrics

**Tools Used**:

- `get_fundamental_data_tool`: Financial statements
- `calculate_liquidity_metrics`: Trading liquidity analysis
- `get_analyst_coverage`: Analyst coverage check

**Output**: Comprehensive DATA_BLOCK with:

- Financial Health Score (0-12 scale using Piotroski F-Score)
- Growth Score (0-6 scale)
- Valuation metrics
- Liquidity analysis
- ADR status
- Analyst coverage count

**Special Features**:

- Structured JSON output for programmatic validation
- Strict thesis compliance checking
- ADR detection to identify "discovered" vs "undiscovered" stocks

---

## Investment Debate Phase

### Bull Researcher

**Role**: Advocate for BUY opportunities with data-driven optimism

**Version**: 2.3

**Thesis Compliance Criteria**:

- Financial health ≥7/12 (preferably ≥8/12 for strong conviction)
- Growth score ≥3/6 (preferably ≥4/6 for strong conviction)
- US revenue <25% (or <35% if ≥30% undervalued + ≥3 catalysts)
- **P/E ≤18 OR (P/E 18-25 with PEG ≤1.2)**
- Liquidity >$250k daily average (>$100k for small caps)
- Analyst coverage <6 US/English analysts
- **No US ADR listing** (maintains "undiscovered" status)

**Key Responsibilities**:

- Build strongest case for upside potential
- Identify catalysts that could drive price higher
- Counter bearish concerns with evidence
- Present best-case scenarios backed by data
- Acknowledge thesis compliance boundaries

**Output Structure**:

1. **Thesis Compliance Check**: List passing/failing criteria
2. **Bull Case Summary**: 2-3 strongest arguments with specific data
3. **Counter to Bear Concerns**: Direct responses with evidence
4. **Catalysts**: Specific events/factors for upside
5. **Conviction**: High/Medium/Low
6. **Recommendation**: BUY/HOLD with reasoning

**Example Output**:
\`\`\`
THESIS COMPLIANCE:
✓ Financial Health: 9/12 (≥7 required)
✓ Growth Score: 4/6 (≥3 required)
✓ P/E: 16 (≤18 threshold)
✓ ADR Status: None (undiscovered)
✓ Analyst Coverage: 3 (<6 required)

BULL CASE SUMMARY:
With a P/E of 16 (well below the 18 threshold) and ROE of 18%,
this company offers compelling value. The undiscovered status
(only 3 US analysts) combined with strong growth catalysts...

CONVICTION: High
RECOMMENDATION: BUY
\`\`\`

---

### Bear Researcher

**Role**: Identify risks and thesis violations with rigorous analysis

**Version**: 2.4

**Focus Areas**:

**Quantitative Hard Fails**:

- Financial health <7/12
- Growth score <3/6
- US revenue >35%
- **P/E >18 without PEG ≤1.2**
- **P/E >25** (always overvalued)
- Liquidity <$100k daily average
- Analyst coverage ≥6 US/English analysts
- **ADR exists** on NYSE/NASDAQ/OTC

**Qualitative Risks**:

- Technological lag (e.g., legacy automaker late to EVs)
- Eroding competitive moat
- Cyclical peak risk
- Jurisdiction risks (authoritarian governments, capital controls)
- Growth story mismatch
- Market saturation/oversupply

**Key Responsibilities**:

- Flag thesis violations explicitly with exact numbers
- Identify structural headwinds
- Challenge bullish arguments
- Present worst-case scenarios with data
- Detect cognitive biases in analysis

**Output Structure**:

1. **Bear Case Summary**: Start with thesis violations, then 2-3 strongest risks
2. **Counter to Bull Arguments**: Direct rebuttals with evidence
3. **Key Risks**:
   - Thesis Violations
   - Qualitative Risks
   - Quantitative Concerns
4. **Conviction**: High/Medium/Low
5. **Recommendation**: SELL/HOLD with reasoning

**Example Output**:
\`\`\`
BEAR CASE SUMMARY:
This stock violates the thesis on valuation: P/E is 22
(vs. threshold of 18) with PEG of 1.5 (above 1.2 threshold).
Additionally, the company has an ADR (TICKER: XYZ) on NYSE,
violating the undiscovered criterion...

KEY RISKS:

- Thesis Violations: P/E=22 (>18), ADR exists, Analyst coverage=8 (>6)
- Qualitative Risks: Cyclical Peak, Eroding Moat
- Quantitative Concerns: High leverage, Declining margins

CONVICTION: High
RECOMMENDATION: SELL
\`\`\`

---

### Research Manager

**Role**: Judge the Bull vs Bear debate and make BUY/HOLD/SELL decision

**Version**: 2.2

**Key Responsibilities**:

- Synthesize Bull and Bear arguments
- Evaluate evidence quality and logic
- Check thesis compliance against DATA_BLOCK
- Make final investment recommendation
- Provide confidence level and reasoning

**Decision Framework**:

- **BUY**: Thesis compliance ≥80%, strong catalysts, Bull case stronger
- **HOLD**: 60-79% thesis compliance or balanced arguments
- **SELL**: Hard thesis violations, Bear case stronger, high risks

**Output Structure**:

1. **Summary of Debate**: Key points from both sides
2. **Thesis Compliance Assessment**: Percentage score
3. **Decision**: BUY/HOLD/SELL
4. **Confidence**: High/Medium/Low
5. **Reasoning**: Why this decision, which arguments were more compelling

---

## Trading Decision

### Trader

**Role**: Convert research recommendation into actionable trade plan

**Key Responsibilities**:

- Translate BUY/HOLD/SELL into specific actions
- Consider market conditions and timing
- Recommend entry/exit points
- Suggest position sizing based on confidence
- Plan risk management (stop-loss, take-profit)

**Output**: Trading plan with action, timing, position size, and risk parameters

---

## Risk Management Debate

### Conservative Debator (Safe Analyst)

**Role**: Advocate for minimal risk exposure

**Key Responsibilities**:

- Emphasize downside protection
- Recommend smaller position sizes
- Suggest tight stop-losses
- Highlight worst-case scenarios
- Prioritize capital preservation

---

### Neutral Debator (Neutral Analyst)

**Role**: Balanced risk perspective

**Key Responsibilities**:

- Weigh risk vs reward objectively
- Recommend moderate position sizes
- Balance upside and downside scenarios
- Suggest standard risk management practices

---

### Aggressive Debator (Risky Analyst)

**Role**: Argue for higher risk for higher returns

**Key Responsibilities**:

- Emphasize upside potential
- Recommend larger position sizes
- Focus on conviction rather than caution
- Highlight asymmetric risk/reward favoring upside

---

## Final Validation

### Portfolio Manager

**Role**: Final gatekeeper for investment decisions

**Version**: 2.3

**Key Responsibilities**:

- **Hard veto** on thesis violations (P/E>25, ADR exists, coverage≥6)
- Validate thesis compliance with exact numbers from DATA_BLOCK
- Assess portfolio fit and diversification
- Enforce risk limits
- Make final GO/NO-GO decision

**Veto Powers**:

- Automatic REJECT if P/E >25
- Automatic REJECT if ADR exists on US exchange
- Automatic REJECT if analyst coverage ≥6
- Automatic REJECT if financial health <7 or growth <3

**Output**: Final decision with enforcement of thesis boundaries

---

### External Consultant

**Role**: Independent validation and bias detection

**Version**: 1.0

**Key Responsibilities**:

1. **Fact-Check Source Data**: Cross-reference claims against DATA_BLOCK
2. **Detect Cognitive Biases**:
   - Confirmation bias
   - Anchoring bias
   - Recency bias
   - Groupthink
   - Survivorship bias
3. **Challenge the Synthesis**: Review Research Manager's logic

**Output Structure**:
\`\`\`
CONSULTANT REVIEW: [APPROVED / CONDITIONAL APPROVAL / MAJOR CONCERNS]

SECTION 1: FACTUAL VERIFICATION
Status: [✓ FACTS VERIFIED / ✗ ERRORS FOUND]

SECTION 2: BIAS DETECTION
Status: [✓ NO BIASES / ⚠ BIASES IDENTIFIED]
Detected Biases:

- [Bias Type]: [Evidence and Impact]

SECTION 3: SYNTHESIS EVALUATION
Research Manager Recommendation: [BUY/HOLD/REJECT]
Consultant Assessment: [✓ AGREE / ✗ DISAGREE / ⚠ RESERVATIONS]

FINAL CONSULTANT VERDICT: [Overall assessment]
\`\`\`

**Special Features**:

- Uses different AI model (OpenAI) to cross-validate Gemini outputs
- Independent of organizational biases
- Focus on material issues that could change decision

---

## Investment Thesis Summary

The multi-agent system enforces a **value-to-growth ex-US equities** thesis:

**Core Criteria**:

- **Valuation**: P/E ≤18 ideal, 18-25 acceptable if PEG≤1.2, >25 rejected
- **Quality**: Financial health ≥7/12, Growth ≥3/6
- **Geography**: US revenue <25-35%, no ADR listing
- **Discovery**: Analyst coverage <6, low liquidity acceptable for small caps
- **Accessibility**: IBKR-accessible jurisdictions

**Emphasized Attributes**:

- Undervaluation >25%
- ROE ≥15%
- FCF yield ≥4%
- Local non-English catalysts

This thesis ensures the system focuses on undiscovered, high-quality value opportunities in international markets.

---

## Usage Examples

### Example 1: Basic Analysis

\`\`\`bash
curl -X POST http://localhost:3000/api/groq-debate 
  -H "Content-Type: application/json" 
  -d '{
    "symbol": "AAPL"
  }'
\`\`\`

### Example 2: Extended Debate

\`\`\`bash
curl -X POST http://localhost:3000/api/groq-debate 
  -H "Content-Type: application/json" 
  -d '{
    "symbol": "TSLA",
    "date": "2024-12-19",
    "max_debate_rounds": 3,
    "llm_provider": "groq"
  }'
\`\`\`

### Example 3: Custom Models

\`\`\`bash
curl -X POST http://localhost:3000/api/groq-debate 
  -H "Content-Type: application/json" 
  -d '{
    "symbol": "NVDA",
    "llm_provider": "anthropic",
    "deep_think_llm": "claude-3-5-sonnet-20241022",
    "quick_think_llm": "claude-3-5-haiku-20241022"
  }'
\`\`\`

### Example 4: JavaScript/TypeScript

\`\`\`typescript
async function analyzeStock(symbol: string) {
  const response = await fetch('/api/groq-debate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      symbol,
      date: new Date().toISOString().split('T')[0],
      max_debate_rounds: 2
    })
  })

  const result = await response.json()

  if (result.success) {
    console.log('Bull Arguments:', result.analysis.bull_arguments)
    console.log('Bear Arguments:', result.analysis.bear_arguments)
    console.log('Final Decision:', result.analysis.final_decision)
    console.log('Confidence:', result.analysis.confidence_level)
    console.log('Reasoning:', result.analysis.reasoning)
  }

  return result
}

// Usage
const analysis = await analyzeStock('AAPL')
\`\`\`

---

## Response Format

\`\`\`json
{
  "success": true,
  "symbol": "AAPL",
  "date": "2024-12-19",
  "analysis": {
    "bull_arguments": [
      "Strong fundamentals with 15% YoY revenue growth",
      "Leading market position in premium smartphones",
      "Services revenue growing 20% annually"
    ],
    "bear_arguments": [
      "P/E ratio of 28 above historical average",
      "iPhone revenue slowing in key markets",
      "Regulatory pressure in EU and China"
    ],
    "final_decision": "BUY",
    "confidence_level": "Medium-High",
    "reasoning": "Bull case stronger based on fundamentals...",
    "risk_assessment": "Medium risk with controlled position sizing",
    "thesis_compliance": {
      "financial_health": "9/12",
      "growth_score": "4/6",
      "pe_ratio": 28,
      "adr_status": "NYSE: AAPL",
      "analyst_coverage": 45,
      "compliance_percentage": 45
    }
  },
  "debate_history": [
    {
      "agent": "bull_researcher",
      "message": "...",
      "timestamp": "2024-12-19T10:00:00Z"
    }
  ],
  "metadata": {
    "llm_provider": "groq",
    "deep_think_model": "llama-3.3-70b-versatile",
    "quick_think_model": "llama-3.1-8b-instant",
    "debate_rounds": 2,
    "total_tokens": 15420,
    "execution_time_ms": 8500
  }
}
\`\`\`

---

## Agent Versions

- **Bull Researcher**: v2.3
- **Bear Researcher**: v2.4
- **Research Manager**: v2.2
- **Portfolio Manager**: v2.3
- **Fundamentals Analyst**: v2.5
- **News Analyst**: v2.0
- **External Consultant**: v1.0

All agents updated to align with the value-to-growth ex-US equities thesis with explicit P/E thresholds and ADR violation detection.
