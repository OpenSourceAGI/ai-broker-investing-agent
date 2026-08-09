---
title: Time-Series Correlations
icon: GitBranch
---

The most **correlated data factors to stock performance**—those most strongly linked to changes in stock prices—fall into several categories:

### Fundamental Factors

Core financial metrics of a company:

- **[Earnings per share (EPS)](https://www.investopedia.com/articles/basics/04/100804.asp) and Profitability**: Stock prices are highly sensitive to changes in earnings and profitability. EPS is a primary driver as it represents return to shareholders.
- **[Valuation multiples](https://www.investopedia.com/articles/basics/04/100804.asp) (e.g., P/E ratio)**: The price investors pay for each dollar of earnings strongly indicates stock performance. Changes in valuation multiples reflect shifts in investor sentiment about growth prospects or risk.
- **[Revenue growth and cash flow](https://www.investopedia.com/articles/basics/04/100804.asp)**: Sustained growth positively correlates with long-term stock appreciation.

### Macroeconomic Indicators

Broad economic data show strong correlations:

- **[Real GDP](https://digitalcommons.unl.edu/cgi/viewcontent.cgi?article=1293&context=honorstheses)**: Historical analysis shows very strong positive correlation between GDP growth and stock market performance, with R² of 0.9174.
- **[Consumer Price Index/Inflation](https://digitalcommons.unl.edu/cgi/viewcontent.cgi?article=1293&context=honorstheses)**: Stock prices often rise with inflation, though the relationship depends on interest rates and economic context. CPI had R² of 0.7597.
- **[Average Weekly Private Wages](https://digitalcommons.unl.edu/cgi/viewcontent.cgi?article=1293&context=honorstheses)**: Higher wages support consumer spending, corporate earnings, and stock prices (R² of 0.7045).
- **[Unemployment Rate](https://digitalcommons.unl.edu/cgi/viewcontent.cgi?article=1293&context=honorstheses)**: Weaker negative correlation with stock performance (R² of 0.2125), as lower unemployment supports economic growth.

### Technical and Market Factors

- **[Overall market and sector movement](https://www.cfm.com/bond-equity-correlations-beyond-the-benchmark/)**: Research suggests up to 90% of a stock's movement is explained by overall market and sector movement, rather than company-specific news.
- **[Liquidity and trading volume](https://www.investopedia.com/articles/basics/04/100804.asp)**: Highly liquid stocks are more responsive to news and trends, while illiquid stocks may be more volatile or discounted.
- **[Momentum and trends](https://caia.org/blog/2021/09/19/are-stock-markets-becoming-more-correlated)**: Stocks that performed well recently tend to continue performing well short-term.

### Market Sentiment and External Factors

- **[Investor sentiment](https://www.investopedia.com/articles/basics/04/100804.asp)**: News, social media, and market mood drive short-term price swings.
- **[Macroeconomic events](https://www.investopedia.com/articles/basics/04/100804.asp)**: Interest rates, inflation expectations, and geopolitical events trigger correlated moves across stocks and sectors.

### Correlations Among Stocks

- **[Index and sector correlations](https://www.investopedia.com/ask/answers/021716/how-does-correlation-affect-stock-market.asp)**: Stocks within the same index or sector move together due to shared economic drivers or investor behavior.
- **[Global market correlations](https://caia.org/blog/2021/09/19/are-stock-markets-becoming-more-correlated)**: US and European stocks are more highly correlated with each other than with Asian stocks, reflecting economic ties and trading hours overlap.

### Summary Table: Most Correlated Factors

| Factor                 | Correlation Strength | Notes                                    |
| ---------------------- | -------------------- | ---------------------------------------- |
| Real GDP               | Very High            | R² ≈ 0.92 with S&P 500                   |
| CPI/Inflation          | High                 | R² ≈ 0.76 with S&P 500                   |
| Average Wages          | High                 | R² ≈ 0.70 with S&P 500                   |
| Market/Sector Movement | Very High            | Explains majority of stock movement      |
| Company Earnings/EPS   | High                 | Direct impact on valuation               |
| P/E Ratio              | High                 | Reflects investor sentiment/expectations |
| Unemployment Rate      | Low/Negative         | R² ≈ 0.21 with S&P 500                   |
| Momentum               | Moderate-High        | Especially during market bubbles         |

**In practice, [combining these factors](https://www.investopedia.com/articles/basics/04/100804.asp)—especially macroeconomic indicators, earnings data, and market/sector trends—provides the most robust correlation with stock performance.** Alternative data (like job postings or news sentiment) can add value for short-term or event-driven strategies, but the most statistically significant correlations remain with [traditional fundamental and macroeconomic indicators](https://digitalcommons.unl.edu/cgi/viewcontent.cgi?article=1293&context=honorstheses).

## Best XGBoost Parameters

XGBoost offers a wide array of parameters, which can be grouped into three main categories: general parameters, booster parameters, and learning task parameters. Below is a structured summary of the most important and commonly tuned parameters for optimal model performance.

---

**General Parameters**

- **booster**: Type of model to run at each iteration. Options are `gbtree` (default), `gblinear`, or `dart`.
- **device**: Specify computation device (`cpu` or `cuda` for GPU acceleration).
- **verbosity**: Controls the amount of messages printed. Range: 0 (silent) to 3 (debug).
- **nthread**: Number of parallel threads used for running XGBoost.

---

**Tree Booster Parameters (for `gbtree` and `dart`)**

| Parameter           | Default | Description                                                                                              | Typical Range    |
| :------------------ | :------ | :------------------------------------------------------------------------------------------------------- | :--------------- |
| eta (learning_rate) | 0.3     | Step size shrinkage to prevent overfitting. Lower values make learning slower but safer.                 | [0.01, 0.3]      |
| gamma               | 0       | Minimum loss reduction required to make a split. Higher values make the algorithm more conservative.     | [0, ∞)           |
| max_depth           | 6       | Maximum depth of a tree. Larger values increase model complexity and risk of overfitting.                |                  |
| min_child_weight    | 1       | Minimum sum of instance weight (hessian) in a child. Higher values make the algorithm more conservative. |                  |
| subsample           | 1       | Fraction of training samples used per tree. Reduces overfitting.                                         | (0.5, 1]         |
| colsample_bytree    | 1       | Fraction of features used per tree.                                                                      | (0.5, 1]         |
| colsample_bylevel   | 1       | Fraction of features used per tree level.                                                                | (0.5, 1]         |
| colsample_bynode    | 1       | Fraction of features used per split.                                                                     | (0.5, 1]         |
| lambda (reg_lambda) | 1       | L2 regularization term on weights.                                                                       | [0, ∞)           |
| alpha (reg_alpha)   | 0       | L1 regularization term on weights.                                                                       | [0, ∞)           |
| tree_method         | auto    | Algorithm for constructing trees: `auto`, `exact`, `approx`, `hist`, `gpu_hist`.                         |                  |
| scale_pos_weight    | 1       | Controls balance of positive/negative weights for unbalanced classification.                             | [1, \#neg/\#pos] |

### Typical Ranges for Key Parameters

| Parameter        | Typical Range |
| :--------------- | :------------ |
| eta              | 0.01 – 0.3    |
| max_leaves       | 16 – 256      |
| colsample_bytree | 0.5 – 1.0     |
| subsample        | 0.5 – 1.0     |
| alpha/lambda     | 0 – 10        |
| min_child_weight | 1 – 10        |

### Why These Parameters Work Well

- **colsample_bytree/colsample_bylevel**: Subsampling features helps reduce overfitting, especially in high-dimensional data.
- **alpha/lambda**: Regularization terms are crucial for controlling model complexity and preventing overfitting, especially with many trees or deep trees.
- **tree_method: 'approx' \& grow_policy: 'lossguide'**: This combination enables efficient training on large datasets, and `lossguide` allows you to control complexity via `max_leaves` instead of `max_depth` .
- **max_leaves**: Directly limits the number of terminal nodes, which is effective for large or sparse datasets.
- **eta**: A moderate learning rate of 0.25 is a reasonable starting point; you can lower it (e.g., 0.05–0.1) for more conservative learning and increase `nrounds` if needed .
- **subsample**: High subsampling (0.95) allows nearly all data to be used but still adds some randomness for regularization.
- **early_stopping_rounds**: Prevents unnecessary training if validation error stops improving.
