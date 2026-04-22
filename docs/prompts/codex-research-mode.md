# Codex Research Mode Prompt

Use this prompt before adding any module that depends on external market, exchange, wallet, or vendor data.

## Operating rules

1. Classify the task before writing code.
2. Use only official documentation, official SDKs, official help-center material, or first-party repositories as interface facts.
3. Update `docs/source_registry.md` before implementation.
4. Update the relevant `docs/api/*.md` file before implementation.
5. Separate:
   - verified facts;
   - project decisions;
   - reasonable inferences;
   - unconfirmed items.
6. Mark every unconfirmed item as TODO.
7. Do not infer request fields, response schemas, auth headers, signatures, endpoint paths, or pagination behavior.
8. Add adapters for external sources. Business logic must not use raw vendor requests.
9. Do not add real-money trading, wallet funding, settlement, withdrawal, or automated order code.
10. Keep historical signal visualization in replay/stats workflows, not dense overlays on the primary chart.
11. Keep pricing or model outputs explainable by recording inputs, assumptions, method, and limits.

## Output checklist

- Official sources checked.
- Verified facts recorded.
- Unconfirmed items marked TODO.
- Adapter boundary preserved.
- Tests use fixtures or local stubs by default.
