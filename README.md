# 🇩🇪 Einkommensteuer Simulator

Interactive simulator for German income tax policy (§32a EStG). Adjust tax bracket parameters and instantly see the fiscal impact based on real Destatis 2021 statistics.

**[Live demo →](https://ihsoyct.github.io/german-tax-sim)**

## What it does

- Models the German 5-zone income tax system with adjustable zone boundaries and rates
- Simulates fiscal impact across 47.1 million taxpayers using Destatis 2021 data
- Shows tax burden distribution, marginal rates, and average rates under any scenario
- Compares new tariff against 2021 baseline in real time

## Data & Methodology

Real aggregate data from [Destatis Lohn- und Einkommensteuerstatistik 2021](https://www.destatis.de) (17 income brackets). Since individual taxable income (zvE) is not published, a per-bracket deduction constant `k` is calibrated via binary search against actual 2021 tax revenue. This `k` stays fixed when simulating alternative tariffs — the assumption being that deductions don't change with bracket boundaries.

6,000–8,000 synthetic income points are generated from the bracket data (power-law distribution, Pareto for top earners) to enable smooth rate curves and detailed group breakdowns.

**Limitations:** static simulation — no behavioural effects, no Ehegattensplitting modelling.

## Development

```bash
npm install
npm run dev       # watch mode → public/app.js
npm run serve     # static file server for public/
```

```bash
npm run build     # production bundle
npm run build:min # minified production bundle
```

## Stack

- React 19 + esbuild
- Recharts for visualisations
- No backend — runs entirely in the browser
