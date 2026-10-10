"""Assessment-only reference runner. Executes original AST function definitions, never the TS implementation.

Run in the staged ai-hedge-fund assessment workspace with pinned pandas/numpy.
The vendored source is read-only. This runner is not imported by production code.
"""
import ast
import json
import math
from pathlib import Path
import pandas as pd
import numpy as np

path = Path('src/agents/technicals.py')
tree = ast.parse(path.read_text())
functions = [n for n in tree.body if isinstance(n, ast.FunctionDef) and (n.name.startswith('calculate_') or n.name in ('safe_float', 'weighted_signal_combination'))]
ns = {'math': math, 'pd': pd, 'np': np}
exec(compile(ast.Module(body=functions, type_ignores=[]), str(path), 'exec'), ns)

def clean(value):
    if isinstance(value, dict): return {k: clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)): return [clean(v) for v in value]
    if isinstance(value, (float, np.floating)): return float(value) if np.isfinite(value) else None
    return value

cases = []
for case in ('up', 'down', 'flat', 'short', 'oscillating'):
    bars = []
    for i in range(8 if case == 'short' else 160):
        close = 100 + i * .6 + math.sin(i * .31) * 1.5 if case == 'up' else 220 - i * .6 + math.sin(i * .31) * 1.5 if case == 'down' else 100 if case == 'flat' else 100 + math.sin(i * .71) * 8
        bars.append({'date': (pd.Timestamp('2026-01-01') + pd.Timedelta(days=i)).strftime('%Y-%m-%d'), 'open': close, 'high': close + 1, 'low': close - 1, 'close': close, 'volume': 1000 + i * 20})
    df = pd.DataFrame(bars).set_index('date')
    groups = {k: ns['calculate_' + fn + '_signals'](df.copy()) for k, fn in [('trend', 'trend'), ('mean_reversion', 'mean_reversion'), ('momentum', 'momentum'), ('volatility', 'volatility'), ('stat_arb', 'stat_arb')]}
    combined = ns['weighted_signal_combination'](groups, {'trend': .25, 'mean_reversion': .20, 'momentum': .25, 'volatility': .15, 'stat_arb': .15})
    upper, lower = ns['calculate_bollinger_bands'](df)
    helpers = {'rsi14': ns['calculate_rsi'](df).iloc[-1], 'ema8': ns['calculate_ema'](df, 8).iloc[-1], 'bbUpper': upper.iloc[-1], 'bbLower': lower.iloc[-1], 'atr14': ns['calculate_atr'](df).iloc[-1], 'adx14': ns['calculate_adx'](df.copy())['adx'].iloc[-1], 'hurst': ns['calculate_hurst_exponent'](df['close'])}
    cases.append(clean({'name': case, 'bars': bars, 'groups': groups, 'combined': combined, 'helpers': helpers}))
Path('/work/hedge-fund-technicals-reference.json').write_text(json.dumps({'pandas': pd.__version__, 'numpy': np.__version__, 'cases': cases}, indent=2) + '\n')
print(json.dumps([{'name': c['name'], 'combined': c['combined'], 'hurst': c['helpers']['hurst']} for c in cases]))
