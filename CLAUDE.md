# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build      # bundle main.jsx → public/app.js
npm run build:min  # same, minified
npm run dev        # watch mode (rebuilds on save)
npm run serve      # static file server for public/
```

There are no tests configured (`npm test` is a placeholder).

## Architecture

This is a **single-page React app** for simulating German income tax policy (§32a EStG). All application logic lives in one file: `tax-simulator-v3-de.jsx` (~595 lines). The entry point `main.jsx` simply renders the root component into `#root`.

### Data Pipeline

1. **Real data**: 17 income brackets from Destatis 2021 tax statistics (47.1M taxpayers, hardcoded as `INCOME_BRACKETS`).
2. **Synthetic generation**: 6,000–8,000 synthetic taxpayer income points are generated from the bracket data using power-law distributions (`SYNTHETIC_TAXPAYERS`). Pareto distribution is used for the top earner bracket (€1M+).
3. **Calibration** (`CALIBRATED_K`): A per-bracket deduction constant `k` is found via binary search so that applying the baseline tariff to synthetic data reproduces the 2021 actual tax revenue. This `k` converts gross income to taxable income (zvE) and stays fixed across simulations.

### Tax Computation

`computeTax(zvE, params)` implements the German 5-zone tariff:
- Zone 1: €0–Grundfreibetrag → 0%
- Zone 2: Grundfreibetrag–z2 → quadratic progression (entry rate ~14%)
- Zone 3: z2–z3 → quadratic progression (reaching 42%)
- Zone 4: z3–z4 → flat top rate (42%)
- Zone 5: z4+ → flat wealth surcharge rate (45%)

Zone boundary parameters and rates are all adjustable by the user via sliders.

### Simulation

`simulateAll(params)` applies `computeTax` to every synthetic taxpayer with the current slider parameters, then aggregates results by income bracket to compute revenue totals, tax shares, and average/marginal rates. The baseline (2021 law) is memoized and compared against the current scenario for the fiscal impact display.

### UI Structure

The component uses React `useState`/`useMemo` with no external state library. Key memoized values:
- `baseline` — result of `simulateAll` with default params (never changes)
- `sim` — result of `simulateAll` with current `params`
- `shareChart`, `rateCurve`, `marginalCurve` — chart-ready data derived from `sim`

UI sections are rendered as `<CollapsibleSection>` accordions. Charts use the `recharts` library. Sliders enforce constraints (minimum 500€ gap between zone boundaries, monotonically increasing rates).

### Dependencies

- `react` + `react-dom` (v19)
- `recharts` (charts)
- `esbuild` (bundler, dev only)
