import { useState, useMemo, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, LineChart, Line, AreaChart, Area, ReferenceLine } from "recharts";

const RAW_BRACKETS = [
  { lo: 0, hi: 5000, taxpayers: 4820115, totalIncome: 7480434000, totalTax: 388099000 },
  { lo: 5000, hi: 10000, taxpayers: 2353352, totalIncome: 17851525000, totalTax: 483628000 },
  { lo: 10000, hi: 15000, taxpayers: 3155869, totalIncome: 39902164000, totalTax: 1021645000 },
  { lo: 15000, hi: 20000, taxpayers: 3594246, totalIncome: 62692463000, totalTax: 2920989000 },
  { lo: 20000, hi: 25000, taxpayers: 3333587, totalIncome: 75016710000, totalTax: 4993263000 },
  { lo: 25000, hi: 30000, taxpayers: 3329026, totalIncome: 91472829000, totalTax: 7430891000 },
  { lo: 30000, hi: 35000, taxpayers: 3094180, totalIncome: 100440834000, totalTax: 9963954000 },
  { lo: 35000, hi: 40000, taxpayers: 2794992, totalIncome: 104647140000, totalTax: 12127197000 },
  { lo: 40000, hi: 45000, taxpayers: 2395727, totalIncome: 101619120000, totalTax: 12996609000 },
  { lo: 45000, hi: 50000, taxpayers: 1985854, totalIncome: 94193859000, totalTax: 12881294000 },
  { lo: 50000, hi: 60000, taxpayers: 3044466, totalIncome: 166523902000, totalTax: 24697749000 },
  { lo: 60000, hi: 70000, taxpayers: 2147178, totalIncome: 139003998000, totalTax: 22473103000 },
  { lo: 70000, hi: 125000, taxpayers: 4951807, totalIncome: 448444143000, totalTax: 85981831000 },
  { lo: 125000, hi: 250000, taxpayers: 1607958, totalIncome: 262642612000, totalTax: 68248810000 },
  { lo: 250000, hi: 500000, taxpayers: 321834, totalIncome: 107367770000, totalTax: 34853749000 },
  { lo: 500000, hi: 1000000, taxpayers: 83268, totalIncome: 55537482000, totalTax: 19665687000 },
  { lo: 1000000, hi: Infinity, taxpayers: 34509, totalIncome: 98259228000, totalTax: 35461945000 },
];

// Width-scaled synthetic taxpayer generation
const { all: SYNTHETIC_TAXPAYERS, byBracket: SYNTHETIC_BY_BRACKET } = (() => {
  const all = [];
  const byBracket = RAW_BRACKETS.map(() => []);
  const BASE_PTS = 300, BASE_WIDTH = 5000;
  for (let bi = 0; bi < RAW_BRACKETS.length; bi++) {
    const b = RAW_BRACKETS[bi];
    const avg = b.totalIncome / b.taxpayers;
    const width = Number.isFinite(b.hi) ? b.hi - b.lo : BASE_WIDTH;
    const nPts = Math.max(BASE_PTS, Math.round(BASE_PTS * width / BASE_WIDTH));
    const taxpayersPerPoint = b.taxpayers / nPts;
    const push = (income) => { const pt = { income, weight: taxpayersPerPoint, bi }; all.push(pt); byBracket[bi].push(pt); };
    if (!Number.isFinite(b.hi)) {
      const alpha = avg / (avg - b.lo);
      for (let i = 0; i < nPts; i++) { const u = (i + 0.5) / nPts; push(Math.min(b.lo / Math.pow(1 - u, 1 / alpha), 50_000_000)); }
      continue;
    }
    const relAvg = (avg - b.lo) / width;
    const shape = Math.log(0.5) / Math.log(Math.max(0.05, Math.min(0.95, relAvg)));
    for (let i = 0; i < nPts; i++) { const u = (i + 0.5) / nPts; push(Math.max(b.lo, Math.min(b.lo + Math.pow(u, shape) * width, b.hi - 1))); }
  }
  return { all, byBracket };
})();

const TOTAL_TAXPAYERS = RAW_BRACKETS.reduce((s, b) => s + b.taxpayers, 0);

const DISPLAY_MAX = 200000;
const N_HIST_BINS = 200;
const INCOME_HISTOGRAM = (() => {
  const binWidth = DISPLAY_MAX / N_HIST_BINS;
  const counts = new Float64Array(N_HIST_BINS);
  for (const tp of SYNTHETIC_TAXPAYERS) {
    if (tp.income >= DISPLAY_MAX) continue;
    counts[Math.min(N_HIST_BINS - 1, Math.floor(tp.income / binWidth))] += tp.weight;
  }
  return Array.from({ length: N_HIST_BINS }, (_, i) => ({ income: Math.round((i + 0.5) * binWidth), count: counts[i] / binWidth }));
})();

function deriveFullParams(p) {
  const entryRate = p.zone2B / 10000;
  const y_top = (p.zone2End - p.grundfreibetrag) / 10000;
  const z_top = (p.zone3End - p.zone2End) / 10000;
  const origMidRate = (2 * 995.21 * ((14753 - 9744) / 10000) + 1400) / 10000;
  const midFraction = (origMidRate - 0.14) / (0.42 - 0.14);
  const midRate = p.midRateTarget != null ? p.midRateTarget : entryRate + midFraction * (p.zone4Rate - entryRate);
  const b2 = p.zone2B;
  const a2 = y_top > 0 ? (midRate * 10000 - b2) / (2 * y_top) : 995.21;
  const b3 = midRate * 10000;
  const a3 = z_top > 0 ? (p.zone4Rate * 10000 - b3) / (2 * z_top) : 208.85;
  const taxAtZone2End = (a2 * y_top + b2) * y_top;
  const zone3C = taxAtZone2End;
  const taxAtZone3End = (a3 * z_top + b3) * z_top + zone3C;
  const zone4Sub = p.zone4Rate * p.zone3End - taxAtZone3End;
  const taxAtZone4End = p.zone4Rate * p.zone4End - zone4Sub;
  const zone5Sub = p.zone5Rate * p.zone4End - taxAtZone4End;
  return { zone2A: a2, zone2B: b2, zone3A: a3, zone3B: b3, zone3C, zone4Sub, zone5Sub, midRate, entryRate };
}

function computeTax(zvE, p) {
  const x = Math.floor(zvE);
  const d = deriveFullParams(p);
  if (x <= p.grundfreibetrag) return 0;
  if (x <= p.zone2End) { const y = (x - p.grundfreibetrag) / 10000; return Math.floor((d.zone2A * y + d.zone2B) * y); }
  if (x <= p.zone3End) { const z = (x - p.zone2End) / 10000; return Math.floor((d.zone3A * z + d.zone3B) * z + d.zone3C); }
  if (x <= p.zone4End) return Math.floor(p.zone4Rate * x - d.zone4Sub);
  return Math.floor(p.zone5Rate * x - d.zone5Sub);
}

const DEFAULT_PARAMS = {
  grundfreibetrag: 9744, zone2End: 14753, zone2B: 1400,
  zone3End: 57918, zone4End: 274612, zone4Rate: 0.42, zone5Rate: 0.45, midRateTarget: null,
};

function bracketTaxGivenK(points, k, params) {
  let sum = 0;
  for (const tp of points) sum += Math.max(0, computeTax(Math.max(0, tp.income - k), params)) * tp.weight;
  return sum;
}

function solveKForBracket(b, points, params) {
  const target = b.totalTax;
  let lo = 0, hi = 500000;
  for (let i = 0; i < 40; i++) { if (bracketTaxGivenK(points, hi, params) <= target) break; hi *= 1.5; }
  for (let i = 0; i < 60; i++) { const mid = 0.5 * (lo + hi); bracketTaxGivenK(points, mid, params) > target ? lo = mid : hi = mid; }
  return 0.5 * (lo + hi);
}

const DISPLAY_GROUPS = [
  { name: "0 – 5k", lo: 0, hi: 5000, repIncome: 2500 },
  { name: "5 – 10k", lo: 5000, hi: 10000, repIncome: 7500 },
  { name: "10 – 15k", lo: 10000, hi: 15000, repIncome: 12500 },
  { name: "15 – 20k", lo: 15000, hi: 20000, repIncome: 17500 },
  { name: "20 – 25k", lo: 20000, hi: 25000, repIncome: 22500 },
  { name: "25 – 30k", lo: 25000, hi: 30000, repIncome: 27500 },
  { name: "30 – 35k", lo: 30000, hi: 35000, repIncome: 32500 },
  { name: "35 – 40k", lo: 35000, hi: 40000, repIncome: 37500 },
  { name: "40 – 45k", lo: 40000, hi: 45000, repIncome: 42500 },
  { name: "45 – 50k", lo: 45000, hi: 50000, repIncome: 47500 },
  { name: "50 – 60k", lo: 50000, hi: 60000, repIncome: 55000 },
  { name: "60 – 70k", lo: 60000, hi: 70000, repIncome: 65000 },
  { name: "70 – 125k", lo: 70000, hi: 125000, repIncome: 90000 },
  { name: "125 – 250k", lo: 125000, hi: 250000, repIncome: 165000 },
  { name: "250 – 500k", lo: 250000, hi: 500000, repIncome: 335000 },
  { name: "500k – 1M", lo: 500000, hi: 1000000, repIncome: 670000 },
  { name: "1M+", lo: 1000000, hi: Infinity, repIncome: 2850000 },
];

const SUMMARY_GROUPS = [
  { name: "Untere 50 %\n(unter €32k)", lo: 0, hi: 32000 },
  { name: "Mitte\n(€32k–90k)", lo: 32000, hi: 90000 },
  { name: "Obere\n(€90k–250k)", lo: 90000, hi: 250000 },
  { name: "Top 5 %\n(€250k+)", lo: 250000, hi: Infinity },
];

// k is solved once against DEFAULT_PARAMS to convert gross income → zvE.
// It stays fixed when simulating other tariffs — the deductions (Sonderausgaben etc.)
// don't change just because we move the bracket boundaries.
const CALIBRATED_K = RAW_BRACKETS.map((b, bi) => solveKForBracket(b, SYNTHETIC_BY_BRACKET[bi], DEFAULT_PARAMS));

function simulateAll(params) {
  const results = SYNTHETIC_TAXPAYERS.map((tp) => {
    const k = CALIBRATED_K[tp.bi] || 0;
    const base = Math.max(0, tp.income - k);
    return { ...tp, base, tax: Math.max(0, computeTax(base, params)) * tp.weight };
  });
  const totalTax = results.reduce((s, r) => s + r.tax, 0);
  const groupResults = (groups) => groups.map((g) => {
    const members = results.filter((r) => r.income >= g.lo && r.income < g.hi);
    const groupTax = members.reduce((s, r) => s + r.tax, 0);
    const groupTaxpayers = members.reduce((s, r) => s + r.weight, 0);
    const groupIncome = members.reduce((s, r) => s + r.income * r.weight, 0);
    return { name: g.name, lo: g.lo, hi: g.hi, taxpayers: Math.round(groupTaxpayers), totalIncome: groupIncome, totalTax: groupTax, share: totalTax > 0 ? (groupTax / totalTax) * 100 : 0, avgRate: groupIncome > 0 ? (groupTax / groupIncome) * 100 : 0 };
  });
  return { totalTax, displayGroups: groupResults(DISPLAY_GROUPS), summaryGroups: groupResults(SUMMARY_GROUPS) };
}

function fmt(n) {
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + " Mrd €";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + " Mio €";
  return Math.round(n).toLocaleString("de-DE") + " €";
}
function fmtPct(n) { return n.toFixed(1) + "%"; }
function fmtNum(n) { return Math.round(n).toLocaleString("de-DE"); }

const C = {
  bg: "#0a0d12", card: "#12161e", cardBorder: "#1c2230",
  accent: "#f0c930", accentDim: "#b89a2f", text: "#dfe1e6", textDim: "#6b7488",
  green: "#34d399", red: "#f87171", blue: "#60a5fa", purple: "#a78bfa", orange: "#fb923c",
  barA: "#3b82f6", barB: "#f0c930",
};

const th = { textAlign: "right", padding: "7px 10px", color: C.textDim, fontWeight: 500, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" };
const td = { textAlign: "right", padding: "7px 10px", whiteSpace: "nowrap" };

function Slider({ label, value, min, max, step, def, set, fmt: format }) {
  const changed = def !== null && Math.abs(value - def) > step * 0.5;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
        <label style={{ fontSize: 11, color: changed ? C.accent : C.textDim }}>{label}</label>
        <span style={{ fontSize: 12, fontWeight: 600, color: changed ? C.accent : C.text }}>{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(parseFloat(e.target.value))} style={{ width: "100%", accentColor: C.accent, cursor: "pointer" }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: C.textDim, marginTop: 1 }}>
        <span>{format(min)}</span>
        <span style={{ color: changed ? C.orange : "transparent" }}>Standard: {format(def)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}

function Btn({ onClick, children }) {
  return <button onClick={onClick} style={{ background: "transparent", border: `1px solid ${C.cardBorder}`, color: C.textDim, padding: "5px 10px", borderRadius: 5, cursor: "pointer", fontSize: 11 }}>{children}</button>;
}

function CollapsibleSection({ title, icon, isCollapsed, onToggle, children, isDark = true, style = {} }) {
  const bgColor = isDark ? C.card : "rgba(240,201,48,0.04)";
  const borderColor = isDark ? C.cardBorder : "rgba(240,201,48,0.15)";
  
  return (
    <div style={{ 
      background: bgColor, 
      border: `1px solid ${borderColor}`, 
      borderRadius: 10, 
      padding: "16px 20px", 
      marginBottom: 20,
      ...style
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={onToggle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
          <span style={{ fontSize: 16 }}>{icon}</span>
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: C.accent }}>{title}</h2>
        </div>
        <span style={{ fontSize: 20, color: C.textDim, transition: "transform 0.2s" }}>
          {isCollapsed ? "▶" : "▼"}
        </span>
      </div>
      {!isCollapsed && <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${borderColor}` }}>{children}</div>}
    </div>
  );
}

export default function TaxSimulator() {
  const [params, setParams] = useState({ ...DEFAULT_PARAMS });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [collapsed, setCollapsed] = useState({
    explainer: false,
    kExplainer: false,
    revenue: false,
    controls: false,
    summary: false,
    charts: false,
    detailed: false,
    methodology: false,
  });
  const baseline = useMemo(() => simulateAll(DEFAULT_PARAMS), []);
  const sim = useMemo(() => simulateAll(params), [params]);

  const updateParam = useCallback((key, val) => {
    setParams((p) => {
      const next = { ...p, [key]: val };
      const minGap = 500;
      if (next.grundfreibetrag + minGap > next.zone2End) next.zone2End = next.grundfreibetrag + minGap;
      if (next.zone2End + minGap > next.zone3End) next.zone3End = next.zone2End + minGap;
      if (next.zone3End + minGap > next.zone4End) next.zone4End = next.zone3End + minGap;
      if (next.zone4End - minGap < next.zone3End) next.zone3End = next.zone4End - minGap;
      if (next.zone3End - minGap < next.zone2End) next.zone2End = next.zone3End - minGap;
      if (next.zone2End - minGap < next.grundfreibetrag) next.grundfreibetrag = next.zone2End - minGap;
      if (next.zone5Rate < next.zone4Rate) next.zone5Rate = next.zone4Rate;
      return next;
    });
  }, []);

  const resetParams = useCallback(() => setParams({ ...DEFAULT_PARAMS }), []);

  const toggleCollapsed = useCallback((key) => {
    setCollapsed(c => ({ ...c, [key]: !c[key] }));
  }, []);

  const delta = sim.totalTax - baseline.totalTax;
  const deltaPct = baseline.totalTax > 0 ? (delta / baseline.totalTax) * 100 : 0;

  const shareChart = useMemo(() => DISPLAY_GROUPS.map((g, i) => ({
    name: g.name,
    "2021": +baseline.displayGroups[i].share.toFixed(2),
    "Neu": +sim.displayGroups[i].share.toFixed(2),
  })), [baseline, sim]);

  const rateCurve = useMemo(() => {
    const incomes = [0,5000,10000,15000,20000,25000,30000,35000,40000,45000,50000,55000,60000,65000,70000,80000,90000,100000,120000,150000,175000,200000,250000,275000,300000,350000,400000,500000,600000,750000,1000000];
    return incomes.map(inc => ({
      name: inc >= 1000 ? `${(inc / 1000).toFixed(0)}k` : "0",
      "2021 Rate": inc > 0 ? +((computeTax(inc, DEFAULT_PARAMS) / inc) * 100).toFixed(2) : 0,
      "Neue Rate": inc > 0 ? +((computeTax(inc, params) / inc) * 100).toFixed(2) : 0,
    }));
  }, [params]);

  const marginalCurve = useMemo(() => {
    const pts = [];
    for (let inc = 0; inc <= 400000; inc += 1000) {
      pts.push({
        name: inc >= 1000 ? `${(inc / 1000).toFixed(0)}k` : "0",
        "2021 Grenzsteuersatz": +((computeTax(inc + 1000, DEFAULT_PARAMS) - computeTax(inc, DEFAULT_PARAMS)) / 10).toFixed(2),
        "Neuer Grenzsteuersatz": +((computeTax(inc + 1000, params) - computeTax(inc, params)) / 10).toFixed(2),
      });
    }
    return pts;
  }, [params]);

  const font = "'SF Mono', 'JetBrains Mono', 'Fira Code', monospace";

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: font, padding: "20px 16px", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 26 }}>🇩🇪</span>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: C.accent, margin: 0 }}>Einkommensteuer Simulator</h1>
          </div>
          <p style={{ color: C.textDim, fontSize: 12, margin: "6px 0 0 0", lineHeight: 1.6 }}>
            Destatis 2021 · §32a EStG · {fmtNum(SYNTHETIC_TAXPAYERS.length)} synthetische Datenpunkte · {fmtNum(TOTAL_TAXPAYERS)} Steuerpflichtige
          </p>
        </div>

        {/* Zone Explainer */}
        <CollapsibleSection 
          title="So funktioniert die deutsche Einkommensteuer (§32a EStG)" 
          icon="📚"
          isCollapsed={collapsed.explainer} 
          onToggle={() => toggleCollapsed("explainer")}
          isDark={false}
        >
          <p style={{ margin: "0 0 10px 0", fontSize: 12, color: C.text, lineHeight: 1.75 }}>Deutschland verwendet <strong>5 Zonen</strong> — nur das Einkommen <em>innerhalb</em> jeder Zone wird zum jeweiligen Satz besteuert (Grenzbesteuerung). Die Gesamtsteuer ist die Summe über alle Zonen.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10, margin: "12px 0" }}>
            {[
              { color: C.green,   label: "Zone 1 — Grundfreibetrag",        desc: "€0 → €9.744: 0 % Steuer. Die ersten Euro sind für alle vollständig steuerfrei." },
              { color: C.blue,    label: "Zone 2 — Untere Progression",     desc: "€9.745 → €14.753: Grenzsteuersatz steigt gleichmäßig von 14 % auf ~24 % (quadratische Formel)." },
              { color: C.purple,  label: "Zone 3 — Obere Progression",      desc: "€14.754 → €57.918: Grenzsteuersatz steigt gleichmäßig von ~24 % auf 42 % (weitere Quadratformel)." },
              { color: C.orange,  label: "Zone 4 — Spitzensteuersatz",      desc: "€57.919 → €274.612: Pauschal 42 % auf jeden Euro in diesem Bereich." },
              { color: C.red,     label: "Zone 5 — Reichensteuer",          desc: "€274.613+: Pauschal 45 % auf jeden Euro oberhalb dieser Schwelle." },
            ].map(z => (
              <div key={z.label} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 6, padding: "10px 14px" }}>
                <div style={{ color: z.color, fontWeight: 700, marginBottom: 3 }}>{z.label}</div>
                <div style={{ fontSize: 11, color: C.textDim }}>{z.desc}</div>
              </div>
            ))}
          </div>
          <p style={{ margin: "10px 0 0 0", color: C.textDim, fontSize: 11 }}>
            <strong style={{ color: C.text }}>Beispiel:</strong> Jemand mit €80.000 Einkommen zahlt 0 % auf die ersten €9.744, dann stufenlos steigende Sätze auf die nächsten ~€48k, und 42 % nur auf den Teil von €57.919 bis €80.000. Der <em>durchschnittliche</em> Steuersatz beträgt dabei etwa 26 %.
          </p>
        </CollapsibleSection>

        {/* K Explainer */}
        <CollapsibleSection 
          title="Wie die Abzugskalibration (k) funktioniert" 
          icon="🔧"
          isCollapsed={collapsed.kExplainer} 
          onToggle={() => toggleCollapsed("kExplainer")}
          isDark={false}
          style={{ background: "rgba(96,165,250,0.04)", border: "1px solid rgba(96,165,250,0.15)" }}
        >
          <p style={{ margin: "0 0 10px 0", fontSize: 12, color: C.text, lineHeight: 1.75 }}>
            Destatis weist den Gesamtbetrag der Einkünfte aus, doch die Steuerformel arbeitet mit dem zu versteuernden Einkommen (<em>zvE</em> — nach Abzug von Sonderausgaben, Kinderfreibeträgen usw.). Da die individuellen Abzüge unbekannt sind, schätzen wir sie mit einer Kalibrationskonstante <strong style={{ color: C.accent }}>k</strong>.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10, margin: "12px 0" }}>
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 6, padding: "12px 14px" }}>
              <div style={{ color: C.blue, fontWeight: 700, marginBottom: 6 }}>Schritt 1 — Das Problem</div>
              <div style={{ fontSize: 11, color: C.textDim }}>
                Destatis sagt uns: Im Bracket €30–35k gab es 3,09 Mio. Steuerpflichtige, die zusammen €9,96 Mrd. Steuer zahlten. Setzen wir €32.500 direkt in die Steuerformel ein, erhalten wir ein falsches Ergebnis — denn €32.500 ist Bruttoeinkommen, nicht zvE.
              </div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 6, padding: "12px 14px" }}>
              <div style={{ color: C.blue, fontWeight: 700, marginBottom: 6 }}>Schritt 2 — k bestimmen</div>
              <div style={{ fontSize: 11, color: C.textDim }}>
                Per Binärsuche ermitteln wir eine Konstante <strong style={{ color: C.accent }}>k</strong>, sodass <code style={{ color: C.accent }}>∑ Steuer(Einkommen − k) = tatsächliche Steuer 2021</code> für alle synthetischen Steuerpflichtigen im Bracket gilt. Dieses k absorbiert alle individuell unbekannten Abzüge.
              </div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 6, padding: "12px 14px" }}>
              <div style={{ color: C.blue, fontWeight: 700, marginBottom: 6 }}>Schritt 3 — Auf neuen Tarif anwenden</div>
              <div style={{ fontSize: 11, color: C.textDim }}>
                Wenn Sie die Regler bewegen, bleibt k fest — wir nehmen an, dass sich Abzüge nicht ändern, nur weil sich die Tarifzonen verschieben. Dieselben Einkommen, minus dasselbe k, laufen nun durch den neuen Tarif. Die Differenz der Gesamtsteuer ergibt den Fiskaleffekt.
              </div>
            </div>
          </div>
          <p style={{ margin: "8px 0 0 0", color: C.textDim, fontSize: 11 }}>
            <strong style={{ color: C.text }}>Einschränkung:</strong> k wurde gegen den Tarif 2021 kalibriert und ist daher nahe der Baseline am genauesten. Bei sehr starken Tarifänderungen kann es zu Ungenauigkeiten kommen — Richtung und Größenordnung des Fiskaleffekts bleiben jedoch zuverlässig.
          </p>
        </CollapsibleSection>

        {/* Revenue Banner */}
        <div style={{ background: delta === 0 ? C.card : delta > 0 ? "rgba(52,211,153,0.06)" : "rgba(248,113,113,0.06)", border: `1px solid ${delta === 0 ? C.cardBorder : delta > 0 ? "rgba(52,211,153,0.2)" : "rgba(248,113,113,0.2)"}`, borderRadius: 10, padding: "14px 20px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
              Steueraufkommen – Veränderung

            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: delta === 0 ? C.textDim : delta > 0 ? C.green : C.red }}>
              {delta >= 0 ? "+" : ""}{fmt(delta)}
              <span style={{ fontSize: 13, marginLeft: 8, fontWeight: 500 }}>({delta >= 0 ? "+" : ""}{deltaPct.toFixed(1)}%)</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 28 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: C.textDim }}>2021 Simuliert</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{fmt(baseline.totalTax)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: C.textDim }}>Neuer Tarif</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.accent }}>{fmt(sim.totalTax)}</div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <CollapsibleSection 
          title="Steuerparameter" 
          icon="⚙"
          isCollapsed={collapsed.controls} 
          onToggle={() => toggleCollapsed("controls")}
        >
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginBottom: 14, gap: 6 }}>
            <Btn onClick={() => setShowAdvanced(!showAdvanced)}>{showAdvanced ? "Einfach" : "Erweitert"}</Btn>
            <Btn onClick={resetParams}>Zurücksetzen</Btn>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18 }}>
            <Slider label="Grundfreibetrag (0 %-Zone)" value={params.grundfreibetrag} min={0} max={30000} step={100} def={DEFAULT_PARAMS.grundfreibetrag} set={(v) => updateParam("grundfreibetrag", v)} fmt={(v) => `€${v.toLocaleString("de-DE")}`} />
            <Slider label="Zone 2 Ende (Untere Progression)" value={params.zone2End} min={5000} max={60000} step={100} def={DEFAULT_PARAMS.zone2End} set={(v) => updateParam("zone2End", v)} fmt={(v) => `€${v.toLocaleString("de-DE")}`} />
            <Slider label="Zone 3 Ende (Obere Progression)" value={params.zone3End} min={15000} max={150000} step={500} def={DEFAULT_PARAMS.zone3End} set={(v) => updateParam("zone3End", v)} fmt={(v) => `€${v.toLocaleString("de-DE")}`} />
            <Slider label="Spitzensteuersatz (42 %-Zone)" value={params.zone4Rate} min={0.25} max={0.55} step={0.005} def={DEFAULT_PARAMS.zone4Rate} set={(v) => updateParam("zone4Rate", v)} fmt={(v) => `${(v * 100).toFixed(1)}%`} />
            <Slider label="Reichensteuer-Schwelle" value={params.zone4End} min={60000} max={1000000} step={5000} def={DEFAULT_PARAMS.zone4End} set={(v) => updateParam("zone4End", v)} fmt={(v) => `€${v.toLocaleString("de-DE")}`} />
            <Slider label="Reichensteuersatz" value={params.zone5Rate} min={0.25} max={0.65} step={0.005} def={DEFAULT_PARAMS.zone5Rate} set={(v) => updateParam("zone5Rate", v)} fmt={(v) => `${(v * 100).toFixed(1)}%`} />
          </div>
          {showAdvanced && (
            <div style={{ marginTop: 18, paddingTop: 18, borderTop: `1px solid ${C.cardBorder}` }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
                <Slider label="Eingangssteuersatz (Zone 2 Beginn)" value={params.zone2B} min={500} max={2500} step={10} def={DEFAULT_PARAMS.zone2B} set={(v) => updateParam("zone2B", v)} fmt={(v) => `${(v / 100).toFixed(1)}%`} />
                <Slider label="Mittlerer Grenzsteuersatz (Zone 2→3)" value={params.midRateTarget ?? deriveFullParams(params).midRate} min={0.15} max={0.30} step={0.001} def={null} set={(v) => updateParam("midRateTarget", v)} fmt={(v) => (v * 100).toFixed(1) + "%"} />
              </div>
              {(() => {
                const d = deriveFullParams(params);
                return (
                  <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 4, fontSize: 10, color: C.textDim, fontFamily: "monospace" }}>
                    <span>Entry rate: {(d.entryRate * 100).toFixed(1)}%</span>
                    <span>Mid-rate: {(d.midRate * 100).toFixed(1)}%</span>
                    <span>Zone2A: {d.zone2A.toFixed(2)}</span>
                    <span>Zone3A: {d.zone3A.toFixed(2)}</span>
                    <span>zone3C: {d.zone3C.toFixed(0)}</span>
                    <span>zone4Sub: {d.zone4Sub.toFixed(0)}</span>
                  </div>
                );
              })()}
            </div>
          )}
        </CollapsibleSection>

        {/* Summary Table */}
        <CollapsibleSection 
          title="Steuerbelastung – Übersicht" 
          icon="📊"
          isCollapsed={collapsed.summary} 
          onToggle={() => toggleCollapsed("summary")}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.cardBorder}` }}>
                {["Gruppe","Steuerpflichtige","Anteil 2021","Anteil neu","Δ Anteil","Ø-Satz 2021","Ø-Satz neu"].map(h => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {SUMMARY_GROUPS.map((g, i) => {
                const b = baseline.summaryGroups[i], s = sim.summaryGroups[i];
                const dShare = s.share - b.share;
                return (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.cardBorder}` }}>
                    <td style={{ ...td, whiteSpace: "pre-line", color: C.accent, fontWeight: 600 }}>{g.name}</td>
                    <td style={{ ...td, color: C.textDim }}>{fmtNum(b.taxpayers)}</td>
                    <td style={td}>{fmtPct(b.share)}</td>
                    <td style={{ ...td, color: C.accent, fontWeight: 600 }}>{fmtPct(s.share)}</td>
                    <td style={{ ...td, color: dShare > 0.05 ? C.red : dShare < -0.05 ? C.green : C.textDim, fontWeight: 600 }}>{dShare >= 0 ? "+" : ""}{fmtPct(dShare)}</td>
                    <td style={td}>{fmtPct(b.avgRate)}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{fmtPct(s.avgRate)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CollapsibleSection>

        {/* Charts */}
        <CollapsibleSection 
          title="Diagramme" 
          icon="📈"
          isCollapsed={collapsed.charts} 
          onToggle={() => toggleCollapsed("charts")}
          style={{ padding: "16px 20px" }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20 }}>

            <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 10, padding: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 14px 0", color: C.accent }}>Anteil am Steueraufkommen nach Einkommensgruppe</h2>
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={shareChart} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
                <XAxis dataKey="name" tick={{ fill: C.textDim, fontSize: 9 }} axisLine={{ stroke: C.cardBorder }} tickLine={false} angle={-45} textAnchor="end" height={65} />
                <YAxis tick={{ fill: C.textDim, fontSize: 10 }} axisLine={{ stroke: C.cardBorder }} tickLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 6, fontSize: 11, color: C.text }} formatter={v => `${v}%`} />
                <Legend wrapperStyle={{ fontSize: 11, color: C.textDim }} />
                <Bar dataKey="2021" fill={C.barA} radius={[3, 3, 0, 0]} />
                <Bar dataKey="Neu" fill={C.barB} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 10, padding: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 14px 0", color: C.accent }}>Grenzsteuersatz (Marginal Tax Rate)</h2>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={marginalCurve} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
                <XAxis dataKey="name" tick={{ fill: C.textDim, fontSize: 9 }} axisLine={{ stroke: C.cardBorder }} tickLine={false} interval={19} />
                <YAxis tick={{ fill: C.textDim, fontSize: 10 }} axisLine={{ stroke: C.cardBorder }} tickLine={false} tickFormatter={v => `${v}%`} domain={[0, 60]} />
                <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 6, fontSize: 11, color: C.text }} formatter={v => `${v}%`} />
                <Legend wrapperStyle={{ fontSize: 11, color: C.textDim }} />
                <Line type="stepAfter" dataKey="2021 Grenzsteuersatz" stroke={C.barA} strokeWidth={2} dot={false} />
                <Line type="stepAfter" dataKey="Neuer Grenzsteuersatz" stroke={C.barB} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 10, padding: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 14px 0", color: C.accent }}>Durchschnittssteuersatz (Average Tax Rate)</h2>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={rateCurve} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
                <XAxis dataKey="name" tick={{ fill: C.textDim, fontSize: 9 }} axisLine={{ stroke: C.cardBorder }} tickLine={false} interval={2} />
                <YAxis tick={{ fill: C.textDim, fontSize: 10 }} axisLine={{ stroke: C.cardBorder }} tickLine={false} tickFormatter={v => `${v}%`} domain={[0, 50]} />
                <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 6, fontSize: 11, color: C.text }} formatter={v => `${v}%`} />
                <Legend wrapperStyle={{ fontSize: 11, color: C.textDim }} />
                <Line type="monotone" dataKey="2021 Rate" stroke={C.barA} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Neue Rate" stroke={C.barB} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          </div>
        </CollapsibleSection>

        {/* Detailed Table */}
        <CollapsibleSection 
          title="Detailaufschlüsselung &amp; Individuelle Auswirkung" 
          icon="📋"
          isCollapsed={collapsed.detailed} 
          onToggle={() => toggleCollapsed("detailed")}
        >
          <p style={{ fontSize: 11, color: C.textDim, margin: "0 0 14px 0", lineHeight: 1.5 }}>
            Das Steuer-Δ zeigt, wie viel mehr oder weniger eine Person mit diesem Bruttoeinkommen unter dem neuen Tarif im Vergleich zu 2021 zahlen würde. Das kalibrierte k des Brackets wird zur Schätzung des zvE für die Deltaberechnung verwendet — absolute Steuerbeträge werden nicht gezeigt, da individuelle zvE-Daten von Destatis nicht verfügbar sind.
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.cardBorder}` }}>
                {["Einkommensklasse","Steuerpflichtige","Repräs. Bruttoeinkommen","Steuer-Δ (€/Jahr)","Anteil 2021","Anteil neu"].map(h => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {DISPLAY_GROUPS.map((g, i) => {
                const b = baseline.displayGroups[i], s = sim.displayGroups[i];
                // We don't know individual zvE reliably — but for the DELTA, we can use
                // the bracket's calibrated k since it cancels out the absolute level.
                // delta = tax(gross - k, newParams) - tax(gross - k, defaultParams)
                const bi = RAW_BRACKETS.findIndex(rb => g.repIncome >= rb.lo && g.repIncome < rb.hi);
                const k = bi >= 0 ? CALIBRATED_K[bi] : 0;
                const zvE = Math.max(0, g.repIncome - k);
                const taxOld = computeTax(zvE, DEFAULT_PARAMS);
                const taxNew = computeTax(zvE, params);
                const delta = taxNew - taxOld;
                return (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.cardBorder}` }}>
                    <td style={{ ...td, color: C.accent }}>{g.name}</td>
                    <td style={{ ...td, color: C.textDim }}>{fmtNum(b.taxpayers)}</td>
                    <td style={{ ...td, color: C.textDim }}>{fmtNum(g.repIncome)} €</td>
                    <td style={{ ...td, fontWeight: 700, fontSize: 12, color: delta > 0 ? C.red : delta < 0 ? C.green : C.textDim, background: delta > 0 ? "rgba(248,113,113,0.06)" : delta < 0 ? "rgba(52,211,153,0.06)" : "transparent" }}>
                      {delta === 0 ? "keine Änderung" : <>{delta >= 0 ? "+" : ""}{fmtNum(delta)} €<div style={{ fontSize: 9, fontWeight: 400, color: C.textDim }}>({delta >= 0 ? "+" : ""}{Math.round(delta / 12)} €/Mon.)</div></>}
                    </td>
                    <td style={td}>{fmtPct(b.share)}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{fmtPct(s.share)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CollapsibleSection>

        {/* Caveats */}
        <CollapsibleSection 
          title="Methodik &amp; Einschränkungen" 
          icon="⚠"
          isCollapsed={collapsed.methodology} 
          onToggle={() => toggleCollapsed("methodology")}
        >
          <ul style={{ fontSize: 11, color: C.textDim, lineHeight: 1.8, margin: 0, paddingLeft: 18 }}>
            <li><strong>Abzugskalibration:</strong> Destatis weist den Gesamtbetrag der Einkünfte aus, nicht das zvE. Eine Konstante k je Bracket wird einmalig gegen den Tarif 2021 gelöst, sodass die simulierte Steuer den tatsächlichen Einnahmen 2021 entspricht. k bleibt bei Tarifänderungen fest — Abzüge gelten als unveränderlich.</li>
            <li><strong>Synthetische Verteilung:</strong> {SYNTHETIC_TAXPAYERS.length.toLocaleString()} Einkommenspunkte aus 17 Destatis-Brackets, breitengewichtet. Power-Transform an Bracket-Mittelwerte angepasst; Pareto-Verteilung für 1M+.</li>
            <li><strong>Keine Verhaltenseffekte:</strong> Statische Simulation — Einkommen reagiert nicht auf Steueränderungen.</li>
            <li><strong>Splitting nicht modelliert:</strong> Ehepaare werden unverändert aus den Daten übernommen.</li>
          </ul>
        </CollapsibleSection>

        <div style={{ textAlign: "center", color: C.textDim, fontSize: 10, paddingBottom: 32 }}>
          Daten: Destatis Lohn- und Einkommensteuerstatistik 2021 · Formel: §32a EStG
        </div>
      </div>
    </div>
  );
}
