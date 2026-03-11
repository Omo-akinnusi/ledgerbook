// ================================================================
// LedgerBook Pro v3 — Business Finance Tracker
// UI Fix: Proper mobile padding, safe-area insets, responsive layout
// ================================================================

import { useState, useEffect, useRef, useMemo } from "react";
import * as Sentry from "@sentry/react";
import {
  auth, db,
  googleProvider, appleProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
  signOut,
  doc, getDoc, setDoc, updateDoc,
  collection, addDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp,
} from "./firebase.js";

// ── Inject global CSS for safe-area, viewport, scrollbar hiding ─
const GLOBAL_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; overflow-x: hidden; }
  body { -webkit-font-smoothing: antialiased; }
  ::-webkit-scrollbar { display: none; }
  * { scrollbar-width: none; -ms-overflow-style: none; }
  input[type="number"]::-webkit-inner-spin-button,
  input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  input[type="number"] { -moz-appearance: textfield; }
  button { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
  input, button { font-family: inherit; }

  /* ── Responsive layout system ── */

  /* Mobile default */
  .lb-root         { display: flex; min-height: 100vh; background: #f0f0f0; }
  .lb-sidebar      { display: none; }
  .lb-shell        { flex: 1; display: flex; flex-direction: column; min-height: 100vh;
                     background: #fff; width: 100%; max-width: 100%; }
  .lb-content      { flex: 1; overflow-y: auto; }
  .lb-bottom-nav   { display: flex; }
  .lb-page-grid    { display: block; }
  .lb-cards-grid   { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .lb-summary-grid { display: grid; grid-template-columns: 1fr; gap: 0; }
  .lb-section      { background: transparent; border-radius: 0; padding: 0; box-shadow: none; margin-bottom: 0; }

  /* Tablet (768px+) */
  @media (min-width: 768px) {
    .lb-root         { justify-content: center; }
    .lb-shell        { max-width: 720px; box-shadow: 0 0 0 1px rgba(0,0,0,0.07), 0 8px 48px rgba(0,0,0,0.13); }
    .lb-cards-grid   { grid-template-columns: 1fr 1fr; }
    .lb-page-grid    { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .lb-summary-grid { grid-template-columns: 1fr 1fr; gap: 20px; }
  }

  /* Desktop (1100px+) */
  @media (min-width: 1100px) {
    .lb-root         { justify-content: flex-start; align-items: stretch; background: #eef0f4; }
    .lb-sidebar      { display: flex; flex-direction: column; width: 260px; min-height: 100vh;
                       position: sticky; top: 0; height: 100vh; flex-shrink: 0;
                       box-shadow: 2px 0 16px rgba(0,0,0,0.10); z-index: 20; }
    .lb-shell        { flex: 1; max-width: 100%; box-shadow: none; background: #eef0f4; }
    .lb-shell-inner  { max-width: 1060px; margin: 0 auto; width: 100%; }
    .lb-header       { margin: 0; border-radius: 0 !important; }
    .lb-content      { padding: 28px 36px 48px !important; overflow-y: auto; }
    .lb-bottom-nav   { display: none; }
    .lb-cards-grid   { grid-template-columns: repeat(4, 1fr); gap: 16px; }
    .lb-page-grid    { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 24px; }
    .lb-summary-grid { grid-template-columns: 1fr 1fr; gap: 24px; }
    .lb-section      { background: #fff; border-radius: 20px; padding: 24px 26px;
                       box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04);
                       margin-bottom: 20px; }
    .lb-section-sm   { background: #fff; border-radius: 20px; padding: 20px 22px;
                       box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04);
                       margin-bottom: 16px; }
    .lb-card-action  { border-radius: 18px !important; padding: 20px 18px !important; }
    .lb-page-title   { font-size: 22px !important; font-weight: 900 !important;
                       color: #1a1a1a !important; margin-bottom: 20px !important;
                       letter-spacing: -0.5px !important; }
    .lb-subheader    { background: transparent !important; border-bottom: none !important;
                       padding-left: 0 !important; padding-right: 0 !important;
                       padding-top: 0 !important; padding-bottom: 16px !important; }
  }

  @media (min-width: 1400px) {
    .lb-sidebar      { width: 280px; }
    .lb-shell-inner  { max-width: 1200px; }
  }
`;

// Track window width for responsive decisions in JS
function useBreakpoint() {
  const [bp, setBp] = useState(() => {
    if (typeof window === "undefined") return "mobile";
    if (window.innerWidth >= 1100) return "desktop";
    if (window.innerWidth >= 768)  return "tablet";
    return "mobile";
  });
  useEffect(() => {
    const fn = () => {
      const w = window.innerWidth;
      setBp(w >= 1100 ? "desktop" : w >= 768 ? "tablet" : "mobile");
    };
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return bp;
}

function GlobalStyles() {
  useEffect(() => {
    const tag = document.createElement("style");
    tag.textContent = GLOBAL_CSS;
    document.head.appendChild(tag);
    // Ensure viewport meta is correct
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) { meta = document.createElement("meta"); meta.name = "viewport"; document.head.appendChild(meta); }
    meta.content = "width=device-width, initial-scale=1, viewport-fit=cover";
    return () => { try { document.head.removeChild(tag); } catch {} };
  }, []);
  return null;
}

// ── Design tokens — single source of truth for spacing ──────────
const S = {
  // Horizontal page padding — applied consistently everywhere
  px: 20,
  // Card inner padding
  cardPad: "18px 20px",
  // Section vertical gap
  sectionGap: 14,
  // Bottom nav height (accounts for safe area)
  navH: 64,
  // Header padding
  headerPx: "14px 20px 12px",
};

// ── Firestore helpers ────────────────────────────────────────────
// User profile doc: users/{uid}
const userDoc   = (uid) => doc(db, "users", uid);
// Settings doc: users/{uid}/settings/prefs
const settingsDoc = (uid) => doc(db, "users", uid, "settings", "prefs");
// Entries collection: users/{uid}/entries
const entriesCol = (uid) => collection(db, "users", uid, "entries");

// Save/merge user profile
const saveProfile = (uid, data) => setDoc(userDoc(uid), data, { merge: true });
// Save/merge settings
const saveSettings = (uid, data) => setDoc(settingsDoc(uid), data, { merge: true });
// Add entry
const addEntry = (uid, entry) => addDoc(entriesCol(uid), { ...entry, createdAt: serverTimestamp() });
// Delete entry
const delEntry = (uid, id) => deleteDoc(doc(db, "users", uid, "entries", id));

// ── Keep localStorage only as fast cache (no more SAMPLE_ENTRIES) ─
const DB = {
  get: (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};

// ── Defaults ────────────────────────────────────────────────────
const DEFAULT_BRANDING = {
  businessName: "My Business", tagline: "Track. Grow. Prosper.",
  logoType: "emoji", logo: "🏪", logoImage: null,
  primaryColor: "#075E54", useGradient: false,
  gradientAngle: 135, gradientColor2: "#25D366",
};
const DEFAULT_CURRENCY = { code: "NGN", symbol: "₦", name: "Nigerian Naira", locale: "en-NG" };
const DEFAULT_INC_CATS = ["Sales", "Service", "Transfer In", "Investment", "Refund", "Other Income"];
const DEFAULT_EXP_CATS = ["Inventory", "Rent", "Salary", "Utilities", "Transport", "Marketing", "Tax", "Other Expense"];

const CURRENCIES = [
  { code: "NGN", symbol: "₦", name: "Nigerian Naira",    locale: "en-NG" },
  { code: "USD", symbol: "$", name: "US Dollar",          locale: "en-US" },
  { code: "GBP", symbol: "£", name: "British Pound",      locale: "en-GB" },
  { code: "EUR", symbol: "€", name: "Euro",               locale: "de-DE" },
  { code: "GHS", symbol: "₵", name: "Ghanaian Cedi",      locale: "en-GH" },
  { code: "KES", symbol: "KSh", name: "Kenyan Shilling",  locale: "en-KE" },
  { code: "ZAR", symbol: "R",  name: "South African Rand",locale: "en-ZA" },
  { code: "XOF", symbol: "CFA",name: "West African CFA",  locale: "fr-SN" },
  { code: "EGP", symbol: "E£", name: "Egyptian Pound",    locale: "ar-EG" },
  { code: "INR", symbol: "₹", name: "Indian Rupee",       locale: "en-IN" },
];

// ── Helpers ─────────────────────────────────────────────────────
const genId    = () => Math.random().toString(36).slice(2, 9);
const toISO    = (d) => new Date(d).toISOString().slice(0, 10);
const fmtDate  = (iso) => new Date(iso).toLocaleDateString("en-NG", { day:"numeric", month:"short", year:"numeric" });
const fmtShort = (iso) => new Date(iso).toLocaleDateString("en-NG", { day:"numeric", month:"short" });
const fmtAmt   = (amount, currency) => {
  try { return new Intl.NumberFormat(currency.locale, { style:"currency", currency:currency.code, maximumFractionDigits:0 }).format(amount); }
  catch { return `${currency.symbol}${Number(amount).toLocaleString()}`; }
};
const getBg = (b) => b.useGradient
  ? `linear-gradient(${b.gradientAngle}deg, ${b.primaryColor}, ${b.gradientColor2})`
  : b.primaryColor;

// ── Date Range ───────────────────────────────────────────────────
const getPresetRange = (preset) => {
  const now = new Date(); const today = toISO(now);
  switch (preset) {
    case "today":      return { from:today, to:today };
    case "yesterday":  { const y=new Date(now); y.setDate(y.getDate()-1); const ys=toISO(y); return { from:ys, to:ys }; }
    case "week":       { const s=new Date(now); s.setDate(s.getDate()-6); return { from:toISO(s), to:today }; }
    case "month":      return { from:toISO(new Date(now.getFullYear(),now.getMonth(),1)), to:today };
    case "last_month": { const s=new Date(now.getFullYear(),now.getMonth()-1,1); const e=new Date(now.getFullYear(),now.getMonth(),0); return { from:toISO(s), to:toISO(e) }; }
    case "quarter":    { const q=Math.floor(now.getMonth()/3); return { from:toISO(new Date(now.getFullYear(),q*3,1)), to:today }; }
    case "year":       return { from:toISO(new Date(now.getFullYear(),0,1)), to:today };
    default:           return { from:"", to:"" };
  }
};

const PRESETS = [
  { id:"all",        label:"All Time",     icon:"📅" },
  { id:"today",      label:"Today",        icon:"📆" },
  { id:"yesterday",  label:"Yesterday",    icon:"◀️" },
  { id:"week",       label:"Last 7 Days",  icon:"📅" },
  { id:"month",      label:"This Month",   icon:"🗓️" },
  { id:"last_month", label:"Last Month",   icon:"🗓️" },
  { id:"quarter",    label:"This Quarter", icon:"📊" },
  { id:"year",       label:"This Year",    icon:"🗂️" },
  { id:"custom",     label:"Custom Range", icon:"✏️" },
];

const applyDateRange = (entries, dateRange) => {
  if (!dateRange.from && !dateRange.to) return entries;
  return entries.filter(e => {
    const d = e.date.slice(0, 10);
    if (dateRange.from && d < dateRange.from) return false;
    if (dateRange.to   && d > dateRange.to)   return false;
    return true;
  });
};

const describeDateRange = (preset, dateRange) => {
  if (preset === "all" || (!dateRange.from && !dateRange.to)) return "All Time";
  const found = PRESETS.find(p => p.id === preset);
  if (preset !== "custom" && found) return found.label;
  if (dateRange.from && dateRange.to) return `${fmtShort(dateRange.from+"T12:00:00")} – ${fmtShort(dateRange.to+"T12:00:00")}`;
  if (dateRange.from) return `From ${fmtShort(dateRange.from+"T12:00:00")}`;
  if (dateRange.to)   return `Up to ${fmtShort(dateRange.to+"T12:00:00")}`;
  return "Custom Range";
};

// ── CSV / PDF / WhatsApp exports ─────────────────────────────────
const exportCSV = (entries, currency, branding, rangeLabel) => {
  const BOM = "\uFEFF";
  const header = ["Date","Type","Category",`Amount (${currency.code})`,"Note"];
  const rows = entries.map(e=>[fmtDate(e.date),e.type,e.category,e.amount,`"${(e.note||"").replace(/"/g,'""')}"`]);
  const content = BOM + [header,...rows].map(r=>r.join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([content],{type:"text/csv;charset=utf-8;"}));
  const a = document.createElement("a");
  a.href=url; a.download=`${branding.businessName.replace(/\s+/g,"_")}_${(rangeLabel||"ledger").replace(/[^a-z0-9]/gi,"_")}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url),1000);
};

const exportPDF = (entries, currency, branding, rangeLabel, allEntries) => {
  // ── Core figures ─────────────────────────────────────────────
  const inc = entries.filter(e=>e.type==="income").reduce((s,e)=>s+e.amount,0);
  const exp = entries.filter(e=>e.type==="expense").reduce((s,e)=>s+e.amount,0);
  const bal = inc - exp;
  const margin = inc > 0 ? ((bal/inc)*100).toFixed(1) : "0.0";
  const hBg = getBg(branding);
  const pc  = branding.primaryColor;
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-NG",{dateStyle:"full"});

  // ── Revenue breakdown by category (Note 2) ───────────────────
  const incByCat = {};
  entries.filter(e=>e.type==="income").forEach(e=>{ incByCat[e.category]=(incByCat[e.category]||0)+e.amount; });
  const incCatsSorted = Object.entries(incByCat).sort((a,b)=>b[1]-a[1]);
  const topIncCat = incCatsSorted[0];

  // ── Expense breakdown by category (Note 3) ───────────────────
  const expByCat = {};
  entries.filter(e=>e.type==="expense").forEach(e=>{ expByCat[e.category]=(expByCat[e.category]||0)+e.amount; });
  const expCatsSorted = Object.entries(expByCat).sort((a,b)=>b[1]-a[1]);
  const topExpCat = expCatsSorted[0];

  // Separate cost of sales vs operating expenses (inventory = COGS)
  const cogsCats = ["Inventory","Stock","Cost of Sales","Purchases","Raw Materials","COGS"];
  const cogsExp  = entries.filter(e=>e.type==="expense" && cogsCats.some(c=>e.category.toLowerCase().includes(c.toLowerCase()))).reduce((s,e)=>s+e.amount,0);
  const opExp    = exp - cogsExp;
  const grossP   = inc - cogsExp;

  // ── Top 10 transactions (Note 4) ─────────────────────────────
  const top10 = [...entries].sort((a,b)=>b.amount-a.amount).slice(0,10);

  // ── Period comparison (Note 5) ───────────────────────────────
  // Compare current filtered period vs same-length prior period
  const sortedDates = entries.map(e=>e.date).sort();
  const periodStart = sortedDates[0] ? new Date(sortedDates[0]) : new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd   = now;
  const periodDays  = Math.max(1, Math.round((periodEnd - periodStart) / 864e5));
  const priorEnd    = new Date(periodStart); priorEnd.setDate(priorEnd.getDate()-1);
  const priorStart  = new Date(priorEnd);    priorStart.setDate(priorStart.getDate() - periodDays);
  const priorISO    = { from: priorStart.toISOString().slice(0,10), to: priorEnd.toISOString().slice(0,10) };
  const priorEntries = (allEntries||entries).filter(e=>{
    const d = e.date.slice(0,10);
    return d >= priorISO.from && d <= priorISO.to;
  });
  const priorInc = priorEntries.filter(e=>e.type==="income").reduce((s,e)=>s+e.amount,0);
  const priorExp = priorEntries.filter(e=>e.type==="expense").reduce((s,e)=>s+e.amount,0);
  const priorBal = priorInc - priorExp;
  const incChg   = priorInc>0 ? (((inc-priorInc)/priorInc)*100).toFixed(1) : null;
  const expChg   = priorExp>0 ? (((exp-priorExp)/priorExp)*100).toFixed(1) : null;
  const balChg   = priorBal!==0 ? (((bal-priorBal)/Math.abs(priorBal))*100).toFixed(1) : null;

  // ── Auto-generated summary notes ─────────────────────────────
  const revenueNote = incCatsSorted.length === 0
    ? "No revenue was recorded in this period."
    : `Revenue for the period totalled ${fmtAmt(inc,currency)}. ${topIncCat ? `The largest contributor was <strong>${topIncCat[0]}</strong> at ${fmtAmt(topIncCat[1],currency)} (${((topIncCat[1]/inc)*100).toFixed(0)}% of total revenue).` : ""} ${incCatsSorted.length > 1 ? `Revenue was generated across ${incCatsSorted.length} categories.` : ""}`;

  const expenseNote = expCatsSorted.length === 0
    ? "No expenses were recorded in this period."
    : `Total operating costs amounted to ${fmtAmt(exp,currency)}. ${topExpCat ? `The highest cost category was <strong>${topExpCat[0]}</strong> at ${fmtAmt(topExpCat[1],currency)} (${((topExpCat[1]/exp)*100).toFixed(0)}% of total expenses).` : ""} ${cogsExp > 0 ? `Cost of sales accounted for ${fmtAmt(cogsExp,currency)}, yielding a gross profit of ${fmtAmt(grossP,currency)}.` : ""}`;

  const compNote = priorInc === 0 && priorExp === 0
    ? "No prior period data is available for comparison."
    : `Compared to the prior period, revenue ${incChg !== null ? (Number(incChg)>=0 ? `<span class="up">increased by ${incChg}%</span>` : `<span class="dn">decreased by ${Math.abs(incChg)}%</span>`) : "changed"} and expenses ${expChg !== null ? (Number(expChg)>=0 ? `<span class="dn">increased by ${expChg}%</span>` : `<span class="up">decreased by ${Math.abs(expChg)}%</span>`) : "changed"}. Net profit ${balChg !== null ? (Number(balChg)>=0 ? `<span class="up">improved by ${balChg}%</span>` : `<span class="dn">declined by ${Math.abs(balChg)}%</span>`) : "changed"}.`;

  // ── HTML helpers ──────────────────────────────────────────────
  const f  = (n) => fmtAmt(n, currency);
  const pct= (n,t) => t>0 ? `${((n/t)*100).toFixed(0)}%` : "—";
  const chgBadge = (curr, prev) => {
    if (!prev || prev===0) return "";
    const d = (((curr-prev)/Math.abs(prev))*100).toFixed(1);
    return Number(d)>=0
      ? `<span style="color:#1b5e20;font-size:11px;font-weight:700;margin-left:8px">▲ ${d}%</span>`
      : `<span style="color:#c62828;font-size:11px;font-weight:700;margin-left:8px">▼ ${Math.abs(d)}%</span>`;
  };

  const noteRows = (items, total) => items.map(([cat,amt])=>`
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f5f5f5;color:#333">${cat}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f5f5f5;text-align:right;color:#555;font-size:12px">${pct(amt,total)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f5f5f5;text-align:right;font-weight:700;color:#222">${f(amt)}</td>
    </tr>`).join("");

  const top10Rows = top10.map((e,i)=>`
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid #f5f5f5;color:#888;font-size:12px">${i+1}</td>
      <td style="padding:9px 0;border-bottom:1px solid #f5f5f5;color:#333;font-size:13px">${fmtDate(e.date)}</td>
      <td style="padding:9px 0;border-bottom:1px solid #f5f5f5"><span style="background:${e.type==="income"?"#e8f5e9":"#fff3e0"};color:${e.type==="income"?"#1b5e20":"#e65100"};padding:2px 8px;border-radius:8px;font-size:11px;font-weight:700">${e.type}</span></td>
      <td style="padding:9px 0;border-bottom:1px solid #f5f5f5;color:#444;font-size:13px">${e.category}</td>
      <td style="padding:9px 0;border-bottom:1px solid #f5f5f5;color:#888;font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.note||"—"}</td>
      <td style="padding:9px 0;border-bottom:1px solid #f5f5f5;text-align:right;font-weight:800;color:${e.type==="income"?"#1b5e20":"#e65100"}">${e.type==="income"?"+":"-"}${f(e.amount)}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8">
<title>${branding.businessName} — Income Statement</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Georgia,'Times New Roman',serif;background:#fff;color:#1a1a1a;font-size:13px;line-height:1.6}
  @page{margin:18mm 16mm}
  @media print{
    body{padding:0}
    .no-break{page-break-inside:avoid}
    .page-break{page-break-before:always}
  }
  /* Cover header */
  .cover{background:${hBg};color:#fff;padding:36px 40px 28px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .cover-logo{font-size:38px;margin-bottom:10px}
  .cover-name{font-size:28px;font-weight:900;letter-spacing:-.5px}
  .cover-tag{font-size:14px;opacity:.75;margin-top:4px}
  .cover-meta{margin-top:18px;padding-top:16px;border-top:1px solid rgba(255,255,255,.25);display:flex;gap:32px;flex-wrap:wrap}
  .cover-meta-item label{font-size:10px;text-transform:uppercase;letter-spacing:1px;opacity:.6;display:block}
  .cover-meta-item span{font-size:14px;font-weight:700}

  /* Summary KPI bar */
  .kpi-bar{display:grid;grid-template-columns:repeat(3,1fr);gap:0;border:1px solid #e8e8e8;border-radius:0 0 12px 12px;overflow:hidden;margin-bottom:32px}
  .kpi{padding:18px 20px;border-right:1px solid #e8e8e8;background:#fafafa}
  .kpi:last-child{border-right:none}
  .kpi label{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#888;font-family:'Segoe UI',sans-serif}
  .kpi .val{font-size:20px;font-weight:900;margin-top:5px;font-family:'Segoe UI',sans-serif}
  .kpi .sub{font-size:11px;color:#aaa;margin-top:2px;font-family:'Segoe UI',sans-serif}

  /* Section titles */
  .section-title{font-size:11px;text-transform:uppercase;letter-spacing:2px;color:${pc};font-weight:700;font-family:'Segoe UI',sans-serif;margin:28px 40px 0;padding-bottom:8px;border-bottom:2px solid ${pc}}
  .section-body{margin:0 40px 8px;padding:0}

  /* Main statement table */
  .stmt{width:100%;border-collapse:collapse;font-family:Georgia,serif}
  .stmt td{padding:9px 0;vertical-align:top}
  .stmt .label{color:#333;padding-left:0}
  .stmt .label.indent{padding-left:24px;color:#555;font-size:12.5px}
  .stmt .note-ref{color:#aaa;font-size:11px;padding-left:8px}
  .stmt .amt{text-align:right;font-weight:600;min-width:120px}
  .stmt .subtotal td{border-top:1px solid #ccc;padding-top:10px;font-weight:700}
  .stmt .total td{border-top:2px solid #222;border-bottom:2px solid #222;padding:10px 0;font-weight:900;font-size:14px}
  .stmt .total .amt{color:${bal>=0?pc:"#c62828"}}
  .stmt .spacer td{padding:5px 0}
  .stmt .section-head td{padding-top:16px;padding-bottom:4px;font-weight:900;text-transform:uppercase;font-size:11px;letter-spacing:.5px;color:#888;font-family:'Segoe UI',sans-serif}

  /* Note blocks */
  .note-block{background:#fafafa;border-left:3px solid ${pc};padding:12px 16px;border-radius:0 8px 8px 0;margin:12px 0;font-size:12.5px;color:#444;line-height:1.65;font-family:'Segoe UI',sans-serif}
  .note-block .up{color:#1b5e20;font-weight:700}
  .note-block .dn{color:#c62828;font-weight:700}

  /* Comparison table */
  .comp-table{width:100%;border-collapse:collapse;font-family:'Segoe UI',sans-serif;font-size:13px}
  .comp-table th{text-align:left;padding:10px 0;font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:#888;border-bottom:1px solid #ddd;font-weight:700}
  .comp-table th:not(:first-child){text-align:right}
  .comp-table td{padding:10px 0;border-bottom:1px solid #f5f5f5;color:#333}
  .comp-table td:not(:first-child){text-align:right;font-weight:600}
  .comp-table .total-row td{border-top:2px solid #222;border-bottom:2px solid #222;font-weight:900;padding:11px 0}

  /* Footer */
  .doc-footer{margin:40px 40px 20px;padding-top:16px;border-top:1px solid #eee;display:flex;justify-content:space-between;align-items:center;font-family:'Segoe UI',sans-serif;font-size:11px;color:#bbb}

  /* Page padding for screen */
  @media screen{body{max-width:860px;margin:0 auto;padding-bottom:40px}}
</style>
</head><body>

<!-- ═══ COVER HEADER ═══════════════════════════════════════════ -->
<div class="cover">
  ${branding.logoType==="emoji"?`<div class="cover-logo">${branding.logo}</div>`:""}
  <div class="cover-name">${branding.businessName}</div>
  <div class="cover-tag">${branding.tagline}</div>
  <div class="cover-meta">
    <div class="cover-meta-item"><label>Report Type</label><span>Income Statement</span></div>
    <div class="cover-meta-item"><label>Period</label><span>${rangeLabel||"All Time"}</span></div>
    <div class="cover-meta-item"><label>Prepared</label><span>${dateStr}</span></div>
    <div class="cover-meta-item"><label>Currency</label><span>${currency.code} — ${currency.name}</span></div>
  </div>
</div>

<!-- ═══ KPI BAR ════════════════════════════════════════════════ -->
<div class="kpi-bar">
  <div class="kpi">
    <label>Total Revenue</label>
    <div class="val" style="color:#1b5e20">${f(inc)}</div>
    <div class="sub">${entries.filter(e=>e.type==="income").length} income entries</div>
  </div>
  <div class="kpi">
    <label>Total Expenses</label>
    <div class="val" style="color:#e65100">${f(exp)}</div>
    <div class="sub">${entries.filter(e=>e.type==="expense").length} expense entries</div>
  </div>
  <div class="kpi">
    <label>Net Profit / (Loss)</label>
    <div class="val" style="color:${bal>=0?pc:"#c62828"}">${bal<0?"(":""}${f(Math.abs(bal))}${bal<0?")":""}</div>
    <div class="sub">Profit margin: ${margin}%</div>
  </div>
</div>

<!-- ═══ STATEMENT OF COMPREHENSIVE INCOME ══════════════════════ -->
<div class="section-title">Income Statement</div>
<div class="section-body">
  <table class="stmt">
    <colgroup><col style="width:55%"><col style="width:10%"><col style="width:35%"></colgroup>
    <tbody>
      <tr class="section-head"><td>Description</td><td class="note-ref" style="text-align:center">Note</td><td class="amt">Amount (${currency.code})</td></tr>

      <!-- Revenue -->
      <tr class="spacer"><td colspan="3"></td></tr>
      <tr><td class="label"><strong>Revenue</strong></td><td class="note-ref" style="text-align:center">2</td><td class="amt" style="color:#1b5e20;font-weight:700">${f(inc)}</td></tr>
      ${incCatsSorted.map(([cat,amt])=>`<tr><td class="label indent">${cat}</td><td></td><td class="amt" style="color:#555;font-size:12px;font-weight:400">${f(amt)}</td></tr>`).join("")}

      <!-- Cost of Sales -->
      ${cogsExp > 0 ? `
      <tr class="spacer"><td colspan="3"></td></tr>
      <tr><td class="label">Cost of Sales</td><td></td><td class="amt" style="color:#e65100">(${f(cogsExp)})</td></tr>
      <tr class="subtotal"><td class="label"><strong>Gross Profit</strong></td><td></td><td class="amt" style="color:${grossP>=0?pc:"#c62828"};font-weight:900">${grossP<0?"(":""}${f(Math.abs(grossP))}${grossP<0?")":""}</td></tr>
      ` : `
      <tr class="spacer"><td colspan="3"></td></tr>
      <tr class="subtotal"><td class="label"><strong>Gross Profit</strong></td><td></td><td class="amt" style="color:${inc>=0?pc:"#c62828"};font-weight:900">${f(inc)}</td></tr>
      `}

      <!-- Operating Expenses -->
      <tr class="spacer"><td colspan="3"></td></tr>
      <tr><td class="label"><strong>Operating Expenses</strong></td><td class="note-ref" style="text-align:center">3</td><td class="amt" style="color:#e65100;font-weight:700">(${f(cogsExp>0?opExp:exp)})</td></tr>
      ${(cogsExp>0 ? expCatsSorted.filter(([cat])=>!cogsCats.some(c=>cat.toLowerCase().includes(c.toLowerCase()))) : expCatsSorted)
        .map(([cat,amt])=>`<tr><td class="label indent">${cat}</td><td></td><td class="amt" style="color:#555;font-size:12px;font-weight:400">(${f(amt)})</td></tr>`).join("")}

      <!-- Operating Profit -->
      <tr class="spacer"><td colspan="3"></td></tr>
      <tr class="subtotal"><td class="label"><strong>Operating Profit</strong></td><td></td><td class="amt" style="color:${bal>=0?pc:"#c62828"}">${bal<0?"(":""}${f(Math.abs(bal))}${bal<0?")":""}</td></tr>

      <!-- Finance items placeholder -->
      <tr class="spacer"><td colspan="3"></td></tr>
      <tr><td class="label">Finance Income / (Costs)</td><td></td><td class="amt" style="color:#888">—</td></tr>

      <!-- Profit for period -->
      <tr class="spacer"><td colspan="3"></td></tr>
      <tr class="total">
        <td class="label"><strong>Profit / (Loss) for the Period</strong></td>
        <td></td>
        <td class="amt">${bal<0?"(":""}${f(Math.abs(bal))}${bal<0?")":""}</td>
      </tr>

      <!-- Other Income / Adjustments -->
      <tr class="spacer"><td colspan="3"></td></tr>
      <tr><td class="label" style="color:#888;font-style:italic">Other Income / Adjustments</td><td></td><td class="amt" style="color:#aaa">—</td></tr>
      <tr class="spacer"><td colspan="3"></td></tr>
      <tr class="total">
        <td class="label"><strong>Total Net Income for the Period</strong></td>
        <td></td>
        <td class="amt">${bal<0?"(":""}${f(Math.abs(bal))}${bal<0?")":""}</td>
      </tr>
    </tbody>
  </table>
  <p style="font-size:11px;color:#aaa;margin-top:12px;font-family:'Segoe UI',sans-serif;font-style:italic">
    Figures in ${currency.name} (${currency.code}). Prepared on a cash basis. Numbers in parentheses ( ) denote negative values.
  </p>
</div>

<!-- ═══ NOTES TO THE FINANCIAL STATEMENTS ══════════════════════ -->
<div class="section-title" style="margin-top:36px">Notes to the Financial Statements</div>
<div class="section-body" style="padding-top:8px">

  <!-- NOTE 2 — REVENUE -->
  <div class="no-break" style="margin-bottom:24px">
    <p style="font-weight:900;font-size:13px;margin-bottom:6px;font-family:'Segoe UI',sans-serif">Note 2 — Revenue</p>
    <div class="note-block">${revenueNote}</div>
    ${incCatsSorted.length > 0 ? `
    <table style="width:100%;border-collapse:collapse;font-family:'Segoe UI',sans-serif">
      <thead><tr>
        <th style="text-align:left;padding:9px 0;font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:#888;border-bottom:1px solid #ddd;font-weight:700">Category</th>
        <th style="text-align:right;padding:9px 0;font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:#888;border-bottom:1px solid #ddd;font-weight:700">% of Total</th>
        <th style="text-align:right;padding:9px 0;font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:#888;border-bottom:1px solid #ddd;font-weight:700">Amount</th>
      </tr></thead>
      <tbody>
        ${noteRows(incCatsSorted, inc)}
        <tr style="border-top:2px solid #222"><td style="padding:10px 0;font-weight:900">Total Revenue</td><td style="text-align:right;padding:10px 0;font-weight:700">100%</td><td style="text-align:right;padding:10px 0;font-weight:900;color:#1b5e20">${f(inc)}</td></tr>
      </tbody>
    </table>` : ""}
  </div>

  <!-- NOTE 3 — OPERATING EXPENSES -->
  <div class="no-break" style="margin-bottom:24px">
    <p style="font-weight:900;font-size:13px;margin-bottom:6px;font-family:'Segoe UI',sans-serif">Note 3 — Operating Expenses</p>
    <div class="note-block">${expenseNote}</div>
    ${expCatsSorted.length > 0 ? `
    <table style="width:100%;border-collapse:collapse;font-family:'Segoe UI',sans-serif">
      <thead><tr>
        <th style="text-align:left;padding:9px 0;font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:#888;border-bottom:1px solid #ddd;font-weight:700">Category</th>
        <th style="text-align:right;padding:9px 0;font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:#888;border-bottom:1px solid #ddd;font-weight:700">% of Total</th>
        <th style="text-align:right;padding:9px 0;font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:#888;border-bottom:1px solid #ddd;font-weight:700">Amount</th>
      </tr></thead>
      <tbody>
        ${noteRows(expCatsSorted, exp)}
        <tr style="border-top:2px solid #222"><td style="padding:10px 0;font-weight:900">Total Expenses</td><td style="text-align:right;padding:10px 0;font-weight:700">100%</td><td style="text-align:right;padding:10px 0;font-weight:900;color:#e65100">${f(exp)}</td></tr>
      </tbody>
    </table>` : ""}
  </div>

  <!-- NOTE 4 — TOP TRANSACTIONS -->
  <div class="no-break page-break" style="margin-bottom:24px">
    <p style="font-weight:900;font-size:13px;margin-bottom:6px;font-family:'Segoe UI',sans-serif">Note 4 — Significant Transactions</p>
    <div class="note-block">The table below lists the top ${top10.length} transactions by value during the period, providing detail on the most material items affecting the financial position of the business.</div>
    ${top10.length > 0 ? `
    <table style="width:100%;border-collapse:collapse;font-family:'Segoe UI',sans-serif">
      <thead><tr>
        <th style="text-align:left;padding:9px 0;font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:#888;border-bottom:1px solid #ddd;font-weight:700">#</th>
        <th style="text-align:left;padding:9px 0;font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:#888;border-bottom:1px solid #ddd;font-weight:700">Date</th>
        <th style="text-align:left;padding:9px 0;font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:#888;border-bottom:1px solid #ddd;font-weight:700">Type</th>
        <th style="text-align:left;padding:9px 0;font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:#888;border-bottom:1px solid #ddd;font-weight:700">Category</th>
        <th style="text-align:left;padding:9px 0;font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:#888;border-bottom:1px solid #ddd;font-weight:700">Note</th>
        <th style="text-align:right;padding:9px 0;font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:#888;border-bottom:1px solid #ddd;font-weight:700">Amount</th>
      </tr></thead>
      <tbody>${top10Rows}</tbody>
    </table>` : `<p style="color:#aaa;font-style:italic;font-size:13px">No transactions in this period.</p>`}
  </div>

  <!-- NOTE 5 — PERIOD COMPARISON -->
  <div class="no-break" style="margin-bottom:24px">
    <p style="font-weight:900;font-size:13px;margin-bottom:6px;font-family:'Segoe UI',sans-serif">Note 5 — Comparative Period Analysis</p>
    <div class="note-block">${compNote}</div>
    <table class="comp-table">
      <thead><tr>
        <th>Line Item</th>
        <th>Current Period</th>
        <th>Prior Period</th>
        <th>Change</th>
      </tr></thead>
      <tbody>
        <tr><td>Revenue</td><td>${f(inc)}</td><td>${f(priorInc)}</td><td>${chgBadge(inc,priorInc)||"—"}</td></tr>
        <tr><td>Total Expenses</td><td>${f(exp)}</td><td>${f(priorExp)}</td><td>${chgBadge(exp,priorExp)||"—"}</td></tr>
        <tr class="total-row"><td><strong>Net Profit / (Loss)</strong></td><td style="color:${bal>=0?pc:"#c62828"}">${bal<0?"(":""}${f(Math.abs(bal))}${bal<0?")":""}</td><td style="color:${priorBal>=0?pc:"#c62828"}">${priorBal<0?"(":""}${f(Math.abs(priorBal))}${priorBal<0?")":""}</td><td>${chgBadge(bal,priorBal)||"—"}</td></tr>
        <tr><td>Profit Margin</td><td>${margin}%</td><td>${priorInc>0?((priorBal/priorInc)*100).toFixed(1):"0.0"}%</td><td>—</td></tr>
        <tr><td>No. of Transactions</td><td>${entries.length}</td><td>${priorEntries.length}</td><td>—</td></tr>
      </tbody>
    </table>
    <p style="font-size:11px;color:#aaa;margin-top:10px;font-family:'Segoe UI',sans-serif;font-style:italic">Prior period covers an equivalent time window immediately preceding the current period.</p>
  </div>

</div><!-- end section-body -->

<!-- ═══ FOOTER ═══════════════════════════════════════════════════ -->
<div class="doc-footer">
  <span>${branding.businessName} · Prepared by LedgerBook Pro</span>
  <span>Generated: ${dateStr}</span>
</div>

<script>window.onload = () => window.print()<\/script>
</body></html>`;

  const url = URL.createObjectURL(new Blob([html],{type:"text/html;charset=utf-8;"}));
  const w = window.open(url,"_blank");
  if (!w) {
    const a = document.createElement("a");
    a.href=url; a.download=`${branding.businessName.replace(/\s+/g,"_")}_income_statement.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }
  setTimeout(()=>URL.revokeObjectURL(url),8000);
};

const buildWAReport = (entries, currency, branding, rangeLabel) => {
  const inc=entries.filter(e=>e.type==="income").reduce((s,e)=>s+e.amount,0);
  const exp=entries.filter(e=>e.type==="expense").reduce((s,e)=>s+e.amount,0);
  const bal=inc-exp;
  return [
    `${branding.logoType==="emoji"?branding.logo:"🏪"} *${branding.businessName}* — Finance Report`,
    rangeLabel&&rangeLabel!=="All Time"?`📅 Period: *${rangeLabel}*`:`📅 ${new Date().toLocaleDateString("en-NG",{dateStyle:"full"})}`,
    ``,`━━━━━━━━━━━━━━━━━━━`,
    `💰 *Income:* ${fmtAmt(inc,currency)}`,`📤 *Expenses:* ${fmtAmt(exp,currency)}`,`🏦 *Balance:* ${fmtAmt(bal,currency)}`,
    `━━━━━━━━━━━━━━━━━━━`,``,`📋 *Transactions (${entries.length}):*`,
    ...entries.slice(0,5).map(e=>`${e.type==="income"?"➕":"➖"} *${e.category}* — ${fmtAmt(e.amount,currency)}${e.note?`\n   _${e.note}_`:""}`),
    entries.length>5?`_...and ${entries.length-5} more_`:"",
    ``,`_${branding.tagline}_`,`_Powered by LedgerBook Pro_`,
  ].filter(x=>x!==undefined).join("\n");
};

// ═══════════════════════════════════════════════════════════════
// DATE RANGE PICKER (Sheet)
// ═══════════════════════════════════════════════════════════════
function DateRangePicker({ preset, dateRange, onChange, onClose, primaryColor:p }) {
  const [lp, setLp] = useState(preset);
  const [lr, setLr] = useState(dateRange);
  const selectPreset = (id) => { setLp(id); if (id!=="custom") setLr(getPresetRange(id)); };
  const apply = () => { onChange(lp, lr); onClose(); };
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:190, display:"flex", alignItems:"flex-end" }}
      onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div style={{ background:"#fff", borderRadius:"24px 24px 0 0", width:"100%", maxHeight:"88vh", display:"flex", flexDirection:"column",
        paddingBottom:"env(safe-area-inset-bottom, 0px)" }}>
        <div style={{ width:40, height:4, background:"#ddd", borderRadius:2, margin:"14px auto 0" }}/>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", paddingLeft:S.px, paddingRight:S.px, paddingTop:14, paddingBottom:10 }}>
          <div style={{ fontWeight:900, fontSize:17, color:"#222" }}>📅 Filter by Date</div>
          <button onClick={onClose} style={{ background:"#f0f0f0", border:"none", borderRadius:10, padding:"6px 14px", cursor:"pointer", color:"#555", fontWeight:700, fontSize:14 }}>✕</button>
        </div>
        <div style={{ flex:1, overflowY:"auto", paddingLeft:S.px, paddingRight:S.px, paddingBottom:10 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:9, marginBottom:16 }}>
            {PRESETS.map(pr=>(
              <button key={pr.id} onClick={()=>selectPreset(pr.id)}
                style={{ padding:"12px 14px", borderRadius:14, border:`2px solid ${lp===pr.id?p:"#eee"}`,
                  background:lp===pr.id?`${p}12`:"#fafafa", cursor:"pointer", textAlign:"left",
                  display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:16 }}>{pr.icon}</span>
                <span style={{ fontWeight:lp===pr.id?800:500, fontSize:13, color:lp===pr.id?p:"#444", flex:1 }}>{pr.label}</span>
                {lp===pr.id&&<span style={{ color:p, fontWeight:900 }}>✓</span>}
              </button>
            ))}
          </div>
          {lp==="custom"&&(
            <div style={{ background:"#f7f7f7", borderRadius:14, padding:16, marginBottom:14 }}>
              <div style={{ fontWeight:800, fontSize:13, color:"#555", marginBottom:12 }}>Select Custom Range</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:"#888", textTransform:"uppercase", letterSpacing:.5, marginBottom:5 }}>From</div>
                  <input type="date" value={lr.from} onChange={e=>setLr(r=>({...r,from:e.target.value}))}
                    style={{ width:"100%", padding:"10px 12px", border:`2px solid ${lr.from?p:"#ddd"}`, borderRadius:10, fontSize:14, outline:"none", boxSizing:"border-box" }}/>
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:"#888", textTransform:"uppercase", letterSpacing:.5, marginBottom:5 }}>To</div>
                  <input type="date" value={lr.to} min={lr.from||undefined} onChange={e=>setLr(r=>({...r,to:e.target.value}))}
                    style={{ width:"100%", padding:"10px 12px", border:`2px solid ${lr.to?p:"#ddd"}`, borderRadius:10, fontSize:14, outline:"none", boxSizing:"border-box" }}/>
                </div>
              </div>
              {lr.from&&lr.to&&<div style={{ marginTop:12, background:`${p}12`, borderRadius:9, padding:"8px 12px", fontSize:13, color:p, fontWeight:600 }}>
                📅 {fmtDate(lr.from+"T12:00:00")} → {fmtDate(lr.to+"T12:00:00")}
              </div>}
            </div>
          )}
          {lp!=="custom"&&lp!=="all"&&(lr.from||lr.to)&&(
            <div style={{ background:`${p}10`, borderRadius:11, padding:"10px 14px", marginBottom:12, fontSize:13, color:p, fontWeight:600 }}>
              📅 {describeDateRange(lp,lr)}
            </div>
          )}
          {lp==="all"&&<div style={{ background:"#f0f0f0", borderRadius:11, padding:"10px 14px", marginBottom:12, fontSize:13, color:"#666" }}>
            Showing all transactions — no date filter applied
          </div>}
        </div>
        <div style={{ paddingLeft:S.px, paddingRight:S.px, paddingTop:14, paddingBottom:22, borderTop:"1px solid #f0f0f0" }}>
          <button onClick={apply} style={{ width:"100%", padding:"15px", background:p, color:"#fff", border:"none", borderRadius:14, fontSize:16, fontWeight:900, cursor:"pointer" }}>
            Apply Filter
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterBadge({ preset, dateRange, onClick, primaryColor:p }) {
  const isActive = preset!=="all";
  return (
    <button onClick={onClick} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 12px", borderRadius:20,
      border:`1.5px solid ${isActive?p:"#ddd"}`, background:isActive?`${p}12`:"#f5f5f5",
      cursor:"pointer", fontSize:12, fontWeight:isActive?700:500, color:isActive?p:"#888", whiteSpace:"nowrap" }}>
      <span>{isActive?"🗓️":"📅"}</span>
      <span>{describeDateRange(preset,dateRange)}</span>
      {isActive&&<span style={{ color:p, fontSize:10 }}>▾</span>}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════
// AUTH SCREEN — Firebase: Google + Apple + Email
// ═══════════════════════════════════════════════════════════════
function AuthScreen() {
  const [mode,    setMode]  = useState("login");
  const [form,    setForm]  = useState({name:"",email:"",password:"",confirm:"",businessName:""});
  const [err,     setErr]   = useState("");
  const [busy,    setBusy]  = useState(false);
  const [busyBtn, setBusyBtn] = useState(""); // "google" | "apple" | "email"
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  // ── Social sign-in ──────────────────────────────────────────
  const handleSocial = async (provider, name) => {
    setErr(""); setBusyBtn(name); setBusy(true);
    try {
      const result = await signInWithPopup(auth, provider);
      // If new Google/Apple user, save their business name prompt
      const uid = result.user.uid;
      if (!DB.get(`lb_bname_${uid}`)) {
        DB.set(`lb_bname_${uid}`, result.user.displayName?.split(" ")[0] + "'s Business" || "My Business");
      }
      // onAuthStateChanged in ROOT will pick up the login automatically
    } catch (e) {
      if (e.code === "auth/popup-closed-by-user") setErr("Sign-in cancelled. Please try again.");
      else if (e.code === "auth/popup-blocked") setErr("Popup was blocked. Please allow popups for this site and try again.");
      else if (e.code !== "auth/cancelled-popup-request") setErr(e.message || "Sign-in failed. Please try again.");
    } finally {
      setBusy(false); setBusyBtn("");
    }
  };

  // ── Email register ──────────────────────────────────────────
  const handleRegister = async () => {
    setErr("");
    if (!form.name.trim())         return setErr("Enter your full name");
    if (!form.businessName.trim()) return setErr("Enter your business name");
    if (!form.email.includes("@")) return setErr("Enter a valid email address");
    if (form.password.length < 6)  return setErr("Password must be at least 6 characters");
    if (form.password !== form.confirm) return setErr("Passwords do not match");
    setBusy(true); setBusyBtn("email");
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      await updateProfile(cred.user, { displayName: form.name });
      DB.set(`lb_bname_${cred.user.uid}`, form.businessName);
    } catch (e) {
      if (e.code === "auth/email-already-in-use") setErr("An account with this email already exists. Sign in instead.");
      else if (e.code === "auth/invalid-email") setErr("That email address doesn't look right.");
      else setErr(e.message || "Registration failed. Please try again.");
    } finally {
      setBusy(false); setBusyBtn("");
    }
  };

  // ── Email login ─────────────────────────────────────────────
  const handleLogin = async () => {
    setErr("");
    if (!form.email || !form.password) return setErr("Please fill in all fields");
    setBusy(true); setBusyBtn("email");
    try {
      await signInWithEmailAndPassword(auth, form.email, form.password);
    } catch (e) {
      if (e.code === "auth/user-not-found" || e.code === "auth/invalid-credential") setErr("No account found. Check your email or sign up.");
      else if (e.code === "auth/wrong-password") setErr("Incorrect password. Please try again.");
      else if (e.code === "auth/too-many-requests") setErr("Too many attempts. Please wait a moment and try again.");
      else setErr(e.message || "Sign-in failed. Please try again.");
    } finally {
      setBusy(false); setBusyBtn("");
    }
  };

  return (
    <div style={{ minHeight:"100vh",
      background:"linear-gradient(160deg,#075E54 0%,#128C7E 50%,#25D366 100%)",
      display:"flex", alignItems:"center", justifyContent:"center",
      padding:`max(24px, env(safe-area-inset-top,24px)) max(20px, env(safe-area-inset-right,20px)) max(24px, env(safe-area-inset-bottom,24px)) max(20px, env(safe-area-inset-left,20px))` }}>

      <div style={{ width:"100%", maxWidth:400, background:"#fff", borderRadius:28,
        overflow:"hidden", boxShadow:"0 24px 64px rgba(0,0,0,0.28)" }}>

        {/* Header */}
        <div style={{ background:"linear-gradient(135deg,#075E54,#25D366)", padding:"36px 28px 28px", textAlign:"center" }}>
          <div style={{ width:76, height:76, borderRadius:22, background:"rgba(255,255,255,0.2)",
            display:"flex", alignItems:"center", justifyContent:"center", fontSize:40, margin:"0 auto 16px" }}>📒</div>
          <div style={{ color:"#fff", fontWeight:900, fontSize:24, letterSpacing:-.5 }}>LedgerBook Pro</div>
          <div style={{ color:"rgba(255,255,255,0.75)", fontSize:14, marginTop:5 }}>Business Finance Tracker</div>
        </div>

        {/* Tab switcher */}
        <div style={{ display:"flex", background:"#f5f5f5" }}>
          {[["login","Sign In"],["register","Create Account"]].map(([m,l])=>(
            <button key={m} onClick={()=>{setMode(m);setErr("");}}
              style={{ flex:1, padding:"14px", border:"none", fontWeight:700, fontSize:14, cursor:"pointer",
                background:mode===m?"#fff":"transparent", color:mode===m?"#075E54":"#999",
                borderBottom:mode===m?"3px solid #075E54":"3px solid transparent" }}>
              {l}
            </button>
          ))}
        </div>

        <div style={{ padding:`24px ${S.px}px 30px` }}>

          {/* ── SOCIAL BUTTONS ── */}
          <div style={{ display:"flex", flexDirection:"column", gap:11, marginBottom:20 }}>

            {/* Google */}
            <button onClick={()=>handleSocial(googleProvider,"google")} disabled={busy}
              style={{ width:"100%", padding:"14px 16px", border:"2px solid #e8e8e8", borderRadius:14,
                background: busyBtn==="google"?"#f5f5f5":"#fff", cursor:busy?"not-allowed":"pointer",
                display:"flex", alignItems:"center", justifyContent:"center", gap:12,
                fontWeight:700, fontSize:15, color:"#333",
                boxShadow:"0 1px 4px rgba(0,0,0,0.08)", transition:"all 0.15s" }}>
              {busyBtn==="google" ? (
                <span style={{ fontSize:13, color:"#888" }}>Connecting…</span>
              ) : (
                <>
                  {/* Google G logo SVG */}
                  <svg width="20" height="20" viewBox="0 0 48 48">
                    <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.7 33.5 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.4-7.8 19.4-20 0-1.3-.1-2.7-.4-4z"/>
                    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 19 13 24 13c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.1 6.5 29.3 4 24 4c-7.8 0-14.5 4.3-17.7 10.7z"/>
                    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.6 26.8 36 24 36c-5.2 0-9.7-3.4-11.3-8.1l-6.6 5.1C9.6 39.7 16.3 44 24 44z"/>
                    <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.2-2.3 4.1-4.2 5.4l6.2 5.2C40.9 35.3 44 30 44 24c0-1.3-.1-2.7-.4-4z"/>
                  </svg>
                  Continue with Google
                </>
              )}
            </button>

            {/* Apple */}
            <button onClick={()=>handleSocial(appleProvider,"apple")} disabled={busy}
              style={{ width:"100%", padding:"14px 16px", border:"2px solid #e8e8e8", borderRadius:14,
                background: busyBtn==="apple"?"#111":"#000", cursor:busy?"not-allowed":"pointer",
                display:"flex", alignItems:"center", justifyContent:"center", gap:12,
                fontWeight:700, fontSize:15, color:"#fff",
                boxShadow:"0 1px 4px rgba(0,0,0,0.15)", transition:"all 0.15s" }}>
              {busyBtn==="apple" ? (
                <span style={{ fontSize:13, color:"#aaa" }}>Connecting…</span>
              ) : (
                <>
                  {/* Apple logo SVG */}
                  <svg width="18" height="22" viewBox="0 0 814 1000" fill="white">
                    <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 790.7 0 663 0 541.8c0-207.5 135.4-317.5 269-317.5 70.1 0 128.4 46.4 172.5 46.4 42.8 0 109.6-49 192-49 30.8 0 110.7 2.6 173.3 66.5zm-245.7-191.4c33.4-39.5 56.7-95.3 56.7-151.1 0-7.7-.6-15.4-1.9-22.4-53.5 2-116.8 35.5-154.2 79.5-29.5 33.9-57.1 89.6-57.1 146.1 0 8.3 1.3 16.6 1.9 19.2 3.2.6 8.3 1.3 13.4 1.3 47.9 0 109.6-32.1 141.2-72.6z"/>
                  </svg>
                  Continue with Apple
                </>
              )}
            </button>
          </div>

          {/* Divider */}
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
            <div style={{ flex:1, height:1, background:"#eee" }}/>
            <span style={{ fontSize:12, color:"#bbb", fontWeight:600 }}>OR</span>
            <div style={{ flex:1, height:1, background:"#eee" }}/>
          </div>

          {/* ── EMAIL FORM ── */}
          {mode==="register"&&<>
            <AInput label="Full Name"     placeholder="John Doe"        value={form.name}         onChange={v=>f("name",v)}/>
            <AInput label="Business Name" placeholder="Ade Electronics" value={form.businessName} onChange={v=>f("businessName",v)}/>
          </>}
          <AInput label="Email"    placeholder="you@example.com"  type="email"    value={form.email}    onChange={v=>f("email",v)}/>
          <AInput label="Password" placeholder="Min. 6 characters" type="password" value={form.password} onChange={v=>f("password",v)}/>
          {mode==="register"&&<AInput label="Confirm Password" placeholder="Re-enter password" type="password" value={form.confirm} onChange={v=>f("confirm",v)}/>}

          {/* Error */}
          {err&&(
            <div style={{ background:"#fff3f3", border:"1px solid #ffcdd2", borderRadius:12,
              padding:"12px 14px", color:"#c62828", fontSize:13, marginBottom:14, lineHeight:1.5 }}>
              ⚠️ {err}
            </div>
          )}

          {/* Submit */}
          <button onClick={mode==="login"?handleLogin:handleRegister} disabled={busy}
            style={{ width:"100%", padding:"15px",
              background:busy?"#ccc":"linear-gradient(135deg,#075E54,#25D366)",
              color:"#fff", border:"none", borderRadius:14, fontSize:16, fontWeight:900,
              cursor:busy?"not-allowed":"pointer",
              boxShadow:busy?"none":"0 4px 18px rgba(7,94,84,0.35)" }}>
            {busyBtn==="email" ? "Please wait…" : mode==="login" ? "Sign In →" : "Create Account →"}
          </button>

          {/* Switch mode */}
          <div style={{ textAlign:"center", marginTop:16, fontSize:13, color:"#999" }}>
            {mode==="login" ? (
              <>No account?{" "}
                <button onClick={()=>{setMode("register");setErr("");}}
                  style={{ background:"none", border:"none", color:"#075E54", fontWeight:700, cursor:"pointer", fontSize:13 }}>
                  Sign up free
                </button>
              </>
            ) : (
              <>Already have an account?{" "}
                <button onClick={()=>{setMode("login");setErr("");}}
                  style={{ background:"none", border:"none", color:"#075E54", fontWeight:700, cursor:"pointer", fontSize:13 }}>
                  Sign in
                </button>
              </>
            )}
          </div>

          {/* Terms note */}
          <div style={{ textAlign:"center", marginTop:14, fontSize:11, color:"#ccc", lineHeight:1.5 }}>
            By continuing, you agree to our Terms of Service and Privacy Policy
          </div>
        </div>
      </div>
    </div>
  );
}

function AInput({ label, placeholder, type="text", value, onChange }) {
  const [show,setShow] = useState(false);
  const isPass = type==="password";
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:11, fontWeight:700, color:"#777", textTransform:"uppercase", letterSpacing:.5, marginBottom:5 }}>{label}</div>
      <div style={{ position:"relative" }}>
        <input type={isPass&&!show?"password":isPass?"text":type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
          style={{ width:"100%", padding:`12px ${isPass?"46px":"15px"} 12px 15px`, border:"2px solid #eee",
            borderRadius:12, fontSize:15, outline:"none", boxSizing:"border-box", background:"#fafafa" }}
          onFocus={e=>{e.target.style.borderColor="#075E54";e.target.style.background="#fff";}}
          onBlur={e=>{e.target.style.borderColor="#eee";e.target.style.background="#fafafa";}}/>
        {isPass&&<button type="button" onClick={()=>setShow(s=>!s)} style={{ position:"absolute", right:13, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"#aaa", fontSize:16, padding:2 }}>{show?"🙈":"👁️"}</button>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// KEYBOARD WIDGET
// ═══════════════════════════════════════════════════════════════
function KeyboardWidget({ currency, branding, incCats, expCats, onClose }) {
  const [kwType,setKwType] = useState("income");
  const [kwAmt,setKwAmt]   = useState("");
  const [kwCat,setKwCat]   = useState("");
  const [kwNote,setKwNote] = useState("");
  const cats = kwType==="income"?incCats:expCats;
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:200, display:"flex", alignItems:"flex-end" }}
      onClick={e=>{if(e.target===e.currentTarget)onClose(null);}}>
      <div style={{ background:"#1a1a2e", borderRadius:"24px 24px 0 0", width:"100%", padding:`18px ${S.px}px`,
        paddingBottom:`max(${S.px}px, calc(env(safe-area-inset-bottom, 0px) + ${S.px}px))` }}>
        <div style={{ width:40, height:4, background:"rgba(255,255,255,0.2)", borderRadius:2, margin:"0 auto 16px" }}/>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <span style={{ color:"#fff", fontWeight:800, fontSize:16 }}>⌨️ Quick Entry</span>
          <button onClick={()=>onClose(null)} style={{ background:"rgba(255,255,255,0.12)", border:"none", color:"#fff", borderRadius:10, padding:"6px 14px", cursor:"pointer", fontSize:13, fontWeight:600 }}>✕</button>
        </div>
        <div style={{ display:"flex", background:"rgba(255,255,255,0.08)", borderRadius:12, padding:3, marginBottom:14 }}>
          {["income","expense"].map(t=>(
            <button key={t} onClick={()=>{setKwType(t);setKwCat("");}}
              style={{ flex:1, padding:"10px", border:"none", borderRadius:10, fontWeight:700, fontSize:13, cursor:"pointer",
                background:kwType===t?(t==="income"?"#25D366":"#FF9800"):"transparent", color:kwType===t?"#fff":"#888" }}>
              {t==="income"?"💰 Income":"📤 Expense"}
            </button>
          ))}
        </div>
        <input value={kwAmt} onChange={e=>setKwAmt(e.target.value)} type="number" placeholder={`Amount (${currency.symbol})`}
          style={{ width:"100%", background:"rgba(255,255,255,0.08)", border:"1.5px solid rgba(255,255,255,0.15)", borderRadius:12,
            padding:"12px 15px", color:"#fff", fontSize:22, fontWeight:800, marginBottom:12, boxSizing:"border-box", outline:"none" }}/>
        <div style={{ display:"flex", gap:7, flexWrap:"wrap", marginBottom:12 }}>
          {cats.map(c=>(
            <button key={c} onClick={()=>setKwCat(c)}
              style={{ padding:"6px 13px", borderRadius:18, border:`1.5px solid ${kwCat===c?"#25D366":"rgba(255,255,255,0.2)"}`,
                background:kwCat===c?"rgba(37,211,102,0.18)":"transparent", color:kwCat===c?"#25D366":"#bbb", fontSize:12, cursor:"pointer" }}>
              {c}
            </button>
          ))}
        </div>
        <input value={kwNote} onChange={e=>setKwNote(e.target.value)} type="text" placeholder="Note (optional)"
          style={{ width:"100%", background:"rgba(255,255,255,0.08)", border:"1.5px solid rgba(255,255,255,0.15)", borderRadius:12,
            padding:"10px 15px", color:"#fff", fontSize:14, marginBottom:14, boxSizing:"border-box", outline:"none" }}/>
        <button onClick={()=>{if(kwAmt&&kwCat)onClose({type:kwType,amount:parseFloat(kwAmt),category:kwCat,note:kwNote});}}
          style={{ width:"100%", padding:"15px", background:kwType==="income"?"#25D366":"#FF9800", color:"#fff", border:"none", borderRadius:14, fontSize:15, fontWeight:900, cursor:"pointer" }}>
          ✓ Save Entry
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS SCREEN
// ═══════════════════════════════════════════════════════════════
const COLORS = ["#075E54","#1a237e","#880e4f","#bf360c","#1b5e20","#4a148c","#006064","#212121","#b71c1c","#e65100","#f57f17","#37474f"];

function SettingsScreen({ branding, setBranding, currency, setCurrency, incCats, setIncCats, expCats, setExpCats, user, onLogout, onClose }) {
  const [tab, setTab] = useState("brand");
  const [newCat, setNewCat] = useState({type:"income",value:""});
  const logoRef = useRef();
  const p  = branding.primaryColor;
  const bg = getBg(branding);

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file||!file.type.startsWith("image/")) return;
    const r = new FileReader();
    r.onload = ev => setBranding(b=>({...b,logoType:"image",logoImage:ev.target.result}));
    r.readAsDataURL(file);
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"#f4f4f4", zIndex:150, display:"flex", flexDirection:"column",
      paddingTop:"env(safe-area-inset-top, 0px)",
      paddingLeft:"env(safe-area-inset-left, 0px)",
      paddingRight:"env(safe-area-inset-right, 0px)" }}>
      {/* Header */}
      <div style={{ background:bg, paddingLeft:S.px, paddingRight:S.px, paddingTop:14, paddingBottom:13,
        display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
        <button onClick={onClose} style={{ background:"rgba(255,255,255,0.2)", border:"none", color:"#fff", borderRadius:10, padding:"8px 14px", cursor:"pointer", fontSize:14, fontWeight:700 }}>← Back</button>
        <div style={{ color:"#fff", fontWeight:900, fontSize:17 }}>Settings</div>
      </div>
      {/* Tab Bar */}
      <div style={{ display:"flex", background:"#fff", borderBottom:"1px solid #eee", flexShrink:0 }}>
        {[["brand","🎨 Brand"],["currency","💱 Currency"],["cats","📂 Categories"],["account","👤 Account"]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{ flex:1, padding:"12px 4px", border:"none", background:"none", fontSize:11, fontWeight:700,
              color:tab===id?p:"#bbb", borderBottom:`2.5px solid ${tab===id?p:"transparent"}`,
              cursor:"pointer", marginBottom:-1, textAlign:"center" }}>
            {label}
          </button>
        ))}
      </div>
      {/* Content */}
      <div style={{ flex:1, overflowY:"auto",
        paddingLeft:S.px, paddingRight:S.px, paddingTop:S.sectionGap,
        paddingBottom:`max(${S.px}px, calc(env(safe-area-inset-bottom,0px) + ${S.px}px))` }}>

        {tab==="brand"&&<>
          {/* Live Preview */}
          <div style={{ background:bg, borderRadius:18, padding:"20px 22px", marginBottom:22, color:"#fff", textAlign:"center" }}>
            {branding.logoType==="image"&&branding.logoImage
              ?<img src={branding.logoImage} alt="logo" style={{ width:62, height:62, borderRadius:15, objectFit:"cover", border:"3px solid rgba(255,255,255,0.4)", margin:"0 auto 12px", display:"block" }}/>
              :<div style={{ width:62, height:62, borderRadius:15, background:"rgba(255,255,255,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:34, margin:"0 auto 12px" }}>{branding.logo}</div>
            }
            <div style={{ fontWeight:900, fontSize:19 }}>{branding.businessName}</div>
            <div style={{ fontSize:13, opacity:.75, marginTop:3 }}>{branding.tagline}</div>
          </div>
          <SLbl>Business Name</SLbl>
          <SIn value={branding.businessName} onChange={v=>setBranding(b=>({...b,businessName:v}))}/>
          <SLbl>Tagline</SLbl>
          <SIn value={branding.tagline} onChange={v=>setBranding(b=>({...b,tagline:v}))}/>
          <SLbl>Logo</SLbl>
          <div style={{ display:"flex", gap:10, marginBottom:14 }}>
            <button onClick={()=>setBranding(b=>({...b,logoType:"emoji"}))}
              style={{ flex:1, padding:"11px", border:`2px solid ${branding.logoType==="emoji"?p:"#ddd"}`, borderRadius:12,
                background:branding.logoType==="emoji"?`${p}12`:"#fff", cursor:"pointer", fontWeight:700, color:branding.logoType==="emoji"?p:"#999", fontSize:13 }}>
              😀 Use Emoji
            </button>
            <button onClick={()=>logoRef.current?.click()}
              style={{ flex:1, padding:"11px", border:`2px solid ${branding.logoType==="image"?p:"#ddd"}`, borderRadius:12,
                background:branding.logoType==="image"?`${p}12`:"#fff", cursor:"pointer", fontWeight:700, color:branding.logoType==="image"?p:"#999", fontSize:13 }}>
              🖼️ Upload Image
            </button>
            <input ref={logoRef} type="file" accept="image/*" style={{ display:"none" }} onChange={handleLogoUpload}/>
          </div>
          {branding.logoType==="image"&&branding.logoImage&&(
            <div style={{ display:"flex", alignItems:"center", gap:12, background:"#f0fff4", borderRadius:13, padding:"11px 15px", marginBottom:14 }}>
              <img src={branding.logoImage} alt="logo" style={{ width:50, height:50, borderRadius:11, objectFit:"cover" }}/>
              <div style={{ flex:1 }}><div style={{ fontWeight:700, fontSize:13 }}>Logo uploaded ✓</div><div style={{ fontSize:11, color:"#888", marginTop:2 }}>Tap Upload to change</div></div>
              <button onClick={()=>setBranding(b=>({...b,logoType:"emoji",logoImage:null}))} style={{ background:"none", border:"none", color:"#ccc", cursor:"pointer", fontSize:20 }}>✕</button>
            </div>
          )}
          {branding.logoType==="emoji"&&(
            <div style={{ display:"flex", flexWrap:"wrap", gap:9, marginBottom:18 }}>
              {["🏪","🏬","🛍️","🍽️","💼","🔧","💊","🎓","🚗","💻","🏗️","🌿","🧴","📦","🎯","🏋️"].map(e=>(
                <button key={e} onClick={()=>setBranding(b=>({...b,logo:e}))}
                  style={{ width:46, height:46, borderRadius:12, border:`2px solid ${branding.logo===e?p:"#ddd"}`, background:branding.logo===e?`${p}15`:"#fff", fontSize:25, cursor:"pointer" }}>{e}</button>
              ))}
            </div>
          )}
          <SLbl>Header Style</SLbl>
          <div style={{ display:"flex", gap:10, marginBottom:18 }}>
            {[["🎨 Solid Color",false],["🌈 Gradient",true]].map(([lbl,val])=>(
              <button key={String(val)} onClick={()=>setBranding(b=>({...b,useGradient:val}))}
                style={{ flex:1, padding:"12px", border:`2px solid ${branding.useGradient===val?p:"#ddd"}`, borderRadius:12,
                  background:branding.useGradient===val?`${p}12`:"#fff", cursor:"pointer", fontWeight:700, fontSize:13, color:branding.useGradient===val?p:"#999" }}>
                {lbl}
              </button>
            ))}
          </div>
          <SLbl>Primary Color</SLbl>
          <div style={{ display:"flex", flexWrap:"wrap", gap:9, marginBottom:12 }}>
            {COLORS.map(c=>(
              <button key={c} onClick={()=>setBranding(b=>({...b,primaryColor:c}))}
                style={{ width:38, height:38, borderRadius:10, background:c,
                  border:`3px solid ${branding.primaryColor===c?"#fff":"transparent"}`,
                  outline:`2.5px solid ${branding.primaryColor===c?c:"transparent"}`, cursor:"pointer" }}/>
            ))}
          </div>
          <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:18 }}>
            <input type="color" value={branding.primaryColor} onChange={e=>setBranding(b=>({...b,primaryColor:e.target.value}))}
              style={{ width:48, height:48, border:"none", borderRadius:11, cursor:"pointer", padding:3 }}/>
            <SIn value={branding.primaryColor} onChange={v=>setBranding(b=>({...b,primaryColor:v}))} style={{ flex:1, marginBottom:0 }} placeholder="#075E54"/>
          </div>
          {branding.useGradient&&<>
            <SLbl>Gradient Second Color</SLbl>
            <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:18 }}>
              <input type="color" value={branding.gradientColor2} onChange={e=>setBranding(b=>({...b,gradientColor2:e.target.value}))}
                style={{ width:48, height:48, border:"none", borderRadius:11, cursor:"pointer", padding:3 }}/>
              <SIn value={branding.gradientColor2} onChange={v=>setBranding(b=>({...b,gradientColor2:v}))} style={{ flex:1, marginBottom:0 }} placeholder="#25D366"/>
            </div>
            <SLbl>Gradient Angle — {branding.gradientAngle}°</SLbl>
            <input type="range" min={0} max={360} step={5} value={branding.gradientAngle} onChange={e=>setBranding(b=>({...b,gradientAngle:parseInt(e.target.value)}))}
              style={{ width:"100%", accentColor:p, marginBottom:10 }}/>
            <div style={{ display:"flex", gap:7, flexWrap:"wrap", marginBottom:14 }}>
              {[[0,"↓"],[45,"↙"],[90,"←"],[135,"↖"],[180,"↑"],[225,"↗"],[270,"→"],[315,"↘"]].map(([deg,arrow])=>(
                <button key={deg} onClick={()=>setBranding(b=>({...b,gradientAngle:deg}))}
                  style={{ padding:"7px 12px", borderRadius:10, border:`1.5px solid ${branding.gradientAngle===deg?p:"#ddd"}`,
                    background:branding.gradientAngle===deg?`${p}18`:"#fff", color:branding.gradientAngle===deg?p:"#999", fontSize:12, cursor:"pointer", fontWeight:600 }}>
                  {arrow} {deg}°
                </button>
              ))}
            </div>
            <div style={{ height:52, borderRadius:14, background:getBg(branding), marginBottom:18, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <span style={{ color:"#fff", fontWeight:700, fontSize:13 }}>Gradient Preview</span>
            </div>
          </>}
        </>}

        {tab==="currency"&&<>
          <div style={{ background:bg, borderRadius:16, padding:"18px 20px", marginBottom:20, textAlign:"center", color:"#fff" }}>
            <div style={{ fontSize:36, fontWeight:900 }}>{currency.symbol}</div>
            <div style={{ fontWeight:700, fontSize:17, marginTop:4 }}>{currency.name}</div>
            <div style={{ opacity:.7, fontSize:13, marginTop:2 }}>{currency.code}</div>
          </div>
          {CURRENCIES.map(c=>(
            <button key={c.code} onClick={()=>setCurrency(c)}
              style={{ width:"100%", display:"flex", alignItems:"center", gap:14, padding:"14px 16px", marginBottom:9, borderRadius:14,
                border:`2px solid ${currency.code===c.code?p:"#eee"}`, background:currency.code===c.code?`${p}0d`:"#fff", cursor:"pointer", textAlign:"left" }}>
              <div style={{ width:46, height:46, borderRadius:12, background:`${p}20`, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, color:p, fontSize:18 }}>{c.symbol}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, color:"#333", fontSize:14 }}>{c.name}</div>
                <div style={{ fontSize:12, color:"#999", marginTop:2 }}>{c.code}</div>
              </div>
              {currency.code===c.code&&<div style={{ color:p, fontWeight:900, fontSize:17 }}>✓</div>}
            </button>
          ))}
        </>}

        {tab==="cats"&&<>
          {[["income","💰 Income Categories",incCats,setIncCats],["expense","📤 Expense Categories",expCats,setExpCats]].map(([type,title,cats,setCats])=>(
            <div key={type} style={{ marginBottom:28 }}>
              <div style={{ fontWeight:800, color:"#333", marginBottom:13, fontSize:15 }}>{title}</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:9, marginBottom:13 }}>
                {cats.map(c=>(
                  <div key={c} style={{ display:"flex", alignItems:"center", gap:6, background:"#f0f0f0", borderRadius:20, padding:"7px 13px 7px 11px" }}>
                    <span style={{ fontSize:13 }}>{c}</span>
                    <button onClick={()=>setCats(prev=>prev.filter(x=>x!==c))} style={{ background:"none", border:"none", color:"#bbb", cursor:"pointer", fontSize:17, lineHeight:1, padding:0 }}>×</button>
                  </div>
                ))}
              </div>
              <div style={{ display:"flex", gap:9 }}>
                <input value={newCat.type===type?newCat.value:""} onChange={e=>setNewCat({type,value:e.target.value})} onFocus={()=>setNewCat(n=>({...n,type}))}
                  placeholder={`Add ${type} category…`} style={{ flex:1, padding:"11px 14px", borderRadius:12, border:"2px solid #e0e0e0", fontSize:14, outline:"none" }}
                  onKeyDown={e=>{ if(e.key==="Enter"&&newCat.value.trim()&&!cats.includes(newCat.value.trim())){setCats(p=>[...p,newCat.value.trim()]);setNewCat({type,value:""});} }}/>
                <button onClick={()=>{ if(newCat.value.trim()&&!cats.includes(newCat.value.trim())){setCats(p=>[...p,newCat.value.trim()]);setNewCat({type,value:""});} }}
                  style={{ background:p, color:"#fff", border:"none", borderRadius:12, padding:"0 20px", fontWeight:900, cursor:"pointer", fontSize:22 }}>+</button>
              </div>
            </div>
          ))}
        </>}

        {tab==="account"&&<>
          <div style={{ background:bg, borderRadius:18, padding:"22px 20px", marginBottom:20, color:"#fff", textAlign:"center" }}>
            <div style={{ width:68, height:68, borderRadius:"50%", background:"rgba(255,255,255,0.25)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:32, margin:"0 auto 14px" }}>👤</div>
            <div style={{ fontWeight:900, fontSize:19 }}>{user.name}</div>
            <div style={{ opacity:.75, fontSize:13, marginTop:5 }}>{user.email}</div>
            <div style={{ opacity:.55, fontSize:12, marginTop:4 }}>Member since {fmtDate(user.createdAt)}</div>
          </div>
          <div style={{ background:"#fff", borderRadius:16, overflow:"hidden", marginBottom:18 }}>
            {[["Business Name",user.businessName||"—"],["Email",user.email],["Account ID",`#${user.id.toUpperCase()}`]].map(([k,v])=>(
              <div key={k} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"15px 18px", borderBottom:"1px solid #f0f0f0" }}>
                <span style={{ color:"#999", fontSize:14 }}>{k}</span>
                <span style={{ fontWeight:700, color:"#333", fontSize:14 }}>{v}</span>
              </div>
            ))}
          </div>
          <button onClick={onLogout} style={{ width:"100%", padding:"15px", background:"#fff", border:"2px solid #ffcdd2", borderRadius:14, color:"#c62828", fontWeight:900, cursor:"pointer", fontSize:15 }}>🚪 Sign Out</button>

          {/* ── Legal links ── */}
          <div style={{ marginTop:24 }}>
            <div style={{ fontSize:11, fontWeight:800, color:"#bbb", textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>Legal</div>
            <div style={{ background:"#fff", borderRadius:16, overflow:"hidden", border:"1px solid #f0f0f0" }}>
              {[
                ["🔒", "Privacy Policy",   "https://ledgerbook-nu.vercel.app/privacy"],
                ["📋", "Terms of Service", "https://ledgerbook-nu.vercel.app/terms"],
                ["📧", "Contact Support",  "mailto:v.bookenterprise@gmail.com"],
              ].map(([icon, label, href]) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                  style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                    padding:"15px 18px", borderBottom:"1px solid #f5f5f5", textDecoration:"none",
                    color:"#333", fontSize:14, fontWeight:600 }}>
                  <span style={{ display:"flex", alignItems:"center", gap:11 }}>
                    <span style={{ fontSize:17 }}>{icon}</span>
                    {label}
                  </span>
                  <span style={{ color:"#ccc", fontSize:16 }}>›</span>
                </a>
              ))}
            </div>
            <div style={{ textAlign:"center", fontSize:11, color:"#ccc", marginTop:12 }}>
              LedgerBook Pro · VBook Enterprise · v1.0
            </div>
          </div>
        </>}
      </div>
    </div>
  );
}

function SLbl({ children }) {
  return <div style={{ fontSize:11, fontWeight:800, color:"#777", textTransform:"uppercase", letterSpacing:.6, marginBottom:8 }}>{children}</div>;
}
function SIn({ value, onChange, style={}, placeholder="" }) {
  return <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
    style={{ width:"100%", padding:"12px 15px", border:"2px solid #e5e5e5", borderRadius:12, fontSize:15, outline:"none", marginBottom:18, boxSizing:"border-box", ...style }}/>;
}

// ═══════════════════════════════════════════════════════════════
// TRANSACTION ROW
// ═══════════════════════════════════════════════════════════════
function TxRow({ entry, currency, onDelete, p }) {
  return (
    <div style={{ background:"#fafafa", borderRadius:14, padding:"12px 14px", marginBottom:9, display:"flex", alignItems:"center", gap:12,
      borderLeft:`4px solid ${entry.type==="income"?"#25D366":"#FF9800"}` }}>
      <div style={{ width:38, height:38, borderRadius:"50%", background:entry.type==="income"?"#E8F5E9":"#FFF3E0",
        display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>
        {entry.type==="income"?"💰":"📤"}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontWeight:700, fontSize:14, color:"#222", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{entry.category}</div>
        {entry.note&&<div style={{ fontSize:11, color:"#aaa", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", marginTop:2 }}>{entry.note}</div>}
      </div>
      <div style={{ textAlign:"right", flexShrink:0 }}>
        <div style={{ fontWeight:900, fontSize:14, color:entry.type==="income"?"#1B5E20":"#E65100" }}>
          {entry.type==="income"?"+":"-"}{fmtAmt(entry.amount,currency)}
        </div>
        <div style={{ fontSize:11, color:"#ccc", marginTop:2 }}>{fmtShort(entry.date)}</div>
      </div>
      <button onClick={()=>onDelete(entry.id)} style={{ background:"none", border:"none", color:"#ddd", cursor:"pointer", fontSize:16, padding:"0 0 0 6px", flexShrink:0 }}>✕</button>
    </div>
  );
}

function CatChart({ entries, currency, type, color }) {
  const cats = entries.filter(e=>e.type===type).reduce((a,e)=>{ a[e.category]=(a[e.category]||0)+e.amount; return a; },{});
  const sorted = Object.entries(cats).sort((a,b)=>b[1]-a[1]);
  const total = sorted.reduce((s,[,v])=>s+v,0); const max = sorted[0]?.[1]||1;
  if (!sorted.length) return <div style={{ color:"#ccc", fontSize:13, textAlign:"center", padding:14 }}>No {type} entries in this period</div>;
  return (
    <div>
      {sorted.map(([cat,amt])=>(
        <div key={cat} style={{ marginBottom:11 }}>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:4 }}>
            <span style={{ color:"#555" }}>{cat}</span>
            <div>
              <span style={{ fontWeight:700, color:"#333" }}>{fmtAmt(amt,currency)}</span>
              <span style={{ fontSize:11, color:"#bbb", marginLeft:6 }}>{Math.round((amt/total)*100)}%</span>
            </div>
          </div>
          <div style={{ height:7, background:"#efefef", borderRadius:4 }}>
            <div style={{ height:"100%", borderRadius:4, background:color, width:`${(amt/max)*100}%`, transition:"width 0.6s ease" }}/>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ROOT
// ═══════════════════════════════════════════════════════════════
export default function LedgerBookPro() {
  const [user,setUser]           = useState(null);
  const [authChecked,setChecked] = useState(false);

  useEffect(()=>{
    // Firebase listens for login/logout automatically
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        const u = {
          id:           firebaseUser.uid,
          name:         firebaseUser.displayName || firebaseUser.email.split("@")[0],
          email:        firebaseUser.email,
          businessName: DB.get(`lb_bname_${firebaseUser.uid}`) || "My Business",
          photoURL:     firebaseUser.photoURL || null,
          createdAt:    firebaseUser.metadata.creationTime || new Date().toISOString(),
        };
        // Tell Sentry who is logged in — makes error reports much easier to investigate
        Sentry.setUser({ id: firebaseUser.uid, email: firebaseUser.email, username: u.name });
        setUser(u);
      } else {
        Sentry.setUser(null); // clear user on logout
        setUser(null);
      }
      setChecked(true);
    });
    return () => unsub();
  },[]);

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
  };

  if (!authChecked) return (
    <>
      <GlobalStyles/>
      <div style={{ minHeight:"100vh", background:"#075E54", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ color:"#fff", fontSize:18 }}>Loading…</div>
      </div>
    </>
  );
  if (!user) return (<><GlobalStyles/><AuthScreen/></>);
  return (<><GlobalStyles/><AppCore user={user} onLogout={handleLogout}/></>);
}

// ═══════════════════════════════════════════════════════════════
// APP CORE — Firestore powered
// ═══════════════════════════════════════════════════════════════
function AppCore({ user, onLogout }) {
  const uid = user.id;

  // ── Data state — all start empty, loaded from Firestore ──────
  const [entries,  setEntries]   = useState([]);
  const [branding, setBranding]  = useState({...DEFAULT_BRANDING, businessName: user.businessName || "My Business"});
  const [currency, setCurrency]  = useState(DEFAULT_CURRENCY);
  const [incCats,  setIncCats]   = useState(DEFAULT_INC_CATS);
  const [expCats,  setExpCats]   = useState(DEFAULT_EXP_CATS);
  const [loading,  setLoading]   = useState(true); // show spinner while data loads

  const [view,      setView]      = useState("home");
  const [form,      setForm]      = useState({type:"income",amount:"",category:"",note:""});
  const [txFilter,  setTxFilter]  = useState("all");
  const [toast,     setToast]     = useState(null);
  const [showKB,    setShowKB]    = useState(false);
  const [showSt,    setShowSt]    = useState(false);
  const [showWA,    setShowWA]    = useState(false);
  const [showDP,    setShowDP]    = useState(false);
  const [waPhone,   setWaPhone]   = useState("");
  const [datePreset,setDatePreset]= useState("all");
  const [dateRange, setDateRange] = useState({from:"",to:""});

  const handleDateChange = (preset,range) => { setDatePreset(preset); setDateRange(range); };

  // ── Load settings from Firestore once on mount ───────────────
  useEffect(() => {
    let unsubEntries;
    const loadData = async () => {
      try {
        // Load settings (branding, currency, categories)
        const snap = await getDoc(settingsDoc(uid));
        if (snap.exists()) {
          const d = snap.data();
          if (d.branding)  setBranding(d.branding);
          if (d.currency)  setCurrency(d.currency);
          if (d.incCats)   setIncCats(d.incCats);
          if (d.expCats)   setExpCats(d.expCats);
        }
        // Real-time listener for entries
        const q = query(entriesCol(uid), orderBy("date", "desc"));
        unsubEntries = onSnapshot(q, (snapshot) => {
          const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          setEntries(data);
          setLoading(false);
        }, (err) => {
          Sentry.captureException(err, { tags: { operation: "entries_snapshot" } });
          setLoading(false);
        });
      } catch(e) {
        Sentry.captureException(e, { tags: { operation: "load_user_data" } });
        setLoading(false);
      }
    };
    loadData();
    return () => { if (unsubEntries) unsubEntries(); };
  }, [uid]);

  // ── Save settings to Firestore whenever they change ──────────
  const savingRef = useRef(false);
  useEffect(() => {
    if (loading) return; // don't save defaults before data loads
    saveSettings(uid, { branding, currency, incCats, expCats });
  }, [branding, currency, incCats, expCats]);

  const p  = branding.primaryColor;
  const bg = getBg(branding);

  const dateFilt  = useMemo(()=>applyDateRange(entries,dateRange),[entries,dateRange]);
  const histFilt  = useMemo(()=>txFilter==="all"?dateFilt:dateFilt.filter(e=>e.type===txFilter),[dateFilt,txFilter]);
  const grouped   = useMemo(()=>histFilt.reduce((acc,e)=>{ const d=e.date.slice(0,10);if(!acc[d])acc[d]=[];acc[d].push(e);return acc; },{}),[histFilt]);
  const totalInc  = useMemo(()=>dateFilt.filter(e=>e.type==="income").reduce((s,e)=>s+e.amount,0),[dateFilt]);
  const totalExp  = useMemo(()=>dateFilt.filter(e=>e.type==="expense").reduce((s,e)=>s+e.amount,0),[dateFilt]);
  const balance   = totalInc - totalExp;
  const allInc    = useMemo(()=>entries.filter(e=>e.type==="income").reduce((s,e)=>s+e.amount,0),[entries]);
  const allExp    = useMemo(()=>entries.filter(e=>e.type==="expense").reduce((s,e)=>s+e.amount,0),[entries]);
  const rLabel    = describeDateRange(datePreset, dateRange);
  const cats      = form.type==="income"?incCats:expCats;

  const showToast = (msg,color) => { setToast({msg,color:color||p}); setTimeout(()=>setToast(null),2600); };

  // ── Add entry — saves to Firestore ───────────────────────────
  const handleAdd = async () => {
    if (!form.amount||!form.category) return showToast("⚠️ Fill all required fields","#c62828");
    const entry = { ...form, amount: parseFloat(form.amount), date: new Date().toISOString() };
    try {
      await addEntry(uid, entry);
      setForm({type:"income",amount:"",category:"",note:""});
      showToast(entry.type==="income"?"✅ Income recorded!":"📤 Expense recorded!","#25D366");
      setView("home");
    } catch(e) {
      Sentry.captureException(e, { tags: { operation: "add_entry" } });
      showToast("❌ Failed to save. Check connection.","#c62828");
    }
  };

  const handleDel = async (id) => {
    try {
      await delEntry(uid, id);
      showToast("Removed","#888");
    } catch(e) {
      Sentry.captureException(e, { tags: { operation: "delete_entry" } });
      showToast("❌ Failed to delete.","#c62828");
    }
  };

  const handleKB = async (data) => {
    if (data) {
      try {
        await addEntry(uid, { ...data, date: new Date().toISOString() });
        showToast("⌨️ Quick entry saved!");
      } catch(e) {
        Sentry.captureException(e, { tags: { operation: "quick_entry" } });
        showToast("❌ Failed to save.","#c62828");
      }
    }
    setShowKB(false);
  };

  // ── Responsive breakpoint ────────────────────────────────────
  const bp = useBreakpoint();
  const isDesktop = bp === "desktop";
  const isTablet  = bp === "tablet";

  // ── Loading screen while Firestore data loads ────────────────
  if (loading) return (
    <div style={{ minHeight:"100vh", background:"#075E54", display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center", gap:16 }}>
      <div style={{ width:56, height:56, borderRadius:16, background:"rgba(255,255,255,0.15)",
        display:"flex", alignItems:"center", justifyContent:"center", fontSize:30 }}>📒</div>
      <div style={{ color:"#fff", fontSize:16, fontWeight:700 }}>Loading your data…</div>
      <div style={{ color:"rgba(255,255,255,0.6)", fontSize:13 }}>{user.name}</div>
    </div>
  );

  // Shared inner padding style
  const PX = { paddingLeft:S.px, paddingRight:S.px };

  // ── Sidebar nav items ────────────────────────────────────────
  const NAV_ITEMS = [
    { id:"home",    icon:"🏠", label:"Home"    },
    { id:"add",     icon:"➕", label:"Add Entry"},
    { id:"history", icon:"📋", label:"History" },
    { id:"summary", icon:"📊", label:"Summary" },
  ];

  // ── Sidebar (desktop only) ───────────────────────────────────
  const Sidebar = () => (
    <div className="lb-sidebar" style={{ background:bg, color:"#fff" }}>
      {/* Brand */}
      <div style={{ padding:"32px 24px 24px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:13, marginBottom:20 }}>
          {branding.logoType==="image"&&branding.logoImage
            ?<img src={branding.logoImage} alt="logo" style={{ width:48, height:48, borderRadius:14, objectFit:"cover", border:"2px solid rgba(255,255,255,0.35)" }}/>
            :<div style={{ width:48, height:48, borderRadius:14, background:"rgba(255,255,255,0.18)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, flexShrink:0 }}>{branding.logo}</div>
          }
          <div style={{ minWidth:0 }}>
            <div style={{ fontWeight:900, fontSize:15, letterSpacing:-.3, lineHeight:1.2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{branding.businessName}</div>
            <div style={{ fontSize:11, opacity:.6, marginTop:3 }}>{branding.tagline}</div>
          </div>
        </div>
        {/* Balance pill */}
        <div style={{ background:"rgba(0,0,0,0.18)", borderRadius:14, padding:"14px 18px", backdropFilter:"blur(8px)" }}>
          <div style={{ fontSize:10, opacity:.55, textTransform:"uppercase", letterSpacing:1.2, marginBottom:5 }}>Net Balance</div>
          <div style={{ fontWeight:900, fontSize:22, letterSpacing:-.5 }}>{fmtAmt(allInc-allExp,currency)}</div>
          <div style={{ display:"flex", gap:16, marginTop:10 }}>
            <div>
              <div style={{ fontSize:9, opacity:.5, textTransform:"uppercase", letterSpacing:.8, marginBottom:2 }}>Income</div>
              <div style={{ fontSize:12, fontWeight:700, opacity:.85 }}>{fmtAmt(allInc,currency)}</div>
            </div>
            <div style={{ width:1, background:"rgba(255,255,255,0.15)" }}/>
            <div>
              <div style={{ fontSize:9, opacity:.5, textTransform:"uppercase", letterSpacing:.8, marginBottom:2 }}>Expenses</div>
              <div style={{ fontSize:12, fontWeight:700, opacity:.85 }}>{fmtAmt(allExp,currency)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height:1, background:"rgba(255,255,255,0.1)", margin:"0 20px" }}/>

      {/* Nav links */}
      <nav style={{ flex:1, padding:"16px 14px" }}>
        <div style={{ fontSize:10, opacity:.45, textTransform:"uppercase", letterSpacing:1.5, padding:"0 10px", marginBottom:8 }}>Navigation</div>
        {NAV_ITEMS.map(({id,icon,label})=>(
          <button key={id} onClick={()=>setView(id)}
            style={{ width:"100%", display:"flex", alignItems:"center", gap:13, padding:"12px 14px", borderRadius:14,
              marginBottom:3, border:"none", cursor:"pointer", textAlign:"left", fontSize:14,
              fontWeight:view===id?800:500, transition:"all 0.15s",
              background:view===id?"rgba(255,255,255,0.22)":"transparent",
              color:view===id?"#fff":"rgba(255,255,255,0.65)" }}>
            <span style={{ fontSize:17, width:22, textAlign:"center", flexShrink:0 }}>{icon}</span>
            {label}
            {view===id&&<div style={{ marginLeft:"auto", width:6, height:6, borderRadius:"50%", background:"#fff" }}/>}
          </button>
        ))}

        {/* Divider */}
        <div style={{ height:1, background:"rgba(255,255,255,0.1)", margin:"14px 4px" }}/>
        <div style={{ fontSize:10, opacity:.45, textTransform:"uppercase", letterSpacing:1.5, padding:"0 10px", marginBottom:8 }}>Tools</div>
        {[["⌨️","Quick Entry",()=>setShowKB(true)],["💬","WhatsApp Share",()=>setShowWA(true)],["⚙️","Settings",()=>setShowSt(true)]].map(([icon,label,fn])=>(
          <button key={label} onClick={fn}
            style={{ width:"100%", display:"flex", alignItems:"center", gap:13, padding:"11px 14px", borderRadius:14,
              marginBottom:3, border:"none", cursor:"pointer", textAlign:"left", fontSize:13, fontWeight:500,
              background:"transparent", color:"rgba(255,255,255,0.6)", transition:"all 0.15s" }}>
            <span style={{ fontSize:16, width:22, textAlign:"center", flexShrink:0 }}>{icon}</span>
            {label}
          </button>
        ))}
      </nav>

      {/* Footer — user + signout */}
      <div style={{ padding:"16px 14px 28px", borderTop:"1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:11, padding:"12px 14px", borderRadius:14, background:"rgba(0,0,0,0.15)", marginBottom:10 }}>
          <div style={{ width:34, height:34, borderRadius:"50%", background:"rgba(255,255,255,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>👤</div>
          <div style={{ minWidth:0, flex:1 }}>
            <div style={{ fontWeight:700, fontSize:13, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user.name}</div>
            <div style={{ fontSize:10, opacity:.5, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", marginTop:1 }}>{user.email}</div>
          </div>
        </div>
        <button onClick={onLogout}
          style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"11px 14px", borderRadius:12,
            border:"1px solid rgba(255,255,255,0.18)", cursor:"pointer", fontSize:13, fontWeight:600,
            background:"transparent", color:"rgba(255,255,255,0.5)", transition:"all 0.15s" }}>
          🚪 Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="lb-root" style={{ fontFamily:"'Segoe UI',system-ui,sans-serif" }}>

      {/* ── SIDEBAR (desktop) ── */}
      <Sidebar/>

      {/* ── MAIN SHELL ── */}
      <div className="lb-shell">
      <div className="lb-shell-inner" style={{ display:"flex", flexDirection:"column", minHeight:"100vh" }}>

        {/* ── HEADER ── */}
        <div className="lb-header" style={{
          background:bg,
          paddingLeft: isDesktop ? 36 : S.px,
          paddingRight: isDesktop ? 36 : S.px,
          paddingTop:isDesktop?0:`max(16px, calc(env(safe-area-inset-top,0px) + 16px))`,
          paddingBottom: isDesktop ? 0 : 14,
          position:"sticky", top:0, zIndex:10,
        }}>
          <div style={{
            display:"flex", alignItems:"center", justifyContent:"space-between",
            height: isDesktop ? 64 : "auto",
            maxWidth: isDesktop ? 1060 : "100%",
            margin: isDesktop ? "0 auto" : 0,
          }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              {!isDesktop&&(branding.logoType==="image"&&branding.logoImage
                ?<img src={branding.logoImage} alt="logo" style={{ width:40, height:40, borderRadius:12, objectFit:"cover", border:"2px solid rgba(255,255,255,0.4)", flexShrink:0 }}/>
                :<div style={{ width:40, height:40, borderRadius:12, background:"rgba(255,255,255,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>{branding.logo}</div>
              )}
              <div style={{ minWidth:0 }}>
                <div style={{ fontWeight:900, fontSize:isDesktop?20:16, color:"#fff", letterSpacing:isDesktop?-.5:.1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                  {isDesktop ? (NAV_ITEMS.find(n=>n.id===view)?.label || branding.businessName) : branding.businessName}
                </div>
                {!isDesktop&&<div style={{ fontSize:11, color:"rgba(255,255,255,0.72)", marginTop:1 }}>{branding.tagline}</div>}
                {isDesktop&&<div style={{ fontSize:12, color:"rgba(255,255,255,0.55)", marginTop:1 }}>
                  {new Date().toLocaleDateString("en-NG",{weekday:"long", day:"numeric", month:"long", year:"numeric"})}
                </div>}
              </div>
            </div>
            <div style={{ display:"flex", gap:8, flexShrink:0 }}>
              {isDesktop ? [
                ["📊","Export CSV",()=>{exportCSV(entries,currency,branding,"All Time");showToast("📊 CSV downloaded!","#1b5e20");}],
                ["🖨️","PDF Report",()=>{exportPDF(dateFilt,currency,branding,rLabel,entries);showToast("🖨️ Opening PDF…","#1a237e");}],
              ].map(([icon,label,fn])=>(
                <button key={label} onClick={fn}
                  style={{ background:"rgba(255,255,255,0.18)", border:"1px solid rgba(255,255,255,0.25)", borderRadius:11, color:"#fff",
                    padding:"9px 16px", cursor:"pointer", fontSize:13, fontWeight:700,
                    display:"flex", alignItems:"center", gap:7, backdropFilter:"blur(4px)" }}>
                  {icon} {label}
                </button>
              )) : [["⌨️",()=>setShowKB(true),"Quick Entry"],["💬",()=>setShowWA(true),"WhatsApp"],["⚙️",()=>setShowSt(true),"Settings"]].map(([icon,fn,title])=>(
                <button key={title} onClick={fn} title={title}
                  style={{ background:"rgba(255,255,255,0.18)", border:"none", borderRadius:10, color:"#fff",
                    width:36, height:36, cursor:"pointer", fontSize:15, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  {icon}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ══ HOME ══ */}
        {view==="home"&&(
          <div className="lb-content" style={{ flex:1, overflowY:"auto", paddingBottom:isDesktop?48:`calc(${S.navH}px + env(safe-area-inset-bottom,0px) + 8px)`,
            padding: isDesktop ? "28px 36px 48px" : undefined }}>
            <div style={{ paddingLeft: isDesktop?0:S.px, paddingRight: isDesktop?0:S.px, paddingTop: isDesktop?0:20 }}>

              {/* Balance card */}
              <div style={{ background:bg, borderRadius:isDesktop?22:20, padding: isDesktop?"28px 32px 24px":"22px 22px 18px",
                color:"#fff", boxShadow:`0 8px 32px ${p}45`, marginBottom:isDesktop?24:16 }}>
                <div style={{ fontSize:11, opacity:.7, textTransform:"uppercase", letterSpacing:1.8, marginBottom:6 }}>Net Balance · All Time</div>
                <div style={{ fontSize:isDesktop?44:34, fontWeight:900, letterSpacing:-1.5, marginBottom:isDesktop?20:16 }}>{fmtAmt(allInc-allExp,currency)}</div>
                <div style={{ display:"flex", background:"rgba(0,0,0,0.15)", borderRadius:14, overflow:"hidden" }}>
                  <div style={{ flex:1, padding: isDesktop?"14px 20px":"11px 16px" }}>
                    <div style={{ fontSize:10, opacity:.65, marginBottom:3, textTransform:"uppercase", letterSpacing:1 }}>📥 Income</div>
                    <div style={{ fontWeight:800, fontSize:isDesktop?16:14 }}>{fmtAmt(allInc,currency)}</div>
                  </div>
                  <div style={{ width:1, background:"rgba(255,255,255,0.15)" }}/>
                  <div style={{ flex:1, padding: isDesktop?"14px 20px":"11px 16px" }}>
                    <div style={{ fontSize:10, opacity:.65, marginBottom:3, textTransform:"uppercase", letterSpacing:1 }}>📤 Expenses</div>
                    <div style={{ fontWeight:800, fontSize:isDesktop?16:14 }}>{fmtAmt(allExp,currency)}</div>
                  </div>
                  {isDesktop&&<>
                    <div style={{ width:1, background:"rgba(255,255,255,0.15)" }}/>
                    <div style={{ flex:1, padding:"14px 20px" }}>
                      <div style={{ fontSize:10, opacity:.65, marginBottom:3, textTransform:"uppercase", letterSpacing:1 }}>📈 Margin</div>
                      <div style={{ fontWeight:800, fontSize:16 }}>{allInc>0?((( allInc-allExp)/allInc)*100).toFixed(1):0}%</div>
                    </div>
                    <div style={{ width:1, background:"rgba(255,255,255,0.15)" }}/>
                    <div style={{ flex:1, padding:"14px 20px" }}>
                      <div style={{ fontSize:10, opacity:.65, marginBottom:3, textTransform:"uppercase", letterSpacing:1 }}>🧾 Entries</div>
                      <div style={{ fontWeight:800, fontSize:16 }}>{entries.length}</div>
                    </div>
                  </>}
                </div>
              </div>

              {/* Quick Actions grid */}
              <div className="lb-cards-grid" style={{ marginBottom:isDesktop?24:16 }}>
                <button className="lb-card-action" onClick={()=>{setForm({type:"income",amount:"",category:"",note:""});setView("add");}}
                  style={{ background:"#F0FBF4", border:"2px solid #25D366", borderRadius:16, padding:"16px 14px", cursor:"pointer", textAlign:"left" }}>
                  <div style={{ fontSize:isDesktop?28:24, marginBottom:isDesktop?10:6 }}>➕</div>
                  <div style={{ fontWeight:800, color:"#1B5E20", fontSize:isDesktop?15:14 }}>Add Income</div>
                  <div style={{ fontSize:11, color:"#4CAF50", marginTop:3 }}>Sales, service, payment</div>
                </button>
                <button className="lb-card-action" onClick={()=>{setForm({type:"expense",amount:"",category:"",note:""});setView("add");}}
                  style={{ background:"#FFF8F0", border:"2px solid #FF9800", borderRadius:16, padding:"16px 14px", cursor:"pointer", textAlign:"left" }}>
                  <div style={{ fontSize:isDesktop?28:24, marginBottom:isDesktop?10:6 }}>➖</div>
                  <div style={{ fontWeight:800, color:"#E65100", fontSize:isDesktop?15:14 }}>Add Expense</div>
                  <div style={{ fontSize:11, color:"#FF9800", marginTop:3 }}>Cost, bill, purchase</div>
                </button>
                {isDesktop&&<>
                  <button className="lb-card-action" onClick={()=>{exportCSV(entries,currency,branding,"All Time");showToast("📊 CSV downloaded!","#1b5e20");}}
                    style={{ background:"#F0FBF0", border:"2px solid #C8E6C9", borderRadius:16, padding:"16px 14px", cursor:"pointer", textAlign:"left" }}>
                    <div style={{ fontSize:28, marginBottom:10 }}>📊</div>
                    <div style={{ fontWeight:800, color:"#2E7D32", fontSize:15 }}>Export CSV</div>
                    <div style={{ fontSize:11, color:"#66BB6A", marginTop:3 }}>Download spreadsheet</div>
                  </button>
                  <button className="lb-card-action" onClick={()=>{exportPDF(dateFilt,currency,branding,rLabel,entries);showToast("🖨️ Opening PDF…","#1a237e");}}
                    style={{ background:"#F3F0FF", border:"2px solid #C5CAE9", borderRadius:16, padding:"16px 14px", cursor:"pointer", textAlign:"left" }}>
                    <div style={{ fontSize:28, marginBottom:10 }}>🖨️</div>
                    <div style={{ fontWeight:800, color:"#283593", fontSize:15 }}>PDF Report</div>
                    <div style={{ fontSize:11, color:"#7986CB", marginTop:3 }}>Income statement</div>
                  </button>
                </>}
              </div>

              {/* Export row — mobile/tablet only */}
              {!isDesktop&&<div style={{ display:"flex", gap:10, marginBottom:16 }}>
                <button onClick={()=>{exportCSV(entries,currency,branding,"All Time");showToast("📊 CSV downloaded!","#1b5e20");}}
                  style={{ flex:1, padding:"10px", background:"#F0FBF0", border:"1.5px solid #C8E6C9", borderRadius:12, fontSize:12, fontWeight:700, cursor:"pointer", color:"#2E7D32" }}>
                  📊 Export CSV
                </button>
                <button onClick={()=>{exportPDF(entries,currency,branding,"All Time",entries);showToast("🖨️ Opening PDF…","#1a237e");}}
                  style={{ flex:1, padding:"10px", background:"#F3F0FF", border:"1.5px solid #C5CAE9", borderRadius:12, fontSize:12, fontWeight:700, cursor:"pointer", color:"#283593" }}>
                  🖨️ PDF Report
                </button>
              </div>}

              {/* Recent Transactions + Charts */}
              <div className="lb-page-grid">
                {/* Left — transactions */}
                <div className="lb-section">
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                    <div style={{ fontWeight:900, fontSize:isDesktop?16:15, color:isDesktop?"#1a1a1a":p }}>Recent Transactions</div>
                    <button onClick={()=>setView("history")} style={{ background:"none", border:`1.5px solid ${p}`, color:p, fontSize:12, cursor:"pointer", fontWeight:700, borderRadius:20, padding:"5px 14px" }}>View All →</button>
                  </div>
                  {entries.slice(0,isDesktop?8:6).map(e=><TxRow key={e.id} entry={e} currency={currency} onDelete={handleDel} p={p}/>)}
                  {entries.length===0&&(
                    <div style={{ textAlign:"center", padding:"40px 0", color:"#ccc", fontSize:14, lineHeight:2 }}>
                      <div style={{ fontSize:40, marginBottom:8 }}>📭</div>
                      No entries yet. Add your first transaction!
                    </div>
                  )}
                </div>

                {/* Right — charts (desktop only) */}
                {isDesktop&&<div>
                  <div className="lb-section" style={{ marginBottom:16 }}>
                    <div style={{ fontWeight:800, fontSize:14, color:"#1a1a1a", marginBottom:14 }}>💰 Income by Category</div>
                    <CatChart entries={entries} currency={currency} type="income" color="#25D366"/>
                  </div>
                  <div className="lb-section">
                    <div style={{ fontWeight:800, fontSize:14, color:"#1a1a1a", marginBottom:14 }}>📤 Expenses by Category</div>
                    <CatChart entries={entries} currency={currency} type="expense" color="#FF9800"/>
                  </div>
                </div>}
              </div>

            </div>
          </div>
        )}

        {/* ══ ADD ENTRY ══ */}
        {view==="add"&&(
          <div style={{ flex:1, overflowY:"auto",
            paddingLeft: isDesktop?0:S.px, paddingRight: isDesktop?0:S.px,
            paddingTop: isDesktop?28:24,
            paddingBottom: isDesktop?48:`calc(${S.navH}px + env(safe-area-inset-bottom,0px) + 24px)`,
            padding: isDesktop ? "28px 36px 48px" : undefined }}>
            <div style={{ maxWidth: isDesktop?560:undefined, margin: isDesktop?"0 auto":undefined }}>
              {isDesktop&&<div style={{ fontWeight:900, fontSize:22, color:"#1a1a1a", marginBottom:24, letterSpacing:-.5 }}>
                {form.type==="income"?"➕ Record Income":"➖ Record Expense"}
              </div>}
              <div className="lb-section" style={{ padding: isDesktop?"28px 32px":undefined }}>
                {!isDesktop&&<div style={{ fontWeight:900, fontSize:17, color:p, marginBottom:18 }}>
                  {form.type==="income"?"➕ Record Income":"➖ Record Expense"}
                </div>}
                <div style={{ display:"flex", background:"#f2f2f2", borderRadius:14, padding:4, marginBottom:22 }}>
                  {["income","expense"].map(t=>(
                    <button key={t} onClick={()=>setForm(f=>({...f,type:t,category:""}))}
                      style={{ flex:1, padding:"12px", border:"none", borderRadius:11, fontWeight:800, fontSize:14, cursor:"pointer",
                        background:form.type===t?(t==="income"?"#25D366":"#FF9800"):"transparent", color:form.type===t?"#fff":"#888" }}>
                      {t==="income"?"💰 Income":"📤 Expense"}
                    </button>
                  ))}
                </div>
                <FLabel>Amount ({currency.symbol})</FLabel>
                <input type="number" placeholder="0" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))}
                  style={{ width:"100%", padding:"16px 18px", border:`2.5px solid ${form.amount?p:"#e5e5e5"}`, borderRadius:14, fontSize:isDesktop?32:28,
                    fontWeight:900, color:form.type==="income"?"#1B5E20":"#E65100", outline:"none", marginBottom:22, boxSizing:"border-box", background:"#fafafa" }}/>
                <FLabel>Category</FLabel>
                <div style={{ display:"flex", flexWrap:"wrap", gap:9, marginBottom:22 }}>
                  {cats.map(c=>(
                    <button key={c} onClick={()=>setForm(f=>({...f,category:c}))}
                      style={{ padding:"9px 16px", borderRadius:22, border:`2px solid ${form.category===c?p:"#e0e0e0"}`,
                        background:form.category===c?`${p}15`:"#fff", fontWeight:form.category===c?800:400,
                        color:form.category===c?p:"#666", fontSize:13, cursor:"pointer" }}>
                      {c}
                    </button>
                  ))}
                </div>
                <FLabel>Note (optional)</FLabel>
                <input type="text" placeholder="Customer name, description…" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}
                  style={{ width:"100%", padding:"14px 16px", border:"2px solid #e5e5e5", borderRadius:14, fontSize:15, outline:"none", marginBottom:24, boxSizing:"border-box", background:"#fafafa" }}/>
                <button onClick={handleAdd}
                  style={{ width:"100%", padding:"17px", background:form.type==="income"?"#25D366":"#FF9800", color:"#fff",
                    border:"none", borderRadius:16, fontSize:17, fontWeight:900, cursor:"pointer",
                    boxShadow:`0 4px 20px ${form.type==="income"?"#25D36640":"#FF980040"}` }}>
                  Save Entry
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ HISTORY ══ */}
        {view==="history"&&(
          <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden",
            padding: isDesktop ? "28px 36px 0" : undefined }}>
            {/* Sub-header */}
            <div className="lb-subheader" style={{ paddingLeft:S.px, paddingRight:S.px, paddingTop:18, paddingBottom:12, borderBottom: isDesktop?"none":"1px solid #f0f0f0", background: isDesktop?"transparent":"#fff", flexShrink:0 }}>
              {isDesktop&&<div style={{ fontWeight:900, fontSize:22, color:"#1a1a1a", marginBottom:18, letterSpacing:-.5 }}>Transaction History</div>}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                {!isDesktop&&<div style={{ fontWeight:900, fontSize:15, color:p }}>Transaction History</div>}
                <FilterBadge preset={datePreset} dateRange={dateRange} onClick={()=>setShowDP(true)} primaryColor={p}/>
              </div>
              <div style={{ display:"flex", background: isDesktop?"#fff":"#f2f2f2", borderRadius:12, padding:3, boxShadow: isDesktop?"0 1px 3px rgba(0,0,0,0.07)":undefined }}>
                {[["all","All"],["income","💰 Income"],["expense","📤 Expense"]].map(([f,l])=>(
                  <button key={f} onClick={()=>setTxFilter(f)}
                    style={{ flex:1, padding:"9px 4px", border:"none", borderRadius:10, fontSize:13, fontWeight:700, cursor:"pointer",
                      background:txFilter===f?p:"transparent", color:txFilter===f?"#fff":"#888" }}>
                    {l}
                  </button>
                ))}
              </div>
              {datePreset!=="all"&&(
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                  background:`${p}10`, borderRadius:11, padding:"9px 13px", marginTop:10 }}>
                  <span style={{ fontSize:12, color:p, fontWeight:700 }}>📅 {rLabel} · {histFilt.length} transaction{histFilt.length!==1?"s":""}</span>
                  <button onClick={()=>handleDateChange("all",{from:"",to:""})} style={{ background:"none", border:"none", color:p, cursor:"pointer", fontSize:12, fontWeight:800 }}>Clear ✕</button>
                </div>
              )}
              {datePreset!=="all"&&histFilt.length>0&&(
                <div style={{ display:"flex", gap:9, marginTop:10 }}>
                  <button onClick={()=>{exportCSV(histFilt,currency,branding,rLabel);showToast("📊 Exported!","#1b5e20");}}
                    style={{ flex:1, padding:"9px", background:"#F0FBF0", border:"1.5px solid #C8E6C9", borderRadius:10, fontSize:12, fontWeight:700, cursor:"pointer", color:"#2E7D32" }}>
                    📊 CSV
                  </button>
                  <button onClick={()=>{exportPDF(histFilt,currency,branding,rLabel,entries);showToast("🖨️ Opening…","#1a237e");}}
                    style={{ flex:1, padding:"9px", background:"#F3F0FF", border:"1.5px solid #C5CAE9", borderRadius:10, fontSize:12, fontWeight:700, cursor:"pointer", color:"#283593" }}>
                    🖨️ PDF
                  </button>
                </div>
              )}
            </div>
            {/* Scrollable list */}
            <div style={{ flex:1, overflowY:"auto",
              paddingLeft: isDesktop?0:S.px, paddingRight: isDesktop?0:S.px,
              paddingTop:14,
              paddingBottom:isDesktop?40:`calc(${S.navH}px + env(safe-area-inset-bottom,0px) + 10px)` }}>
              <div className={isDesktop?"lb-section":""} style={{ padding: isDesktop?"24px 26px":undefined }}>
                {Object.keys(grouped).sort((a,b)=>b.localeCompare(a)).map(day=>(
                  <div key={day}>
                    <div style={{ fontSize:11, color:"#bbb", fontWeight:700, textTransform:"uppercase", letterSpacing:.5, margin:"10px 0 7px" }}>
                      {fmtDate(day+"T12:00:00")}
                    </div>
                    {grouped[day].map(e=><TxRow key={e.id} entry={e} currency={currency} onDelete={handleDel} p={p}/>)}
                  </div>
                ))}
                {histFilt.length===0&&(
                  <div style={{ textAlign:"center", color:"#ccc", marginTop:48, fontSize:14, lineHeight:2 }}>
                    <div style={{ fontSize:40, marginBottom:8 }}>📭</div>
                    <div>No transactions found</div>
                    {datePreset!=="all"&&<div style={{ fontSize:12, marginTop:6 }}>
                      <button onClick={()=>handleDateChange("all",{from:"",to:""})} style={{ background:"none", border:"none", color:p, cursor:"pointer", fontWeight:700, fontSize:13 }}>Clear date filter</button>
                    </div>}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}


        {/* ══ SUMMARY ══ */}
        {view==="summary"&&(
          <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden",
            padding: isDesktop ? "28px 36px 0" : undefined }}>
            {/* Sub-header */}
            <div style={{ paddingLeft: isDesktop?0:S.px, paddingRight: isDesktop?0:S.px, paddingTop: isDesktop?0:18, paddingBottom:12,
              borderBottom: isDesktop?"none":"1px solid #f0f0f0", background: isDesktop?"transparent":"#fff", flexShrink:0 }}>
              {isDesktop&&<div style={{ fontWeight:900, fontSize:22, color:"#1a1a1a", marginBottom:18, letterSpacing:-.5 }}>Business Summary</div>}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                {!isDesktop&&<div style={{ fontWeight:900, fontSize:15, color:p }}>Business Summary</div>}
                <FilterBadge preset={datePreset} dateRange={dateRange} onClick={()=>setShowDP(true)} primaryColor={p}/>
              </div>
              {datePreset!=="all"&&(
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                  background:`${p}10`, borderRadius:11, padding:"9px 13px" }}>
                  <span style={{ fontSize:12, color:p, fontWeight:700 }}>📅 {rLabel} · {dateFilt.length} transactions</span>
                  <button onClick={()=>handleDateChange("all",{from:"",to:""})} style={{ background:"none", border:"none", color:p, cursor:"pointer", fontSize:12, fontWeight:800 }}>Clear ✕</button>
                </div>
              )}
            </div>

            <div style={{ flex:1, overflowY:"auto",
              paddingLeft: isDesktop?0:S.px, paddingRight: isDesktop?0:S.px,
              paddingTop: isDesktop?0:18,
              paddingBottom: isDesktop?48:`calc(${S.navH}px + env(safe-area-inset-bottom,0px) + 10px)` }}>

              {/* P&L hero card */}
              <div style={{ background:bg, borderRadius:isDesktop?22:20, padding: isDesktop?"28px 32px":"20px 22px", marginBottom:isDesktop?24:16, color:"#fff",
                boxShadow:`0 8px 32px ${p}40` }}>
                <div style={{ fontSize:11, opacity:.7, textTransform:"uppercase", letterSpacing:1.8, marginBottom:6 }}>Profit & Loss · {rLabel}</div>
                <div style={{ fontSize:isDesktop?40:30, fontWeight:900, letterSpacing:-1, marginBottom:isDesktop?20:16 }}>{fmtAmt(balance,currency)}</div>
                <div style={{ display:"flex", gap:0, background:"rgba(0,0,0,0.15)", borderRadius:14, overflow:"hidden" }}>
                  {[["REVENUE",fmtAmt(totalInc,currency)],["EXPENSES",fmtAmt(totalExp,currency)],["MARGIN",(totalInc>0?Math.round((balance/totalInc)*100):0)+"%"]].map(([label,val],i)=>(
                    <div key={label} style={{ flex:1, padding: isDesktop?"14px 20px":"11px 14px", borderRight: i<2?"1px solid rgba(255,255,255,0.15)":undefined }}>
                      <div style={{ fontSize:9, opacity:.6, textTransform:"uppercase", letterSpacing:1.2, marginBottom:4 }}>{label}</div>
                      <div style={{ fontWeight:800, fontSize:isDesktop?15:13 }}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Charts grid */}
              <div className="lb-summary-grid" style={{ marginBottom: isDesktop?24:0 }}>
                <div className="lb-section" style={{ marginBottom: isDesktop?0:14 }}>
                  <div style={{ fontWeight:800, color: isDesktop?"#1a1a1a":"#333", marginBottom:14, fontSize:14 }}>💰 Income Breakdown</div>
                  <CatChart entries={dateFilt} currency={currency} type="income" color="#25D366"/>
                </div>
                <div className="lb-section" style={{ marginBottom: isDesktop?0:14 }}>
                  <div style={{ fontWeight:800, color: isDesktop?"#1a1a1a":"#333", marginBottom:14, fontSize:14 }}>📤 Expense Breakdown</div>
                  <CatChart entries={dateFilt} currency={currency} type="expense" color="#FF9800"/>
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display:"flex", gap:12, marginTop: isDesktop?0:4, marginBottom:12, flexWrap:"wrap" }}>
                <button onClick={()=>{exportCSV(dateFilt,currency,branding,rLabel);showToast("📊 CSV downloaded!","#1b5e20");}}
                  style={{ flex:1, minWidth:140, padding:"13px", background:"#F0FBF0", border:"1.5px solid #C8E6C9", borderRadius:14, fontWeight:700, cursor:"pointer", fontSize:13, color:"#2E7D32" }}>
                  📊 Export CSV
                </button>
                <button onClick={()=>{exportPDF(dateFilt,currency,branding,rLabel,entries);showToast("🖨️ Opening PDF…","#1a237e");}}
                  style={{ flex:1, minWidth:140, padding:"13px", background:"#F3F0FF", border:"1.5px solid #C5CAE9", borderRadius:14, fontWeight:700, cursor:"pointer", fontSize:13, color:"#283593" }}>
                  🖨️ PDF Report
                </button>
                <button onClick={()=>setShowWA(true)}
                  style={{ flex:1, minWidth:140, padding:"13px", background:"#25D366", color:"#fff", border:"none", borderRadius:14, fontSize:13, fontWeight:900, cursor:"pointer" }}>
                  💬 WhatsApp
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── BOTTOM NAV (mobile/tablet only) ── */}
        <div className="lb-bottom-nav" style={{
          background:"#fff", borderTop:"1px solid #ebebeb",
          position:"sticky", bottom:0, zIndex:10,
          paddingBottom:"env(safe-area-inset-bottom, 0px)",
        }}>
          {[
            {id:"home",   icon:"🏠", label:"Home"},
            {id:"add",    icon:"➕", label:"Add"},
            {id:"history",icon:"📋", label:"History"},
            {id:"summary",icon:"📊", label:"Summary"},
          ].map(tab=>(
            <button key={tab.id} onClick={()=>{ if(tab.id==="add")setForm({type:"income",amount:"",category:"",note:""}); setView(tab.id); }}
              style={{ flex:1, padding:"13px 4px 10px", border:"none", background:"none", cursor:"pointer",
                display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
              <span style={{ fontSize:22 }}>{tab.icon}</span>
              <span style={{ fontSize:10, fontWeight:700, color:view===tab.id?p:"#ccc", lineHeight:1 }}>
                {tab.label}
                {(tab.id==="history"||tab.id==="summary")&&datePreset!=="all"
                  ?<span style={{ color:p }}> ●</span>:null}
              </span>
              {view===tab.id&&<div style={{ width:20, height:3, background:p, borderRadius:2 }}/>}
            </button>
          ))}
        </div>

        {/* ── OVERLAYS ── */}
        {showKB&&<KeyboardWidget currency={currency} branding={branding} incCats={incCats} expCats={expCats} onClose={handleKB}/>}
        {showSt&&<SettingsScreen branding={branding} setBranding={setBranding} currency={currency} setCurrency={setCurrency}
          incCats={incCats} setIncCats={setIncCats} expCats={expCats} setExpCats={setExpCats}
          user={user} onLogout={onLogout} onClose={()=>setShowSt(false)}/>}
        {showDP&&<DateRangePicker preset={datePreset} dateRange={dateRange} onChange={handleDateChange} onClose={()=>setShowDP(false)} primaryColor={p}/>}

        {/* WhatsApp Modal */}
        {showWA&&(
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:180, display:"flex", alignItems:"flex-end" }}
            onClick={e=>{if(e.target===e.currentTarget)setShowWA(false);}}>
          <div style={{ background:"#fff", borderRadius:"24px 24px 0 0", width:"100%",
            paddingLeft:S.px, paddingRight:S.px, paddingTop:26,
            paddingBottom:`max(26px, calc(env(safe-area-inset-bottom,0px) + 26px))` }}>
              <div style={{ fontWeight:900, fontSize:17, marginBottom:4, color:"#222" }}>💬 Share via WhatsApp</div>
              <div style={{ fontSize:12, color:"#999", marginBottom:12 }}>
                Period: <span style={{ color:p, fontWeight:700 }}>{rLabel}</span> · {dateFilt.length} transactions
              </div>
              <div style={{ background:"#f0f7f0", borderRadius:14, padding:14, fontSize:12, color:"#555", marginBottom:16,
                whiteSpace:"pre-wrap", maxHeight:160, overflow:"auto", fontFamily:"monospace", lineHeight:1.6 }}>
                {buildWAReport(dateFilt,currency,branding,rLabel)}
              </div>
              <div style={{ fontSize:12, color:"#999", marginBottom:7 }}>Phone number (optional, with country code)</div>
              <input value={waPhone} onChange={e=>setWaPhone(e.target.value)} placeholder="e.g. 2348012345678"
                style={{ width:"100%", padding:"12px 15px", borderRadius:12, border:"2px solid #eee", fontSize:14, marginBottom:16, boxSizing:"border-box", outline:"none" }}/>
              <div style={{ display:"flex", gap:10 }}>
                <button onClick={()=>{navigator.clipboard.writeText(buildWAReport(dateFilt,currency,branding,rLabel));showToast("📋 Copied!");setShowWA(false);}}
                  style={{ flex:1, padding:"13px", background:"#f2f2f2", border:"none", borderRadius:13, fontWeight:700, cursor:"pointer", fontSize:14 }}>📋 Copy</button>
                <button onClick={()=>{ const t=buildWAReport(dateFilt,currency,branding,rLabel); window.open(waPhone?`https://wa.me/${waPhone}?text=${encodeURIComponent(t)}`:`https://wa.me/?text=${encodeURIComponent(t)}`,"_blank"); setShowWA(false); }}
                  style={{ flex:2, padding:"13px", background:"#25D366", color:"#fff", border:"none", borderRadius:13, fontWeight:900, cursor:"pointer", fontSize:15 }}>💬 Open WhatsApp</button>
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast&&(
          <div style={{ position:"fixed", bottom:isDesktop?24:`calc(${S.navH + 12}px + env(safe-area-inset-bottom,0px))`,
            left:"50%", transform:"translateX(-50%)", background:toast.color, color:"#fff",
            padding:"11px 24px", borderRadius:24, fontWeight:700, fontSize:13,
            boxShadow:"0 4px 20px rgba(0,0,0,0.2)", zIndex:300, whiteSpace:"nowrap", pointerEvents:"none" }}>
            {toast.msg}
          </div>
        )}

        {/* ── SUPPORT CHAT WIDGET — disabled, pending WhatsApp Cloud API setup ── */}
        {/* <SupportWidget user={user} primaryColor={p}/> */}

      </div>{/* lb-shell-inner */}
      </div>{/* lb-shell */}
    </div>   /* lb-root */
  );
}

// SUPPORT CHAT WIDGET — removed pending WhatsApp Cloud API setup
// const SUPPORT_NUMBER = "2348152900802";

function FLabel({ children }) {
  return <div style={{ fontSize:11, fontWeight:800, color:"#999", textTransform:"uppercase", letterSpacing:.5, marginBottom:8 }}>{children}</div>;
}
