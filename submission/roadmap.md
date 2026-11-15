# Limitations and roadmap

We state the limitations openly:

- Crew data is simulated. Real sensor or medical device data can already be imported (CSV/JSON, column mapping, unit conversion) and replaces the simulation in its time range.
- There is no authentication yet. Every action already goes through one server RPC layer, where checks would be added.
- The assistant is offline and rule-based. A language model would connect through the server so the key never reaches the browser.
- Some thresholds are Health Atlas rules (no threshold in the source). A flight surgeon would set them; each band's basis is shown in the app.
- Delayed contact with the flight surgeon is simulated. Delay and blackout logic is in the engine.
- It does not diagnose. It is a decision-support prototype.

Tests: 463 unit and component tests (Vitest) and 111 end-to-end tests (Playwright, including axe accessibility scans); all passed in the last run (14 November 2026).

Next steps:

1. A pilot in a NASA analog mission such as HERA or CHAPEA.
2. Validation with real sensor data, with thresholds set by a flight surgeon.
3. A security audit and medical software approval.
