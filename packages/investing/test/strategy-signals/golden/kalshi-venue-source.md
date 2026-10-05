# PyKalshi mapping fixture provenance

The raw fixture follows vendored `pykalshi/models.py:MarketModel`. Independent hand-reviewed YES quotes are 52/55 cents; NO quotes are 40/43 cents, deliberately not complements. The SDK assessment imports the actual Python model and serializes those quote values without credentials. A 3-contract YES BUY at 55 cents leaves 9,835 cents and 3 YES contracts from 10,000 cents. Missing quotes stay null.
