import { useState, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, ReferenceLine, ReferenceArea,
  ResponsiveContainer, Tooltip,
} from "recharts";

/* ============================================================
   MARKTPULS — Sentiment & Frühwarnsystem (Prototyp, Demo-Daten)
   Composite-Score aus 7 gewichteten Markt-Internals,
   regelbasierte Frühwarnsignale, Zeitreise-Scrubber.
   ============================================================ */

// ---------- Design-Tokens ----------
const C = {
  page: "#07090F",
  bg: "#0C111B",
  card: "#121A29",
  card2: "#16203233",
  line: "#222D43",
  text: "#EAE6DC",
  mut: "#8B94A8",
  red: "#E4574C",
  amber: "#E8A33D",
  green: "#5BC48F",
};

// ---------- Utils ----------
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
function mix(h1, h2, t) {
  const a = hexToRgb(h1), b = hexToRgb(h2);
  const ch = (i) => Math.round(lerp(a[i], b[i], t)).toString(16).padStart(2, "0");
  return `#${ch(0)}${ch(1)}${ch(2)}`;
}
// 0 = Risk-Off (rot) … 100 = Risk-On (grün)
function scoreColor(s) {
  return s <= 50 ? mix(C.red, C.amber, s / 50) : mix(C.amber, C.green, (s - 50) / 50);
}

function interpPath(points, f) {
  if (f <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (f <= points[i][0]) {
      const [f0, v0] = points[i - 1], [f1, v1] = points[i];
      return lerp(v0, v1, (f - f0) / (f1 - f0));
    }
  }
  return points[points.length - 1][1];
}

function makeSeries(points, days, rng, amp = 6) {
  const out = []; let n = 0;
  for (let i = 0; i < days; i++) {
    n = (n + (rng() - 0.5) * amp * 0.6) * 0.92;
    out.push(clamp(interpPath(points, i / (days - 1)) + n, 2, 98));
  }
  return out;
}

function makePrice(cfg, days, rng) {
  const out = [100];
  for (let i = 1; i < days; i++) {
    const d = interpPath(cfg.drift, i / (days - 1));
    out.push(out[i - 1] * (1 + d + (rng() - 0.5) * cfg.vol));
  }
  return out;
}

function sma(arr, n) {
  const out = new Array(arr.length).fill(null);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
    if (i >= n) sum -= arr[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

function winMax(arr, i, k) { let m = -Infinity; for (let j = Math.max(0, i - k + 1); j <= i; j++) m = Math.max(m, arr[j]); return m; }
function winMin(arr, i, k) { let m = Infinity; for (let j = Math.max(0, i - k + 1); j <= i; j++) m = Math.min(m, arr[j]); return m; }
function avgK(arr, i, k) { let s = 0, n = 0; for (let j = Math.max(0, i - k + 1); j <= i; j++) { s += arr[j]; n++; } return s / n; }

// ---------- Komponenten des Composite-Scores ----------
const COMPONENTS = [
  { key: "momentum", label: "Momentum", w: 0.20, info: "Abstand des Index zur 125-Tage-Linie. Notiert der Markt darüber, dominiert der Aufwärtstrend — darunter kippt das mittelfristige Bild." },
  { key: "breadth", label: "Marktbreite", w: 0.20, info: "Anteil der Aktien über ihrer 200-Tage-Linie. Steigt der Index, während immer weniger Aktien ihn tragen, wird die Rally brüchig — der klassische Frühindikator." },
  { key: "vol", label: "Volatilität (VIX)", w: 0.15, info: "Erwartete Schwankungsbreite, invers skaliert. Hoher VIX = Angst, sehr niedriger VIX = gefährliche Sorglosigkeit." },
  { key: "term", label: "VIX-Termstruktur", w: 0.10, info: "Verhältnis kurzfristiger zu mittelfristiger Volatilität. Eine Inversion (kurz > lang) ging vielen Abverkäufen voraus." },
  { key: "putcall", label: "Put/Call-Ratio", w: 0.15, info: "Absicherungsneigung am Optionsmarkt, invers skaliert. Extreme in beide Richtungen wirken oft als Kontraindikator." },
  { key: "credit", label: "Kreditspreads", w: 0.10, info: "Risikoaufschläge von High-Yield-Anleihen, invers skaliert. Der Anleihemarkt riecht Stress häufig vor dem Aktienmarkt." },
  { key: "haven", label: "Safe-Haven-Flüsse", w: 0.10, info: "Nachfrage nach Gold, Staatsanleihen und Fluchtwährungen, invers skaliert. Steigende Nachfrage = sinkende Risikobereitschaft." },
];

// ---------- Demo-Szenarien ----------
const DAYS = 130, TOTAL = 330, WEEKS = 130;

// ---------- Makro-Regelwerk: Wochenlogik (inspiriert von Uwe Langs Kombinierter Methode) ----------
function getMacroSignals(M, w, date) {
  const eps = 0.01;
  const sig = [];
  const push = (label, lvl, detail) => sig.push({ label, lvl, detail });

  // 1 — Zinsstruktur (Abstand lang/kurz vs. 32-Wochen-Schnitt)
  const spread = M.bondYield.map((v, i) => v - M.shortRate[i]);
  const sAvg = avgK(spread, w, 32);
  push("Zinsstruktur", spread[w] >= sAvg ? "buy" : "sell",
    spread[w] >= sAvg
      ? "Abstand lang- zu kurzfristigen Zinsen über dem 32-Wochen-Schnitt."
      : "Zinsstruktur unter dem 32-Wochen-Schnitt — die Geldpolitik bremst.");

  // 2 — Anleihezinsen (38-Wochen-Extreme)
  const byHigh = M.bondYield[w] >= winMax(M.bondYield, w, 38) - eps;
  const byLow = M.bondYield[w] <= winMin(M.bondYield, w, 38) + eps;
  push("Anleihezinsen", byLow ? "buy" : byHigh ? "sell" : "neutral",
    byLow ? "38-Wochen-Tief der Renditen — Rückenwind für Aktien."
      : byHigh ? "38-Wochen-Hoch der Renditen — Gegenwind für Aktien."
      : "Renditen ohne neues Extrem.");

  // 3 — Indextrend (38-Wochen-Linie)
  const iAvg = avgK(M.index, w, 38);
  push("Indextrend (38W-Linie)", M.index[w] >= iAvg ? "buy" : "sell",
    M.index[w] >= iAvg
      ? "Leitindex notiert über seinem 38-Wochen-Schnitt."
      : "Leitindex unter dem 38-Wochen-Schnitt — Trend angeschlagen.");

  // 4 — Früherkennung: Nasdaq + Dow Jones Utilities
  const nzH = M.nasdaq[w] >= winMax(M.nasdaq, w, 13) - eps;
  const utH = M.utilities[w] >= winMax(M.utilities, w, 13) - eps;
  const nzL = M.nasdaq[w] <= winMin(M.nasdaq, w, 18) + eps;
  const utL = M.utilities[w] <= winMin(M.utilities, w, 18) + eps;
  push("Früherkennung Nasdaq + Utilities",
    nzH && utH ? "buy" : nzL && utL ? "sell" : "neutral",
    nzH && utH ? "Beide Indizes auf 13-Wochen-Hoch — klassisches Kaufsignal."
      : nzL && utL ? "Beide Indizes auf 18-Wochen-Tief — Verkaufssignal."
      : "Kein gemeinsames Wochen-Extrem der beiden Frühindikatoren.");

  // 5 — Ölpreis (6-Wochen-Extreme, invers)
  const oilH = M.oil[w] >= winMax(M.oil, w, 6) - eps;
  const oilL = M.oil[w] <= winMin(M.oil, w, 6) + eps;
  push("Ölpreis", oilL ? "buy" : oilH ? "sell" : "neutral",
    oilL ? "6-Wochen-Tief beim Öl — Entlastung für Konjunktur und Margen."
      : oilH ? "6-Wochen-Hoch beim Öl — belastet die Märkte."
      : "Ölpreis ohne neues Extrem.");

  // 6 — Euro/Dollar (15-Wochen-Extreme, starker Dollar positiv)
  const eH = M.eurusd[w] >= winMax(M.eurusd, w, 15) - eps;
  const eL = M.eurusd[w] <= winMin(M.eurusd, w, 15) + eps;
  push("Euro/Dollar", eL ? "buy" : eH ? "sell" : "neutral",
    eL ? "15-Wochen-Tief des Euro — starker Dollar, historisch positiv."
      : eH ? "15-Wochen-Hoch des Euro — schwacher Dollar, historisch negativ."
      : "Wechselkurs ohne neues Extrem.");

  // 7 — Saisonfaktor (November–April positiv)
  const m = date.getMonth();
  const good = m >= 10 || m <= 3;
  push("Saisonfaktor", good ? "buy" : "sell",
    good ? "November bis April — historisch die starke Börsenphase."
      : "Mai bis Oktober — historisch die schwächere Phase.");

  const buys = sig.filter((s) => s.lvl === "buy").length;
  const sells = sig.filter((s) => s.lvl === "sell").length;
  return { sig, buys, sells };
}

const SCN = {
  latecycle: {
    name: "Spätzyklische Rally",
    seed: 1042,
    paths: {
      momentum: [[0, 70], [1, 82]],
      breadth: [[0, 68], [0.4, 60], [1, 36]],
      vol: [[0, 66], [0.6, 58], [1, 46]],
      term: [[0, 60], [0.6, 46], [1, 28]],
      putcall: [[0, 68], [1, 86]],
      credit: [[0, 62], [0.5, 56], [1, 42]],
      haven: [[0, 62], [1, 40]],
    },
    price: { drift: [[0, 0.0013], [0.7, 0.0009], [1, 0.0005]], vol: 0.008 },
    macro: {
      bondYield: [[0, 50], [1, 63]],
      shortRate: [[0, 38], [1, 58]],
      index: [[0, 50], [1, 66]],
      nasdaq: [[0, 52], [1, 64]],
      utilities: [[0, 56], [1, 42]],
      oil: [[0, 45], [1, 62]],
      eurusd: [[0, 50], [1, 58]],
    },
  },
  riskoff: {
    name: "Risk-Off",
    seed: 707,
    paths: {
      momentum: [[0, 58], [0.5, 48], [1, 22]],
      breadth: [[0, 50], [0.5, 38], [1, 16]],
      vol: [[0, 52], [0.6, 38], [1, 14]],
      term: [[0, 48], [0.6, 34], [1, 18]],
      putcall: [[0, 55], [0.7, 35], [1, 15]],
      credit: [[0, 55], [0.6, 42], [1, 24]],
      haven: [[0, 50], [1, 20]],
    },
    price: { drift: [[0, 0.0009], [0.6, 0.0004], [0.75, -0.002], [1, -0.0035]], vol: 0.013 },
    macro: {
      bondYield: [[0, 56], [0.7, 58], [1, 45]],
      shortRate: [[0, 52], [1, 54]],
      index: [[0, 55], [0.6, 50], [1, 33]],
      nasdaq: [[0, 55], [0.6, 48], [1, 31]],
      utilities: [[0, 52], [0.6, 47], [1, 35]],
      oil: [[0, 60], [0.6, 64], [1, 47]],
      eurusd: [[0, 50], [1, 40]],
    },
  },
  bull: {
    name: "Gesunder Bulle",
    seed: 99,
    paths: {
      momentum: [[0, 64], [1, 73]],
      breadth: [[0, 60], [1, 71]],
      vol: [[0, 60], [1, 68]],
      term: [[0, 58], [1, 65]],
      putcall: [[0, 50], [1, 56]],
      credit: [[0, 62], [1, 67]],
      haven: [[0, 58], [1, 63]],
    },
    price: { drift: [[0, 0.0008], [1, 0.0008]], vol: 0.006 },
    macro: {
      bondYield: [[0, 52], [1, 46]],
      shortRate: [[0, 40], [1, 38]],
      index: [[0, 50], [1, 63]],
      nasdaq: [[0, 50], [1, 64]],
      utilities: [[0, 50], [1, 58]],
      oil: [[0, 53], [1, 44]],
      eurusd: [[0, 50], [1, 52]],
    },
  },
};

function buildScenario(key) {
  const cfg = SCN[key];
  const rng = mulberry32(cfg.seed);
  const comp = {};
  COMPONENTS.forEach((c) => { comp[c.key] = makeSeries(cfg.paths[c.key], DAYS, rng); });
  const priceFull = makePrice(cfg.price, TOTAL, rng);
  const off = TOTAL - DAYS;
  const data = {
    comp,
    price: priceFull.slice(off),
    ma50: sma(priceFull, 50).slice(off),
    ma125: sma(priceFull, 125).slice(off),
    ma200: sma(priceFull, 200).slice(off),
  };
  data.composite = Array.from({ length: DAYS }, (_, i) =>
    COMPONENTS.reduce((a, c) => a + comp[c.key][i] * c.w, 0)
  );
  data.macro = {};
  Object.entries(cfg.macro).forEach(([k, p]) => { data.macro[k] = makeSeries(p, WEEKS, rng, 4); });
  return data;
}

// ---------- Regelwerk: Frühwarnsignale ----------
function getSignals(D, t) {
  const g20 = (arr) => (t >= 20 ? arr[t] - arr[t - 20] : 0);
  const sig = [];
  const p0 = D.price[Math.max(0, t - 20)];
  const priceCh = ((D.price[t] - p0) / p0) * 100;

  // 1 — Breitendivergenz
  const brCh = g20(D.comp.breadth);
  let lvl = "ok", detail = "Die Marktbreite bestätigt den Kurstrend.";
  if (priceCh > 1 && brCh < -6) { lvl = "red"; detail = "Kurse steigen, aber immer weniger Aktien tragen die Rally — klassische Topbildungs-Warnung."; }
  else if (priceCh > 0 && brCh < -3) { lvl = "amber"; detail = "Marktbreite lässt nach, noch kein Bruch."; }
  sig.push({ id: "div", label: "Marktbreite-Divergenz", lvl, detail });

  // 2 — VIX-Termstruktur
  const tv = D.comp.term[t];
  sig.push({
    id: "term", label: "VIX-Termstruktur",
    lvl: tv < 26 ? "red" : tv < 40 ? "amber" : "ok",
    detail: tv < 26 ? "Kurzfristige Volatilität über mittelfristiger — typisches Stresssignal vor Abverkäufen."
      : tv < 40 ? "Termstruktur flacht ab, Absicherung verteuert sich."
      : "Normale Contango-Struktur, kein Stress sichtbar.",
  });

  // 3 — Optionsmarkt-Extreme
  const pc = D.comp.putcall[t];
  let l3 = "ok", d3 = "Absicherungsverhalten unauffällig.";
  if (pc > 80) { l3 = "amber"; d3 = "Kaum Absicherung — Sorglosigkeit auf Euphorie-Niveau, Markt anfällig für Schocks."; }
  else if (pc < 20) { l3 = "amber"; d3 = "Panik-Absicherung — historisch oft nahe Tiefpunkten (Kontraindikator)."; }
  sig.push({ id: "pc", label: "Optionsmarkt-Extreme", lvl: l3, detail: d3 });

  // 4 — Kreditspreads weiten sich
  const cr = g20(D.comp.credit);
  sig.push({
    id: "cr", label: "Kreditspreads",
    lvl: cr < -12 ? "red" : cr < -6 ? "amber" : "ok",
    detail: cr < -12 ? "High-Yield-Spreads weiten sich deutlich — der Anleihemarkt schaltet auf Risiko-aus."
      : cr < -6 ? "Risikoaufschläge ziehen an, der Bondmarkt wird vorsichtiger."
      : "Kreditmärkte entspannt.",
  });

  // 5 — Trendbruch
  const below = D.price[t] < D.ma125[t];
  sig.push({
    id: "tb", label: "Trendbruch (125T-Linie)",
    lvl: below ? "red" : "ok",
    detail: below ? "Index notiert unter der 125-Tage-Linie — der mittelfristige Aufwärtstrend ist gebrochen."
      : "Index hält sich über der 125-Tage-Linie.",
  });

  // 6 — 50/200-Kreuzung
  const dist = ((D.ma50[t] - D.ma200[t]) / D.ma200[t]) * 100;
  const tp = Math.max(0, t - 10);
  const distPrev = ((D.ma50[tp] - D.ma200[tp]) / D.ma200[tp]) * 100;
  let l6 = "ok", d6 = `Golden Cross intakt (Abstand +${dist.toFixed(1)} %).`;
  if (dist < 0) { l6 = "red"; d6 = "Death Cross aktiv: 50-Tage-Linie unter der 200-Tage-Linie."; }
  else if (dist < 1 && dist < distPrev) { l6 = "amber"; d6 = `Die Linien nähern sich (Abstand ${dist.toFixed(1)} %) — Kreuzung möglich.`; }
  sig.push({ id: "ma", label: "50/200-Kreuzung", lvl: l6, detail: d6 });

  // 7 — Stimmungs-Tempo
  const d5 = t >= 5 ? D.composite[t] - D.composite[t - 5] : 0;
  sig.push({
    id: "sp", label: "Stimmungs-Tempo",
    lvl: Math.abs(d5) > 10 ? "amber" : "ok",
    detail: Math.abs(d5) > 10
      ? `Sentiment ${d5 > 0 ? "springt" : "kippt"} um ${Math.abs(d5).toFixed(0)} Punkte in 5 Tagen — Umschwung-Tempo.`
      : "Stimmungsänderung im Normalbereich.",
  });

  const order = { red: 0, amber: 1, ok: 2 };
  return sig.sort((a, b) => order[a.lvl] - order[b.lvl]);
}

function regime(s) {
  if (s < 20) return ["Extreme Angst", C.red];
  if (s < 40) return ["Angst", mix(C.red, C.amber, 0.6)];
  if (s < 60) return ["Neutral", C.amber];
  if (s < 80) return ["Zuversicht", mix(C.amber, C.green, 0.7)];
  return ["Euphorie", C.green];
}

function dateForOffset(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
}
const fmtDate = (d) => d.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });

// ---------- Gauge ----------
function Gauge({ score, delta }) {
  const cx = 160, cy = 152, r = 118, N = 40;
  const segs = [];
  for (let i = 0; i < N; i++) {
    const a0 = Math.PI * (1 - i / N), a1 = Math.PI * (1 - (i + 1) / N);
    const x0 = cx + r * Math.cos(a0), y0 = cy - r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy - r * Math.sin(a1);
    const mid = ((i + 0.5) / N) * 100;
    segs.push(
      <path key={i}
        d={`M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`}
        stroke={scoreColor(mid)} strokeWidth="13" fill="none"
        opacity={mid <= score ? 1 : 0.16}
      />
    );
  }
  const ticks = [];
  for (let v = 0; v <= 100; v += 10) {
    const a = Math.PI * (1 - v / 100);
    const r1 = r + 12, r2 = r + (v % 50 === 0 ? 20 : 16);
    ticks.push(
      <line key={v}
        x1={cx + r1 * Math.cos(a)} y1={cy - r1 * Math.sin(a)}
        x2={cx + r2 * Math.cos(a)} y2={cy - r2 * Math.sin(a)}
        stroke={C.mut} strokeWidth={v % 50 === 0 ? 1.6 : 1} opacity="0.55"
      />
    );
  }
  const [label, color] = regime(score);
  return (
    <div style={{ position: "relative" }}>
      <svg viewBox="0 0 320 196" style={{ width: "100%", display: "block" }} role="img"
        aria-label={`Sentiment-Score ${Math.round(score)} von 100, ${label}`}>
        {segs}
        {ticks}
        <text x={cx - r - 4} y={cy + 18} fill={C.mut} fontSize="10" textAnchor="middle" className="mono">0</text>
        <text x={cx} y={cy - r - 26} fill={C.mut} fontSize="10" textAnchor="middle" className="mono">50</text>
        <text x={cx + r + 4} y={cy + 18} fill={C.mut} fontSize="10" textAnchor="middle" className="mono">100</text>
        <g className="needle" style={{ transform: `rotate(${(score / 100) * 180}deg)`, transformOrigin: `${cx}px ${cy}px` }}>
          <line x1={cx} y1={cy} x2={cx - (r - 28)} y2={cy} stroke={C.text} strokeWidth="2.5" strokeLinecap="round" />
          <line x1={cx} y1={cy} x2={cx - (r - 28)} y2={cy} stroke={color} strokeWidth="6" strokeLinecap="round" opacity="0.25" />
        </g>
        <circle cx={cx} cy={cy} r="7" fill={C.card} stroke={C.text} strokeWidth="2" />
      </svg>
      <div style={{ textAlign: "center", marginTop: -54 }}>
        <div className="mono" style={{ fontSize: 46, fontWeight: 600, color: C.text, lineHeight: 1 }}>
          {Math.round(score)}
        </div>
        <div style={{ display: "inline-flex", gap: 8, alignItems: "center", marginTop: 8 }}>
          <span style={{
            color, border: `1px solid ${color}55`, background: `${color}14`,
            borderRadius: 999, padding: "3px 12px", fontSize: 12, fontWeight: 600, letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}>{label}</span>
          <span className="mono" style={{
            fontSize: 12, color: delta >= 0 ? C.green : C.red,
            background: `${delta >= 0 ? C.green : C.red}1A`, borderRadius: 999, padding: "3px 10px",
          }}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)} / 5T
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------- Bausteine ----------
function Card({ title, children, right, style }) {
  return (
    <section style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 18, padding: 16, ...style }}>
      {title && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <h2 style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.mut, fontWeight: 700 }}>
            {title}
          </h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

function Dot({ lvl }) {
  const col = lvl === "red" ? C.red : lvl === "amber" ? C.amber : C.green;
  return (
    <span style={{
      width: 9, height: 9, borderRadius: 99, background: col, flexShrink: 0,
      boxShadow: lvl === "ok" ? "none" : `0 0 8px ${col}`, marginTop: 5,
    }} />
  );
}

// ---------- App ----------
export default function Marktpuls() {
  const [scenario, setScenario] = useState("latecycle");
  const [offset, setOffset] = useState(0); // -89 … 0
  const [open, setOpen] = useState(null);

  const D = useMemo(() => buildScenario(scenario), [scenario]);
  const t = DAYS - 1 + offset;
  const score = D.composite[t];
  const delta = score - D.composite[Math.max(0, t - 5)];
  const signals = useMemo(() => getSignals(D, t), [D, t]);
  const alerts = signals.filter((s) => s.lvl !== "ok");

  const chartData = useMemo(
    () => Array.from({ length: 90 }, (_, i) => {
      const idx = DAYS - 90 + i;
      return { x: idx - (DAYS - 1), y: D.composite[idx] };
    }),
    [D]
  );

  const maDist = ((D.ma50[t] - D.ma200[t]) / D.ma200[t]) * 100;
  let crossAge = null, crossType = null;
  for (let i = t; i > 0; i--) {
    const s0 = Math.sign(D.ma50[i - 1] - D.ma200[i - 1]);
    const s1 = Math.sign(D.ma50[i] - D.ma200[i]);
    if (s0 !== s1) { crossAge = t - i; crossType = s1 > 0 ? "Golden Cross" : "Death Cross"; break; }
  }

  const curDate = dateForOffset(offset);
  const weekT = WEEKS - 1 + Math.round(offset / 7);
  const macro = useMemo(() => getMacroSignals(D.macro, weekT, dateForOffset(offset)), [D, weekT, offset]);

  return (
    <div style={{ minHeight: "100vh", background: C.page, color: C.text, fontFamily: "'Archivo','Segoe UI',system-ui,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
        .needle { transition: transform .55s cubic-bezier(.3,1.2,.4,1); }
        .bar-fill { transition: width .45s ease; }
        button:focus-visible, input:focus-visible { outline: 2px solid ${C.amber}; outline-offset: 2px; }
        input[type=range] { -webkit-appearance: none; width: 100%; height: 4px; border-radius: 99px;
          background: ${C.line}; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px;
          border-radius: 99px; background: ${C.text}; border: 3px solid ${C.page}; cursor: pointer;
          box-shadow: 0 0 0 1px ${C.line}; }
        input[type=range]::-moz-range-thumb { width: 16px; height: 16px; border-radius: 99px;
          background: ${C.text}; border: 3px solid ${C.page}; cursor: pointer; }
        @media (prefers-reduced-motion: reduce) { .needle, .bar-fill { transition: none; } }
        .wrap { max-width: 440px; margin: 0 auto; padding: 20px 14px 32px;
          display: flex; flex-direction: column; gap: 12px; }
        .col { display: contents; }
        @media (min-width: 900px) {
          .wrap { max-width: 968px; padding: 28px 24px 40px;
            display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
          .wrap > header, .wrap > footer { grid-column: 1 / -1; }
          .col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
          .pills { max-width: 480px; }
        }
      `}</style>

      <div className="wrap">

        {/* Header */}
        <header style={{ padding: "4px 4px 2px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: "0.04em" }}>
                MARKT<span style={{ color: C.amber }}>·</span>PULS
              </div>
              <div style={{ color: C.mut, fontSize: 12, marginTop: 2 }}>Sentiment & Frühwarnsystem</div>
            </div>
            <div className="mono" style={{ textAlign: "right", fontSize: 12, color: C.mut }}>
              <div style={{ color: C.text, fontWeight: 600 }}>{fmtDate(curDate)}</div>
              <div>{offset === 0 ? "heute" : `${-offset} Tage zurück`}</div>
            </div>
          </div>

          {/* Szenario-Pills */}
          <div className="pills" style={{ display: "flex", gap: 6, marginTop: 14 }}>
            {Object.entries(SCN).map(([key, s]) => (
              <button key={key}
                onClick={() => { setScenario(key); setOffset(0); setOpen(null); }}
                style={{
                  flex: 1, padding: "7px 4px", borderRadius: 99, fontSize: 11.5, fontWeight: 600,
                  border: `1px solid ${scenario === key ? C.amber : C.line}`,
                  background: scenario === key ? `${C.amber}1A` : "transparent",
                  color: scenario === key ? C.amber : C.mut, cursor: "pointer",
                  fontFamily: "inherit",
                }}>
                {s.name}
              </button>
            ))}
          </div>
        </header>

        {/* Spalte 1 (Desktop) — order steuert die mobile Reihenfolge */}
        <div className="col">

        {/* Gauge */}
        <Card style={{ order: 1 }}>
          <Gauge score={score} delta={delta} />
          <p style={{ color: C.mut, fontSize: 11.5, textAlign: "center", marginTop: 12, lineHeight: 1.5 }}>
            Composite aus 7 gewichteten Markt-Internals · 0 = Risk-Off · 100 = Risk-On
          </p>
        </Card>

        {/* Verlauf + Zeitreise */}
        <Card style={{ order: 3 }} title="Sentiment · 90 Tage" right={
          <span className="mono" style={{ fontSize: 11, color: C.mut }}>{Math.round(score)} Pkt.</span>
        }>
          <div style={{ height: 150, marginLeft: -8 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="mp-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={scoreColor(score)} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={scoreColor(score)} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <ReferenceArea y1={0} y2={25} fill={C.red} fillOpacity={0.05} />
                <ReferenceArea y1={75} y2={100} fill={C.green} fillOpacity={0.05} />
                <XAxis dataKey="x" type="number" domain={[-89, 0]} ticks={[-89, -60, -30, 0]}
                  tickFormatter={(v) => (v === 0 ? "heute" : `${v}T`)}
                  tick={{ fill: C.mut, fontSize: 10 }} axisLine={{ stroke: C.line }} tickLine={false} />
                <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]}
                  tick={{ fill: C.mut, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 12 }}
                  labelStyle={{ color: C.mut }} itemStyle={{ color: C.text }}
                  formatter={(v) => [`${v.toFixed(1)} Pkt.`, "Sentiment"]}
                  labelFormatter={(v) => (v === 0 ? "heute" : `vor ${-v} Tagen`)}
                />
                <ReferenceLine y={50} stroke={C.line} strokeDasharray="4 4" />
                {offset < 0 && <ReferenceLine x={offset} stroke={C.text} strokeDasharray="3 3" strokeOpacity={0.7} />}
                <Area type="monotone" dataKey="y" stroke={scoreColor(score)} strokeWidth={2}
                  fill="url(#mp-fill)" isAnimationActive={false} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div style={{ marginTop: 14, padding: "0 4px" }}>
            <input type="range" min={-89} max={0} step={1} value={offset}
              aria-label="Zeitreise: Tag auswählen"
              onChange={(e) => setOffset(Number(e.target.value))} />
            <p style={{ color: C.mut, fontSize: 11.5, marginTop: 8, lineHeight: 1.5 }}>
              Zeitreise: Zieh den Regler zurück und beobachte, wann die Frühwarnsignale angeschlagen haben.
            </p>
          </div>
        </Card>

        {/* Komponenten */}
        <Card style={{ order: 4 }} title="Komponenten des Scores">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {COMPONENTS.map((c) => {
              const v = D.comp[c.key][t];
              const ch = v - D.comp[c.key][Math.max(0, t - 10)];
              const col = scoreColor(v);
              const isOpen = open === c.key;
              return (
                <button key={c.key} onClick={() => setOpen(isOpen ? null : c.key)}
                  style={{
                    width: "100%", textAlign: "left", background: "transparent", border: "none",
                    padding: 0, cursor: "pointer", color: C.text, fontFamily: "inherit",
                  }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      {c.label}
                      <span className="mono" style={{ color: C.mut, fontSize: 10.5, marginLeft: 7 }}>
                        {(c.w * 100).toFixed(0)} %
                      </span>
                    </span>
                    <span className="mono" style={{ fontSize: 12.5 }}>
                      <span style={{ color: ch >= 0 ? C.green : C.red, marginRight: 7, fontSize: 10.5 }}>
                        {ch >= 0 ? "▲" : "▼"}{Math.abs(ch).toFixed(0)}
                      </span>
                      <span style={{ color: col, fontWeight: 600 }}>{Math.round(v)}</span>
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 99, background: C.line, overflow: "hidden" }}>
                    <div className="bar-fill" style={{ height: "100%", width: `${v}%`, background: col, borderRadius: 99 }} />
                  </div>
                  {isOpen && (
                    <p style={{ color: C.mut, fontSize: 12, lineHeight: 1.55, margin: "7px 0 2px" }}>{c.info}</p>
                  )}
                </button>
              );
            })}
          </div>
          <p style={{ color: C.mut, fontSize: 11, marginTop: 12 }}>
            Antippen für die Erklärung. 10-Tage-Veränderung als Pfeil.
          </p>
        </Card>

        </div>

        {/* Spalte 2 (Desktop) */}
        <div className="col">

        {/* Frühwarnsignale */}
        <Card style={{ order: 2 }} title="Frühwarnsignale" right={
          <span className="mono" style={{
            fontSize: 11, color: alerts.length ? C.amber : C.green,
          }}>{alerts.length ? `${alerts.length} aktiv` : "alles ruhig"}</span>
        }>
          <ul style={{ display: "flex", flexDirection: "column", gap: 4, margin: 0, padding: 0, listStyle: "none" }}>
            {signals.map((s) => (
              <li key={s.id}>
                <button onClick={() => setOpen(open === s.id ? null : s.id)}
                  style={{
                    width: "100%", textAlign: "left", display: "flex", gap: 10, alignItems: "flex-start",
                    background: s.lvl !== "ok" ? C.card2 : "transparent",
                    border: "none", borderRadius: 10, padding: "8px 10px", cursor: "pointer",
                    color: C.text, fontFamily: "inherit",
                  }}>
                  <Dot lvl={s.lvl} />
                  <span style={{ flex: 1 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, opacity: s.lvl === "ok" ? 0.65 : 1 }}>
                      {s.label}
                    </span>
                    {(open === s.id || s.lvl !== "ok") && (
                      <span style={{ display: "block", color: C.mut, fontSize: 12, lineHeight: 1.5, marginTop: 2 }}>
                        {s.detail}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {/* MA-Monitor */}
        <Card style={{ order: 5 }} title="Gleitende Durchschnitte · Leitindex">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            {[
              ["Kurs", D.price[t].toFixed(1)],
              ["MA 50", D.ma50[t].toFixed(1)],
              ["MA 200", D.ma200[t].toFixed(1)],
            ].map(([k, v]) => (
              <div key={k} style={{ flex: 1, background: C.card2, borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
                <div style={{ color: C.mut, fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase" }}>{k}</div>
                <div className="mono" style={{ fontSize: 15, fontWeight: 600, marginTop: 3 }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
            <span style={{
              fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 99,
              color: maDist >= 0 ? C.green : C.red,
              border: `1px solid ${maDist >= 0 ? C.green : C.red}55`,
            }}>
              {maDist >= 0 ? "Golden Cross" : "Death Cross"}
            </span>
            <span className="mono" style={{ color: C.mut, fontSize: 12 }}>
              Abstand {maDist >= 0 ? "+" : ""}{maDist.toFixed(1)} %
              {crossAge !== null && ` · ${crossType} vor ${crossAge} T`}
            </span>
          </div>
        </Card>

        {/* Makro-Signale */}
        <Card style={{ order: 6 }} title="Makro-Signale · Wochenlogik" right={
          <span className="mono" style={{
            fontSize: 11, fontWeight: 600,
            color: macro.buys >= macro.sells ? C.green : C.red,
          }}>
            {macro.buys}:{macro.sells} für die {macro.buys >= macro.sells ? "Hausse" : "Baisse"}
          </span>
        }>
          <ul style={{ display: "flex", flexDirection: "column", gap: 4, margin: 0, padding: 0, listStyle: "none" }}>
            {macro.sig.map((s) => {
              const col = s.lvl === "buy" ? C.green : s.lvl === "sell" ? C.red : C.mut;
              return (
                <li key={s.label} style={{
                  display: "flex", gap: 10, alignItems: "flex-start",
                  background: s.lvl !== "neutral" ? C.card2 : "transparent",
                  borderRadius: 10, padding: "8px 10px",
                }}>
                  <span style={{
                    width: 9, height: 9, borderRadius: 99, background: col, flexShrink: 0, marginTop: 5,
                    boxShadow: s.lvl === "neutral" ? "none" : `0 0 8px ${col}`,
                    opacity: s.lvl === "neutral" ? 0.5 : 1,
                  }} />
                  <span style={{ flex: 1 }}>
                    <span style={{
                      display: "flex", justifyContent: "space-between", alignItems: "baseline",
                    }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, opacity: s.lvl === "neutral" ? 0.65 : 1 }}>
                        {s.label}
                      </span>
                      <span className="mono" style={{ fontSize: 10.5, color: col, fontWeight: 600 }}>
                        {s.lvl === "buy" ? "KAUF" : s.lvl === "sell" ? "VERKAUF" : "NEUTRAL"}
                      </span>
                    </span>
                    <span style={{ display: "block", color: C.mut, fontSize: 12, lineHeight: 1.5, marginTop: 2 }}>
                      {s.detail}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p style={{ color: C.mut, fontSize: 11, marginTop: 12, lineHeight: 1.6 }}>
            Sieben Ja/Nein-Signale auf Wochenbasis (Hochs, Tiefs, Wochen-Durchschnitte) — inspiriert von
            Uwe Langs Kombinierter Methode. Läuft als eigenes Makro-Modul parallel zum Sentiment-Score.
          </p>
        </Card>

        </div>

        {/* Footer */}
        <footer style={{ textAlign: "center", color: C.mut, fontSize: 10.5, lineHeight: 1.7, padding: "6px 16px 0", order: 7 }}>
          Prototyp mit simulierten Demo-Daten (3 Marktregime).<br />
          Keine Anlageberatung — Informations- und Lernzwecke.
        </footer>
      </div>
    </div>
  );
}
