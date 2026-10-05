# Survival-state provenance

Vendored `core/survival/SurvivalManager.js` blob at b877b41: `16ecbf7a2d87c67e2d12313b9413eb1dd166e746`. Original SurvivalManager class was run with the golden balance sequence through `assess.sh`, offline, using Node 22 slim (`sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c`). Its observed states are stored in the golden JSON. No TypeScript implementation generated these expectations. This was a component simulation with the real upstream class/event bus, not a live trading agent run.

The state-machine implementation is independent because the ISC package metadata does not include a complete notice. It preserves code behavior at equality: growth >=1.20, critical <=0.50, defensive <=0.85, recovery from Defensive only above0.70, and Recovery persists below1.0 except where an earlier branch applies. Three-tick hysteresis is the default; Critical is immediate.

The numeric multipliers (Growth/Survival1, Recovery0.75, Defensive0.5, Critical0) are new, approved demo policy. They are tested as policy and are not claimed to come from upstream. The common gate always permits validated exits irrespective of entry posture.
