// ================================================================
// Cash Counter — Business Finance Tracker by VBook Enterprise
// UI Fix: Proper mobile padding, safe-area insets, responsive layout
// ================================================================

import React, { useState, useEffect, useRef, useMemo } from "react";
import * as Sentry from "@sentry/react";
import {
  trackSignup, trackLogin, trackLogout, trackPasswordReset,
  trackOnboardingStart, trackOnboardingComplete, trackOnboardingSkip,
  trackPage, trackEntryAdded, trackEntryEdited, trackEntryDeleted,
  trackUpgradeModalOpen, trackUpgradeInitiated, trackUpgradeSuccess,
  trackLimitReached, trackAdClick, trackBudgetCreated,
  trackExportCSV, trackExportPDF, trackQuickEntry, trackEmailVerified,
} from "./analytics.js";
import {
  auth, db,
  googleProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  onAuthStateChanged,
  signOut,
  reload,
  deleteUser,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  EmailAuthProvider,
  applyActionCode,
  doc, getDoc, getDocs, setDoc, updateDoc,
  collection, addDoc, deleteDoc,
  onSnapshot, query, orderBy, where, limit, serverTimestamp,
} from "./firebase.js";

// ── Inject global CSS for safe-area, viewport, scrollbar hiding ─
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Funnel+Display:wght@300;400;500;600;700;800&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; overflow-x: hidden; font-family: 'Funnel Display', sans-serif; }
  body { -webkit-font-smoothing: antialiased; }
  ::-webkit-scrollbar { display: none; }
  * { scrollbar-width: none; -ms-overflow-style: none; }
  input[type="number"]::-webkit-inner-spin-button,
  input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  input[type="number"] { -moz-appearance: textfield; }
  input[type="date"] { -webkit-appearance: none; appearance: none; display: block; }
  input[type="date"]::-webkit-calendar-picker-indicator { opacity: 0.5; cursor: pointer; }
  button { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
  input, button { font-family: inherit; }

  /* ── Responsive layout system ── */

  /* Mobile default */
  .lb-root         { display: flex; min-height: 100vh; background: #f0f0f0; }
  .lb-sidebar      { display: none; }
  .lb-shell        { flex: 1; display: flex; flex-direction: column; min-height: 100vh;
                     background: #fff; width: 100%; max-width: 100%; overflow-x: hidden; }
  .lb-content      { flex: 1; overflow-y: auto; overflow-x: hidden; }
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

const notifsCol  = (uid) => collection(db, "users", uid, "notifications");
const addNotif   = (uid, n) => addDoc(notifsCol(uid), { ...n, read: false, createdAt: serverTimestamp() });
const markNotifRead = (uid, id) => updateDoc(doc(db, "users", uid, "notifications", id), { read: true });
const markAllRead   = async (uid, notifs) => {
  const unread = notifs.filter(n => !n.read);
  await Promise.all(unread.map(n => markNotifRead(uid, n.id)));
};
// Settings doc: users/{uid}/settings/prefs
const settingsDoc = (uid) => doc(db, "users", uid, "settings", "prefs");
// Entries collection: users/{uid}/entries
const entriesCol  = (uid) => collection(db, "users", uid, "entries");
// Budgets collection: users/{uid}/budgets
const budgetsCol  = (uid) => collection(db, "users", uid, "budgets");
const addBudget   = (uid, b) => addDoc(budgetsCol(uid), { ...b, createdAt: serverTimestamp() });
const saveBudget  = (uid, id, b) => setDoc(doc(db, "users", uid, "budgets", id), b, { merge: true });
const delBudget   = (uid, id) => deleteDoc(doc(db, "users", uid, "budgets", id));

// Save/merge user profile
const saveProfile = (uid, data) => setDoc(userDoc(uid), data, { merge: true });
// Save/merge settings
const saveSettings = (uid, data) => setDoc(settingsDoc(uid), data, { merge: true });
// Add entry
const addEntry = (uid, entry) => addDoc(entriesCol(uid), { ...entry, createdAt: serverTimestamp() });
// Update entry
const updateEntry = (uid, id, data) => updateDoc(doc(db, "users", uid, "entries", id), { ...data, updatedAt: serverTimestamp() });
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
// ── Freemium Plan Config ─────────────────────────────────────
const PLAN = { FREE: "free", PRO: "pro" };
const FREE_LIMITS = { ENTRIES_PER_MONTH: 20 };
const countThisMonth = (entries) => {
  const now = new Date();
  const ym  = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0");
  return entries.filter(e => e.date && e.date.slice(0,7) === ym).length;
};
const planDoc = (uid) => doc(db, "users", uid, "settings", "plan");

// ── Paystack Plan Codes ───────────────────────────────────────
// Create these 3 plans in your Paystack dashboard, then paste the plan codes here.
// Amounts in their respective currencies (Paystack handles FX).
const PAYSTACK_PLANS = {
  monthly:    { code: "PLN_riztufvgcixap7k",  label:"Monthly",  months:1,  usd:5,  discount:null },
  biannually: { code: "PLN_lr0mhzc8n3wa28h",  label:"6 Months", months:6,  usd:27, discount:"Save 10%" },
  annually:   { code: "PLN_cizrk6zouo32rjs",  label:"Annual",   months:12, usd:50, discount:"Save 17%" },
};

// Price display per currency — Base: $5/mo · $27/6mo · $50/yr
const PLAN_PRICES = {
  NGN: { monthly: "₦5,000",   biannually: "₦27,000",   annually: "₦50,000",   note:"NGN" },
  USD: { monthly: "$5",        biannually: "$27",        annually: "$50",        note:"USD" },
  GBP: { monthly: "£4",        biannually: "£21",        annually: "£39",        note:"GBP" },
  EUR: { monthly: "€4.60",     biannually: "€25",        annually: "€46",        note:"EUR" },
  GHS: { monthly: "₵75",       biannually: "₵405",       annually: "₵750",       note:"GHS" },
  KES: { monthly: "KSh645",    biannually: "KSh3,480",   annually: "KSh6,450",   note:"KES" },
  ZAR: { monthly: "R92",       biannually: "R497",       annually: "R920",       note:"ZAR" },
  XOF: { monthly: "CFA3,050",  biannually: "CFA16,470",  annually: "CFA30,500",  note:"XOF" },
  EGP: { monthly: "E£250",     biannually: "E£1,350",    annually: "E£2,500",    note:"EGP" },
  INR: { monthly: "₹420",      biannually: "₹2,268",     annually: "₹4,200",     note:"INR" },
  default: { monthly: "$5",    biannually: "$27",        annually: "$50",        note:"USD" },
};

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

const exportPDF = (entries, currency, branding, rangeLabel, allEntries, budgets = []) => {
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

${(() => {
  if (!budgets || budgets.length === 0) return "";
  const reportFrom = entries.length ? entries.map(e=>e.date.slice(0,10)).sort()[0] : null;
  const reportTo   = toISO(new Date());
  const relevant   = budgets.filter(b => reportFrom ? b.endDate >= reportFrom && b.startDate <= reportTo : true);
  if (!relevant.length) return "";

  const f2 = (n) => fmtAmt(n, currency);
  const budgetRows = relevant.map(b => {
    const bAll         = (allEntries||entries).filter(e => e.date.slice(0,10) >= b.startDate && e.date.slice(0,10) <= b.endDate);
    const incCatB      = b.incCatBudgets || {};
    const expCatB      = b.expCatBudgets || {};
    const budgetedIncs = Object.keys(incCatB);
    const budgetedExps = Object.keys(expCatB);

    // Per-category actuals (income and expense separately)
    const catActI = {}, catActE = {};
    bAll.filter(e=>e.type==="income").forEach(e =>  { catActI[e.category] = (catActI[e.category]||0)+e.amount; });
    bAll.filter(e=>e.type==="expense").forEach(e => { catActE[e.category] = (catActE[e.category]||0)+e.amount; });

    const actBudgetedInc = budgetedIncs.reduce((s,c)=>s+(catActI[c]||0),0);
    const actBudgetedExp = budgetedExps.reduce((s,c)=>s+(catActE[c]||0),0);
    const budgetInc      = b.totalIncome  || 0;
    const budgetExp      = b.totalExpense || 0;
    const expOver        = budgetExp > 0 && actBudgetedExp > budgetExp;
    const incMet         = budgetInc > 0 && actBudgetedInc >= budgetInc;
    const today          = toISO(new Date());
    const status         = today < b.startDate ? "Upcoming" : today > b.endDate ? "Ended" : "Active";

    // Unplanned
    const unplannedIncs = Object.keys(catActI).filter(c=>!budgetedIncs.includes(c));
    const unplannedExps = Object.keys(catActE).filter(c=>!budgetedExps.includes(c));
    const unplannedInc  = unplannedIncs.reduce((s,c)=>s+(catActI[c]||0),0);
    const unplannedExp  = unplannedExps.reduce((s,c)=>s+(catActE[c]||0),0);

    // Build income category rows
    const incCatRows = budgetedIncs.map(cat => {
      const bud  = incCatB[cat]; const act = catActI[cat]||0;
      const pct  = bud > 0 ? ((act/bud)*100).toFixed(1) : "—";
      const met  = bud > 0 && act >= bud;
      return `<tr>
        <td style="padding-left:24px;color:#555;font-size:12px">💰 ${cat}</td>
        <td style="font-size:12px">${f2(bud)}</td>
        <td style="font-size:12px;color:${met?"#2E7D32":"inherit"}">${f2(act)}</td>
        <td style="font-size:12px;font-weight:700;color:${met?"#2E7D32":"inherit"}">${pct!=="—"?pct+"%":"—"}${met?" ✓":""}</td>
        <td style="font-size:12px;color:${met?"#2E7D32":"#c62828"}">${bud>0?(act>=bud?`+${f2(act-bud)}`:`–${f2(bud-act)}`):"—"}</td>
      </tr>`;
    }).join("");

    // Build expense category rows
    const expCatRows = budgetedExps.map(cat => {
      const bud  = expCatB[cat]; const act = catActE[cat]||0;
      const pct  = bud > 0 ? ((act/bud)*100).toFixed(1) : "—";
      const over = bud > 0 && act > bud;
      return `<tr>
        <td style="padding-left:24px;color:#555;font-size:12px">📤 ${cat}</td>
        <td style="font-size:12px">${f2(bud)}</td>
        <td style="font-size:12px;color:${over?"#c62828":"inherit"}">${f2(act)}</td>
        <td style="font-size:12px;font-weight:700;color:${over?"#c62828":parseFloat(pct)>=80?"#e65100":"inherit"}">${pct!=="—"?pct+"%":"—"}${over?" ⚠️":""}</td>
        <td style="font-size:12px;color:${over?"#c62828":"#2E7D32"}">${bud>0?(act>bud?`–${f2(act-bud)} over`:`+${f2(bud-act)} left`):"—"}</td>
      </tr>`;
    }).join("");

    // Build unplanned rows
    const unplannedRows = [
      ...unplannedIncs.map(cat => `<tr style="background:#f9fff9">
        <td style="padding-left:24px;color:#888;font-size:11px;font-style:italic">💰 ${cat} <span style="color:#aaa">(unplanned)</span></td>
        <td style="font-size:11px;color:#aaa">—</td>
        <td style="font-size:11px;color:#2E7D32">${f2(catActI[cat]||0)}</td>
        <td style="font-size:11px;color:#aaa">—</td>
        <td style="font-size:11px;color:#2E7D32">+${f2(catActI[cat]||0)}</td>
      </tr>`),
      ...unplannedExps.map(cat => `<tr style="background:#fff9f9">
        <td style="padding-left:24px;color:#888;font-size:11px;font-style:italic">📤 ${cat} <span style="color:#aaa">(unplanned)</span></td>
        <td style="font-size:11px;color:#aaa">—</td>
        <td style="font-size:11px;color:#E65100">${f2(catActE[cat]||0)}</td>
        <td style="font-size:11px;color:#aaa">—</td>
        <td style="font-size:11px;color:#E65100">–${f2(catActE[cat]||0)}</td>
      </tr>`),
    ].join("");

    return `
    <tr style="background:#f2f2f2">
      <td colspan="5" style="padding:10px 14px;font-weight:900;font-size:13px;border-top:2px solid #ccc">
        ${b.name}
        <span style="margin-left:10px;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:${status==="Active"?"#E8F5E9":status==="Ended"?"#F5F5F5":"#E3F2FD"};color:${status==="Active"?"#2E7D32":status==="Ended"?"#888":"#1565C0"}">${status}</span>
        <span style="margin-left:8px;font-size:10px;color:#aaa">${b.startDate} → ${b.endDate}</span>
      </td>
    </tr>
    ${budgetedIncs.length>0?`
    <tr style="background:#f9f9f9"><td colspan="5" style="padding:6px 14px;font-size:11px;font-weight:800;color:#2E7D32;letter-spacing:0.5px;text-transform:uppercase">Income</td></tr>
    ${incCatRows}
    <tr style="background:#E8F5E9"><td style="padding-left:14px;font-weight:900;font-size:12px">Total Income</td><td style="font-weight:900">${f2(budgetInc)}</td><td style="font-weight:900;color:${incMet?"#2E7D32":"inherit"}">${f2(actBudgetedInc)}</td><td style="font-weight:900;color:${incMet?"#2E7D32":"inherit"}">${budgetInc>0?((actBudgetedInc/budgetInc)*100).toFixed(1)+"%":"—"}</td><td style="font-weight:900;color:${incMet?"#2E7D32":"#c62828"}">${budgetInc>0?(actBudgetedInc>=budgetInc?`+${f2(actBudgetedInc-budgetInc)}`:`–${f2(budgetInc-actBudgetedInc)}`):"—"}</td></tr>
    `:""}
    ${budgetedExps.length>0?`
    <tr style="background:#f9f9f9"><td colspan="5" style="padding:6px 14px;font-size:11px;font-weight:800;color:#E65100;letter-spacing:0.5px;text-transform:uppercase">Expenses</td></tr>
    ${expCatRows}
    <tr style="background:#FFF3E0"><td style="padding-left:14px;font-weight:900;font-size:12px">Total Expenses</td><td style="font-weight:900">${f2(budgetExp)}</td><td style="font-weight:900;color:${expOver?"#c62828":"inherit"}">${f2(actBudgetedExp)}</td><td style="font-weight:900;color:${expOver?"#c62828":"inherit"}">${budgetExp>0?((actBudgetedExp/budgetExp)*100).toFixed(1)+"%":"—"}</td><td style="font-weight:900;color:${expOver?"#c62828":"#2E7D32"}">${budgetExp>0?(actBudgetedExp>budgetExp?`–${f2(actBudgetedExp-budgetExp)} over`:`+${f2(budgetExp-actBudgetedExp)} left`):"—"}</td></tr>
    `:""}
    ${(unplannedIncs.length||unplannedExps.length)?`
    <tr style="background:#f5f5f5"><td colspan="5" style="padding:6px 14px;font-size:11px;font-weight:800;color:#888;letter-spacing:0.5px;text-transform:uppercase">Other Factors (not in budget plan)</td></tr>
    ${unplannedRows}
    <tr><td style="padding-left:14px;font-weight:900;font-size:12px;color:#555">Net impact of other factors</td><td colspan="2"></td><td colspan="2" style="font-weight:900;color:${(unplannedInc-unplannedExp)>=0?"#2E7D32":"#c62828"}">${(unplannedInc-unplannedExp)>=0?"+":""}${f2(unplannedInc-unplannedExp)}</td></tr>
    `:""}`;
  }).join("");

  return `
  <div class="section-wrap" style="page-break-before:always">
    <div class="section-header">Note 6 — Budget Performance</div>
    <div class="section-body">
      <p style="font-weight:900;font-size:13px;margin-bottom:6px;font-family:'Segoe UI',sans-serif">Budget vs Actual Analysis</p>
      <div class="note-block">The table below compares budgeted targets against actual performance, separated into income and expense sections. Items marked as "other factors" occurred during the budget period but were not included in the budget plan — they influenced overall performance but fall outside the scope of the tracked budget.</div>
      <table class="comp-table">
        <thead><tr>
          <th>Category</th><th>Budget</th><th>Actual</th><th>% Used</th><th>Variance</th>
        </tr></thead>
        <tbody>${budgetRows}</tbody>
      </table>
    </div>
  </div>`;
})()}

</div><!-- end section-body -->

<!-- ═══ FOOTER ═══════════════════════════════════════════════════ -->
<div class="doc-footer">
  <span>${branding.businessName} · Powered by Cash Counter</span>
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
    ``,`_${branding.tagline}_`,`_Powered by Cash Counter_`,
  ].filter(x=>x!==undefined).join("\n");
};

// ═══════════════════════════════════════════════════════════════
// UPGRADE MODAL
// ═══════════════════════════════════════════════════════════════
function UpgradeModal({ onClose, reason="default", monthCount=0, p="#075E54", user, currency }) {
  const UPGRADE_CSS = `
    @keyframes um-in{from{opacity:0;transform:translateY(40px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
    @keyframes um-badge{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
    .um-card{animation:um-in .35s cubic-bezier(.22,.68,0,1.1) both}
    .um-badge{animation:um-badge 2s ease-in-out infinite}
    .um-row{display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid #f5f5f5}
    .um-row:last-child{border-bottom:none}
    .um-plan{border:2.5px solid #e0e0e0;border-radius:16px;padding:14px 16px;cursor:pointer;transition:all .18s;position:relative;margin-bottom:10px}
    .um-plan:hover{border-color:#075E54;background:#f0faf7}
    .um-plan.selected{border-color:#075E54;background:#f0faf7}
    .um-plan.popular::before{content:"BEST VALUE";position:absolute;top:-10px;right:14px;
      background:#075E54;color:#fff;font-size:9px;font-weight:900;letter-spacing:.8px;
      padding:3px 9px;border-radius:6px}
    .um-pay-btn{width:100%;padding:16px;background:linear-gradient(135deg,#054d44,#128C7E);
      color:#fff;border:none;border-radius:16px;font-size:16px;font-weight:900;cursor:pointer;
      box-shadow:0 6px 20px rgba(7,94,84,.35);transition:opacity .15s,transform .15s;display:flex;
      align-items:center;justify-content:center;gap:10px}
    .um-pay-btn:hover{opacity:.92;transform:translateY(-1px)}
    .um-pay-btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
    .um-spin{width:18px;height:18px;border-radius:50%;border:2px solid rgba(255,255,255,.3);
      border-top-color:#fff;animation:um-spin .7s linear infinite;flex-shrink:0}
    @keyframes um-spin{to{transform:rotate(360deg)}}
  `;

  const reasons = {
    limit:   { icon:"🚫", title:"Monthly limit reached", sub:`You've used all ${FREE_LIMITS.ENTRIES_PER_MONTH} free entries for ${new Date().toLocaleString("default",{month:"long"})}. Upgrade for unlimited entries.` },
    budget:  { icon:"🎯", title:"Budget feature is Pro",  sub:"Create and track budgets, set targets per category, and see detailed budget vs actual reports." },
    cats:    { icon:"🏷️", title:"Custom categories are Pro", sub:"Edit, add, and remove income and expense categories to match your exact business structure." },
    default: { icon:"⚡", title:"Upgrade to Cash Counter", sub:"Unlock the full power of Cash Counter and grow your business faster." },
  };
  const { icon, title, sub } = reasons[reason] || reasons.default;

  const FEATURES = [
    ["♾️", "Unlimited entries",          "Free plan: 20/month"],
    ["🎯", "Budget creation & tracking", "Set targets, track actuals"],
    ["🏷️", "Custom categories",          "Add, edit, remove categories"],
    ["🚫", "No ads, ever",               "Clean, distraction-free UI"],
    ["📊", "All reports & exports",      "CSV, PDF income statements"],
  ];

  const [selectedPlan, setSelectedPlan] = useState("annually");
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");
  const [screen,       setScreen]       = useState("pricing"); // "pricing" | "features"
  const [payMethod,    setPayMethod]    = useState("card");    // "card" | "transfer"

  const prices = PLAN_PRICES[currency?.code] || PLAN_PRICES.default;

  const PLANS = [
    {
      id: "monthly",
      label: "Monthly",
      price: prices.monthly,
      perMonth: prices.monthly,
      discount: null,
      detail: "Billed monthly, cancel anytime",
    },
    {
      id: "biannually",
      label: "6 Months",
      price: prices.biannually,
      perMonth: null,
      discount: "Save 10%",
      detail: "One payment every 6 months",
    },
    {
      id: "annually",
      label: "Annual",
      price: prices.annually,
      perMonth: null,
      discount: "Save 17%",
      detail: "Best value — one payment per year",
      popular: true,
    },
  ];

  const handleCheckout = async () => {
    if (!user?.email) return setError("No email found. Please sign out and sign back in.");
    const plan = PAYSTACK_PLANS[selectedPlan];
    if (!plan.code || plan.code.includes("_CODE_HERE")) {
      return setError("Payment is not yet configured. Contact v.bookenterprise@gmail.com to upgrade.");
    }
    setLoading(true);
    setError("");
    trackUpgradeInitiated(selectedPlan);
    try {
      sessionStorage.setItem("lb_pending_uid", user.id);

      const body = payMethod === "transfer"
        ? { email: user.email, uid: user.id, paymentType: "transfer", interval: selectedPlan }
        : { email: user.email, planCode: plan.code, uid: user.id, paymentType: "card" };

      const res  = await fetch("/api/paystack-init", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.authorization_url) throw new Error(data.error || "Failed to start checkout");
      window.location.href = data.authorization_url;
    } catch(e) {
      setError(e.message || "Something went wrong. Try again.");
      setLoading(false);
    }
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:500,
      display:"flex", alignItems:"flex-end", justifyContent:"center", backdropFilter:"blur(3px)" }}
      onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <style>{UPGRADE_CSS}</style>
      <div className="um-card" style={{ width:"100%", maxWidth:520, background:"#fff",
        borderRadius:"28px 28px 0 0", overflow:"hidden", maxHeight:"92vh",
        display:"flex", flexDirection:"column",
        boxShadow:"0 -8px 40px rgba(0,0,0,0.2)",
        paddingBottom:"max(20px,env(safe-area-inset-bottom,20px))" }}>

        {/* Hero */}
        <div style={{ background:`linear-gradient(135deg,#054d44,#075E54,#128C7E)`,
          padding:"28px 24px 22px", textAlign:"center", position:"relative", flexShrink:0 }}>
          <button onClick={onClose} style={{ position:"absolute", top:14, right:14,
            background:"rgba(255,255,255,.18)", border:"none", borderRadius:"50%",
            width:30, height:30, color:"#fff", fontSize:15, cursor:"pointer",
            display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
          <div className="um-badge" style={{ fontSize:44, marginBottom:10 }}>{icon}</div>
          <div style={{ color:"#fff", fontWeight:900, fontSize:19, letterSpacing:"-.3px", marginBottom:5 }}>{title}</div>
          <div style={{ color:"rgba(255,255,255,.72)", fontSize:13, lineHeight:1.5 }}>{sub}</div>
          {reason==="limit"&&(
            <div style={{ marginTop:12, background:"rgba(255,255,255,.15)", borderRadius:10,
              padding:"6px 14px", display:"inline-block", color:"#fff", fontSize:12, fontWeight:700 }}>
              {monthCount}/{FREE_LIMITS.ENTRIES_PER_MONTH} entries used this month
            </div>
          )}
          {/* Tab switcher */}
          <div style={{ display:"flex", background:"rgba(0,0,0,.2)", borderRadius:10, padding:3,
            marginTop:16, gap:2 }}>
            {[["pricing","💳 Pricing"],["features","✅ Features"]].map(([id,label])=>(
              <button key={id} onClick={()=>setScreen(id)}
                style={{ flex:1, padding:"8px", border:"none", borderRadius:8, fontSize:12,
                  fontWeight:700, cursor:"pointer", transition:"all .15s",
                  background: screen===id ? "rgba(255,255,255,.25)" : "transparent",
                  color: screen===id ? "#fff" : "rgba(255,255,255,.6)" }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex:1, overflowY:"auto", padding:"20px 20px 0" }}>

          {screen==="pricing" && <>
            <div style={{ fontSize:11, fontWeight:800, color:"#aaa", textTransform:"uppercase",
              letterSpacing:.8, marginBottom:12 }}>Choose your plan · {prices.note}</div>

            {PLANS.map(plan=>(
              <div key={plan.id} className={`um-plan${selectedPlan===plan.id?" selected":""}${plan.popular?" popular":""}`}
                onClick={()=>setSelectedPlan(plan.id)}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                      <div style={{ fontWeight:800, fontSize:15, color:"#222" }}>{plan.label}</div>
                      {plan.discount&&(
                        <span style={{ background:"#e8f9f0", color:"#1b5e20", fontSize:10,
                          fontWeight:800, padding:"2px 8px", borderRadius:6 }}>{plan.discount}</span>
                      )}
                    </div>
                    <div style={{ fontSize:12, color:"#aaa" }}>{plan.detail}</div>
                  </div>
                  <div style={{ textAlign:"right", flexShrink:0 }}>
                    <div style={{ fontWeight:900, fontSize:20, color:"#075E54" }}>{plan.price}</div>
                  </div>
                </div>
                {selectedPlan===plan.id&&(
                  <div style={{ marginTop:8, display:"flex", alignItems:"center", gap:6,
                    color:"#075E54", fontSize:12, fontWeight:700 }}>
                    <span>✓</span> Selected
                  </div>
                )}
              </div>
            ))}

            {/* Payment method selector */}
            <div style={{ margin:"16px 0 4px" }}>
              <div style={{ fontSize:11, fontWeight:800, color:"#aaa", textTransform:"uppercase",
                letterSpacing:.8, marginBottom:10 }}>How would you like to pay?</div>
              <div style={{ display:"flex", gap:10 }}>
                {[
                  { id:"card",     icon:"💳", label:"Card",          sub:"Auto-renews" },
                  { id:"transfer", icon:"🏦", label:"Bank Transfer",  sub:"One-time, manual renewal" },
                ].map(m => (
                  <div key={m.id} onClick={()=>setPayMethod(m.id)}
                    style={{ flex:1, padding:"12px 14px", borderRadius:14, cursor:"pointer",
                      border: payMethod===m.id ? "2px solid #075E54" : "2px solid #f0f0f0",
                      background: payMethod===m.id ? "#f0fdf4" : "#fafafa",
                      transition:"all .15s" }}>
                    <div style={{ fontSize:20, marginBottom:4 }}>{m.icon}</div>
                    <div style={{ fontWeight:800, fontSize:13, color:"#222", marginBottom:2 }}>{m.label}</div>
                    <div style={{ fontSize:11, color:"#aaa" }}>{m.sub}</div>
                    {payMethod===m.id && (
                      <div style={{ fontSize:11, color:"#075E54", fontWeight:700, marginTop:4 }}>✓ Selected</div>
                    )}
                  </div>
                ))}
              </div>
              {payMethod==="transfer" && (
                <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:10,
                  padding:"10px 12px", marginTop:10, fontSize:12, color:"#92400e", lineHeight:1.6 }}>
                  💡 Bank transfer pays for one period only. You'll need to manually renew when your plan expires. We'll remind you in-app.
                </div>
              )}
            </div>

            {error&&(
              <div style={{ background:"#fff3f0", border:"1px solid #ffcdd2", borderRadius:10,
                padding:"10px 14px", color:"#c62828", fontSize:12, marginTop:8 }}>
                ⚠️ {error}
              </div>
            )}

            <button className="um-pay-btn" onClick={handleCheckout} disabled={loading}
              style={{ marginTop:14 }}>
              {loading
                ? <><div className="um-spin"/><span>Opening checkout…</span></>
                : <span>{payMethod==="transfer" ? "Pay via Bank Transfer 🏦" : "Pay with Card 💳"}</span>}
            </button>
            <div style={{ textAlign:"center", fontSize:11, color:"#ccc", marginTop:10, marginBottom:4 }}>
              {payMethod==="transfer"
                ? "One-time payment · Supports bank transfer, USSD & more"
                : "Secured by Paystack · Auto-renews · Cancel anytime"}
            </div>
          </>}

          {screen==="features" && <>
            <div style={{ fontSize:11, fontWeight:800, color:"#aaa", textTransform:"uppercase",
              letterSpacing:.8, marginBottom:4 }}>Everything in Pro</div>
            {FEATURES.map(([em, feat, detail])=>(
              <div key={feat} className="um-row">
                <span style={{ fontSize:20, flexShrink:0, marginTop:1 }}>{em}</span>
                <div>
                  <div style={{ fontWeight:700, fontSize:14, color:"#222" }}>{feat}</div>
                  <div style={{ fontSize:12, color:"#aaa", marginTop:1 }}>{detail}</div>
                </div>
                <span style={{ marginLeft:"auto", color:"#25D366", fontWeight:900, fontSize:16, flexShrink:0 }}>✓</span>
              </div>
            ))}
            <button className="um-pay-btn" onClick={()=>setScreen("pricing")}
              style={{ marginTop:16 }}>
              See Pricing →
            </button>
          </>}

        </div>

        <button onClick={onClose}
          style={{ margin:"12px 20px 0", padding:"11px", background:"none", border:"none",
            color:"#aaa", fontSize:13, cursor:"pointer", fontWeight:600, flexShrink:0 }}>
          Continue with free plan
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// AD BANNER  (free tier only)
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// AD SYSTEM
// ═══════════════════════════════════════════════════════════════

// ── HOUSE ADS ─────────────────────────────────────────────────
// To add a paid sponsor: add an entry to this array.
// Set active:true, provide a real url, and the ad rotates automatically.
// When all house ads have active:false, AdSense fallback is shown instead.
const HOUSE_ADS = [
  {
    active:  false, // ← set true when sponsor pays
    logo:    "🏦",
    brand:   "GTBank",
    title:   "GTBank Business Account",
    body:    "Zero COT for the first 6 months. Open your SME account today.",
    cta:     "Open account",
    color:   "#F57F17",
    url:     "https://www.gtbank.com/business-banking",
  },
  {
    active:  false,
    logo:    "💳",
    brand:   "Moniepoint",
    title:   "Moniepoint for Business",
    body:    "Accept payments anywhere. POS and virtual accounts for SMEs.",
    cta:     "Get started",
    color:   "#1565C0",
    url:     "https://moniepoint.com",
  },
  {
    active:  false,
    logo:    "📦",
    brand:   "Jumia",
    title:   "Sell on Jumia",
    body:    "Reach 10M+ customers. List your products free on Jumia.",
    cta:     "Start selling",
    color:   "#E65100",
    url:     "https://seller.jumia.com.ng",
  },
  {
    active:  false,
    logo:    "📲",
    brand:   "Paystack",
    title:   "Paystack Payment Links",
    body:    "Get paid online instantly. No website needed — just share a link.",
    cta:     "Create link",
    color:   "#0C6B58",
    url:     "https://paystack.com",
  },
  {
    active:  false,
    logo:    "💰",
    brand:   "Cowrywise",
    title:   "Grow your business savings",
    body:    "Earn up to 18% p.a. on your business cash reserves.",
    cta:     "Start saving",
    color:   "#6B21A8",
    url:     "https://cowrywise.com",
  },
];

// Your Google AdSense publisher ID — replace with your real one from adsense.google.com
const ADSENSE_CLIENT   = "ca-pub-3514986468098625";
const ADSENSE_SLOT     = "XXXXXXXXXX"; // Replace with your ad unit slot ID once approved
const ADSENSE_APPROVED = false; // ← Set to true once Google approves your AdSense account

// ── AdSense Unit ───────────────────────────────────────────────
function AdSenseUnit() {
  const ref = React.useRef(null);
  useEffect(() => {
    try {
      if (window.adsbygoogle && ref.current) {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      }
    } catch(e) {}
  }, []);

  return (
    <div style={{ margin:"0 0 14px", borderRadius:14, overflow:"hidden",
      border:"1px solid #f0f0f0", background:"#fafafa", minHeight:80,
      display:"flex", alignItems:"center", justifyContent:"center" }}>
      <ins ref={ref}
        className="adsbygoogle"
        style={{ display:"block", width:"100%", minHeight:80 }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={ADSENSE_SLOT}
        data-ad-format="auto"
        data-full-width-responsive="true"/>
    </div>
  );
}

// ── House Ad Card ──────────────────────────────────────────────
function HouseAdCard({ ad, onUpgrade }) {
  const AD_CSS = `
    @keyframes ad-pulse{0%,100%{opacity:.6}50%{opacity:1}}
    .ad-badge{animation:ad-pulse 2.5s ease-in-out infinite;font-size:9px;font-weight:800;letter-spacing:.5px}
  `;

  const handleClick = () => {
    if (ad.isUpgrade) onUpgrade();
    else window.open(ad.url, "_blank", "noopener");
  };

  if (ad.image) {
    return (
      <div style={{ position:"relative", cursor:"pointer", borderRadius:14, overflow:"hidden" }}
        onClick={handleClick}>
        <style>{AD_CSS}</style>
        <img src={ad.image} alt={ad.brand}
          style={{ width:"100%", display:"block", maxHeight:120, objectFit:"cover" }}/>
        <div style={{ position:"absolute", top:8, left:8, background:"rgba(0,0,0,.45)",
          borderRadius:6, padding:"2px 7px" }}>
          <span className="ad-badge" style={{ color:"#fff" }}>AD</span>
          <span style={{ color:"rgba(255,255,255,.7)", fontSize:9, marginLeft:4 }}>
            Sponsored by {ad.brand}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding:"11px 14px" }}>
      <style>{AD_CSS}</style>
      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
        <div style={{ width:40, height:40, borderRadius:12, background:`${ad.color}18`,
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>
          {ad.logo}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:10, color:"#bbb", fontWeight:600, letterSpacing:.3, marginBottom:2 }}>
            <span className="ad-badge">AD</span> · Sponsored by {ad.brand}
          </div>
          <div style={{ fontWeight:800, fontSize:13, color:"#222", lineHeight:1.3 }}>{ad.title}</div>
          <div style={{ fontSize:11, color:"#888", marginTop:2, lineHeight:1.4 }}>{ad.body}</div>
        </div>
        <button onClick={handleClick}
          style={{ flexShrink:0, padding:"7px 12px", background:ad.color, color:"#fff",
            border:"none", borderRadius:10, fontSize:11, fontWeight:800, cursor:"pointer",
            whiteSpace:"nowrap" }}>
          {ad.cta}
        </button>
      </div>
    </div>
  );
}

// ── AdBanner — carousel of all active house ads, AdSense fallback ──
const CAROUSEL_INTERVAL = 5000; // ms between slides

function AdBanner({ onUpgrade, p="#075E54", slot="home" }) {
  const upgradeAd = {
    active:true, logo:"✨", brand:"Cash Counter", isUpgrade:true,
    title:"Upgrade to Cash Counter",
    body:"Remove ads, unlock budgets & unlimited entries.",
    cta:"Upgrade ✨", color:"#075E54", url:"",
  };

  const activeAds = HOUSE_ADS.filter(a => a.active);
  const ads = activeAds.length > 0 ? activeAds : [upgradeAd];

  const [idx, setIdx] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    if (ads.length <= 1) return;
    const timer = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % ads.length);
        setFade(true);
      }, 300);
    }, CAROUSEL_INTERVAL);
    return () => clearInterval(timer);
  }, [ads.length]);

  const ad = ads[idx];

  // AdSense fallback only when approved — controlled by ADSENSE_APPROVED flag
  if (activeAds.length === 0 && ADSENSE_CLIENT !== "ca-pub-XXXXXXXXXXXXXXXX" && ADSENSE_APPROVED) {
    return <AdSenseUnit/>;
  }

  const BANNER_CSS = `
    @keyframes ad-fade-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
    .ad-slide{animation:ad-fade-in .3s ease both}
  `;

  return (
    <div style={{ margin:"0 0 14px", borderRadius:14, overflow:"hidden",
      border:`1px solid ${ad.color || "#e5e7eb"}22`,
      background: ad.image ? "#000" : `${ad.color || "#075E54"}07`,
      position:"relative" }}>
      <style>{BANNER_CSS}</style>

      {/* Slide */}
      <div key={idx} className="ad-slide"
        style={{ opacity: fade ? 1 : 0, transition:"opacity .3s" }}>
        <HouseAdCard ad={ad} onUpgrade={onUpgrade}/>
      </div>

      {/* Dots — only shown when 2+ ads */}
      {ads.length > 1 && (
        <div style={{ display:"flex", justifyContent:"center", gap:5,
          paddingBottom:8, paddingTop: ad.image ? 0 : 4 }}>
          {ads.map((_, i) => (
            <button key={i} onClick={()=>{ setFade(false); setTimeout(()=>{ setIdx(i); setFade(true); },300); }}
              style={{ width: i===idx ? 16 : 6, height:6, borderRadius:3, border:"none",
                background: i===idx ? (ad.color||p) : "#ddd",
                cursor:"pointer", padding:0,
                transition:"all .3s" }}/>
          ))}
        </div>
      )}
    </div>
  );
}

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
// SPLASH SCREEN  (Chowdeck-inspired animated scene)
// ═══════════════════════════════════════════════════════════════
function SplashScreen() {
  const css = `
    @keyframes sp-cloud1{0%{transform:translateX(0)}100%{transform:translateX(16px)}}
    @keyframes sp-cloud2{0%{transform:translateX(0)}100%{transform:translateX(-12px)}}
    @keyframes sp-moto{0%{left:-100px}100%{left:108%}}
    @keyframes sp-logo{0%,100%{transform:translateY(0) scale(1)}45%{transform:translateY(-11px) scale(1.06)}65%{transform:translateY(-5px) scale(1.02)}}
    @keyframes sp-fadein{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
    @keyframes sp-dot{0%,80%,100%{transform:scale(.55);opacity:.35}40%{transform:scale(1);opacity:1}}
    @keyframes sp-coin{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
    @keyframes sp-star{0%,100%{opacity:0;transform:scale(0)}50%{opacity:1;transform:scale(1)}}
    @keyframes sp-hill{0%{transform:translateX(0)}100%{transform:translateX(-5px)}}
    .sp-logo{animation:sp-logo 2.4s ease-in-out infinite}
    .sp-title{animation:sp-fadein .7s ease-out both}
    .sp-tag{animation:sp-fadein .7s .2s ease-out both}
    .sp-d1{animation:sp-dot 1.3s ease-in-out infinite}
    .sp-d2{animation:sp-dot 1.3s .22s ease-in-out infinite}
    .sp-d3{animation:sp-dot 1.3s .44s ease-in-out infinite}
    .sp-moto{position:absolute;bottom:96px;animation:sp-moto 4s linear infinite}
  `;
  return (
    <div style={{position:"fixed",inset:0,background:"linear-gradient(175deg,#032e28 0%,#054d44 28%,#075E54 55%,#0a7a6c 80%,#0d9688 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",overflow:"hidden",userSelect:"none"}}>
      <style>{css}</style>

      {/* ── Full-screen background SVG ── */}
      <svg style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",overflow:"visible",pointerEvents:"none"}}
        viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">

        {/* Cloud 1 */}
        <g style={{animation:"sp-cloud1 5s ease-in-out alternate infinite"}}>
          <ellipse cx="72"  cy="88"  rx="50" ry="27" fill="rgba(255,255,255,.09)"/>
          <ellipse cx="95"  cy="76"  rx="36" ry="20" fill="rgba(255,255,255,.09)"/>
          <ellipse cx="51"  cy="81"  rx="26" ry="14" fill="rgba(255,255,255,.08)"/>
        </g>
        {/* Cloud 2 */}
        <g style={{animation:"sp-cloud2 7s ease-in-out alternate infinite"}}>
          <ellipse cx="295" cy="125" rx="60" ry="32" fill="rgba(255,255,255,.07)"/>
          <ellipse cx="322" cy="112" rx="44" ry="24" fill="rgba(255,255,255,.07)"/>
          <ellipse cx="272" cy="118" rx="30" ry="17" fill="rgba(255,255,255,.06)"/>
        </g>
        {/* Cloud 3 */}
        <g style={{animation:"sp-cloud1 4.5s 1s ease-in-out alternate infinite"}}>
          <ellipse cx="178" cy="56"  rx="34" ry="18" fill="rgba(255,255,255,.06)"/>
          <ellipse cx="198" cy="46"  rx="24" ry="14" fill="rgba(255,255,255,.05)"/>
        </g>
        {/* Cloud 4 */}
        <g style={{animation:"sp-cloud2 6s 0.5s ease-in-out alternate infinite"}}>
          <ellipse cx="340" cy="262" rx="44" ry="22" fill="rgba(255,255,255,.06)"/>
          <ellipse cx="364" cy="251" rx="30" ry="17" fill="rgba(255,255,255,.05)"/>
        </g>
        {/* Cloud 5 */}
        <g style={{animation:"sp-cloud1 5.5s 2s ease-in-out alternate infinite"}}>
          <ellipse cx="38"  cy="207" rx="36" ry="19" fill="rgba(255,255,255,.055)"/>
          <ellipse cx="60"  cy="197" rx="26" ry="15" fill="rgba(255,255,255,.05)"/>
        </g>

        {/* Floating coins */}
        <g style={{animation:"sp-coin 2.6s ease-in-out infinite",transformOrigin:"56px 182px"}}>
          <circle cx="56" cy="182" r="14" fill="rgba(255,215,0,.2)" stroke="rgba(255,215,0,.4)" strokeWidth="1.5"/>
          <text x="56" y="187" textAnchor="middle" fontSize="12" fill="rgba(255,215,0,.7)">₦</text>
        </g>
        <g style={{animation:"sp-coin 3.1s .8s ease-in-out infinite",transformOrigin:"334px 218px"}}>
          <circle cx="334" cy="218" r="11" fill="rgba(255,215,0,.17)" stroke="rgba(255,215,0,.35)" strokeWidth="1.5"/>
          <text x="334" y="222" textAnchor="middle" fontSize="10" fill="rgba(255,215,0,.65)">$</text>
        </g>
        <g style={{animation:"sp-coin 2.9s 1.5s ease-in-out infinite",transformOrigin:"198px 158px"}}>
          <circle cx="198" cy="158" r="9" fill="rgba(255,215,0,.14)" stroke="rgba(255,215,0,.3)" strokeWidth="1.5"/>
          <text x="198" y="162" textAnchor="middle" fontSize="9" fill="rgba(255,215,0,.6)">£</text>
        </g>

        {/* Sparkle stars */}
        <g style={{animation:"sp-star 2.2s .1s ease-in-out infinite",transformOrigin:"118px 302px"}}>
          <path d="M118 296 L119.5 301 L118 306 L116.5 301 Z" fill="rgba(255,255,255,.55)"/>
          <path d="M112 302 L117 300 L122 302 L117 304 Z" fill="rgba(255,255,255,.55)"/>
        </g>
        <g style={{animation:"sp-star 2.5s .9s ease-in-out infinite",transformOrigin:"272px 182px"}}>
          <path d="M272 176 L273.5 181 L272 186 L270.5 181 Z" fill="rgba(255,255,255,.45)"/>
          <path d="M266 182 L271 180 L276 182 L271 184 Z" fill="rgba(255,255,255,.45)"/>
        </g>
        <g style={{animation:"sp-star 2s 1.7s ease-in-out infinite",transformOrigin:"352px 358px"}}>
          <path d="M352 352 L353.5 357 L352 362 L350.5 357 Z" fill="rgba(255,255,255,.4)"/>
          <path d="M346 358 L351 356 L356 358 L351 360 Z" fill="rgba(255,255,255,.4)"/>
        </g>

        {/* Rolling hills */}
        <g style={{animation:"sp-hill 7s ease-in-out alternate infinite"}}>
          {/* Back hill */}
          <path d="M-20 722 Q85 642 185 678 Q285 715 385 650 Q430 624 460 642 L460 844 L-20 844 Z" fill="rgba(0,0,0,.17)"/>
          {/* Mid hill */}
          <path d="M-20 752 Q55 702 155 720 Q255 738 345 698 Q392 676 460 698 L460 844 L-20 844 Z" fill="rgba(0,0,0,.24)"/>
          {/* Fence posts */}
          <rect x="8"   y="717" width="2" height="13" rx="1" fill="rgba(255,255,255,.22)"/>
          <rect x="4"   y="715" width="10" height="2" rx="1" fill="rgba(255,255,255,.17)"/>
          <rect x="30"  y="718" width="2" height="13" rx="1" fill="rgba(255,255,255,.22)"/>
          <rect x="26"  y="716" width="10" height="2" rx="1" fill="rgba(255,255,255,.17)"/>
          <rect x="52"  y="717" width="2" height="13" rx="1" fill="rgba(255,255,255,.22)"/>
          <rect x="48"  y="715" width="10" height="2" rx="1" fill="rgba(255,255,255,.17)"/>
          <rect x="74"  y="716" width="2" height="13" rx="1" fill="rgba(255,255,255,.22)"/>
          <rect x="70"  y="714" width="10" height="2" rx="1" fill="rgba(255,255,255,.17)"/>
          <rect x="96"  y="717" width="2" height="13" rx="1" fill="rgba(255,255,255,.22)"/>
          <rect x="92"  y="715" width="10" height="2" rx="1" fill="rgba(255,255,255,.17)"/>
          <rect x="118" y="718" width="2" height="13" rx="1" fill="rgba(255,255,255,.22)"/>
          <rect x="114" y="716" width="10" height="2" rx="1" fill="rgba(255,255,255,.17)"/>
          <rect x="140" y="717" width="2" height="13" rx="1" fill="rgba(255,255,255,.22)"/>
          <rect x="136" y="715" width="10" height="2" rx="1" fill="rgba(255,255,255,.17)"/>
          <rect x="162" y="716" width="2" height="13" rx="1" fill="rgba(255,255,255,.22)"/>
          <rect x="158" y="714" width="10" height="2" rx="1" fill="rgba(255,255,255,.17)"/>
          <rect x="184" y="717" width="2" height="13" rx="1" fill="rgba(255,255,255,.22)"/>
          <rect x="180" y="715" width="10" height="2" rx="1" fill="rgba(255,255,255,.17)"/>
          <rect x="206" y="718" width="2" height="13" rx="1" fill="rgba(255,255,255,.22)"/>
          <rect x="202" y="716" width="10" height="2" rx="1" fill="rgba(255,255,255,.17)"/>
          <rect x="228" y="717" width="2" height="13" rx="1" fill="rgba(255,255,255,.22)"/>
          <rect x="224" y="715" width="10" height="2" rx="1" fill="rgba(255,255,255,.17)"/>
          <rect x="250" y="716" width="2" height="13" rx="1" fill="rgba(255,255,255,.22)"/>
          <rect x="246" y="714" width="10" height="2" rx="1" fill="rgba(255,255,255,.17)"/>
          <rect x="272" y="717" width="2" height="13" rx="1" fill="rgba(255,255,255,.22)"/>
          <rect x="268" y="715" width="10" height="2" rx="1" fill="rgba(255,255,255,.17)"/>
          <rect x="294" y="718" width="2" height="13" rx="1" fill="rgba(255,255,255,.22)"/>
          <rect x="290" y="716" width="10" height="2" rx="1" fill="rgba(255,255,255,.17)"/>
          <rect x="316" y="717" width="2" height="13" rx="1" fill="rgba(255,255,255,.22)"/>
          <rect x="312" y="715" width="10" height="2" rx="1" fill="rgba(255,255,255,.17)"/>
          <rect x="338" y="716" width="2" height="13" rx="1" fill="rgba(255,255,255,.22)"/>
          <rect x="334" y="714" width="10" height="2" rx="1" fill="rgba(255,255,255,.17)"/>
          <rect x="360" y="717" width="2" height="13" rx="1" fill="rgba(255,255,255,.22)"/>
          <rect x="356" y="715" width="10" height="2" rx="1" fill="rgba(255,255,255,.17)"/>
          {/* Front hill */}
          <path d="M-20 788 Q105 748 225 762 Q325 774 425 752 Q448 746 470 755 L470 844 L-20 844 Z" fill="rgba(0,0,0,.33)"/>
          {/* Trees */}
          <rect x="36.5" y="779" width="3" height="11" fill="rgba(255,255,255,.16)"/>
          <ellipse cx="38"  cy="777" rx="8"  ry="10" fill="rgba(255,255,255,.14)"/>
          <ellipse cx="38"  cy="772" rx="5"  ry="7"  fill="rgba(255,255,255,.11)"/>
          <rect x="110.5" y="770" width="3" height="11" fill="rgba(255,255,255,.16)"/>
          <ellipse cx="112" cy="768" rx="8"  ry="10" fill="rgba(255,255,255,.14)"/>
          <ellipse cx="112" cy="763" rx="5"  ry="7"  fill="rgba(255,255,255,.11)"/>
          <rect x="290.5" y="771" width="3" height="11" fill="rgba(255,255,255,.16)"/>
          <ellipse cx="292" cy="769" rx="8"  ry="10" fill="rgba(255,255,255,.14)"/>
          <ellipse cx="292" cy="764" rx="5"  ry="7"  fill="rgba(255,255,255,.11)"/>
          <rect x="362.5" y="761" width="3" height="11" fill="rgba(255,255,255,.16)"/>
          <ellipse cx="364" cy="759" rx="8"  ry="10" fill="rgba(255,255,255,.14)"/>
          <ellipse cx="364" cy="754" rx="5"  ry="7"  fill="rgba(255,255,255,.11)"/>
        </g>

        {/* Mini bar chart */}
        <g opacity=".22" transform="translate(308,718)">
          <rect x="0"  y="22" width="10" height="30" rx="2" fill="#25D366"/>
          <rect x="13" y="8"  width="10" height="44" rx="2" fill="#25D366"/>
          <rect x="26" y="28" width="10" height="24" rx="2" fill="rgba(255,255,255,.7)"/>
          <rect x="39" y="14" width="10" height="38" rx="2" fill="#25D366"/>
          <rect x="52" y="32" width="10" height="20" rx="2" fill="rgba(255,255,255,.7)"/>
        </g>
      </svg>

      {/* ── Motorcycle (outside SVG for CSS left animation) ── */}
      <div className="sp-moto" style={{zIndex:3}}>
        <svg width="76" height="42" viewBox="0 0 76 42" fill="none">
          {/* Exhaust puffs */}
          <ellipse cx="-8"  cy="30" rx="9"  ry="3.5" fill="rgba(255,255,255,.1)"/>
          <ellipse cx="-20" cy="29" rx="6"  ry="2.5" fill="rgba(255,255,255,.06)"/>
          {/* Wheels */}
          <circle cx="16" cy="30" r="9"   stroke="rgba(255,255,255,.65)" strokeWidth="2.5"/>
          <circle cx="16" cy="30" r="3.5" fill="rgba(255,255,255,.55)"/>
          <circle cx="50" cy="30" r="9"   stroke="rgba(255,255,255,.65)" strokeWidth="2.5"/>
          <circle cx="50" cy="30" r="3.5" fill="rgba(255,255,255,.55)"/>
          {/* Bike frame */}
          <path d="M20 28 L32 12 L49 14 L53 28 Z" fill="rgba(255,255,255,.4)"/>
          <path d="M16 28 L20 28 L26 10 L20 10 Z"  fill="rgba(255,255,255,.3)"/>
          {/* Rider torso */}
          <path d="M28 17 Q32 7 36 17 L34 28 L30 28 Z" fill="rgba(255,210,0,.55)"/>
          {/* Rider head */}
          <circle cx="32" cy="10" r="6" fill="rgba(255,210,0,.8)"/>
          {/* Helmet visor */}
          <path d="M28 11 Q32 15 36 11" stroke="rgba(0,0,0,.2)" strokeWidth="1.5" fill="none"/>
          {/* Delivery box */}
          <rect x="38" y="9"  width="15" height="12" rx="2" fill="rgba(37,211,102,.7)" stroke="rgba(255,255,255,.3)" strokeWidth="1"/>
          <text x="45.5" y="17" textAnchor="middle" fontSize="7" fill="white" fontWeight="bold">₦</text>
        </svg>
      </div>

      {/* ── Logo + title + dots ── */}
      <div style={{position:"relative",zIndex:10,display:"flex",flexDirection:"column",alignItems:"center",marginTop:-55}}>
        <div className="sp-logo" style={{width:96,height:96,borderRadius:26,background:"#075E54",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:20,boxShadow:"0 10px 36px rgba(0,0,0,.32),inset 0 1px 0 rgba(255,255,255,.18)"}}>
          <svg width="64" height="64" viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">
            {/* Stack 1 — 2 coins */}
            <ellipse cx="155" cy="320" rx="48" ry="13" fill="#c8960c"/>
            <rect x="107" y="290" width="96" height="30" fill="#f5c842"/>
            <ellipse cx="155" cy="290" rx="48" ry="13" fill="#ffe066"/>
            <ellipse cx="155" cy="350" rx="48" ry="13" fill="#c8960c"/>
            <rect x="107" y="320" width="96" height="30" fill="#f5c842"/>
            <ellipse cx="155" cy="320" rx="48" ry="13" fill="#ffe066"/>
            {/* Stack 2 — 4 coins */}
            <ellipse cx="250" cy="260" rx="48" ry="13" fill="#c8960c"/>
            <rect x="202" y="230" width="96" height="30" fill="#f5c842"/>
            <ellipse cx="250" cy="230" rx="48" ry="13" fill="#ffe066"/>
            <ellipse cx="250" cy="290" rx="48" ry="13" fill="#c8960c"/>
            <rect x="202" y="260" width="96" height="30" fill="#f5c842"/>
            <ellipse cx="250" cy="260" rx="48" ry="13" fill="#ffe066"/>
            <ellipse cx="250" cy="320" rx="48" ry="13" fill="#c8960c"/>
            <rect x="202" y="290" width="96" height="30" fill="#f5c842"/>
            <ellipse cx="250" cy="290" rx="48" ry="13" fill="#ffe066"/>
            <ellipse cx="250" cy="350" rx="48" ry="13" fill="#c8960c"/>
            <rect x="202" y="320" width="96" height="30" fill="#f5c842"/>
            <ellipse cx="250" cy="320" rx="48" ry="13" fill="#ffe066"/>
            {/* Stack 3 — 6 coins */}
            <ellipse cx="345" cy="200" rx="48" ry="13" fill="#c8960c"/>
            <rect x="297" y="170" width="96" height="30" fill="#f5c842"/>
            <ellipse cx="345" cy="170" rx="48" ry="13" fill="#ffe066"/>
            <ellipse cx="345" cy="230" rx="48" ry="13" fill="#c8960c"/>
            <rect x="297" y="200" width="96" height="30" fill="#f5c842"/>
            <ellipse cx="345" cy="200" rx="48" ry="13" fill="#ffe066"/>
            <ellipse cx="345" cy="260" rx="48" ry="13" fill="#c8960c"/>
            <rect x="297" y="230" width="96" height="30" fill="#f5c842"/>
            <ellipse cx="345" cy="230" rx="48" ry="13" fill="#ffe066"/>
            <ellipse cx="345" cy="290" rx="48" ry="13" fill="#c8960c"/>
            <rect x="297" y="260" width="96" height="30" fill="#f5c842"/>
            <ellipse cx="345" cy="260" rx="48" ry="13" fill="#ffe066"/>
            <ellipse cx="345" cy="320" rx="48" ry="13" fill="#c8960c"/>
            <rect x="297" y="290" width="96" height="30" fill="#f5c842"/>
            <ellipse cx="345" cy="290" rx="48" ry="13" fill="#ffe066"/>
            <ellipse cx="345" cy="350" rx="48" ry="13" fill="#c8960c"/>
            <rect x="297" y="320" width="96" height="30" fill="#f5c842"/>
            <ellipse cx="345" cy="320" rx="48" ry="13" fill="#ffe066"/>
            {/* Base line */}
            <rect x="107" y="350" width="286" height="8" rx="4" fill="rgba(255,255,255,0.25)"/>
            {/* Teal dot */}
            <circle cx="345" cy="150" r="22" fill="#5fafc6"/>
          </svg>
        </div>
        <div className="sp-title" style={{color:"#fff",fontWeight:900,fontSize:30,letterSpacing:"-.7px",textShadow:"0 2px 18px rgba(0,0,0,.3)",marginBottom:6}}>
          Cash Counter
        </div>
        <div className="sp-tag" style={{color:"rgba(255,255,255,.6)",fontSize:14,fontWeight:500,letterSpacing:".3px",marginBottom:44}}>
          Track · Grow · Prosper
        </div>
        <div style={{display:"flex",gap:7,alignItems:"center"}}>
          <div className="sp-d1" style={{width:9,height:9,borderRadius:"50%",background:"rgba(255,255,255,.8)"}}/>
          <div className="sp-d2" style={{width:9,height:9,borderRadius:"50%",background:"rgba(255,255,255,.8)"}}/>
          <div className="sp-d3" style={{width:9,height:9,borderRadius:"50%",background:"rgba(255,255,255,.8)"}}/>
        </div>
      </div>

      <div style={{position:"absolute",bottom:30,fontSize:11,color:"rgba(255,255,255,.3)",fontWeight:600,letterSpacing:".5px",zIndex:10}}>
        by VBook Enterprise
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// AUTH FIELD helper
// ═══════════════════════════════════════════════════════════════
function AuthField({ label, placeholder, type="text", value, onChange, icon }) {
  const [show, setShow] = useState(false);
  const isPass = type === "password";
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:11, fontWeight:800, color:"#888", textTransform:"uppercase", letterSpacing:.6, marginBottom:6 }}>{label}</div>
      <div style={{ position:"relative" }}>
        {icon && <span style={{ position:"absolute", left:13, top:"50%", transform:"translateY(-50%)", fontSize:15, pointerEvents:"none", opacity:.45 }}>{icon}</span>}
        <input className="au-inp"
          type={isPass && !show ? "password" : isPass ? "text" : type}
          value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
          style={{ width:"100%", padding:`13px ${isPass?46:15}px 13px ${icon?42:15}px`, border:"2px solid #ebebeb", borderRadius:13, fontSize:15, boxSizing:"border-box", background:"#fafafa", fontFamily:"inherit", WebkitAppearance:"none" }}/>
        {isPass && (
          <button type="button" onClick={()=>setShow(s=>!s)}
            style={{ position:"absolute", right:13, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"#c0c0c0", fontSize:16, padding:2, lineHeight:1 }}>
            {show ? "🙈" : "👁️"}
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// AUTH SCREEN  (redesigned)
// ═══════════════════════════════════════════════════════════════
function AuthScreen() {
  const [mode,    setMode]   = useState("login"); // "login" | "register" | "forgot"
  const [form,    setForm]   = useState({name:"",email:"",password:"",confirm:"",businessName:""});
  const [err,     setErr]    = useState("");
  const [success, setSuccess]= useState("");
  const [busy,    setBusy]   = useState(false);
  const [busyBtn, setBusyBtn]= useState("");
  const [pwStrength, setPwStrength] = useState({ score:0, hints:[] });

  // Client-side lockout — tracks failed attempts this session
  const [failCount,   setFailCount]   = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [lockTimer,   setLockTimer]   = useState(0);
  const [termsAccepted, setTermsAccepted] = useState(false); // countdown seconds

  // Countdown ticker
  useEffect(() => {
    if (lockedUntil <= Date.now()) return;
    const tick = setInterval(() => {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (remaining <= 0) { setLockTimer(0); setLockedUntil(0); clearInterval(tick); }
      else setLockTimer(remaining);
    }, 1000);
    return () => clearInterval(tick);
  }, [lockedUntil]);

  const isLocked = lockedUntil > Date.now();

  // Record a failed attempt — lockout escalates: 3 fails = 30s, 5 = 2min, 7+ = 10min
  const recordFailure = () => {
    const next = failCount + 1;
    setFailCount(next);
    if (next >= 7)      { const t = Date.now() + 10*60*1000; setLockedUntil(t); setLockTimer(600); }
    else if (next >= 5) { const t = Date.now() + 2*60*1000;  setLockedUntil(t); setLockTimer(120); }
    else if (next >= 3) { const t = Date.now() + 30*1000;    setLockedUntil(t); setLockTimer(30);  }
  };

  // Check server-side rate limit before hitting Firebase
  const checkRateLimit = async (action) => {
    try {
      const res  = await fetch("/api/auth-rate-limit", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!data.allowed) {
        setErr(data.message || "Too many attempts. Please wait before trying again.");
        return false;
      }
      return true;
    } catch {
      // If the API is unreachable, allow through — don't block legitimate users
      return true;
    }
  };

  const f = (k,v) => {
    setForm(p=>({...p,[k]:v}));
    if (k === "password") checkPasswordStrength(v);
  };

  // Password strength checker
  const checkPasswordStrength = (pw) => {
    const hints = [];
    if (pw.length < 8)                    hints.push("At least 8 characters");
    if (!/[A-Z]/.test(pw))               hints.push("One uppercase letter (A-Z)");
    if (!/[a-z]/.test(pw))               hints.push("One lowercase letter (a-z)");
    if (!/[0-9]/.test(pw))               hints.push("One number (0-9)");
    const score = 4 - hints.length;
    setPwStrength({ score, hints });
  };

  const isStrongPassword = (pw) =>
    pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[0-9]/.test(pw);

  const AUTH_CSS = `
    @keyframes au-up{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:translateY(0)}}
    @keyframes au-shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-5px)}40%,80%{transform:translateX(5px)}}
    @keyframes au-c1{0%{transform:translateX(0)}100%{transform:translateX(13px)}}
    @keyframes au-c2{0%{transform:translateX(0)}100%{transform:translateX(-11px)}}
    @keyframes au-coin{0%,100%{transform:translateY(0) rotate(-5deg)}50%{transform:translateY(-9px) rotate(5deg)}}
    .au-card{animation:au-up .5s cubic-bezier(.22,.68,0,1.18) both}
    .au-err{animation:au-shake .38s ease}
    .au-c1{animation:au-c1 5s ease-in-out alternate infinite}
    .au-c2{animation:au-c2 7s ease-in-out alternate infinite}
    .au-coin1{animation:au-coin 2.6s ease-in-out infinite;transform-origin:50px 178px}
    .au-coin2{animation:au-coin 3.1s 1s ease-in-out infinite;transform-origin:342px 205px}
    .au-inp{transition:border-color .18s,box-shadow .18s,background .18s}
    .au-inp:focus{border-color:#075E54 !important;box-shadow:0 0 0 3px rgba(7,94,84,.12) !important;outline:none;background:#fff !important}
    .au-btn{transition:transform .13s,box-shadow .13s}
    .au-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 8px 28px rgba(7,94,84,.44) !important}
    .au-btn:active:not(:disabled){transform:translateY(0px)}
    .au-soc{transition:all .15s}
    .au-soc:hover:not(:disabled){background:#f7f7f7 !important;transform:translateY(-1px);box-shadow:0 4px 14px rgba(0,0,0,.12) !important}
    .au-tab{transition:background .2s,color .2s,box-shadow .2s}
  `;

  const switchMode = (m) => {
    setMode(m); setErr(""); setSuccess("");
    setForm({name:"",email:"",password:"",confirm:"",businessName:""});
    setPwStrength({ score:0, hints:[] });
    setTermsAccepted(false);
  };

  const handleForgotPassword = async () => {
    setErr(""); setSuccess("");
    if (isLocked) return setErr(`Too many attempts. Please wait ${lockTimer} seconds.`);
    if (!form.email.includes("@")) return setErr("Enter a valid email address");
    setBusy(true); setBusyBtn("forgot");

    // Server-side rate limit check
    const allowed = await checkRateLimit("forgot");
    if (!allowed) { setBusy(false); setBusyBtn(""); return; }

    try {
      await sendPasswordResetEmail(auth, form.email);
      trackPasswordReset();
      setFailCount(0);
      setSuccess(`Reset link sent to ${form.email} — check your inbox and spam folder.`);
    } catch(e) {
      recordFailure();
      if (e.code === "auth/user-not-found" || e.code === "auth/invalid-credential")
        setErr("No account found with that email address.");
      else setErr(e.message || "Failed to send reset email. Try again.");
    } finally { setBusy(false); setBusyBtn(""); }
  };

  const handleSocial = async (provider, name) => {
    setErr(""); setBusyBtn(name); setBusy(true);
    try {
      const result = await signInWithPopup(auth, provider);
      const uid = result.user.uid;
      const isNew = result._tokenResponse?.isNewUser;
      if (isNew) trackSignup("google");
      else        trackLogin("google");
      if (!DB.get(`lb_bname_${uid}`)) {
        DB.set(`lb_bname_${uid}`, result.user.displayName?.split(" ")[0] + "'s Business" || "My Business");
      }
    } catch (e) {
      if (e.code === "auth/popup-closed-by-user") setErr("Sign-in cancelled. Please try again.");
      else if (e.code === "auth/popup-blocked") setErr("Popup blocked. Please allow popups for this site.");
      else if (e.code !== "auth/cancelled-popup-request") setErr(e.message || "Sign-in failed. Please try again.");
    } finally { setBusy(false); setBusyBtn(""); }
  };

  const handleRegister = async () => {
    setErr("");
    if (isLocked) return setErr(`Too many attempts. Please wait ${lockTimer} seconds.`);
    if (!form.name.trim())         return setErr("Enter your full name");
    if (!form.businessName.trim()) return setErr("Enter your business name");
    if (!form.email.includes("@")) return setErr("Enter a valid email address");
    if (!isStrongPassword(form.password)) return setErr("Password must be at least 8 characters with one uppercase letter, one lowercase letter, and one number");
    if (form.password !== form.confirm) return setErr("Passwords do not match");
    if (!termsAccepted) return setErr("Please read and accept the Terms of Service and Privacy Policy to continue.");

    setBusy(true); setBusyBtn("email");

    // Server-side rate limit check
    const allowed = await checkRateLimit("register");
    if (!allowed) { setBusy(false); setBusyBtn(""); return; }

    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      await updateProfile(cred.user, { displayName: form.name });
      DB.set(`lb_bname_${cred.user.uid}`, form.businessName);

      // Capture referral code from URL if present
      const refCode = new URLSearchParams(window.location.search).get("ref");
      if (refCode) {
        DB.set(`lb_ref_${cred.user.uid}`, refCode);
      }

      await sendEmailVerification(cred.user, {
        url: "https://cashcounter.vbookng.com",
        handleCodeInApp: false,
      });
      await signOut(auth);
      trackSignup("email");
      setSuccess(`Verification email sent to ${form.email}. Please check your inbox and click the link to activate your account.`);
      switchMode("login");
    } catch (e) {
      recordFailure();
      if (e.code === "auth/email-already-in-use") setErr("Account already exists. Sign in instead.");
      else if (e.code === "auth/invalid-email") setErr("That email address doesn't look right.");
      else setErr(e.message || "Registration failed. Please try again.");
    } finally { setBusy(false); setBusyBtn(""); }
  };

  const handleLogin = async () => {
    setErr("");
    if (isLocked) return setErr(`Too many attempts. Please wait ${lockTimer} seconds.`);
    if (!form.email || !form.password) return setErr("Please fill in all fields");

    setBusy(true); setBusyBtn("email");

    // Server-side rate limit check
    const allowed = await checkRateLimit("login");
    if (!allowed) { setBusy(false); setBusyBtn(""); return; }

    try {
      await signInWithEmailAndPassword(auth, form.email, form.password);
      setFailCount(0); // reset on success
      trackLogin("email");
    } catch (e) {
      recordFailure();
      if (e.code === "auth/user-not-found" || e.code === "auth/invalid-credential") setErr("No account found. Check your email or sign up.");
      else if (e.code === "auth/wrong-password") setErr("Incorrect password. Try again.");
      else if (e.code === "auth/too-many-requests") setErr("Too many attempts. Please wait a moment or reset your password.");
      else setErr(e.message || "Sign-in failed. Please try again.");
    } finally { setBusy(false); setBusyBtn(""); }
  };

  return (
    <div style={{minHeight:"100vh",position:"relative",overflow:"hidden",
      background:"linear-gradient(175deg,#032e28 0%,#054d44 28%,#075E54 58%,#0a7a6c 82%,#128C7E 100%)"}}>
      <style>{AUTH_CSS}</style>

      {/* Background scene */}
      <svg style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",overflow:"visible",pointerEvents:"none"}}
        viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
        <g className="au-c1">
          <ellipse cx="62" cy="82" rx="46" ry="25" fill="rgba(255,255,255,.07)"/>
          <ellipse cx="88" cy="71" rx="32" ry="19" fill="rgba(255,255,255,.07)"/>
          <ellipse cx="42" cy="76" rx="22" ry="14" fill="rgba(255,255,255,.06)"/>
        </g>
        <g className="au-c2">
          <ellipse cx="302" cy="112" rx="55" ry="28" fill="rgba(255,255,255,.06)"/>
          <ellipse cx="330" cy="100" rx="38" ry="22" fill="rgba(255,255,255,.05)"/>
          <ellipse cx="280" cy="107" rx="26" ry="16" fill="rgba(255,255,255,.05)"/>
        </g>
        <g className="au-c1" style={{animationDuration:"4.5s",animationDelay:"1s"}}>
          <ellipse cx="178" cy="52" rx="30" ry="16" fill="rgba(255,255,255,.05)"/>
          <ellipse cx="198" cy="44" rx="21" ry="13" fill="rgba(255,255,255,.04)"/>
        </g>
        <g className="au-coin1">
          <circle cx="50" cy="178" r="13" fill="rgba(255,215,0,.18)" stroke="rgba(255,215,0,.35)" strokeWidth="1.5"/>
          <text x="50" y="183" textAnchor="middle" fontSize="11" fill="rgba(255,215,0,.6)">₦</text>
        </g>
        <g className="au-coin2">
          <circle cx="342" cy="205" r="10" fill="rgba(255,215,0,.14)" stroke="rgba(255,215,0,.3)" strokeWidth="1.5"/>
          <text x="342" y="210" textAnchor="middle" fontSize="9" fill="rgba(255,215,0,.55)">$</text>
        </g>
        {/* subtle grid dots */}
        {Array.from({length:30},(_,i)=>{
          const row=Math.floor(i/5), col=i%5;
          return <circle key={i} cx={60+col*70} cy={380+row*70} r="1.5" fill="rgba(255,255,255,.06)"/>;
        })}
        <path d="M-20 800Q100 762 230 776Q340 788 440 762L440 844L-20 844Z" fill="rgba(0,0,0,.18)"/>
        <path d="M-20 828Q120 800 260 812Q360 820 440 800L440 844L-20 844Z" fill="rgba(0,0,0,.26)"/>
      </svg>

      {/* Top logo */}
      <div style={{position:"relative",zIndex:2,textAlign:"center",
        paddingTop:"max(48px,env(safe-area-inset-top,48px))",paddingBottom:22}}>
        <div style={{width:70,height:70,borderRadius:22,margin:"0 auto 12px",
          background:"rgba(255,255,255,.14)",backdropFilter:"blur(12px)",
          border:"2px solid rgba(255,255,255,.22)",
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:38,boxShadow:"0 8px 24px rgba(0,0,0,.24)"}}>
          📒
        </div>
        <div style={{color:"#fff",fontWeight:900,fontSize:22,letterSpacing:"-.5px",textShadow:"0 2px 12px rgba(0,0,0,.22)"}}>
          Cash Counter
        </div>
        <div style={{color:"rgba(255,255,255,.55)",fontSize:13,marginTop:4}}>
          {mode==="login" ? "Welcome back 👋" : "Let's get you started 🚀"}
        </div>
      </div>

      {/* Card */}
      <div className="au-card" style={{position:"relative",zIndex:2,margin:"0 auto",width:"100%",maxWidth:420,
        paddingLeft:16,paddingRight:16,
        paddingBottom:"max(32px,env(safe-area-inset-bottom,32px))"}}>

        <div style={{background:"rgba(255,255,255,.97)",borderRadius:28,
          boxShadow:"0 24px 64px rgba(0,0,0,.28),0 0 0 1px rgba(255,255,255,.4)",overflow:"hidden"}}>

          {/* Tabs — hidden on forgot mode */}
          {mode !== "forgot" && (
            <div style={{display:"flex",background:"#f2f2f2",padding:5,gap:4,margin:"16px 16px 0",borderRadius:18}}>
              {[["login","Sign In"],["register","Create Account"]].map(([m,l])=>(
                <button key={m} className="au-tab" onClick={()=>switchMode(m)}
                  style={{flex:1,padding:"11px 6px",border:"none",fontWeight:800,fontSize:14,cursor:"pointer",
                    borderRadius:13,letterSpacing:"-.2px",
                    background:mode===m?"#fff":"transparent",
                    color:mode===m?"#075E54":"#aaa",
                    boxShadow:mode===m?"0 2px 8px rgba(0,0,0,.1)":"none"}}>
                  {l}
                </button>
              ))}
            </div>
          )}

          {/* Forgot password header */}
          {mode === "forgot" && (
            <div style={{padding:"20px 22px 0",textAlign:"center"}}>
              <div style={{fontSize:36,marginBottom:8}}>🔑</div>
              <div style={{fontWeight:900,fontSize:18,color:"#0a1612",marginBottom:6}}>Reset your password</div>
              <div style={{fontSize:13,color:"#9ca3af",marginBottom:4}}>
                Enter your email and we'll send you a reset link.
              </div>
            </div>
          )}

          <div style={{padding:"20px 22px 26px"}}>

            {/* Social buttons — hidden on forgot mode */}
            {mode !== "forgot" && (
            <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:18}}>
              <button className="au-soc" onClick={()=>handleSocial(googleProvider,"google")} disabled={busy}
                style={{width:"100%",padding:"13px 16px",border:"1.5px solid #e5e5e5",borderRadius:14,
                  background:"#fff",cursor:busy?"not-allowed":"pointer",
                  display:"flex",alignItems:"center",justifyContent:"center",gap:11,
                  fontWeight:700,fontSize:15,color:"#2d2d2d",
                  boxShadow:"0 2px 6px rgba(0,0,0,.05)"}}>
                {busyBtn==="google" ? <span style={{fontSize:13,color:"#888"}}>Connecting…</span> : <>
                  <svg width="20" height="20" viewBox="0 0 48 48">
                    <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.7 33.5 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.4-7.8 19.4-20 0-1.3-.1-2.7-.4-4z"/>
                    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 19 13 24 13c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.1 6.5 29.3 4 24 4c-7.8 0-14.5 4.3-17.7 10.7z"/>
                    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.6 26.8 36 24 36c-5.2 0-9.7-3.4-11.3-8.1l-6.6 5.1C9.6 39.7 16.3 44 24 44z"/>
                    <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.2-2.3 4.1-4.2 5.4l6.2 5.2C40.9 35.3 44 30 44 24c0-1.3-.1-2.7-.4-4z"/>
                  </svg>
                  Continue with Google
                </>}
              </button>
            </div>
            )}

            {/* Divider — hidden on forgot mode */}
            {mode !== "forgot" && (
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
              <div style={{flex:1,height:1,background:"#efefef"}}/>
              <span style={{fontSize:11,color:"#ccc",fontWeight:700,letterSpacing:.5}}>OR</span>
              <div style={{flex:1,height:1,background:"#efefef"}}/>
            </div>
            )}

            {/* Form fields */}
            {mode==="register" && <>
              <AuthField label="Full Name"     placeholder="e.g. Oluwasegun Akinnusi" value={form.name}         onChange={v=>f("name",v)}         icon="👤"/>
              <AuthField label="Business Name" placeholder="e.g. Ade Electronics"     value={form.businessName} onChange={v=>f("businessName",v)} icon="🏪"/>
            </>}
            <AuthField label="Email Address"    placeholder="you@example.com"         type="email"    value={form.email}    onChange={v=>f("email",v)}    icon="📧"/>

            {mode !== "forgot" && <>
              <AuthField label="Password" placeholder="Min. 8 chars, uppercase, number" type="password" value={form.password} onChange={v=>f("password",v)} icon="🔒"/>

              {/* Password strength bar — show on register */}
              {mode === "register" && form.password.length > 0 && (
                <div style={{marginBottom:14, marginTop:-8}}>
                  <div style={{display:"flex", gap:4, marginBottom:6}}>
                    {[0,1,2,3].map(i => (
                      <div key={i} style={{
                        flex:1, height:3, borderRadius:2,
                        background: i < pwStrength.score
                          ? pwStrength.score <= 1 ? "#ef4444"
                          : pwStrength.score <= 2 ? "#f97316"
                          : pwStrength.score <= 3 ? "#eab308"
                          : "#22c55e"
                          : "#e5e7eb",
                        transition:"background .2s"
                      }}/>
                    ))}
                  </div>
                  {pwStrength.hints.length > 0 && (
                    <div style={{fontSize:11, color:"#9ca3af", lineHeight:1.6}}>
                      Still needed: {pwStrength.hints.join(" · ")}
                    </div>
                  )}
                  {pwStrength.score === 4 && (
                    <div style={{fontSize:11, color:"#22c55e", fontWeight:700}}>✓ Strong password</div>
                  )}
                </div>
              )}

              {mode === "register" && <AuthField label="Confirm Password" placeholder="Re-enter password" type="password" value={form.confirm} onChange={v=>f("confirm",v)} icon="🔒"/>}
            </>}

            {/* Error */}
            {err && (
              <div className="au-err" key={err}
                style={{background:"#fff3f3",border:"1.5px solid #ffcdd2",borderRadius:13,
                  padding:"11px 14px",color:"#c62828",fontSize:13,marginBottom:14,
                  lineHeight:1.55,display:"flex",gap:8,alignItems:"flex-start"}}>
                <span style={{flexShrink:0}}>⚠️</span><span>{err}</span>
              </div>
            )}

            {/* Success (forgot password) */}
            {success && (
              <div style={{background:"#f0fdf4",border:"1.5px solid #bbf7d0",borderRadius:13,
                padding:"11px 14px",color:"#15803d",fontSize:13,marginBottom:14,
                lineHeight:1.55,display:"flex",gap:8,alignItems:"flex-start"}}>
                <span style={{flexShrink:0}}>✅</span><span>{success}</span>
              </div>
            )}

            {/* Lockout warning */}
            {isLocked && (
              <div style={{ background:"#fff3f0", border:"1.5px solid #ffcdd2", borderRadius:13,
                padding:"11px 14px", color:"#c62828", fontSize:13, marginBottom:14,
                display:"flex", alignItems:"center", gap:8 }}>
                <span>🔒</span>
                <span>Too many attempts. Try again in <strong>{lockTimer}s</strong>.</span>
              </div>
            )}

            {/* Submit */}
            <button className="au-btn"
              onClick={mode==="login" ? handleLogin : mode==="register" ? handleRegister : handleForgotPassword}
              disabled={busy || isLocked || (mode==="register" && !termsAccepted)}
              style={{width:"100%",padding:"15px",
                background: busy || isLocked || (mode==="register" && !termsAccepted) ? "#e5e7eb"
                  : "linear-gradient(135deg,#054d44 0%,#075E54 40%,#128C7E 75%,#1aab92 100%)",
                color: busy || isLocked || (mode==="register" && !termsAccepted) ? "#9ca3af" : "#fff",
                border:"none",borderRadius:15,fontSize:16,fontWeight:900,
                cursor: busy || isLocked || (mode==="register" && !termsAccepted) ? "not-allowed" : "pointer",
                letterSpacing:"-.2px",
                boxShadow: busy || isLocked || (mode==="register" && !termsAccepted) ? "none" : "0 6px 22px rgba(7,94,84,.38)"}}>
              {busy ? "Please wait…"
                : isLocked ? `🔒 Locked (${lockTimer}s)`
                : mode==="login"    ? "Sign In →"
                : mode==="register" ? "Create Account →"
                : "Send Reset Link →"}
            </button>

            {/* Forgot password link — shown on login */}
            {mode === "login" && (
              <div style={{textAlign:"center", marginTop:12}}>
                <button onClick={()=>switchMode("forgot")}
                  style={{background:"none",border:"none",color:"#9ca3af",fontWeight:600,
                    cursor:"pointer",fontSize:12}}>
                  Forgot your password?
                </button>
              </div>
            )}

            {/* Switch mode */}
            <div style={{textAlign:"center",marginTop: mode==="forgot" ? 16 : 8,fontSize:13,color:"#aaa"}}>
              {mode === "forgot" ? <>
                Remember it?{" "}
                <button onClick={()=>switchMode("login")} style={{background:"none",border:"none",color:"#075E54",fontWeight:800,cursor:"pointer",fontSize:13}}>Back to sign in</button>
              </> : mode==="login" ? <>
                Don't have an account?{" "}
                <button onClick={()=>switchMode("register")} style={{background:"none",border:"none",color:"#075E54",fontWeight:800,cursor:"pointer",fontSize:13}}>Sign up free</button>
              </> : <>
                Already have an account?{" "}
                <button onClick={()=>switchMode("login")} style={{background:"none",border:"none",color:"#075E54",fontWeight:800,cursor:"pointer",fontSize:13}}>Sign in</button>
              </>}
            </div>

            {/* Legal */}
            {mode === "register" ? (
              <div style={{display:"flex", alignItems:"flex-start", gap:10, marginTop:12,
                padding:"12px 14px", background:"#f9fafb", borderRadius:12,
                border: `1.5px solid ${termsAccepted ? "#bbf7d0" : "#e5e7eb"}`}}>
                <div style={{flexShrink:0, marginTop:1}}>
                  <input
                    type="checkbox"
                    id="terms-checkbox"
                    checked={termsAccepted}
                    onChange={e => setTermsAccepted(e.target.checked)}
                    style={{width:18, height:18, cursor:"pointer", accentColor:"#075E54"}}/>
                </div>
                <label htmlFor="terms-checkbox"
                  style={{fontSize:12, color:"#555", lineHeight:1.6, cursor:"pointer"}}>
                  I have read and agree to the{" "}
                  <a href="https://cashcounter.vbookng.com/terms" target="_blank"
                    rel="noopener noreferrer"
                    style={{color:"#075E54", fontWeight:700, textDecoration:"none"}}
                    onClick={e => e.stopPropagation()}>
                    Terms of Service
                  </a>
                  {" "}and{" "}
                  <a href="https://cashcounter.vbookng.com/privacy" target="_blank"
                    rel="noopener noreferrer"
                    style={{color:"#075E54", fontWeight:700, textDecoration:"none"}}
                    onClick={e => e.stopPropagation()}>
                    Privacy Policy
                  </a>
                  , including the subscription and refund policy.
                </label>
              </div>
            ) : mode === "login" ? (
              <div style={{textAlign:"center", marginTop:13, fontSize:11, color:"#ccc", lineHeight:1.65}}>
                By signing in you agree to our{" "}
                <a href="https://cashcounter.vbookng.com/terms" target="_blank" rel="noopener noreferrer"
                  style={{color:"#075E54", fontWeight:700, textDecoration:"none"}}>Terms</a>
                {" "}and{" "}
                <a href="https://cashcounter.vbookng.com/privacy" target="_blank" rel="noopener noreferrer"
                  style={{color:"#075E54", fontWeight:700, textDecoration:"none"}}>Privacy Policy</a>
              </div>
            ) : null}

          </div>
        </div>
      </div>
    </div>
  );
}

// legacy alias so any stale references compile fine
const AInput = AuthField;



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

// ═══════════════════════════════════════════════════════════════
// DELETE ACCOUNT MODAL
// ═══════════════════════════════════════════════════════════════
function DeleteAccountModal({ user, onDeleted, onClose }) {
  const isGoogle    = auth.currentUser?.providerData?.some(p => p.providerId === "google.com");
  const [step,      setStep]     = useState(1); // 1=confirm, 2=reauth, 3=deleting
  const [password,  setPassword] = useState("");
  const [err,       setErr]      = useState("");
  const [busy,      setBusy]     = useState(false);

  // Delete all Firestore subcollections then the profile doc
  const deleteAllUserData = async (uid) => {
    const db = auth.currentUser ? (await import("./firebase.js")).db : null;
    if (!db) return;
    // Delete subcollections in parallel
    const cols = ["entries", "budgets", "notifications"];
    await Promise.all(cols.map(async (colName) => {
      const snap = await getDocs(collection(db, "users", uid, colName));
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
    }));
    // Delete settings docs
    const settingsSnap = await getDocs(collection(db, "users", uid, "settings"));
    await Promise.all(settingsSnap.docs.map(d => deleteDoc(d.ref)));
    // Delete profile doc
    await deleteDoc(doc(db, "users", uid));
  };

  const handleDelete = async () => {
    setErr(""); setBusy(true); setStep(3);
    try {
      const firebaseUser = auth.currentUser;

      // Re-authenticate
      if (isGoogle) {
        await reauthenticateWithPopup(firebaseUser, googleProvider);
      } else {
        if (!password) { setErr("Please enter your password."); setBusy(false); setStep(2); return; }
        const credential = EmailAuthProvider.credential(firebaseUser.email, password);
        await reauthenticateWithCredential(firebaseUser, credential);
      }

      // Delete all Firestore data
      await deleteAllUserData(firebaseUser.uid);

      // Delete Firebase Auth account
      await deleteUser(firebaseUser);

      // Notify parent — triggers sign out and redirect to auth screen
      onDeleted();

    } catch(e) {
      setBusy(false);
      setStep(isGoogle ? 1 : 2);
      if (e.code === "auth/wrong-password" || e.code === "auth/invalid-credential") {
        setErr("Incorrect password. Please try again.");
      } else if (e.code === "auth/popup-closed-by-user") {
        setErr("Sign-in cancelled. Please try again.");
      } else if (e.code === "auth/requires-recent-login") {
        setErr("Please sign out and sign back in before deleting your account.");
      } else {
        setErr(e.message || "Failed to delete account. Please try again.");
      }
    }
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:600,
      display:"flex", alignItems:"center", justifyContent:"center",
      padding:"24px 20px", backdropFilter:"blur(3px)" }}
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>

      <div style={{ width:"100%", maxWidth:420, background:"#fff",
        borderRadius:24, padding:"28px 24px",
        boxShadow:"0 24px 64px rgba(0,0,0,0.3)" }}>

        {step === 3 ? (
          // Deleting state
          <div style={{ textAlign:"center", padding:"20px 0" }}>
            <div style={{ fontSize:48, marginBottom:16 }}>🗑️</div>
            <div style={{ fontWeight:900, fontSize:18, color:"#1a1a1a", marginBottom:8 }}>
              Deleting your account…
            </div>
            <div style={{ fontSize:14, color:"#9ca3af" }}>
              Please wait while we erase all your data.
            </div>
          </div>
        ) : step === 1 ? (
          // Step 1 — Confirm
          <>
            <div style={{ textAlign:"center", marginBottom:20 }}>
              <div style={{ fontSize:48, marginBottom:12 }}>⚠️</div>
              <div style={{ fontWeight:900, fontSize:18, color:"#c62828", marginBottom:8 }}>
                Delete your account?
              </div>
              <div style={{ fontSize:14, color:"#6b7280", lineHeight:1.65 }}>
                This will permanently delete:
              </div>
            </div>
            <div style={{ background:"#fff3f0", border:"1px solid #ffcdd2",
              borderRadius:14, padding:"14px 16px", marginBottom:20 }}>
              {["All your financial entries", "All your budgets", "Your business profile and settings",
                "Your subscription (no refund for unused period)", "All notifications"].map(item => (
                <div key={item} style={{ fontSize:13, color:"#c62828", marginBottom:5, display:"flex", gap:8 }}>
                  <span>✗</span><span>{item}</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize:13, color:"#9ca3af", textAlign:"center", marginBottom:20 }}>
              This action is <strong>permanent</strong> and cannot be undone.
            </p>
            {err && <div style={{ color:"#c62828", fontSize:13, marginBottom:12 }}>⚠️ {err}</div>}
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={onClose}
                style={{ flex:1, padding:"13px", background:"#f5f5f5", border:"none",
                  borderRadius:13, fontWeight:700, fontSize:14, cursor:"pointer", color:"#555" }}>
                Cancel
              </button>
              <button onClick={() => isGoogle ? handleDelete() : setStep(2)}
                style={{ flex:1, padding:"13px", background:"#c62828", border:"none",
                  borderRadius:13, fontWeight:900, fontSize:14, cursor:"pointer", color:"#fff" }}>
                {isGoogle ? "Continue with Google" : "Continue →"}
              </button>
            </div>
          </>
        ) : (
          // Step 2 — Re-auth with password
          <>
            <div style={{ textAlign:"center", marginBottom:20 }}>
              <div style={{ fontSize:40, marginBottom:10 }}>🔒</div>
              <div style={{ fontWeight:900, fontSize:17, color:"#1a1a1a", marginBottom:6 }}>
                Confirm your password
              </div>
              <div style={{ fontSize:13, color:"#9ca3af" }}>
                Enter your password to confirm account deletion.
              </div>
            </div>
            <input
              type="password"
              placeholder="Your password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
              style={{ width:"100%", padding:"13px 16px", border:"1.5px solid #e5e7eb",
                borderRadius:13, fontSize:15, outline:"none", boxSizing:"border-box",
                fontFamily:"inherit", marginBottom:err ? 8 : 16 }}/>
            {err && <div style={{ color:"#c62828", fontSize:13, marginBottom:12 }}>⚠️ {err}</div>}
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => { setStep(1); setErr(""); }}
                style={{ flex:1, padding:"13px", background:"#f5f5f5", border:"none",
                  borderRadius:13, fontWeight:700, fontSize:14, cursor:"pointer", color:"#555" }}>
                ← Back
              </button>
              <button onClick={handleDelete} disabled={busy || !password}
                style={{ flex:1, padding:"13px", background: busy || !password ? "#e5e7eb" : "#c62828",
                  border:"none", borderRadius:13, fontWeight:900, fontSize:14,
                  cursor: busy || !password ? "not-allowed" : "pointer",
                  color: busy || !password ? "#9ca3af" : "#fff" }}>
                {busy ? "Deleting…" : "Delete Account"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SettingsScreen({ branding, setBranding, currency, setCurrency, incCats, setIncCats, expCats, setExpCats, user, onLogout, onClose, isPro=false, onUpgrade, planInfo=null, onUserUpdate }) {
  const [editingProfile, setEditingProfile] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [profileForm,    setProfileForm]    = useState({
    businessName: user.businessName || "",
    industry:     user.industry     || "",
    phone:        user.phone        || "",
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileErr,    setProfileErr]    = useState("");

  const handleProfileSave = async () => {
    if (!profileForm.businessName.trim()) return setProfileErr("Business name is required");
    setProfileSaving(true);
    setProfileErr("");
    try {
      await setDoc(userDoc(user.id), {
        businessName: profileForm.businessName.trim(),
        industry:     profileForm.industry,
        phone:        profileForm.phone.trim(),
      }, { merge: true });
      if (onUserUpdate) onUserUpdate({
        businessName: profileForm.businessName.trim(),
        industry:     profileForm.industry,
        phone:        profileForm.phone.trim(),
      });
      setEditingProfile(false);
    } catch(e) {
      setProfileErr("Failed to save. Try again.");
    } finally {
      setProfileSaving(false);
    }
  };
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
          {!isPro ? (
            /* ── Locked for free users ── */
            <div style={{ textAlign:"center", padding:"32px 16px" }}>
              <div style={{ fontSize:48, marginBottom:14 }}>🏷️</div>
              <div style={{ fontWeight:900, fontSize:17, color:"#222", marginBottom:8 }}>Custom Categories</div>
              <div style={{ fontSize:13, color:"#888", lineHeight:1.65, marginBottom:24 }}>
                Add and remove income & expense categories to perfectly match your business. Available on the Pro plan.
              </div>
              {/* Show read-only categories with lock overlay */}
              {[["income","💰 Income",incCats],["expense","📤 Expense",expCats]].map(([type,title,cats])=>(
                <div key={type} style={{ marginBottom:18, textAlign:"left" }}>
                  <div style={{ fontWeight:700, fontSize:13, color:"#555", marginBottom:8 }}>{title}</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8, pointerEvents:"none", opacity:.55 }}>
                    {cats.map(c=>(
                      <div key={c} style={{ background:"#f0f0f0", borderRadius:20, padding:"6px 13px", fontSize:13, color:"#555" }}>{c}</div>
                    ))}
                  </div>
                </div>
              ))}
              <button onClick={onUpgrade}
                style={{ marginTop:8, padding:"14px 32px",
                  background:"linear-gradient(135deg,#054d44,#128C7E)",
                  color:"#fff", border:"none", borderRadius:14,
                  fontWeight:900, fontSize:15, cursor:"pointer",
                  boxShadow:"0 4px 16px rgba(7,94,84,.3)" }}>
                Upgrade to Pro ✨
              </button>
            </div>
          ) : (
            /* ── Pro: full category editing ── */
            [["income","💰 Income Categories",incCats,setIncCats],["expense","📤 Expense Categories",expCats,setExpCats]].map(([type,title,cats,setCats])=>(
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
            ))
          )}
        </>}

        {tab==="account"&&<>
          <div style={{ background:bg, borderRadius:18, padding:"22px 20px", marginBottom:20, color:"#fff", textAlign:"center" }}>
            <div style={{ width:68, height:68, borderRadius:"50%", background:"rgba(255,255,255,0.25)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:32, margin:"0 auto 14px" }}>👤</div>
            <div style={{ fontWeight:900, fontSize:19 }}>{user.name}</div>
            <div style={{ opacity:.75, fontSize:13, marginTop:5 }}>{user.email}</div>
            <div style={{ opacity:.55, fontSize:12, marginTop:4 }}>Member since {fmtDate(user.createdAt)}</div>
            {/* Plan badge */}
            <div style={{ marginTop:14, display:"inline-flex", alignItems:"center", gap:6,
              background: isPro ? "rgba(255,215,0,.25)" : "rgba(255,255,255,.15)",
              borderRadius:20, padding:"6px 14px", fontSize:12, fontWeight:800 }}>
              {isPro ? "✨ Pro Plan" : "🆓 Free Plan"}
            </div>
          </div>

          {/* Subscription info card (Pro) */}
          {isPro && planInfo && (
            <div style={{ background:"#fff", borderRadius:14, padding:"14px 18px", marginBottom:14,
              border:"1px solid #e8f9f0", boxShadow:"0 2px 8px rgba(7,94,84,.08)" }}>
              <div style={{ fontSize:10, fontWeight:800, color:"#075E54", textTransform:"uppercase",
                letterSpacing:1, marginBottom:10 }}>Subscription Details</div>
              {[
                ["Plan",     planInfo.interval ? { monthly:"Monthly", biannually:"6-Month", annually:"Annual" }[planInfo.interval] || planInfo.interval : "Pro"],
                ["Status",   planInfo.status === "active" ? "✅ Active" : planInfo.status === "cancelled" ? "❌ Cancelled" : planInfo.status || "Active"],
                ["Renews",   planInfo.expiresAt ? fmtDate(planInfo.expiresAt) : "—"],
                ["Activated",planInfo.activatedAt ? fmtDate(planInfo.activatedAt) : "—"],
              ].map(([k,v])=>(
                <div key={k} style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                  padding:"7px 0", borderBottom:"1px solid #f0f0f0" }}>
                  <span style={{ color:"#999", fontSize:13 }}>{k}</span>
                  <span style={{ fontWeight:700, color:"#222", fontSize:13 }}>{v}</span>
                </div>
              ))}
              <div style={{ marginTop:10, fontSize:11, color:"#aaa", lineHeight:1.6 }}>
                To cancel, open the subscription email from Paystack and click "Cancel subscription".
              </div>
            </div>
          )}

          {/* Upgrade CTA for free users */}
          {!isPro && (
            <button onClick={onUpgrade}
              style={{ width:"100%", padding:"15px", marginBottom:14,
                background:"linear-gradient(135deg,#054d44,#128C7E)",
                color:"#fff", border:"none", borderRadius:14,
                fontWeight:900, fontSize:15, cursor:"pointer",
                boxShadow:"0 4px 16px rgba(7,94,84,.3)" }}>
              ✨ Upgrade to Pro — Unlock everything
            </button>
          )}
          <div style={{ background:"#fff", borderRadius:16, overflow:"hidden", marginBottom:18 }}>
            {editingProfile ? (
              <div style={{ padding:"16px 18px" }}>
                {[
                  ["Business Name", "businessName", "text", "e.g. Ade Electronics"],
                  ["Phone",         "phone",         "tel",  "e.g. +234 801 234 5678"],
                ].map(([label, key, type, placeholder])=>(
                  <div key={key} style={{ marginBottom:14 }}>
                    <div style={{ fontSize:11, fontWeight:800, color:"#9ca3af",
                      textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>{label}</div>
                    <input type={type} value={profileForm[key]}
                      onChange={e=>setProfileForm(f=>({...f,[key]:e.target.value}))}
                      placeholder={placeholder}
                      style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #e5e7eb",
                        borderRadius:11, fontSize:14, outline:"none", boxSizing:"border-box",
                        fontFamily:"inherit", color:"#111" }}/>
                  </div>
                ))}
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:11, fontWeight:800, color:"#9ca3af",
                    textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Industry</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
                    {INDUSTRIES.map(ind=>(
                      <button key={ind} onClick={()=>setProfileForm(f=>({...f,industry:ind}))}
                        style={{ padding:"7px 13px", borderRadius:20, fontSize:12, cursor:"pointer",
                          border:`1.5px solid ${profileForm.industry===ind?"#075E54":"#e5e7eb"}`,
                          background: profileForm.industry===ind ? "#f0faf7" : "#f9fafb",
                          color: profileForm.industry===ind ? "#075E54" : "#6b7280",
                          fontWeight: profileForm.industry===ind ? 800 : 500 }}>
                        {ind}
                      </button>
                    ))}
                  </div>
                </div>
                {profileErr && (
                  <div style={{ color:"#c62828", fontSize:12, marginBottom:10 }}>⚠️ {profileErr}</div>
                )}
                <div style={{ display:"flex", gap:10 }}>
                  <button onClick={()=>{ setEditingProfile(false); setProfileErr(""); }}
                    style={{ flex:1, padding:"11px", background:"#f5f5f5", border:"none",
                      borderRadius:10, fontSize:14, fontWeight:700, color:"#555", cursor:"pointer" }}>
                    Cancel
                  </button>
                  <button onClick={handleProfileSave} disabled={profileSaving}
                    style={{ flex:2, padding:"11px", background:"linear-gradient(135deg,#054d44,#128C7E)",
                      border:"none", borderRadius:10, fontSize:14, fontWeight:900,
                      color:"#fff", cursor:profileSaving?"not-allowed":"pointer" }}>
                    {profileSaving ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {[
                  ["Business Name", user.businessName||"—"],
                  ["Industry",      user.industry||"—"],
                  ["Phone",         user.phone||"—"],
                  ["Email",         user.email],
                  ["Account ID",    `#${user.id.toUpperCase()}`],
                ].map(([k,v])=>(
                  <div key={k} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"15px 18px", borderBottom:"1px solid #f0f0f0" }}>
                    <span style={{ color:"#999", fontSize:14 }}>{k}</span>
                    <span style={{ fontWeight:700, color:"#333", fontSize:14, textAlign:"right", maxWidth:"60%" }}>{v}</span>
                  </div>
                ))}
                <button onClick={()=>{ setProfileForm({ businessName:user.businessName||"", industry:user.industry||"", phone:user.phone||"" }); setEditingProfile(true); }}
                  style={{ width:"100%", padding:"13px 18px", background:"none", border:"none",
                    borderTop:"1px solid #f0f0f0", color:"#075E54", fontSize:13,
                    fontWeight:800, cursor:"pointer", textAlign:"center" }}>
                  ✏️ Edit Profile
                </button>
              </>
            )}
          </div>
          <button onClick={onLogout} style={{ width:"100%", padding:"15px", background:"#fff", border:"2px solid #ffcdd2", borderRadius:14, color:"#c62828", fontWeight:900, cursor:"pointer", fontSize:15 }}>🚪 Sign Out</button>

          {/* Delete account */}
          <button onClick={() => setShowDeleteModal(true)}
            style={{ width:"100%", padding:"12px", background:"none", border:"none",
              color:"#9ca3af", fontWeight:600, cursor:"pointer", fontSize:13,
              marginTop:8, textDecoration:"underline" }}>
            Delete my account
          </button>

          {/* Delete Account Modal */}
          {showDeleteModal && (
            <DeleteAccountModal
              user={user}
              onDeleted={() => { setShowDeleteModal(false); onLogout(); }}
              onClose={() => setShowDeleteModal(false)}
            />
          )}

          {/* ── Legal links ── */}
          <div style={{ marginTop:24 }}>
            <div style={{ fontSize:11, fontWeight:800, color:"#bbb", textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>Legal</div>
            <div style={{ background:"#fff", borderRadius:16, overflow:"hidden", border:"1px solid #f0f0f0" }}>
              {[
                ["🔒", "Privacy Policy",   "https://cashcounter.vbookng.com/privacy"],
                ["📋", "Terms of Service", "https://cashcounter.vbookng.com/terms"],
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
              Cash Counter · VBook Enterprise · v1.0
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
function TxRow({ entry, currency, onDelete, onEdit, isPro, p }) {
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
      {isPro && (
        <button onClick={()=>onEdit(entry)}
          style={{ background:"none", border:"none", color:"#bbb", cursor:"pointer", fontSize:14,
            padding:"0 0 0 2px", flexShrink:0, lineHeight:1 }} title="Edit entry">✏️</button>
      )}
      <button onClick={()=>onDelete(entry.id)}
        style={{ background:"none", border:"none", color:"#ddd", cursor:"pointer", fontSize:16,
          padding:"0 0 0 2px", flexShrink:0 }}>✕</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// EDIT ENTRY MODAL (Pro only)
// ═══════════════════════════════════════════════════════════════
function EditEntryModal({ entry, onClose, onSave, incCats, expCats, currency }) {
  const [form, setForm] = useState({
    type:     entry.type,
    amount:   String(entry.amount),
    category: entry.category,
    note:     entry.note || "",
    date:     entry.date ? entry.date.slice(0,10) : new Date().toISOString().slice(0,10),
  });
  const [saving, setSaving] = useState(false);
  const cats = form.type === "income" ? incCats : expCats;
  const col  = form.type === "income" ? "#16a34a" : "#c2410c";
  const bgCol = form.type === "income" ? "#f0fdf4" : "#fff7ed";

  const handleSave = async () => {
    if (!form.amount || !form.category) return;
    setSaving(true);
    await onSave(entry.id, {
      type:     form.type,
      amount:   parseFloat(form.amount),
      category: form.category,
      note:     form.note,
      date:     new Date(form.date).toISOString(),
    });
    setSaving(false);
    onClose();
  };

  const MODAL_CSS = `
    @keyframes em-in{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}
    .em-card{animation:em-in .28s cubic-bezier(.22,.68,0,1.1) both}
  `;

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:600,
      display:"flex", alignItems:"flex-end", justifyContent:"center", backdropFilter:"blur(3px)" }}
      onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <style>{MODAL_CSS}</style>
      <div className="em-card" style={{ width:"100%", maxWidth:520, background:"#fff",
        borderRadius:"24px 24px 0 0", overflow:"hidden", maxHeight:"90vh", display:"flex", flexDirection:"column",
        paddingBottom:"max(20px,env(safe-area-inset-bottom,20px))" }}>
        <div style={{ background: form.type==="income"
            ? "linear-gradient(135deg,#054d2e,#16a34a)"
            : "linear-gradient(135deg,#7c2d12,#c2410c)",
          padding:"20px 20px 0", transition:"background .3s" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <div style={{ color:"#fff", fontWeight:900, fontSize:17 }}>Edit Entry</div>
            <button onClick={onClose} style={{ background:"rgba(255,255,255,.2)", border:"none",
              borderRadius:"50%", width:30, height:30, color:"#fff", fontSize:14,
              cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>X</button>
          </div>
          <div style={{ display:"flex", background:"rgba(0,0,0,.2)", borderRadius:14, padding:3, gap:3, marginBottom:16 }}>
            {[["income","Income"],["expense","Expense"]].map(([t,label])=>(
              <button key={t} onClick={()=>setForm(f=>({...f,type:t,category:""}))}
                style={{ flex:1, padding:"10px 8px", border:"none", borderRadius:11,
                  fontWeight:800, fontSize:14, cursor:"pointer", transition:"all .2s",
                  background: form.type===t ? "rgba(255,255,255,.22)" : "transparent",
                  color: form.type===t ? "#fff" : "rgba(255,255,255,.5)" }}>
                {t==="income"?"Income":"Expense"}
              </button>
            ))}
          </div>
          <div style={{ paddingBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:800, color:"rgba(255,255,255,.55)", textTransform:"uppercase", letterSpacing:1.5, marginBottom:8 }}>Amount</div>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <span style={{ fontSize:28, fontWeight:900, color:"rgba(255,255,255,.6)" }}>{currency.symbol}</span>
              <input type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))}
                inputMode="decimal" placeholder="0.00"
                style={{ flex:1, background:"transparent", border:"none", outline:"none",
                  fontSize:40, fontWeight:900, color:"#fff", fontFamily:"inherit" }}/>
            </div>
            <div style={{ height:1.5, background:"rgba(255,255,255,.2)", borderRadius:1, marginTop:8 }}/>
          </div>
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:"18px 20px 0" }}>
          <div style={{ marginBottom:18 }}>
            <div style={{ fontSize:11, fontWeight:800, color:"#9ca3af", textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Date</div>
            <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}
              style={{ width:"100%", padding:"13px 16px", border:"1.5px solid #e5e7eb",
                borderRadius:13, fontSize:15, outline:"none", boxSizing:"border-box",
                background:"#f9fafb", color:"#111", fontFamily:"inherit" }}/>
          </div>
          <div style={{ marginBottom:18 }}>
            <div style={{ fontSize:11, fontWeight:800, color:"#9ca3af", textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>Category</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
              {cats.map(c=>{
                const sel = form.category===c;
                return (
                  <button key={c} onClick={()=>setForm(f=>({...f,category:c}))}
                    style={{ padding:"8px 16px", borderRadius:24,
                      border:"1.5px solid " + (sel ? col : "#e5e7eb"),
                      background: sel ? bgCol : "#f9fafb",
                      fontWeight: sel ? 800 : 500,
                      color: sel ? col : "#6b7280",
                      fontSize:13, cursor:"pointer", transition:"all .12s" }}>
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ marginBottom:4 }}>
            <div style={{ fontSize:11, fontWeight:800, color:"#9ca3af", textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Note (optional)</div>
            <input type="text" placeholder="Customer name, description" value={form.note}
              onChange={e=>setForm(f=>({...f,note:e.target.value}))}
              style={{ width:"100%", padding:"13px 16px", border:"1.5px solid #e5e7eb",
                borderRadius:13, fontSize:15, outline:"none", boxSizing:"border-box",
                background:"#f9fafb", fontFamily:"inherit", color:"#111" }}/>
          </div>
        </div>
        <div style={{ padding:"16px 20px 0" }}>
          <button onClick={handleSave} disabled={saving || !form.amount || !form.category}
            style={{ width:"100%", padding:"16px",
              background: !form.amount || !form.category ? "#e5e7eb"
                : form.type==="income" ? "linear-gradient(135deg,#054d2e,#16a34a)"
                : "linear-gradient(135deg,#7c2d12,#c2410c)",
              color: !form.amount || !form.category ? "#9ca3af" : "#fff",
              border:"none", borderRadius:15, fontSize:16, fontWeight:900,
              cursor: saving || !form.amount || !form.category ? "not-allowed" : "pointer" }}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
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
// ONBOARDING SCREEN — shown once after signup (email or Google)
// ═══════════════════════════════════════════════════════════════
const INDUSTRIES = [
  "Retail & Trading",
  "Food & Beverages",
  "Fashion & Clothing",
  "Beauty & Cosmetics",
  "Technology & IT",
  "Agriculture & Farming",
  "Construction & Real Estate",
  "Transport & Logistics",
  "Healthcare & Pharmacy",
  "Education & Training",
  "Media & Creative Arts",
  "Financial Services",
  "Hospitality & Events",
  "Manufacturing",
  "Professional Services",
  "E-commerce",
  "Other",
];

// ═══════════════════════════════════════════════════════════════
// EMAIL VERIFICATION SCREEN
// shown when a user signs in but hasn't verified their email yet
// ═══════════════════════════════════════════════════════════════
function EmailVerificationScreen({ email, onVerified, onLogout, autoVerified=false }) {
  const [checking,  setChecking]  = useState(false);
  const [resending, setResending] = useState(false);
  const [resent,    setResent]    = useState(false);
  const [err,       setErr]       = useState("");

  // Auto-proceed if verification was just completed via link
  useEffect(() => {
    if (autoVerified) {
      // Give Firebase a moment to propagate, then reload and proceed
      setTimeout(async () => {
        try {
          await reload(auth.currentUser);
          if (auth.currentUser?.emailVerified) {
            trackEmailVerified();
            onVerified();
          }
        } catch(e) {}
      }, 1500);
    }
  }, [autoVerified]);

  const EV_CSS = `
    @keyframes ev-in{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
    .ev-card{animation:ev-in .4s cubic-bezier(.22,.68,0,1.1) both}
    @keyframes ev-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
    .ev-icon{animation:ev-pulse 2.5s ease-in-out infinite}
  `;

  const handleCheckVerified = async () => {
    setChecking(true); setErr("");
    try {
      // Force reload the Firebase user to get latest emailVerified status
      await reload(auth.currentUser);
      if (auth.currentUser?.emailVerified) {
        trackEmailVerified();
        onVerified();
      } else {
        setErr("Email not verified yet. Please click the link in your inbox first.");
      }
    } catch(e) {
      setErr("Could not check verification status. Try again.");
    } finally { setChecking(false); }
  };

  const handleResend = async () => {
    setResending(true); setErr(""); setResent(false);
    try {
      await sendEmailVerification(auth.currentUser);
      setResent(true);
    } catch(e) {
      if (e.code === "auth/too-many-requests")
        setErr("Too many requests. Please wait a few minutes before resending.");
      else setErr("Failed to resend. Try again.");
    } finally { setResending(false); }
  };

  return (
    <div style={{ minHeight:"100vh",
      background:"linear-gradient(175deg,#032e28 0%,#054d44 28%,#075E54 58%,#0a7a6c 82%,#128C7E 100%)",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      padding:"24px 20px" }}>
      <style>{EV_CSS}</style>
      <div className="ev-card" style={{ width:"100%", maxWidth:420 }}>

        {/* Card */}
        <div style={{ background:"#fff", borderRadius:28, padding:"36px 28px",
          boxShadow:"0 24px 64px rgba(0,0,0,.3)", textAlign:"center" }}>

          <div className="ev-icon" style={{ fontSize:64, marginBottom:16 }}>
            {autoVerified ? "✅" : "📧"}
          </div>
          <div style={{ fontWeight:900, fontSize:22, color:"#0a1612",
            letterSpacing:"-.4px", marginBottom:10 }}>
            {autoVerified ? "Email verified!" : "Verify your email"}
          </div>
          <div style={{ fontSize:14, color:"#6b7280", lineHeight:1.7, marginBottom:6 }}>
            {autoVerified ? "Your email has been verified. Taking you in…" : "We sent a verification link to"}
          </div>
          {!autoVerified && (
            <div style={{ fontWeight:800, fontSize:15, color:"#075E54",
              background:"#f0faf7", borderRadius:10, padding:"8px 16px",
              display:"inline-block", marginBottom:20 }}>
              {email}
            </div>
          )}
          {!autoVerified && (
            <div style={{ fontSize:13, color:"#9ca3af", lineHeight:1.65, marginBottom:24 }}>
              Click the link in that email to activate your account, then come back here and tap the button below.
            </div>
          )}

          {/* Error */}
          {err && (
            <div style={{ background:"#fff3f0", border:"1px solid #ffcdd2", borderRadius:12,
              padding:"10px 14px", color:"#c62828", fontSize:13, marginBottom:16, textAlign:"left" }}>
              ⚠️ {err}
            </div>
          )}

          {/* Resent success */}
          {resent && (
            <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:12,
              padding:"10px 14px", color:"#15803d", fontSize:13, marginBottom:16 }}>
              ✅ Verification email resent — check your inbox.
            </div>
          )}

          {/* I've verified button */}
          <button onClick={handleCheckVerified} disabled={checking}
            style={{ width:"100%", padding:"15px", marginBottom:12, border:"none",
              borderRadius:15, fontSize:16, fontWeight:900, cursor:checking?"not-allowed":"pointer",
              background: checking ? "#e5e7eb" : "linear-gradient(135deg,#054d44,#128C7E)",
              color: checking ? "#9ca3af" : "#fff",
              boxShadow: checking ? "none" : "0 6px 20px rgba(7,94,84,.3)",
              transition:"all .2s" }}>
            {checking ? "Checking…" : "✅ I've verified my email"}
          </button>

          {/* Resend */}
          <button onClick={handleResend} disabled={resending}
            style={{ width:"100%", padding:"13px", border:"1.5px solid #e5e7eb",
              borderRadius:14, fontSize:14, fontWeight:700, cursor:resending?"not-allowed":"pointer",
              background:"#f9fafb", color:"#555", transition:"all .2s", marginBottom:16 }}>
            {resending ? "Sending…" : "🔁 Resend verification email"}
          </button>

          {/* Sign out */}
          <button onClick={onLogout}
            style={{ background:"none", border:"none", color:"#9ca3af",
              fontSize:12, cursor:"pointer", fontWeight:600 }}>
            Sign out and use a different account
          </button>
        </div>

        {/* Tip */}
        <div style={{ textAlign:"center", marginTop:16, color:"rgba(255,255,255,.45)",
          fontSize:12, lineHeight:1.65 }}>
          Can't find the email? Check your spam folder.<br/>
          The link expires after 24 hours.
        </div>
      </div>
    </div>
  );
}

function OnboardingScreen({ user, onComplete }) {
  const [step,         setStep]        = useState(1);
  const [businessName, setBusinessName]= useState(user.businessName !== "My Business" ? user.businessName : "");
  const [industry,     setIndustry]    = useState("");
  const [phone,        setPhone]       = useState("");
  const [saving,       setSaving]      = useState(false);
  const [err,          setErr]         = useState("");

  useEffect(() => { trackOnboardingStart(); }, []);

  const OB_CSS = `
    @keyframes ob-in{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:translateY(0)}}
    @keyframes ob-step{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:translateX(0)}}
    .ob-wrap{animation:ob-in .4s cubic-bezier(.22,.68,0,1.1) both}
    .ob-step{animation:ob-step .3s cubic-bezier(.22,.68,0,1.1) both}
  `;

  const TOTAL_STEPS = 3;
  const progress = (step / TOTAL_STEPS) * 100;

  const nextStep = () => {
    setErr("");
    if (step === 1) {
      if (!businessName.trim()) return setErr("Please enter your business name");
      setStep(2);
    } else if (step === 2) {
      if (!industry) return setErr("Please select your industry");
      setStep(3);
    }
  };

  const handleFinish = async () => {
    setErr("");
    if (!phone.trim()) return setErr("Please enter your phone number");
    if (!/^[+\d\s\-()]{7,15}$/.test(phone.replace(/\s/g,"")))
      return setErr("Enter a valid phone number");
    setSaving(true);
    try {
      await setDoc(userDoc(user.id), {
        businessName: businessName.trim(),
        industry,
        phone: phone.trim(),
        onboarded:   true,
        onboardedAt: new Date().toISOString(),
      }, { merge: true });
      trackOnboardingComplete(industry);
      onComplete({ businessName: businessName.trim(), industry, phone: phone.trim() });
    } catch(e) {
      setErr("Failed to save. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(175deg,#032e28 0%,#054d44 28%,#075E54 58%,#0a7a6c 82%,#128C7E 100%)",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      padding:"24px 20px" }}>
      <style>{OB_CSS}</style>

      <div className="ob-wrap" style={{ width:"100%", maxWidth:440 }}>

        {/* Logo + welcome */}
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ fontSize:48, marginBottom:10 }}>🏪</div>
          <div style={{ color:"#fff", fontWeight:900, fontSize:24, letterSpacing:"-.5px" }}>
            Welcome, {user.name.split(" ")[0]}!
          </div>
          <div style={{ color:"rgba(255,255,255,.6)", fontSize:14, marginTop:6 }}>
            Let's set up your business profile
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ background:"rgba(255,255,255,.15)", borderRadius:4, height:4, marginBottom:28 }}>
          <div style={{ height:"100%", borderRadius:4, background:"#25D366",
            width:`${progress}%`, transition:"width .4s ease" }}/>
        </div>

        {/* Step indicator */}
        <div style={{ display:"flex", justifyContent:"center", gap:8, marginBottom:24 }}>
          {[1,2,3].map(s=>(
            <div key={s} style={{ width:s===step?24:8, height:8, borderRadius:4,
              background: s<=step ? "#25D366" : "rgba(255,255,255,.2)",
              transition:"all .3s" }}/>
          ))}
        </div>

        {/* Card */}
        <div style={{ background:"#fff", borderRadius:24, padding:"28px 24px",
          boxShadow:"0 24px 64px rgba(0,0,0,.3)" }}>

          {/* ── Step 1: Business Name ── */}
          {step === 1 && (
            <div key="s1" className="ob-step">
              <div style={{ fontWeight:900, fontSize:18, color:"#0a1612", marginBottom:6 }}>
                What's your business name?
              </div>
              <div style={{ fontSize:13, color:"#9ca3af", marginBottom:20 }}>
                This will appear on your reports and exports.
              </div>
              <input
                type="text"
                placeholder="e.g. Ade Electronics, Grace Boutique"
                value={businessName}
                onChange={e=>setBusinessName(e.target.value)}
                autoFocus
                style={{ width:"100%", padding:"14px 16px", border:"1.5px solid #e5e7eb",
                  borderRadius:14, fontSize:15, outline:"none", boxSizing:"border-box",
                  fontFamily:"inherit", color:"#111", marginBottom:err?8:0 }}/>
            </div>
          )}

          {/* ── Step 2: Industry ── */}
          {step === 2 && (
            <div key="s2" className="ob-step">
              <div style={{ fontWeight:900, fontSize:18, color:"#0a1612", marginBottom:6 }}>
                What industry are you in?
              </div>
              <div style={{ fontSize:13, color:"#9ca3af", marginBottom:16 }}>
                Helps us personalise your experience.
              </div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8, maxHeight:280, overflowY:"auto" }}>
                {INDUSTRIES.map(ind=>(
                  <button key={ind} onClick={()=>setIndustry(ind)}
                    style={{ padding:"9px 16px", borderRadius:24, fontSize:13, cursor:"pointer",
                      border:`1.5px solid ${industry===ind?"#075E54":"#e5e7eb"}`,
                      background: industry===ind ? "#f0faf7" : "#f9fafb",
                      color: industry===ind ? "#075E54" : "#6b7280",
                      fontWeight: industry===ind ? 800 : 500,
                      transition:"all .12s" }}>
                    {ind}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 3: Phone Number ── */}
          {step === 3 && (
            <div key="s3" className="ob-step">
              <div style={{ fontWeight:900, fontSize:18, color:"#0a1612", marginBottom:6 }}>
                What's your phone number?
              </div>
              <div style={{ fontSize:13, color:"#9ca3af", marginBottom:20 }}>
                Used for account recovery and important notifications only.
              </div>
              <input
                type="tel"
                placeholder="e.g. +234 801 234 5678"
                value={phone}
                onChange={e=>setPhone(e.target.value)}
                autoFocus
                style={{ width:"100%", padding:"14px 16px", border:"1.5px solid #e5e7eb",
                  borderRadius:14, fontSize:15, outline:"none", boxSizing:"border-box",
                  fontFamily:"inherit", color:"#111", marginBottom:err?8:0 }}/>
            </div>
          )}

          {/* Error */}
          {err && (
            <div style={{ background:"#fff3f0", border:"1px solid #ffcdd2", borderRadius:10,
              padding:"9px 14px", color:"#c62828", fontSize:12, marginTop:8, marginBottom:4 }}>
              ⚠️ {err}
            </div>
          )}

          {/* Actions */}
          <div style={{ marginTop:20, display:"flex", gap:10 }}>
            {step > 1 && (
              <button onClick={()=>{ setErr(""); setStep(s=>s-1); }}
                style={{ padding:"14px 20px", background:"#f5f5f5", border:"none",
                  borderRadius:14, fontSize:14, fontWeight:700, color:"#555", cursor:"pointer" }}>
                ← Back
              </button>
            )}
            <button
              onClick={step < TOTAL_STEPS ? nextStep : handleFinish}
              disabled={saving}
              style={{ flex:1, padding:"14px", border:"none", borderRadius:14,
                fontSize:15, fontWeight:900, cursor:saving?"not-allowed":"pointer",
                background: saving ? "#e5e7eb" : "linear-gradient(135deg,#054d44,#128C7E)",
                color: saving ? "#9ca3af" : "#fff",
                boxShadow: saving ? "none" : "0 4px 16px rgba(7,94,84,.3)",
                transition:"all .2s" }}>
              {saving ? "Saving…" : step < TOTAL_STEPS ? "Continue →" : "Finish Setup 🎉"}
            </button>
          </div>
        </div>

        {/* Skip */}
        <button onClick={()=>{ trackOnboardingSkip(); onComplete({}); }}
          style={{ display:"block", margin:"16px auto 0", background:"none", border:"none",
            color:"rgba(255,255,255,.45)", fontSize:12, cursor:"pointer", fontWeight:600 }}>
          Skip for now
        </button>

      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
// ERROR BOUNDARY — catches IndexedDB/Firebase connection errors
// and shows a friendly recovery screen instead of a blank crash
// ═══════════════════════════════════════════════════════════════
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, isIndexedDB: false };
  }
  static getDerivedStateFromError(error) {
    const isIndexedDB = error?.message?.includes("IndexedDB") ||
                        error?.message?.includes("Connection to Indexed") ||
                        error?.name === "UnknownError";
    return { hasError: true, isIndexedDB };
  }
  componentDidCatch(error, info) {
    if (!this.state.isIndexedDB) {
      Sentry.captureException(error, { extra: info });
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ position:"fixed", inset:0, background:"#f7f9f8",
          display:"flex", flexDirection:"column", alignItems:"center",
          justifyContent:"center", padding:"24px", textAlign:"center",
          fontFamily:"'Funnel Display', sans-serif" }}>
          <div style={{ fontSize:52, marginBottom:16 }}>
            {this.state.isIndexedDB ? "🔄" : "⚠️"}
          </div>
          <div style={{ fontWeight:900, fontSize:20, color:"#1a1a1a", marginBottom:10 }}>
            {this.state.isIndexedDB ? "Connection interrupted" : "Something went wrong"}
          </div>
          <div style={{ fontSize:14, color:"#666", lineHeight:1.65,
            maxWidth:320, marginBottom:28 }}>
            {this.state.isIndexedDB
              ? "Your browser lost connection to local storage. This can happen in private/incognito mode or when storage is full. Refresh to reconnect."
              : "An unexpected error occurred. Please refresh the page."}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{ background:"#075E54", color:"#fff", border:"none",
              borderRadius:14, padding:"14px 32px", fontSize:15,
              fontWeight:900, cursor:"pointer" }}>
            Refresh Page
          </button>
          {this.state.isIndexedDB && (
            <div style={{ fontSize:12, color:"#9ca3af", marginTop:16, maxWidth:280 }}>
              Tip: If this keeps happening, try opening the app in a regular browser window instead of private/incognito mode.
            </div>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

export default function CashCounter() {
  const [user,setUser]               = useState(null);
  const [authChecked,setChecked]     = useState(false);
  const [needsOnboarding,setNeeds]   = useState(false);
  const [needsVerification,setNeedsVerif] = useState(false);
  const [verifSuccess, setVerifSuccess]   = useState(false);

  // Handle Firebase email action links (verification, password reset)
  useEffect(() => {
    const params  = new URLSearchParams(window.location.search);
    const mode    = params.get("mode");
    const oobCode = params.get("oobCode");
    if (mode === "verifyEmail" && oobCode) {
      applyActionCode(auth, oobCode)
        .then(() => {
          // Clear URL params so it doesn't re-trigger on refresh
          window.history.replaceState({}, document.title, window.location.pathname);
          setVerifSuccess(true);
          // Reload current user to pick up emailVerified: true
          if (auth.currentUser) reload(auth.currentUser).catch(() => {});
        })
        .catch((e) => {
          console.warn("Email verification failed:", e.code, e.message);
          // Link may be expired or already used — still clear params
          window.history.replaceState({}, document.title, window.location.pathname);
        });
    }
  }, []);

  useEffect(()=>{
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Email/password users must verify their email before accessing the app
        // Google users skip this — their email is already verified by Google
        const isEmailProvider = firebaseUser.providerData.some(p => p.providerId === "password");
        if (isEmailProvider && !firebaseUser.emailVerified) {
          setNeedsVerif(true);
          setUser({ id: firebaseUser.uid, email: firebaseUser.email,
            name: firebaseUser.displayName || firebaseUser.email.split("@")[0] });
          setChecked(true);
          return;
        }
        setNeedsVerif(false);

        const u = {
          id:           firebaseUser.uid,
          name:         firebaseUser.displayName || firebaseUser.email.split("@")[0],
          email:        firebaseUser.email,
          businessName: DB.get(`lb_bname_${firebaseUser.uid}`) || "My Business",
          photoURL:     firebaseUser.photoURL || null,
          createdAt:    firebaseUser.metadata.creationTime || new Date().toISOString(),
        };
        try {
          const profileSnap = await getDoc(userDoc(firebaseUser.uid));
          const profileData  = profileSnap.exists() ? profileSnap.data() : {};

          if (profileData.businessName && profileData.businessName !== "My Business") {
            u.businessName = profileData.businessName;
          }
          if (profileData.industry) u.industry = profileData.industry;
          if (profileData.phone)    u.phone    = profileData.phone;

          setNeeds(!profileData.onboarded);

          // Check for referral code — from URL or localStorage
          const refFromUrl   = new URLSearchParams(window.location.search).get("ref");
          const refFromStore = DB.get(`lb_ref_${firebaseUser.uid}`);
          const refCode      = profileData.referredBy || refFromUrl || refFromStore || null;

          await saveProfile(firebaseUser.uid, {
            name:         u.name,
            email:        u.email,
            businessName: u.businessName,
            photoURL:     u.photoURL || "",
            lastSeen:     new Date().toISOString(),
            createdAt:    u.createdAt,
            ...(refCode && !profileData.referredBy ? { referredBy: refCode } : {}),
          });

          // Clear stored ref once saved
          if (refCode && !profileData.referredBy) {
            DB.remove(`lb_ref_${firebaseUser.uid}`);
          }
        } catch(e) {
          console.warn("saveProfile failed:", e.code, e.message);
          Sentry.captureException(e, { tags: { operation: "save_profile" } });
          setNeeds(false);
        }
        Sentry.setUser({ id: firebaseUser.uid, email: firebaseUser.email, username: u.name });
        setUser(u);
      } else {
        Sentry.setUser(null);
        setUser(null);
        setNeeds(false);
        setNeedsVerif(false);
      }
      setChecked(true);
    });
    return () => unsub();
  },[]);

  const handleOnboardingComplete = ({ businessName, industry, phone }) => {
    setUser(u => ({
      ...u,
      ...(businessName ? { businessName } : {}),
      ...(industry     ? { industry }     : {}),
      ...(phone        ? { phone }        : {}),
    }));
    if (businessName && user) DB.set(`lb_bname_${user.id}`, businessName);
    setNeeds(false);
  };

  const handleLogout = async () => {
    trackLogout();
    await signOut(auth);
    setUser(null);
    setNeeds(false);
    setNeedsVerif(false);
  };

  // After user verifies email, reload and re-trigger onAuthStateChanged
  const handleVerified = () => {
    setNeedsVerif(false);
    // onAuthStateChanged will re-fire automatically after reload
    // but we force a reload just in case
    if (auth.currentUser) reload(auth.currentUser);
  };

  if (!authChecked) return (<ErrorBoundary><GlobalStyles/><SplashScreen/></ErrorBoundary>);
  if (!user)        return (<ErrorBoundary><GlobalStyles/><AuthScreen/></ErrorBoundary>);
  if (needsVerification) return (
    <><GlobalStyles/><EmailVerificationScreen
      email={user.email}
      onVerified={handleVerified}
      onLogout={handleLogout}
      autoVerified={verifSuccess}
    /></>
  );
  if (needsOnboarding) return (
    <><GlobalStyles/><OnboardingScreen user={user} onComplete={handleOnboardingComplete}/></>
  );
  return (<ErrorBoundary><GlobalStyles/><AppCore user={user} onLogout={handleLogout} onUserUpdate={u=>setUser(prev=>({...prev,...u}))}/></ErrorBoundary>);
}

// ═══════════════════════════════════════════════════════════════
// APP CORE — Firestore powered
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// NOTIFICATION PANEL
// ═══════════════════════════════════════════════════════════════
const NOTIF_ICONS = {
  budget_warning:  "⚠️",
  budget_exceeded: "🚫",
  subscription:    "💳",
  welcome:         "👋",
  summary:         "📊",
  info:            "ℹ️",
};

function NotificationPanel({ uid, notifs, onClose, onMarkAllRead }) {
  const NP_CSS = `
    @keyframes np-in{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
    .np-card{animation:np-in .25s cubic-bezier(.22,.68,0,1.1) both}
  `;

  const timeAgo = (ts) => {
    if (!ts) return "";
    const secs = Math.floor((Date.now() - (ts.toDate ? ts.toDate() : new Date(ts))) / 1000);
    if (secs < 60)    return "just now";
    if (secs < 3600)  return Math.floor(secs/60) + "m ago";
    if (secs < 86400) return Math.floor(secs/3600) + "h ago";
    return Math.floor(secs/86400) + "d ago";
  };

  const unreadCount = notifs.filter(n => !n.read).length;

  return (
    <div style={{ position:"fixed", inset:0, zIndex:600,
      background:"rgba(0,0,0,0.45)", backdropFilter:"blur(3px)",
      display:"flex", alignItems:"flex-end", justifyContent:"center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <style>{NP_CSS}</style>
      <div className="np-card" style={{ width:"100%", maxWidth:520,
        background:"#fff", borderRadius:"24px 24px 0 0",
        maxHeight:"80vh", display:"flex", flexDirection:"column",
        boxShadow:"0 -8px 40px rgba(0,0,0,0.2)" }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"18px 20px 14px", borderBottom:"1px solid #f0f0f0", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:20 }}>🔔</span>
            <span style={{ fontWeight:900, fontSize:17, color:"#1a1a1a" }}>Notifications</span>
            {unreadCount > 0 && (
              <span style={{ background:"#ef4444", color:"#fff", borderRadius:20,
                fontSize:11, fontWeight:800, padding:"2px 8px" }}>{unreadCount}</span>
            )}
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {unreadCount > 0 && (
              <button onClick={() => onMarkAllRead()}
                style={{ background:"none", border:"none", color:"#075E54",
                  fontSize:12, fontWeight:700, cursor:"pointer" }}>
                Mark all read
              </button>
            )}
            <button onClick={onClose}
              style={{ background:"#f5f5f5", border:"none", borderRadius:8,
                width:32, height:32, cursor:"pointer", fontSize:16, display:"flex",
                alignItems:"center", justifyContent:"center" }}>×</button>
          </div>
        </div>

        {/* List */}
        <div style={{ overflowY:"auto", flex:1 }}>
          {notifs.length === 0 ? (
            <div style={{ textAlign:"center", padding:"48px 24px", color:"#bbb" }}>
              <div style={{ fontSize:48, marginBottom:12 }}>🔔</div>
              <div style={{ fontWeight:700, fontSize:15, marginBottom:6 }}>No notifications yet</div>
              <div style={{ fontSize:13 }}>We'll notify you about budgets, subscriptions and more.</div>
            </div>
          ) : notifs.map(n => (
            <div key={n.id}
              onClick={() => !n.read && markNotifRead(uid, n.id)}
              style={{ display:"flex", gap:14, padding:"14px 20px",
                borderBottom:"1px solid #f5f5f5", cursor: n.read ? "default" : "pointer",
                background: n.read ? "#fff" : "#f0fdf4",
                transition:"background .15s" }}>
              <div style={{ fontSize:24, flexShrink:0, marginTop:2 }}>
                {NOTIF_ICONS[n.type] || "🔔"}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
                  <div style={{ fontWeight: n.read ? 600 : 800, fontSize:14, color:"#1a1a1a", lineHeight:1.4 }}>
                    {n.title}
                  </div>
                  {!n.read && (
                    <div style={{ width:8, height:8, borderRadius:"50%",
                      background:"#075E54", flexShrink:0, marginTop:4 }}/>
                  )}
                </div>
                <div style={{ fontSize:13, color:"#666", marginTop:3, lineHeight:1.5 }}>{n.body}</div>
                <div style={{ fontSize:11, color:"#bbb", marginTop:5 }}>{timeAgo(n.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

function AppCore({ user, onLogout, onUserUpdate }) {
  const uid = user.id;

  // ── Data state — all start empty, loaded from Firestore ──────
  const [entries,  setEntries]   = useState([]);
  const [branding, setBranding]  = useState({...DEFAULT_BRANDING, businessName: user.businessName || "My Business"});
  const [currency, setCurrency]  = useState(DEFAULT_CURRENCY);
  const [incCats,  setIncCats]   = useState(DEFAULT_INC_CATS);
  const [expCats,  setExpCats]   = useState(DEFAULT_EXP_CATS);
  const [loading,  setLoading]   = useState(true);
  const [hasMoreEntries, setHasMoreEntries] = useState(false);
  const ENTRIES_LIMIT = 500; // load latest 500 entries; Pro users with more can load older ones

  const [view,      setView]      = useState("home");
  const [form,      setForm]      = useState({type:"income",amount:"",category:"",note:"",date:new Date().toISOString().split("T")[0]});
  const [txFilter,  setTxFilter]  = useState("all");
  const [toast,     setToast]     = useState(null);
  const [showSt,    setShowSt]    = useState(false);
  const [showDP,    setShowDP]    = useState(false);
  const [datePreset,setDatePreset]= useState("all");
  const [dateRange, setDateRange] = useState({from:"",to:""});
  const [budgets,   setBudgets]   = useState([]);
  const [plan,      setPlan]      = useState("free"); // "free" | "pro"
  const [planInfo,  setPlanInfo]  = useState(null);   // full plan doc data
  const [showUpgrade, setShowUpgrade] = useState(false);
  const openUpgrade = (reason = "default") => {
    trackUpgradeModalOpen(reason);
    setShowUpgrade(true);
  };
  const [editingEntry, setEditingEntry] = useState(null);
  const [budgetView,setBudgetView]= useState("list");
  const [notifs,       setNotifs]      = useState([]);
  const [showNotifs,   setShowNotifs]  = useState(false);
  const notifSentRef = useRef({}); // tracks which alerts have been sent this session
  const [activeBudget,setActiveBudget] = useState(null); // budget being viewed/edited

  const handleDateChange = (preset,range) => { setDatePreset(preset); setDateRange(range); };

  // ── Load settings from Firestore once on mount ───────────────
  useEffect(() => {
    let unsubEntries;
    let unsubBudgets;
    let unsubNotifs;
    const loadData = async () => {
      try {
        // Load profile fields (industry, phone) that may have been set during onboarding
        const profileSnap = await getDoc(userDoc(uid));
        if (profileSnap.exists()) {
          const pd = profileSnap.data();
          const updates = {};
          if (pd.industry && !user.industry) updates.industry = pd.industry;
          if (pd.phone    && !user.phone)    updates.phone    = pd.phone;
          if (pd.businessName && pd.businessName !== user.businessName)
            updates.businessName = pd.businessName;
          if (Object.keys(updates).length > 0 && onUserUpdate) onUserUpdate(updates);

          // Send welcome notification on first ever login
          if (!pd.welcomeNotifSent) {
            await addNotif(uid, {
              type:  "welcome",
              title: `Welcome to Cash Counter, ${user.name.split(" ")[0]}! 👋`,
              body:  "Start by adding your first income or expense entry. Upgrade to Pro to unlock budgets and unlimited entries.",
            });
            await setDoc(userDoc(uid), { welcomeNotifSent: true }, { merge: true });
          }
        }
        // Load settings (branding, currency, categories)
        const snap = await getDoc(settingsDoc(uid));
        if (snap.exists()) {
          const d = snap.data();
          if (d.branding)  setBranding(d.branding);
          if (d.currency)  setCurrency(d.currency);
          if (d.incCats)   setIncCats(d.incCats);
          if (d.expCats)   setExpCats(d.expCats);
        }
        // Load plan (free/pro) — also auto-downgrade if subscription has expired
        const planSnap = await getDoc(planDoc(uid));
        if (planSnap.exists() && planSnap.data().plan) {
          const planData  = planSnap.data();
          const expiresAt = planData.expiresAt;
          // Auto-downgrade if Pro subscription has expired
          if (planData.plan === "pro" && expiresAt && new Date(expiresAt) < new Date()) {
            setPlan("free");
            setDoc(planDoc(uid), { plan: "free", status: "expired", expiredAt: new Date().toISOString() }, { merge: true })
              .catch(()=>{});
          } else {
            setPlan(planData.plan);
            // Subscription expiry alerts
            if (planData.plan === "pro" && expiresAt) {
              const daysLeft = Math.ceil((new Date(expiresAt) - new Date()) / 86400000);
              if (daysLeft <= 7 && daysLeft > 1 && !notifSentRef.current["sub_7"]) {
                notifSentRef.current["sub_7"] = true;
                await addNotif(uid, {
                  type:  "subscription",
                  title: `Your Pro plan expires in ${daysLeft} days`,
                  body:  "Renew your subscription to keep unlimited entries, budgets and an ad-free experience.",
                });
              } else if (daysLeft === 1 && !notifSentRef.current["sub_1"]) {
                notifSentRef.current["sub_1"] = true;
                await addNotif(uid, {
                  type:  "subscription",
                  title: "Your Pro plan expires tomorrow",
                  body:  "Renew today to avoid losing access to Pro features.",
                });
              }
            }
          }
          setPlanInfo(planData);
        }
        // Real-time listener for entries
        const q = query(entriesCol(uid), orderBy("date", "desc"), limit(ENTRIES_LIMIT));
        unsubEntries = onSnapshot(q, (snapshot) => {
          const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          setEntries(data);
          setHasMoreEntries(snapshot.docs.length === ENTRIES_LIMIT);
          setLoading(false);
        }, (err) => {
          Sentry.captureException(err, { tags: { operation: "entries_snapshot" } });
          setLoading(false);
        });
        // Real-time listener for budgets
        const qb = query(budgetsCol(uid), orderBy("createdAt", "desc"));
        unsubBudgets = onSnapshot(qb, (snapshot) => {
          setBudgets(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (err) => {
          Sentry.captureException(err, { tags: { operation: "budgets_snapshot" } });
        });
        // Real-time listener for notifications
        const qn = query(notifsCol(uid), orderBy("createdAt", "desc"), limit(30));
        unsubNotifs = onSnapshot(qn, (snapshot) => {
          setNotifs(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        }, () => {});
      } catch(e) {
        Sentry.captureException(e, { tags: { operation: "load_user_data" } });
        setLoading(false);
      }
    };
    loadData();
    return () => {
      if (unsubEntries) unsubEntries();
      if (unsubBudgets) unsubBudgets();
      if (unsubNotifs)  unsubNotifs();
    };
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
  const isPro     = plan === PLAN.PRO;
  const monthCount = countThisMonth(entries);
  const atLimit    = !isPro && monthCount >= FREE_LIMITS.ENTRIES_PER_MONTH;
  const remaining  = Math.max(0, FREE_LIMITS.ENTRIES_PER_MONTH - monthCount);

  // ── Budget alerts — fire when usage crosses 80% or 100% ──────
  useEffect(() => {
    if (!isPro || !budgets.length || loading) return;
    const now = new Date();
    budgets.forEach(async (b) => {
      if (!b.startDate || !b.endDate) return;
      const start = new Date(b.startDate);
      const end   = new Date(b.endDate + "T23:59:59");
      if (now < start || now > end) return; // budget not active

      // Get actual spending within budget date range
      const budgetEntries = entries.filter(e => {
        const d = new Date(e.date);
        return d >= start && d <= end && e.type === "expense";
      });
      const actualExp = budgetEntries.reduce((s, e) => s + e.amount, 0);
      const budgetExp = b.totalExpense || 0;
      if (budgetExp <= 0) return;

      const pct = (actualExp / budgetExp) * 100;
      const key80  = `budget_80_${b.id}`;
      const key100 = `budget_100_${b.id}`;

      if (pct >= 100 && !notifSentRef.current[key100]) {
        notifSentRef.current[key100] = true;
        await addNotif(uid, {
          type:  "budget_exceeded",
          title: `Budget exceeded: ${b.name}`,
          body:  `Your expenses have exceeded your budget for "${b.name}". Consider reviewing your spending.`,
        });
      } else if (pct >= 80 && pct < 100 && !notifSentRef.current[key80]) {
        notifSentRef.current[key80] = true;
        await addNotif(uid, {
          type:  "budget_warning",
          title: `80% of budget used: ${b.name}`,
          body:  `You've used ${Math.round(pct)}% of your budget for "${b.name}". You have ${fmtAmt(budgetExp - actualExp, currency)} remaining.`,
        });
      }
    });
  }, [budgets, entries, isPro, loading]);

  const showToast = (msg,color) => { setToast({msg,color:color||p}); setTimeout(()=>setToast(null),2600); };

  const handleAdd = async () => {
    if (atLimit) { trackLimitReached(); return openUpgrade("limit"); }
    if (!form.amount||!form.category) return showToast("⚠️ Fill all required fields","#c62828");

    const selectedDate = form.date || new Date().toISOString().split("T")[0];
    const entry = { ...form, amount: parseFloat(form.amount), date: new Date(selectedDate).toISOString() };

    try {
      // Server-side free tier cap — re-verify count before writing
      // This catches users who bypass the UI check via devtools or API calls
      if (!isPro) {
        const now       = new Date();
        const yearMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
        const profileSnap = await getDoc(userDoc(uid));
        const pd          = profileSnap.exists() ? profileSnap.data() : {};
        const savedMonth  = pd.entryMonth || "";
        const savedCount  = savedMonth === yearMonth ? (pd.entryCount || 0) : 0;

        if (savedCount >= FREE_LIMITS.ENTRIES_PER_MONTH) {
          trackLimitReached();
          return openUpgrade("limit");
        }

        // Write entry and update counter atomically
        await addEntry(uid, entry);
        await setDoc(userDoc(uid), {
          entryCount: savedCount + 1,
          entryMonth: yearMonth,
        }, { merge: true });
      } else {
        await addEntry(uid, entry);
      }

      trackEntryAdded(entry.type, entry.category);
      setForm({type:"income",amount:"",category:"",note:"",date:new Date().toISOString().split("T")[0]});
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
      trackEntryDeleted();
      showToast("Removed","#888");
    } catch(e) {
      Sentry.captureException(e, { tags: { operation: "delete_entry" } });
      showToast("❌ Failed to delete.","#c62828");
    }
  };

  const handleEditSave = async (id, data) => {
    try {
      await updateEntry(uid, id, data);
      trackEntryEdited(data.type);
      showToast("✅ Entry updated!","#25D366");
    } catch(e) {
      Sentry.captureException(e, { tags: { operation: "edit_entry" } });
      showToast("❌ Failed to update.","#c62828");
    }
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
    { id:"budget",  icon:"🎯", label:"Budget"  },
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
          <button key={id} onClick={()=>{ setView(id); trackPage(label); }}
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
        {[["⚙️","Settings",()=>setShowSt(true)]].map(([icon,label,fn])=>(
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
                ["📊","Export CSV",()=>{exportCSV(entries,currency,branding,"All Time");trackExportCSV();showToast("📊 CSV downloaded!","#1b5e20");}],
                ["🖨️","PDF Report",()=>{exportPDF(dateFilt,currency,branding,rLabel,entries,budgets);trackExportPDF();showToast("🖨️ Opening PDF…","#1a237e");}],
              ].map(([icon,label,fn])=>(
                <button key={label} onClick={fn}
                  style={{ background:"rgba(255,255,255,0.18)", border:"1px solid rgba(255,255,255,0.25)", borderRadius:11, color:"#fff",
                    padding:"9px 16px", cursor:"pointer", fontSize:13, fontWeight:700,
                    display:"flex", alignItems:"center", gap:7, backdropFilter:"blur(4px)" }}>
                  {icon} {label}
                </button>
              )) : [["⚙️",()=>setShowSt(true),"Settings"]].map(([icon,fn,title])=>(
                <button key={title} onClick={fn} title={title}
                  style={{ background:"rgba(255,255,255,0.18)", border:"none", borderRadius:10, color:"#fff",
                    width:36, height:36, cursor:"pointer", fontSize:15, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  {icon}
                </button>
              ))}
              {/* Bell icon — shown on both mobile and desktop */}
              <button onClick={()=>setShowNotifs(true)} title="Notifications"
                style={{ background:"rgba(255,255,255,0.18)", border:"none", borderRadius:10, color:"#fff",
                  width:36, height:36, cursor:"pointer", fontSize:15, display:"flex",
                  alignItems:"center", justifyContent:"center", position:"relative" }}>
                🔔
                {notifs.filter(n=>!n.read).length > 0 && (
                  <span style={{ position:"absolute", top:4, right:4, width:8, height:8,
                    background:"#ef4444", borderRadius:"50%", border:"1.5px solid rgba(255,255,255,0.8)" }}/>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ══ HOME ══ */}
        {view==="home"&&(
          <div className="lb-content" style={{ flex:1, overflowY:"auto", paddingBottom:isDesktop?48:`calc(${S.navH}px + env(safe-area-inset-bottom,0px) + 8px)`,
            padding: isDesktop ? "28px 36px 48px" : undefined }}>
            <div style={{ paddingLeft: isDesktop?0:S.px, paddingRight: isDesktop?0:S.px, paddingTop: isDesktop?0:20 }}>

              {/* ── Free tier usage banner ── */}
              {!isPro && (
                <div onClick={()=>openUpgrade()} style={{ cursor:"pointer",
                  background: atLimit ? "#fff3f0" : `${p}0f`,
                  border: `1.5px solid ${atLimit ? "#ffcdd2" : p+"33"}`,
                  borderRadius:14, padding:"11px 14px", marginBottom:14,
                  display:"flex", alignItems:"center", gap:11 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:800, fontSize:13, color: atLimit ? "#c62828" : p }}>
                      {atLimit ? "🚫 Monthly limit reached" : `📊 Free plan — ${remaining} entries left this month`}
                    </div>
                    <div style={{ fontSize:11, color:"#aaa", marginTop:2 }}>
                      {atLimit
                        ? "Upgrade to Pro for unlimited entries"
                        : `${monthCount}/${FREE_LIMITS.ENTRIES_PER_MONTH} entries used · Tap to upgrade`}
                    </div>
                  </div>
                  <div style={{ background: atLimit ? "#c62828" : p,
                    color:"#fff", borderRadius:10, padding:"6px 12px",
                    fontSize:11, fontWeight:800, flexShrink:0, whiteSpace:"nowrap" }}>
                    {atLimit ? "Upgrade" : "Go Pro ✨"}
                  </div>
                </div>
              )}

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
                  <button className="lb-card-action" onClick={()=>{exportCSV(entries,currency,branding,"All Time");trackExportCSV();showToast("📊 CSV downloaded!","#1b5e20");}}
                    style={{ background:"#F0FBF0", border:"2px solid #C8E6C9", borderRadius:16, padding:"16px 14px", cursor:"pointer", textAlign:"left" }}>
                    <div style={{ fontSize:28, marginBottom:10 }}>📊</div>
                    <div style={{ fontWeight:800, color:"#2E7D32", fontSize:15 }}>Export CSV</div>
                    <div style={{ fontSize:11, color:"#66BB6A", marginTop:3 }}>Download spreadsheet</div>
                  </button>
                  <button className="lb-card-action" onClick={()=>{exportPDF(dateFilt,currency,branding,rLabel,entries,budgets);trackExportPDF();showToast("🖨️ Opening PDF…","#1a237e");}}
                    style={{ background:"#F3F0FF", border:"2px solid #C5CAE9", borderRadius:16, padding:"16px 14px", cursor:"pointer", textAlign:"left" }}>
                    <div style={{ fontSize:28, marginBottom:10 }}>🖨️</div>
                    <div style={{ fontWeight:800, color:"#283593", fontSize:15 }}>PDF Report</div>
                    <div style={{ fontSize:11, color:"#7986CB", marginTop:3 }}>Income statement</div>
                  </button>
                </>}
              </div>

              {/* Export row — mobile/tablet only */}
              {!isDesktop&&<div style={{ display:"flex", gap:10, marginBottom:16 }}>
                <button onClick={()=>{exportCSV(entries,currency,branding,"All Time");trackExportCSV();showToast("📊 CSV downloaded!","#1b5e20");}}
                  style={{ flex:1, padding:"10px", background:"#F0FBF0", border:"1.5px solid #C8E6C9", borderRadius:12, fontSize:12, fontWeight:700, cursor:"pointer", color:"#2E7D32" }}>
                  📊 Export CSV
                </button>
                <button onClick={()=>{exportPDF(entries,currency,branding,"All Time",entries,budgets);trackExportPDF();showToast("🖨️ Opening PDF…","#1a237e");}}
                  style={{ flex:1, padding:"10px", background:"#F3F0FF", border:"1.5px solid #C5CAE9", borderRadius:12, fontSize:12, fontWeight:700, cursor:"pointer", color:"#283593" }}>
                  🖨️ PDF Report
                </button>
              </div>}

              {/* ── Ad banner (free tier only) ── */}
              {!isPro && <AdBanner onUpgrade={()=>openUpgrade()} p={p} slot="home"/>}

              {/* Recent Transactions + Charts */}
              <div className="lb-page-grid">
                {/* Left — transactions */}
                <div className="lb-section">
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                    <div style={{ fontWeight:900, fontSize:isDesktop?16:15, color:isDesktop?"#1a1a1a":p }}>Recent Transactions</div>
                    <button onClick={()=>setView("history")} style={{ background:"none", border:`1.5px solid ${p}`, color:p, fontSize:12, cursor:"pointer", fontWeight:700, borderRadius:20, padding:"5px 14px" }}>View All →</button>
                  </div>
                  {entries.slice(0,isDesktop?8:6).map(e=><TxRow key={e.id} entry={e} currency={currency} onDelete={handleDel} onEdit={setEditingEntry} isPro={isPro} p={p}/>)}
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
          <div style={{ flex:1, overflowY:"auto", overflowX:"hidden",
            padding: isDesktop?"28px 36px 48px":"0",
            paddingBottom: isDesktop?48:`calc(${S.navH}px + env(safe-area-inset-bottom,0px) + 24px)` }}>

            {isDesktop && <div style={{ fontWeight:900, fontSize:22, color:"#1a1a1a",
              marginBottom:24, letterSpacing:-.5 }}>
              {form.type==="income" ? "➕ Record Income" : "➖ Record Expense"}
            </div>}

            <div className="lb-page-grid">

              {/* ── LEFT — the form ── */}
              <div>
                <div className="lb-section" style={{ padding:0, overflow:"hidden", marginBottom:20 }}>

                  {/* Type + Amount header */}
                  <div style={{
                    background: form.type==="income"
                      ? "linear-gradient(135deg,#054d2e,#16a34a)"
                      : "linear-gradient(135deg,#7c2d12,#c2410c)",
                    padding: isDesktop?"24px 24px 0":"16px 16px 0",
                    transition:"background .3s" }}>
                    <div style={{ display:"flex", background:"rgba(0,0,0,.2)", borderRadius:14, padding:4, gap:3, marginBottom:18 }}>
                      {[["income","💰","Income"],["expense","📤","Expense"]].map(([t,em,label])=>(
                        <button key={t} onClick={()=>setForm(f=>({...f,type:t,category:""}))}
                          style={{ flex:1, padding:"11px 8px", border:"none", borderRadius:11,
                            fontWeight:800, fontSize:14, cursor:"pointer", transition:"all .2s",
                            background: form.type===t ? "rgba(255,255,255,.22)" : "transparent",
                            color: form.type===t ? "#fff" : "rgba(255,255,255,.5)" }}>
                          {em} {label}
                        </button>
                      ))}
                    </div>
                    <div style={{ paddingBottom:24 }}>
                      <div style={{ fontSize:11, fontWeight:800, color:"rgba(255,255,255,.55)",
                        textTransform:"uppercase", letterSpacing:1.5, marginBottom:8 }}>
                        Amount ({currency.code})
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <span style={{ fontSize:32, fontWeight:900, color:"rgba(255,255,255,.6)", lineHeight:1 }}>
                          {currency.symbol}
                        </span>
                        <input type="number" placeholder="0.00" value={form.amount}
                          onChange={e=>setForm(f=>({...f,amount:e.target.value}))}
                          inputMode="decimal"
                          style={{ flex:1, background:"transparent", border:"none", outline:"none",
                            fontSize:48, fontWeight:900, color:"#fff", width:"100%",
                            caretColor:"rgba(255,255,255,.8)", fontFamily:"inherit", letterSpacing:-1 }}/>
                      </div>
                      <div style={{ height:1.5, background:"rgba(255,255,255,.2)", borderRadius:1, marginTop:8 }}/>
                    </div>
                  </div>

                  {/* Fields */}
                  <div style={{ padding: isDesktop?"20px 24px 0":"20px 16px 0" }}>

                    {/* Mobile: free tier bar */}
                    {!isPro && !isDesktop && (
                      <div style={{ marginBottom:14,
                        background: atLimit?"#fff3f0":"#f0fdf4",
                        border:`1.5px solid ${atLimit?"#ffcdd2":"#bbf7d0"}`,
                        borderRadius:14, padding:"11px 14px" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                          <span style={{ fontWeight:800, fontSize:13, color: atLimit?"#c62828":"#16a34a" }}>
                            {atLimit ? "🚫 Limit reached" : `${remaining} entries left this month`}
                          </span>
                          <button onClick={()=>openUpgrade()}
                            style={{ background: atLimit?"#c62828":"#16a34a", color:"#fff", border:"none",
                              borderRadius:8, padding:"4px 10px", fontSize:11, fontWeight:800, cursor:"pointer" }}>
                            {atLimit ? "Upgrade" : "Go Pro ✨"}
                          </button>
                        </div>
                        <div style={{ height:5, background:"#e5e7eb", borderRadius:3, overflow:"hidden" }}>
                          <div style={{ height:"100%", width:`${Math.min(100,(monthCount/FREE_LIMITS.ENTRIES_PER_MONTH)*100)}%`,
                            background: atLimit?"#ef4444":monthCount/FREE_LIMITS.ENTRIES_PER_MONTH>0.75?"#f97316":"#22c55e",
                            borderRadius:3, transition:"width .4s" }}/>
                        </div>
                        <div style={{ fontSize:11, color:"#9ca3af", marginTop:4 }}>
                          {monthCount}/{FREE_LIMITS.ENTRIES_PER_MONTH} used in {new Date().toLocaleString("default",{month:"long"})}
                        </div>
                      </div>
                    )}

                    {/* Mobile ad */}
                    {!isPro && !isDesktop && <AdBanner onUpgrade={()=>openUpgrade()} p={p} slot="add"/>}

                    {/* Date */}
                    <div style={{ marginBottom:18 }}>
                      <div style={{ fontSize:11, fontWeight:800, color:"#9ca3af", textTransform:"uppercase",
                        letterSpacing:1, marginBottom:8 }}>📅 Date</div>
                      <input type="date" value={form.date || new Date().toISOString().split("T")[0]}
                        onChange={e=>setForm(f=>({...f,date:e.target.value}))}
                        style={{ width:"100%", padding:"13px 16px", border:"1.5px solid #e5e7eb",
                          borderRadius:13, fontSize:15, outline:"none", boxSizing:"border-box",
                          background:"#f9fafb", color:"#111", fontFamily:"inherit",
                          WebkitAppearance:"none", appearance:"none", display:"block" }}/>
                    </div>

                    {/* Category */}
                    <div style={{ marginBottom:18 }}>
                      <div style={{ fontSize:11, fontWeight:800, color:"#9ca3af", textTransform:"uppercase",
                        letterSpacing:1, marginBottom:10 }}>🏷️ Category</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                        {cats.map(c=>{
                          const sel = form.category===c;
                          const col = form.type==="income" ? "#16a34a" : "#c2410c";
                          const bgSel = form.type==="income" ? "#f0fdf4" : "#fff7ed";
                          return (
                            <button key={c} onClick={()=>setForm(f=>({...f,category:c}))}
                              style={{ padding:"9px 18px", borderRadius:24,
                                border:`1.5px solid ${sel ? col : "#e5e7eb"}`,
                                background: sel ? bgSel : "#f9fafb",
                                fontWeight: sel ? 800 : 500,
                                color: sel ? col : "#6b7280",
                                fontSize:13, cursor:"pointer", transition:"all .12s",
                                boxShadow: sel ? `0 1px 4px ${col}33` : "none" }}>
                              {c}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Note */}
                    <div style={{ marginBottom:24 }}>
                      <div style={{ fontSize:11, fontWeight:800, color:"#9ca3af", textTransform:"uppercase",
                        letterSpacing:1, marginBottom:8 }}>📝 Note (optional)</div>
                      <input type="text" placeholder="Customer name, description…"
                        value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}
                        style={{ width:"100%", padding:"13px 16px", border:"1.5px solid #e5e7eb",
                          borderRadius:13, fontSize:15, outline:"none",
                          boxSizing:"border-box", background:"#f9fafb", fontFamily:"inherit",
                          color:"#111" }}/>
                    </div>

                    {/* Save button — desktop inside card */}
                    {isDesktop && (
                      <div style={{ paddingBottom:24 }}>
                        <button onClick={handleAdd} disabled={!form.amount || !form.category}
                          style={{ width:"100%", padding:"16px",
                            background: !form.amount || !form.category
                              ? "#e5e7eb"
                              : form.type==="income"
                                ? "linear-gradient(135deg,#054d2e,#16a34a)"
                                : "linear-gradient(135deg,#7c2d12,#c2410c)",
                            color: !form.amount || !form.category ? "#9ca3af" : "#fff",
                            border:"none", borderRadius:14, fontSize:16, fontWeight:900,
                            cursor: !form.amount || !form.category ? "not-allowed" : "pointer",
                            boxShadow: !form.amount || !form.category ? "none"
                              : form.type==="income" ? "0 6px 20px #16a34a44" : "0 6px 20px #c2410c44",
                            transition:"all .2s" }}>
                          {form.type==="income" ? "💰 Save Income" : "📤 Save Expense"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Save button — mobile sticky */}
                {!isDesktop && (
                  <div style={{ padding:"16px", background:"#fff",
                    borderTop:"1px solid #f3f4f6", position:"sticky", bottom:0,
                    paddingBottom:"max(16px,env(safe-area-inset-bottom,16px))" }}>
                    <button onClick={handleAdd} disabled={!form.amount || !form.category}
                      style={{ width:"100%", padding:"17px",
                        background: !form.amount || !form.category
                          ? "#e5e7eb"
                          : form.type==="income"
                            ? "linear-gradient(135deg,#054d2e,#16a34a)"
                            : "linear-gradient(135deg,#7c2d12,#c2410c)",
                        color: !form.amount || !form.category ? "#9ca3af" : "#fff",
                        border:"none", borderRadius:16, fontSize:17, fontWeight:900,
                        cursor: !form.amount || !form.category ? "not-allowed" : "pointer",
                        boxShadow: !form.amount || !form.category ? "none"
                          : form.type==="income" ? "0 6px 20px #16a34a44" : "0 6px 20px #c2410c44",
                        transition:"all .2s" }}>
                      {form.type==="income" ? "💰 Save Income" : "📤 Save Expense"}
                    </button>
                  </div>
                )}
              </div>

              {/* ── RIGHT — stats panel (desktop only) ── */}
              {isDesktop && <div>
                {/* This month summary */}
                <div className="lb-section" style={{ marginBottom:20 }}>
                  <div style={{ fontWeight:800, fontSize:14, color:"#1a1a1a", marginBottom:16 }}>📊 This Month</div>
                  {[
                    ["Income",  totalInc,  "#16a34a", "#f0fdf4"],
                    ["Expenses",totalExp,  "#c2410c", "#fff7ed"],
                    ["Balance", totalInc-totalExp, totalInc-totalExp>=0?"#16a34a":"#c2410c", totalInc-totalExp>=0?"#f0fdf4":"#fff7ed"],
                  ].map(([label, val, col, bg])=>(
                    <div key={label} style={{ display:"flex", justifyContent:"space-between",
                      alignItems:"center", padding:"10px 14px", borderRadius:12,
                      background:bg, marginBottom:8 }}>
                      <span style={{ fontSize:13, color:"#555", fontWeight:600 }}>{label}</span>
                      <span style={{ fontSize:15, fontWeight:900, color:col }}>{fmtAmt(val, currency)}</span>
                    </div>
                  ))}
                </div>

                {/* Free tier bar (desktop) */}
                {!isPro && (
                  <div className="lb-section" style={{ marginBottom:20,
                    background: atLimit ? "#fff3f0" : "#f0fdf4",
                    border:`1.5px solid ${atLimit?"#ffcdd2":"#bbf7d0"}` }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                      <span style={{ fontWeight:800, fontSize:13, color: atLimit?"#c62828":"#16a34a" }}>
                        {atLimit ? "🚫 Limit reached" : `${remaining} entries left`}
                      </span>
                      <button onClick={()=>openUpgrade()}
                        style={{ background: atLimit?"#c62828":"#16a34a", color:"#fff", border:"none",
                          borderRadius:8, padding:"4px 10px", fontSize:11, fontWeight:800, cursor:"pointer" }}>
                        Go Pro ✨
                      </button>
                    </div>
                    <div style={{ height:6, background:"#e5e7eb", borderRadius:3, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${Math.min(100,(monthCount/FREE_LIMITS.ENTRIES_PER_MONTH)*100)}%`,
                        background: atLimit?"#ef4444":monthCount/FREE_LIMITS.ENTRIES_PER_MONTH>0.75?"#f97316":"#22c55e",
                        borderRadius:3, transition:"width .4s" }}/>
                    </div>
                    <div style={{ fontSize:11, color:"#9ca3af", marginTop:6 }}>
                      {monthCount}/{FREE_LIMITS.ENTRIES_PER_MONTH} used in {new Date().toLocaleString("default",{month:"long"})}
                    </div>
                  </div>
                )}

                {/* Recent entries */}
                <div className="lb-section">
                  <div style={{ fontWeight:800, fontSize:14, color:"#1a1a1a", marginBottom:14 }}>🕐 Recent Entries</div>
                  {entries.slice(0,5).length === 0
                    ? <div style={{ color:"#ccc", fontSize:13, textAlign:"center", padding:"16px 0" }}>No entries yet</div>
                    : entries.slice(0,5).map(e=>(
                      <div key={e.id} style={{ display:"flex", justifyContent:"space-between",
                        alignItems:"center", padding:"8px 0",
                        borderBottom:"1px solid #f5f5f5" }}>
                        <div style={{ minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:"#222" }}>{e.category}</div>
                          <div style={{ fontSize:11, color:"#aaa" }}>{fmtShort(e.date)}</div>
                        </div>
                        <div style={{ fontWeight:900, fontSize:14, flexShrink:0,
                          color: e.type==="income" ? "#16a34a" : "#c2410c" }}>
                          {e.type==="income"?"+":"-"}{fmtAmt(e.amount,currency)}
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>}

            </div>
          </div>
        )}

        {/* ══ ADD ENTRY (mobile) ══ */}
        {false && null /* mobile handled inline above via isDesktop checks */}



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
                  <button onClick={()=>{exportCSV(histFilt,currency,branding,rLabel);trackExportCSV();showToast("📊 Exported!","#1b5e20");}}
                    style={{ flex:1, padding:"9px", background:"#F0FBF0", border:"1.5px solid #C8E6C9", borderRadius:10, fontSize:12, fontWeight:700, cursor:"pointer", color:"#2E7D32" }}>
                    📊 CSV
                  </button>
                  <button onClick={()=>{exportPDF(histFilt,currency,branding,rLabel,entries,budgets);trackExportPDF();showToast("🖨️ Opening…","#1a237e");}}
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
              {/* Ad banner in history (free only) */}
              {!isPro && <AdBanner onUpgrade={()=>openUpgrade()} p={p} slot="history"/>}
              <div className={isDesktop?"lb-section":""} style={{ padding: isDesktop?"24px 26px":undefined }}>
                {Object.keys(grouped).sort((a,b)=>b.localeCompare(a)).map((day, dayIdx)=>(
                  <div key={day}>
                    <div style={{ fontSize:11, color:"#bbb", fontWeight:700, textTransform:"uppercase", letterSpacing:.5, margin:"10px 0 7px" }}>
                      {fmtDate(day+"T12:00:00")}
                    </div>
                    {grouped[day].map(e=><TxRow key={e.id} entry={e} currency={currency} onDelete={handleDel} onEdit={setEditingEntry} isPro={isPro} p={p}/>)}
                    {/* Inline ad after every 5th day group */}
                    {!isPro && dayIdx > 0 && (dayIdx + 1) % 5 === 0 && (
                      <AdBanner onUpgrade={()=>openUpgrade()} p={p} slot="inline"/>
                    )}
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
                {/* Older entries notice — shown when 500 entry limit is reached */}
                {hasMoreEntries && histFilt.length > 0 && (
                  <div style={{ textAlign:"center", padding:"16px 0 8px",
                    borderTop:"1px solid #f0f0f0", marginTop:8 }}>
                    <div style={{ fontSize:12, color:"#aaa", marginBottom:8 }}>
                      Showing your most recent {ENTRIES_LIMIT} entries.
                    </div>
                    <div style={{ fontSize:11, color:"#bbb" }}>
                      Older entries are stored safely — use CSV or PDF export to access your full history.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}


        {/* ══ BUDGET ══ */}
        {view==="budget"&&(
          <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden",
            padding: isDesktop ? "28px 36px 0" : undefined }}>
            {!isPro ? (
              /* ── Free tier: Budget locked ── */
              <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                padding:"40px 28px", textAlign:"center",
                paddingBottom:`calc(${S.navH+24}px + env(safe-area-inset-bottom,0px))` }}>
                <div style={{ fontSize:64, marginBottom:16 }}>🎯</div>
                <div style={{ fontWeight:900, fontSize:20, color:"#222", marginBottom:8, letterSpacing:"-.4px" }}>
                  Budget Tracking
                </div>
                <div style={{ fontSize:14, color:"#888", lineHeight:1.65, maxWidth:300, marginBottom:28 }}>
                  Create monthly or custom budgets, set income & expense targets per category, and get a full budget vs actual report — available on the Pro plan.
                </div>
                <div style={{ width:"100%", maxWidth:340 }}>
                  {[["🎯","Budget creation","Set targets by category"],
                    ["📊","Budget vs Actual","See variance at a glance"],
                    ["📎","Unplanned items","Track what fell outside your plan"],
                    ["♾️","Multiple budgets","Different periods at once"],
                  ].map(([em,feat,detail])=>(
                    <div key={feat} style={{ display:"flex", alignItems:"center", gap:12,
                      padding:"10px 0", borderBottom:"1px solid #f5f5f5", textAlign:"left" }}>
                      <span style={{ fontSize:20 }}>{em}</span>
                      <div>
                        <div style={{ fontWeight:700, fontSize:13, color:"#333" }}>{feat}</div>
                        <div style={{ fontSize:11, color:"#aaa" }}>{detail}</div>
                      </div>
                      <span style={{ marginLeft:"auto", color:"#25D366", fontWeight:900 }}>✓</span>
                    </div>
                  ))}
                </div>
                <button onClick={()=>openUpgrade()}
                  style={{ marginTop:28, padding:"15px 36px",
                    background:"linear-gradient(135deg,#054d44,#128C7E)",
                    color:"#fff", border:"none", borderRadius:16,
                    fontWeight:900, fontSize:16, cursor:"pointer",
                    boxShadow:"0 6px 20px rgba(7,94,84,.35)" }}>
                  Upgrade to Pro ✨
                </button>
                <div style={{ marginTop:12, fontSize:12, color:"#ccc" }}>
                  Unlimited entries · Budgets · Custom categories · No ads
                </div>
              </div>
            ) : (
              <>
                {budgetView==="list"   && <BudgetList   budgets={budgets} entries={entries} currency={currency} p={p} isDesktop={isDesktop} uid={uid} onNew={()=>{ setActiveBudget(null); setBudgetView("create"); }} onView={(b)=>{ setActiveBudget(b); setBudgetView("detail"); }} onDelete={async(id)=>{ await delBudget(uid,id); showToast("Budget deleted","#888"); }} showToast={showToast}/>}
                {budgetView==="create" && <BudgetCreate  budget={activeBudget} expCats={expCats} incCats={incCats} currency={currency} p={p} isDesktop={isDesktop} uid={uid} onSave={async(b)=>{ try { if(b.id){ await saveBudget(uid,b.id,b); showToast("✅ Budget updated!",p); } else { await addBudget(uid,b); trackBudgetCreated(); showToast("✅ Budget created!",p); } setBudgetView("list"); } catch(e){ Sentry.captureException(e); showToast("❌ Failed to save","#c62828"); }}} onBack={()=>setBudgetView("list")}/>}
                {budgetView==="detail" && <BudgetDetail  budget={activeBudget} entries={entries} currency={currency} p={p} bg={bg} isDesktop={isDesktop} onBack={()=>setBudgetView("list")} onEdit={(b)=>{ setActiveBudget(b); setBudgetView("create"); }} onDelete={async(id)=>{ await delBudget(uid,id); setBudgetView("list"); showToast("Budget deleted","#888"); }}/>}
              </>
            )}
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

              {/* Active budget widget */}
              {(() => {
                const today = toISO(new Date());
                const active = budgets.filter(b => b.startDate <= today && b.endDate >= today);
                if (!active.length) return null;
                return (
                  <div style={{ marginBottom: isDesktop?24:16 }}>
                    <div style={{ fontWeight:800, fontSize:14, color:isDesktop?"#1a1a1a":p, marginBottom:10 }}>🎯 Active Budgets</div>
                    {active.map(b => {
                      const bEntries = entries.filter(e => e.date.slice(0,10) >= b.startDate && e.date.slice(0,10) <= b.endDate);
                      const { actualBudgetedExp, actualBudgetedInc } = calcBudgetStats(b, entries);
                      const budgetInc = b.totalIncome  || 0;
                      const budgetExp = b.totalExpense || 0;
                      const expPct = budgetExp > 0 ? Math.min(100,(actualBudgetedExp/budgetExp)*100) : 0;
                      const incPct = budgetInc  > 0 ? Math.min(100,(actualBudgetedInc/budgetInc)*100)  : 0;
                      const expOver = budgetExp > 0 && actualBudgetedExp > budgetExp;
                      const incMet  = budgetInc  > 0 && actualBudgetedInc >= budgetInc;
                      return (
                        <div key={b.id} className="lb-section" style={{ marginBottom:12, cursor:"pointer", padding: isDesktop?"22px 24px":"14px 16px" }}
                          onClick={()=>{ setActiveBudget(b); setBudgetView("detail"); setView("budget"); }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                            <div>
                              <div style={{ fontWeight:900, fontSize:15, color:"#1a1a1a" }}>{b.name}</div>
                              <div style={{ fontSize:11, color:"#999", marginTop:2 }}>{fmtDate(b.startDate+"T12:00:00")} → {fmtDate(b.endDate+"T12:00:00")}</div>
                            </div>
                            <div style={{ fontSize:11, fontWeight:800, padding:"4px 10px", borderRadius:20,
                              background: expOver?"#FFEBEE":"#E8F5E9", color: expOver?"#c62828":"#2E7D32" }}>
                              {expOver ? "⚠️ Over budget" : "✅ On track"}
                            </div>
                          </div>
                          {b.totalExpense > 0 && (
                            <div style={{ marginBottom:10 }}>
                              <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#555", marginBottom:5 }}>
                                <span>📤 Expenses</span>
                                <span style={{ fontWeight:700, color: expOver?"#c62828":"#333" }}>{Math.round(expPct)}% — {fmtAmt(actualBudgetedExp,currency)} of {fmtAmt(budgetExp,currency)}</span>
                              </div>
                              <div style={{ height:8, background:"#f0f0f0", borderRadius:99, overflow:"hidden" }}>
                                <div style={{ height:"100%", borderRadius:99, width:`${expPct}%`,
                                  background: expOver?"#ef5350":"#FF9800", transition:"width 0.5s" }}/>
                              </div>
                            </div>
                          )}
                          {b.totalIncome > 0 && (
                            <div>
                              <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#555", marginBottom:5 }}>
                                <span>💰 Income</span>
                                <span style={{ fontWeight:700, color: incMet?"#2E7D32":"#333" }}>{Math.round(incPct)}% — {fmtAmt(actualBudgetedInc,currency)} of {fmtAmt(budgetInc,currency)}</span>
                              </div>
                              <div style={{ height:8, background:"#f0f0f0", borderRadius:99, overflow:"hidden" }}>
                                <div style={{ height:"100%", borderRadius:99, width:`${incPct}%`,
                                  background: incMet?"#25D366":"#128C7E", transition:"width 0.5s" }}/>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

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
                <button onClick={()=>{exportCSV(dateFilt,currency,branding,rLabel);trackExportCSV();showToast("📊 CSV downloaded!","#1b5e20");}}
                  style={{ flex:1, minWidth:140, padding:"13px", background:"#F0FBF0", border:"1.5px solid #C8E6C9", borderRadius:14, fontWeight:700, cursor:"pointer", fontSize:13, color:"#2E7D32" }}>
                  📊 Export CSV
                </button>
                <button onClick={()=>{exportPDF(dateFilt,currency,branding,rLabel,entries,budgets);trackExportPDF();showToast("🖨️ Opening PDF…","#1a237e");}}
                  style={{ flex:1, minWidth:140, padding:"13px", background:"#F3F0FF", border:"1.5px solid #C5CAE9", borderRadius:14, fontWeight:700, cursor:"pointer", fontSize:13, color:"#283593" }}>
                  🖨️ PDF Report
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── BOTTOM NAV (mobile/tablet only) ── */}
        <div className="lb-bottom-nav" style={{
          background:"#fff", borderTop:"1px solid #ebebeb",
          position:"fixed", bottom:0, left:0, right:0, zIndex:100,
          paddingBottom:"env(safe-area-inset-bottom, 0px)",
        }}>
          {[
            {id:"home",   icon:"🏠", label:"Home"},
            {id:"add",    icon:"➕", label:"Add"},
            {id:"history",icon:"📋", label:"History"},
            {id:"budget", icon:"🎯", label:"Budget", proOnly:true},
            {id:"summary",icon:"📊", label:"Summary"},
          ].map(tab=>(
            <button key={tab.id} onClick={()=>{ if(tab.id==="add")setForm({type:"income",amount:"",category:"",note:""}); setView(tab.id); trackPage(tab.label); }}
              style={{ flex:1, padding:"13px 4px 10px", border:"none", background:"none", cursor:"pointer",
                display:"flex", flexDirection:"column", alignItems:"center", gap:3, position:"relative" }}>
              <span style={{ fontSize:22 }}>{tab.icon}</span>
              <span style={{ fontSize:10, fontWeight:700, color:view===tab.id?p:"#ccc", lineHeight:1 }}>
                {tab.label}
                {(tab.id==="history"||tab.id==="summary")&&datePreset!=="all"
                  ?<span style={{ color:p }}> ●</span>:null}
              </span>
              {view===tab.id&&<div style={{ width:20, height:3, background:p, borderRadius:2 }}/>}
              {tab.proOnly&&!isPro&&(
                <div style={{ position:"absolute", top:10, right:"calc(50% - 18px)",
                  background:"#FF9800", borderRadius:"50%", width:14, height:14,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:8, color:"#fff", fontWeight:900, lineHeight:1 }}>🔒</div>
              )}
            </button>
          ))}
        </div>

        {/* ── OVERLAYS ── */}
                {showSt&&<SettingsScreen branding={branding} setBranding={setBranding} currency={currency} setCurrency={setCurrency}
          incCats={incCats} setIncCats={setIncCats} expCats={expCats} setExpCats={setExpCats}
          user={user} onLogout={onLogout} onClose={()=>setShowSt(false)}
          isPro={isPro} onUpgrade={()=>{ setShowSt(false); openUpgrade(); }}
          planInfo={planInfo} onUserUpdate={onUserUpdate}/>}
        {showDP&&<DateRangePicker preset={datePreset} dateRange={dateRange} onChange={handleDateChange} onClose={()=>setShowDP(false)} primaryColor={p}/>}
        {showUpgrade&&<UpgradeModal onClose={()=>setShowUpgrade(false)} reason={atLimit?"limit":"default"} monthCount={monthCount} p={p} user={user} currency={currency}/>}
        {editingEntry&&<EditEntryModal entry={editingEntry} onClose={()=>setEditingEntry(null)} onSave={handleEditSave} incCats={incCats} expCats={expCats} currency={currency}/>}
        {showNotifs&&<NotificationPanel uid={uid} notifs={notifs} onClose={()=>setShowNotifs(false)} onMarkAllRead={()=>markAllRead(uid,notifs)}/>}

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

// ═══════════════════════════════════════════════════════════════
// BUDGET — helper
// ═══════════════════════════════════════════════════════════════
const calcBudgetStats = (budget, entries) => {
  const inRange = entries.filter(e =>
    e.date.slice(0,10) >= budget.startDate && e.date.slice(0,10) <= budget.endDate
  );

  // Actual income and expense totals
  const actualInc = inRange.filter(e=>e.type==="income").reduce((s,e)=>s+e.amount, 0);
  const actualExp = inRange.filter(e=>e.type==="expense").reduce((s,e)=>s+e.amount, 0);

  // Separate per-category actual maps
  const catActualInc = {}, catActualExp = {};
  inRange.filter(e=>e.type==="income").forEach(e  => { catActualInc[e.category] = (catActualInc[e.category]||0) + e.amount; });
  inRange.filter(e=>e.type==="expense").forEach(e => { catActualExp[e.category] = (catActualExp[e.category]||0) + e.amount; });

  // Budgeted category maps (support both new schema and legacy catBudgets)
  const incCatBudgets = budget.incCatBudgets || {};
  const expCatBudgets = budget.expCatBudgets || {};

  const today = toISO(new Date());
  const totalDays    = Math.max(1, Math.ceil((new Date(budget.endDate) - new Date(budget.startDate)) / 864e5) + 1);
  const elapsedDays  = Math.min(totalDays, Math.max(0,
    Math.ceil((new Date(Math.min(new Date(today), new Date(budget.endDate))) - new Date(budget.startDate)) / 864e5) + 1
  ));
  const pctTimeElapsed = elapsedDays / totalDays;
  const isActive  = today >= budget.startDate && today <= budget.endDate;
  const isPast    = today > budget.endDate;
  const isFuture  = today < budget.startDate;

  // Actual income in budgeted categories vs unbudgeted
  const budgetedIncCats   = Object.keys(incCatBudgets);
  const budgetedExpCats   = Object.keys(expCatBudgets);
  const actualBudgetedInc = budgetedIncCats.reduce((s,c)=>s+(catActualInc[c]||0), 0);
  const actualBudgetedExp = budgetedExpCats.reduce((s,c)=>s+(catActualExp[c]||0), 0);
  const unbudgetedIncCats = Object.keys(catActualInc).filter(c => !budgetedIncCats.includes(c));
  const unbudgetedExpCats = Object.keys(catActualExp).filter(c => !budgetedExpCats.includes(c));
  const unbudgetedInc     = unbudgetedIncCats.reduce((s,c)=>s+(catActualInc[c]||0), 0);
  const unbudgetedExp     = unbudgetedExpCats.reduce((s,c)=>s+(catActualExp[c]||0), 0);

  return {
    actualInc, actualExp,
    catActualInc, catActualExp,
    incCatBudgets, expCatBudgets,
    budgetedIncCats, budgetedExpCats,
    actualBudgetedInc, actualBudgetedExp,
    unbudgetedIncCats, unbudgetedExpCats,
    unbudgetedInc, unbudgetedExp,
    totalDays, elapsedDays, pctTimeElapsed,
    inRange, isActive, isPast, isFuture,
  };
};

// ═══════════════════════════════════════════════════════════════
// BUDGET LIST
// ═══════════════════════════════════════════════════════════════
function BudgetList({ budgets, entries, currency, p, isDesktop, onNew, onView, onDelete }) {
  const today = toISO(new Date());
  const active = budgets.filter(b => b.startDate <= today && b.endDate >= today);
  const past   = budgets.filter(b => b.endDate < today);
  const future = budgets.filter(b => b.startDate > today);

  const BudgetCard = ({ b }) => {
    const { actualBudgetedExp, actualBudgetedInc, pctTimeElapsed, isActive, isPast,
            budgetedExpCats, budgetedIncCats } = calcBudgetStats(b, entries);
    const budgetInc = b.totalIncome  || 0;
    const budgetExp = b.totalExpense || 0;
    const expPct   = budgetExp > 0 ? Math.min(100,(actualBudgetedExp/budgetExp)*100) : null;
    const incPct   = budgetInc > 0 ? Math.min(100,(actualBudgetedInc/budgetInc)*100) : null;
    const expOver  = budgetExp > 0 && actualBudgetedExp > budgetExp;
    const timePct  = Math.round(pctTimeElapsed * 100);

    return (
      <div onClick={()=>onView(b)} style={{ background:"#fff", borderRadius:18, padding:"18px 20px", marginBottom:12,
        boxShadow:"0 2px 8px rgba(0,0,0,0.06)", border:`1.5px solid ${expOver?"#ffcdd2":"#f0f0f0"}`,
        cursor:"pointer", transition:"box-shadow 0.15s" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontWeight:900, fontSize:15, color:"#1a1a1a", marginBottom:3 }}>{b.name}</div>
            <div style={{ fontSize:11, color:"#aaa" }}>{fmtDate(b.startDate+"T12:00:00")} → {fmtDate(b.endDate+"T12:00:00")}</div>
          </div>
          <div style={{ display:"flex", gap:6, alignItems:"center", flexShrink:0, marginLeft:10 }}>
            <span style={{ fontSize:11, fontWeight:800, padding:"3px 10px", borderRadius:20,
              background: expOver?"#FFEBEE": isActive?"#E8F5E9": isPast?"#F5F5F5":"#E3F2FD",
              color: expOver?"#c62828": isActive?"#2E7D32": isPast?"#888":"#1565C0" }}>
              {expOver?"⚠️ Over": isActive?"🟢 Active": isPast?"✅ Ended":"⏳ Upcoming"}
            </span>
            <button onClick={e=>{e.stopPropagation(); if(window.confirm("Delete this budget?")) onDelete(b.id);}}
              style={{ background:"none", border:"none", cursor:"pointer", fontSize:16, color:"#ccc", padding:4 }}>🗑️</button>
          </div>
        </div>

        {/* Progress bars */}
        {expPct !== null && (
          <div style={{ marginBottom:8 }}>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#888", marginBottom:4 }}>
              <span>📤 Expenses</span>
              <span style={{ fontWeight:700, color: expOver?"#c62828":"#555" }}>{Math.round(expPct)}% of {fmtAmt(budgetExp,currency)}</span>
            </div>
            <div style={{ height:7, background:"#f0f0f0", borderRadius:99, overflow:"hidden" }}>
              <div style={{ height:"100%", borderRadius:99, width:`${expPct}%`, background: expOver?"#ef5350":"#FF9800", transition:"width 0.6s" }}/>
            </div>
          </div>
        )}
        {incPct !== null && (
          <div style={{ marginBottom: isActive?8:0 }}>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#888", marginBottom:4 }}>
              <span>💰 Income</span>
              <span style={{ fontWeight:700, color: incPct>=100?"#2E7D32":"#555" }}>{Math.round(incPct)}% of {fmtAmt(budgetInc,currency)}</span>
            </div>
            <div style={{ height:7, background:"#f0f0f0", borderRadius:99, overflow:"hidden" }}>
              <div style={{ height:"100%", borderRadius:99, width:`${incPct}%`, background: incPct>=100?"#25D366":"#128C7E", transition:"width 0.6s" }}/>
            </div>
          </div>
        )}
        {isActive && (
          <div style={{ marginTop:10, display:"flex", justifyContent:"space-between", fontSize:11, color:"#bbb" }}>
            <span>⏱ {timePct}% of period elapsed</span>
            <span style={{ color: expOver?"#e53935":expPct!=null&&expPct>timePct?"#ff9800":"#aaa" }}>
              {expOver ? "Over budget!" : expPct!=null&&expPct>timePct ? "Spending ahead of pace" : "On track"}
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ flex:1, overflowY:"auto", paddingLeft:isDesktop?0:S.px, paddingRight:isDesktop?0:S.px,
      paddingTop:isDesktop?0:20, paddingBottom:isDesktop?48:`calc(${S.navH}px + env(safe-area-inset-bottom,0px) + 16px)` }}>
      {isDesktop&&<div style={{ fontWeight:900, fontSize:22, color:"#1a1a1a", marginBottom:24, letterSpacing:-.5 }}>🎯 Budgets</div>}

      {/* Create button */}
      <button onClick={onNew} style={{ width:"100%", padding:"15px", background:p, color:"#fff", border:"none",
        borderRadius:16, fontSize:15, fontWeight:900, cursor:"pointer", marginBottom:24,
        boxShadow:`0 4px 16px ${p}50`, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
        ＋ Create New Budget
      </button>

      {budgets.length === 0 && (
        <div style={{ textAlign:"center", padding:"48px 24px", color:"#ccc" }}>
          <div style={{ fontSize:52, marginBottom:16 }}>🎯</div>
          <div style={{ fontWeight:800, fontSize:16, color:"#999", marginBottom:8 }}>No budgets yet</div>
          <div style={{ fontSize:13, lineHeight:1.7 }}>Create your first budget to start tracking your spending against targets.</div>
        </div>
      )}

      {active.length > 0 && <>
        <div style={{ fontSize:11, fontWeight:800, textTransform:"uppercase", letterSpacing:1.2, color:"#aaa", marginBottom:10 }}>Active</div>
        {active.map(b=><BudgetCard key={b.id} b={b}/>)}
      </>}
      {future.length > 0 && <>
        <div style={{ fontSize:11, fontWeight:800, textTransform:"uppercase", letterSpacing:1.2, color:"#aaa", marginBottom:10, marginTop:active.length?16:0 }}>Upcoming</div>
        {future.map(b=><BudgetCard key={b.id} b={b}/>)}
      </>}
      {past.length > 0 && <>
        <div style={{ fontSize:11, fontWeight:800, textTransform:"uppercase", letterSpacing:1.2, color:"#aaa", marginBottom:10, marginTop:(active.length||future.length)?16:0 }}>Past</div>
        {past.map(b=><BudgetCard key={b.id} b={b}/>)}
      </>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// BUDGET CREATE / EDIT
// ═══════════════════════════════════════════════════════════════
// ── CatInput — defined outside BudgetCreate so it has a stable
//    reference and never causes the keyboard to close on mobile ──
function CatInput({ cat, value, onChange, type, currency, p }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12,
      padding:"10px 14px", background:"#fafafa", borderRadius:13, border:"1.5px solid #eee" }}>
      <div style={{ flex:1, fontWeight:700, fontSize:14, color:"#333" }}>
        {type==="income"?"💰":"📤"} {cat}
      </div>
      <div style={{ position:"relative", width:150, flexShrink:0 }}>
        <span style={{ position:"absolute", left:11, top:"50%", transform:"translateY(-50%)",
          fontSize:13, color:"#aaa", fontWeight:700, pointerEvents:"none" }}>
          {currency.symbol}
        </span>
        <input
          type="number"
          inputMode="decimal"
          placeholder="—"
          value={value ?? ""}
          onChange={e => onChange(cat, e.target.value)}
          style={{ width:"100%", padding:"9px 10px 9px 26px",
            border:`2px solid ${value > 0 ? p : "#e5e5e5"}`,
            borderRadius:10, fontSize:14, outline:"none",
            boxSizing:"border-box", background:"#fff" }}/>
      </div>
    </div>
  );
}

function BudgetCreate({ budget, expCats, incCats, currency, p, isDesktop, onSave, onBack }) {
  const isEdit = !!budget;
  const [name,          setName]         = useState(budget?.name || "");
  const [startDate,     setStartDate]    = useState(budget?.startDate || toISO(new Date()));
  const [endDate,       setEndDate]      = useState(budget?.endDate || "");
  // Separate maps: incCatBudgets = { cat: amount } for income, expCatBudgets for expense
  const [incCatBudgets, setIncCatBudgets]= useState(budget?.incCatBudgets || {});
  const [expCatBudgets, setExpCatBudgets]= useState(budget?.expCatBudgets || {});
  const [tab,           setTab]          = useState("overview");
  const [saving,        setSaving]       = useState(false);

  // Auto-totals derived from categories
  const totalIncome  = Object.values(incCatBudgets).reduce((s,v)=>s+(parseFloat(v)||0), 0);
  const totalExpense = Object.values(expCatBudgets).reduce((s,v)=>s+(parseFloat(v)||0), 0);

  const setIncCat = (cat, val) => setIncCatBudgets(prev => ({ ...prev, [cat]: val === "" ? "" : parseFloat(val)||0 }));
  const setExpCat = (cat, val) => setExpCatBudgets(prev => ({ ...prev, [cat]: val === "" ? "" : parseFloat(val)||0 }));

  const handleSave = async () => {
    if (!name.trim())        return alert("Please enter a budget name.");
    if (!startDate)          return alert("Please select a start date.");
    if (!endDate)            return alert("Please select an end date.");
    if (endDate < startDate) return alert("End date must be after start date.");
    if (totalIncome === 0 && totalExpense === 0) return alert("Please set at least one income target or expense limit.");
    setSaving(true);
    const cleanInc = {}, cleanExp = {};
    Object.entries(incCatBudgets).forEach(([k,v]) => { if (v !== "" && parseFloat(v) > 0) cleanInc[k] = parseFloat(v); });
    Object.entries(expCatBudgets).forEach(([k,v]) => { if (v !== "" && parseFloat(v) > 0) cleanExp[k] = parseFloat(v); });
    await onSave({
      ...(isEdit ? { id: budget.id } : {}),
      name: name.trim(), startDate, endDate,
      totalIncome,
      totalExpense,
      incCatBudgets: cleanInc,
      expCatBudgets: cleanExp,
      // keep legacy catBudgets empty so old code doesn't mix
      catBudgets: {},
    });
    setSaving(false);
  };

  const inputStyle = { width:"100%", padding:"13px 15px", border:"2px solid #e5e5e5", borderRadius:13,
    fontSize:15, outline:"none", marginBottom:16, boxSizing:"border-box", background:"#fafafa", fontFamily:"inherit" };
  const labelStyle = { fontSize:11, fontWeight:800, color:"#999", textTransform:"uppercase", letterSpacing:.5, marginBottom:7, display:"block" };

  const incCatsWithValues = Object.values(incCatBudgets).filter(v=>parseFloat(v)>0).length;
  const expCatsWithValues = Object.values(expCatBudgets).filter(v=>parseFloat(v)>0).length;

  return (
    <div style={{ flex:1, overflowY:"auto", overflowX:"hidden",
      paddingLeft:isDesktop?0:S.px, paddingRight:isDesktop?0:S.px,
      paddingTop:isDesktop?0:20,
      paddingBottom:isDesktop?48:`calc(${S.navH}px + env(safe-area-inset-bottom,0px) + 16px)` }}>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:22 }}>
        <button onClick={onBack} style={{ background:"#f0f0f0", border:"none", borderRadius:11, padding:"8px 14px",
          cursor:"pointer", fontWeight:800, fontSize:14, color:"#555" }}>← Back</button>
        <div style={{ fontWeight:900, fontSize:isDesktop?22:18, color:"#1a1a1a", letterSpacing:-.3 }}>
          {isEdit ? "Edit Budget" : "Create Budget"}
        </div>
      </div>

      <div style={{ maxWidth:isDesktop?600:undefined }}>

        {/* Tabs */}
        <div style={{ display:"flex", background:"#f2f2f2", borderRadius:14, padding:4, marginBottom:20 }}>
          {[
            ["overview", "📋 Overview"],
            ["income",   `💰 Income${incCatsWithValues>0?` (${incCatsWithValues})`:""}` ],
            ["expense",  `📤 Expenses${expCatsWithValues>0?` (${expCatsWithValues})`:""}` ],
          ].map(([id,lbl])=>(
            <button key={id} onClick={()=>setTab(id)}
              style={{ flex:1, padding:"10px 4px", border:"none", borderRadius:11, fontSize:12, fontWeight:700,
                cursor:"pointer", background:tab===id?p:"transparent", color:tab===id?"#fff":"#888" }}>
              {lbl}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW TAB ── */}
        {tab==="overview" && (
          <div className="lb-section" style={{ padding:isDesktop?"26px 28px":"16px" }}>
            <label style={labelStyle}>Budget Name</label>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Q2 2026 Budget"
              style={inputStyle}/>

            <div style={{ display:"grid", gridTemplateColumns: isDesktop?"1fr 1fr":"1fr", gap:12, marginBottom:4 }}>
              <div>
                <label style={labelStyle}>Start Date</label>
                <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}
                  style={{ width:"100%", padding:"13px 14px", border:"2px solid #e5e5e5",
                    borderRadius:13, fontSize:15, outline:"none", boxSizing:"border-box",
                    background:"#fafafa", fontFamily:"inherit", display:"block" }}/>
              </div>
              <div>
                <label style={labelStyle}>End Date</label>
                <input type="date" value={endDate} min={startDate||undefined} onChange={e=>setEndDate(e.target.value)}
                  style={{ width:"100%", padding:"13px 14px", border:"2px solid #e5e5e5",
                    borderRadius:13, fontSize:15, outline:"none", boxSizing:"border-box",
                    background:"#fafafa", fontFamily:"inherit", display:"block" }}/>
              </div>
            </div>
            {startDate&&endDate&&endDate>=startDate&&(
              <div style={{ background:`${p}12`, borderRadius:10, padding:"9px 14px", fontSize:12,
                color:p, fontWeight:700, marginTop:12, marginBottom:4 }}>
                📅 {Math.ceil((new Date(endDate)-new Date(startDate))/864e5)+1} days · {fmtDate(startDate+"T12:00:00")} → {fmtDate(endDate+"T12:00:00")}
              </div>
            )}

            {/* Auto-total preview */}
            <div style={{ background:"#f9f9f9", borderRadius:14, padding:"16px 18px", marginTop:18,
              border:"1.5px dashed #ddd" }}>
              <div style={{ fontSize:11, fontWeight:800, color:"#aaa", textTransform:"uppercase",
                letterSpacing:1, marginBottom:12 }}>Projected Totals (from categories)</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div style={{ background:totalIncome>0?"#E8F5E9":"#fff", borderRadius:12, padding:"14px 16px",
                  border:`1.5px solid ${totalIncome>0?"#a5d6a7":"#eee"}` }}>
                  <div style={{ fontSize:11, color:"#888", marginBottom:4 }}>💰 Projected Income</div>
                  <div style={{ fontWeight:900, fontSize:18, color:totalIncome>0?"#2E7D32":"#ccc" }}>
                    {totalIncome>0 ? fmtAmt(totalIncome,currency) : "—"}
                  </div>
                  <div style={{ fontSize:11, color:"#aaa", marginTop:3 }}>
                    {incCatsWithValues>0 ? `${incCatsWithValues} categor${incCatsWithValues===1?"y":"ies"}` : "Set on Income tab →"}
                  </div>
                </div>
                <div style={{ background:totalExpense>0?"#FFF3E0":"#fff", borderRadius:12, padding:"14px 16px",
                  border:`1.5px solid ${totalExpense>0?"#ffcc80":"#eee"}` }}>
                  <div style={{ fontSize:11, color:"#888", marginBottom:4 }}>📤 Expense Limit</div>
                  <div style={{ fontWeight:900, fontSize:18, color:totalExpense>0?"#E65100":"#ccc" }}>
                    {totalExpense>0 ? fmtAmt(totalExpense,currency) : "—"}
                  </div>
                  <div style={{ fontSize:11, color:"#aaa", marginTop:3 }}>
                    {expCatsWithValues>0 ? `${expCatsWithValues} categor${expCatsWithValues===1?"y":"ies"}` : "Set on Expenses tab →"}
                  </div>
                </div>
              </div>
              {totalIncome>0&&totalExpense>0&&(
                <div style={{ marginTop:12, display:"flex", justifyContent:"space-between", fontSize:12,
                  fontWeight:700, color:"#555", background:"#fff", borderRadius:10, padding:"10px 14px",
                  border:"1px solid #eee" }}>
                  <span>Projected Net</span>
                  <span style={{ color: totalIncome-totalExpense>=0?"#2E7D32":"#c62828", fontWeight:900 }}>
                    {fmtAmt(totalIncome-totalExpense,currency)}
                  </span>
                </div>
              )}
              <div style={{ fontSize:11, color:"#bbb", marginTop:10, lineHeight:1.6 }}>
                Totals are auto-calculated from the income and expense category tabs. You don't need to enter them manually.
              </div>
            </div>
          </div>
        )}

        {/* ── INCOME CATEGORIES TAB ── */}
        {tab==="income" && (
          <div>
            <div className="lb-section" style={{ padding:isDesktop?"22px 24px":"16px 18px", marginBottom:12 }}>
              <div style={{ fontSize:13, color:"#666", lineHeight:1.65, marginBottom:4 }}>
                Enter your expected income per category for this period. Only categories with a value will be tracked. Leave blank to exclude a category.
              </div>
            </div>
            {incCats.map(cat=>(
              <CatInput key={cat} cat={cat} value={incCatBudgets[cat]} onChange={setIncCat} type="income" currency={currency} p={p}/>
            ))}
            {totalIncome > 0 && (
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                background:`${p}15`, borderRadius:14, padding:"14px 18px", marginTop:8,
                border:`1.5px solid ${p}40` }}>
                <span style={{ fontWeight:800, fontSize:14, color:p }}>Total Projected Income</span>
                <span style={{ fontWeight:900, fontSize:16, color:p }}>{fmtAmt(totalIncome,currency)}</span>
              </div>
            )}
          </div>
        )}

        {/* ── EXPENSE CATEGORIES TAB ── */}
        {tab==="expense" && (
          <div>
            <div className="lb-section" style={{ padding:isDesktop?"22px 24px":"16px 18px", marginBottom:12 }}>
              <div style={{ fontSize:13, color:"#666", lineHeight:1.65, marginBottom:4 }}>
                Enter your spending limit per expense category. Categories without a value will not be tracked against a budget, but will still appear as "unplanned" in your report.
              </div>
            </div>
            {expCats.map(cat=>(
              <CatInput key={cat} cat={cat} value={expCatBudgets[cat]} onChange={setExpCat} type="expense" currency={currency} p={p}/>
            ))}
            {totalExpense > 0 && (
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                background:"#FFF3E0", borderRadius:14, padding:"14px 18px", marginTop:8,
                border:"1.5px solid #ffcc80" }}>
                <span style={{ fontWeight:800, fontSize:14, color:"#E65100" }}>Total Expense Limit</span>
                <span style={{ fontWeight:900, fontSize:16, color:"#E65100" }}>{fmtAmt(totalExpense,currency)}</span>
              </div>
            )}
          </div>
        )}

        <button onClick={handleSave} disabled={saving}
          style={{ width:"100%", padding:"16px", background:p, color:"#fff", border:"none", borderRadius:16,
            fontSize:16, fontWeight:900, cursor:"pointer", marginTop:20, boxShadow:`0 4px 16px ${p}50` }}>
          {saving ? "Saving…" : isEdit ? "✅ Update Budget" : "✅ Create Budget"}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// BUDGET DETAIL
// ═══════════════════════════════════════════════════════════════
function BudgetDetail({ budget, entries, currency, p, bg, isDesktop, onBack, onEdit, onDelete }) {
  const {
    actualInc, actualExp,
    catActualInc, catActualExp,
    incCatBudgets, expCatBudgets,
    budgetedIncCats, budgetedExpCats,
    actualBudgetedInc, actualBudgetedExp,
    unbudgetedIncCats, unbudgetedExpCats,
    unbudgetedInc, unbudgetedExp,
    totalDays, elapsedDays, pctTimeElapsed,
    inRange, isActive, isPast, isFuture,
  } = calcBudgetStats(budget, entries);

  const totalBudgetedInc = Object.values(incCatBudgets).reduce((s,v)=>s+v,0);
  const totalBudgetedExp = Object.values(expCatBudgets).reduce((s,v)=>s+v,0);

  // Use budget's stored totals (which equal sum of categories)
  const budgetInc = budget.totalIncome  || totalBudgetedInc;
  const budgetExp = budget.totalExpense || totalBudgetedExp;

  const expPct    = budgetExp > 0 ? Math.min(100,(actualBudgetedExp/budgetExp)*100) : null;
  const incPct    = budgetInc > 0 ? Math.min(100,(actualBudgetedInc/budgetInc)*100) : null;
  const expOver   = budgetExp > 0 && actualBudgetedExp > budgetExp;
  const incMet    = budgetInc > 0 && actualBudgetedInc >= budgetInc;
  const timePct   = Math.round(pctTimeElapsed*100);
  const netBudget = budgetInc - budgetExp;
  const netActual = actualInc - actualExp;

  // ── Category row component ───────────────────────────────────
  const CatRow = ({ cat, budgeted, actual, type }) => {
    const pct   = budgeted > 0 ? Math.min(100,(actual/budgeted)*100) : null;
    const over  = budgeted > 0 && actual > budgeted;
    const near  = !over && pct !== null && pct >= 80;
    const barColor = type==="income"
      ? (pct >= 100 ? "#25D366" : "#128C7E")
      : (over ? "#ef5350" : near ? "#FF9800" : "#25D366");

    return (
      <div style={{ marginBottom:14, paddingBottom:14, borderBottom:"1px solid #f5f5f5" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:pct!==null?7:0 }}>
          <div style={{ fontWeight:700, fontSize:14, color:"#222" }}>
            {type==="income" ? "💰" : "📤"} {cat}
          </div>
          <div style={{ textAlign:"right", flexShrink:0, marginLeft:12 }}>
            <div style={{ fontSize:13, fontWeight:800,
              color: over?"#c62828": pct>=100&&type==="income"?"#2E7D32":"#333" }}>
              {fmtAmt(actual,currency)}
              {budgeted>0&&<span style={{ fontWeight:400, color:"#bbb", fontSize:12 }}> / {fmtAmt(budgeted,currency)}</span>}
            </div>
            {pct!==null&&<div style={{ fontSize:11, fontWeight:700,
              color:over?"#e53935":pct>=100&&type==="income"?"#2E7D32":"#888" }}>{Math.round(pct)}%</div>}
          </div>
        </div>
        {pct!==null&&(
          <div style={{ height:7, background:"#f0f0f0", borderRadius:99, overflow:"hidden" }}>
            <div style={{ height:"100%", borderRadius:99, width:`${pct}%`, background:barColor, transition:"width 0.5s" }}/>
          </div>
        )}
        {over&&<div style={{ fontSize:11, color:"#e53935", fontWeight:700, marginTop:4 }}>⚠️ Over by {fmtAmt(actual-budgeted,currency)}</div>}
        {near&&!over&&<div style={{ fontSize:11, color:"#f57c00", fontWeight:700, marginTop:4 }}>⚠️ {fmtAmt(budgeted-actual,currency)} remaining</div>}
        {type==="income"&&pct!==null&&pct>=100&&<div style={{ fontSize:11, color:"#2E7D32", fontWeight:700, marginTop:4 }}>🎉 Target met!</div>}
      </div>
    );
  };

  return (
    <div style={{ flex:1, overflowY:"auto",
      paddingLeft:isDesktop?0:S.px, paddingRight:isDesktop?0:S.px,
      paddingTop:isDesktop?0:16,
      paddingBottom:isDesktop?48:`calc(${S.navH}px + env(safe-area-inset-bottom,0px) + 16px)` }}>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <button onClick={onBack} style={{ background:"#f0f0f0", border:"none", borderRadius:11,
            padding:"8px 14px", cursor:"pointer", fontWeight:800, fontSize:14, color:"#555" }}>← Back</button>
          <div style={{ fontWeight:900, fontSize:isDesktop?20:16, color:"#1a1a1a", letterSpacing:-.3 }}>{budget.name}</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={()=>onEdit(budget)} style={{ background:`${p}15`, border:`1.5px solid ${p}`, color:p,
            borderRadius:11, padding:"7px 14px", cursor:"pointer", fontWeight:800, fontSize:13 }}>✏️ Edit</button>
          <button onClick={()=>{if(window.confirm("Delete this budget?")) onDelete(budget.id);}}
            style={{ background:"#FFF3F3", border:"1.5px solid #ffcdd2", color:"#c62828",
              borderRadius:11, padding:"7px 12px", cursor:"pointer", fontSize:14 }}>🗑️</button>
        </div>
      </div>

      {/* Hero card */}
      <div style={{ background:bg, borderRadius:20, padding:"20px 22px", color:"#fff", marginBottom:18,
        boxShadow:`0 8px 28px ${p}40` }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
          <div>
            <div style={{ fontSize:10, opacity:.7, textTransform:"uppercase", letterSpacing:1.5, marginBottom:3 }}>
              {isActive?"Active Budget": isPast?"Completed": "Upcoming"}
            </div>
            <div style={{ fontSize:11, opacity:.65 }}>{fmtDate(budget.startDate+"T12:00:00")} → {fmtDate(budget.endDate+"T12:00:00")}</div>
          </div>
          <div style={{ background:"rgba(0,0,0,0.2)", borderRadius:20, padding:"4px 12px", fontSize:11, fontWeight:800 }}>
            {isActive ? `Day ${elapsedDays} of ${totalDays}` : isPast ? `${totalDays} days` : `Starts in ${Math.ceil((new Date(budget.startDate)-new Date())/864e5)} days`}
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", background:"rgba(0,0,0,0.15)", borderRadius:13, overflow:"hidden" }}>
          {[["Budgeted Net", fmtAmt(netBudget,currency)],["Actual Net",fmtAmt(netActual,currency)],["Variance",fmtAmt(netActual-netBudget,currency)]].map(([lbl,val],i)=>(
            <div key={lbl} style={{ padding:"11px 12px", borderRight:i<2?"1px solid rgba(255,255,255,0.15)":undefined }}>
              <div style={{ fontSize:9, opacity:.6, textTransform:"uppercase", letterSpacing:.8, marginBottom:3 }}>{lbl}</div>
              <div style={{ fontWeight:900, fontSize:13 }}>{val}</div>
            </div>
          ))}
        </div>
        {isActive&&(
          <div style={{ marginTop:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, opacity:.7, marginBottom:4 }}>
              <span>Time elapsed</span><span>{timePct}%</span>
            </div>
            <div style={{ height:5, background:"rgba(0,0,0,0.2)", borderRadius:99 }}>
              <div style={{ height:"100%", borderRadius:99, width:`${timePct}%`, background:"rgba(255,255,255,0.7)" }}/>
            </div>
          </div>
        )}
      </div>

      {/* ── INCOME SECTION ─────────────────────────────────── */}
      {budgetedIncCats.length > 0 && (
        <div className="lb-section" style={{ marginBottom:14, padding:isDesktop?"22px 24px":"16px 18px" }}>
          <div style={{ fontWeight:900, fontSize:15, color:"#1a1a1a", marginBottom:4 }}>💰 Income Performance</div>
          {budgetInc > 0 && (
            <div style={{ marginBottom:16 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#888", marginBottom:5 }}>
                <span>Overall income target</span>
                <span style={{ fontWeight:800, color:incMet?"#2E7D32":"#555" }}>
                  {Math.round(incPct||0)}% · {fmtAmt(actualBudgetedInc,currency)} of {fmtAmt(budgetInc,currency)}
                </span>
              </div>
              <div style={{ height:9, background:"#f0f0f0", borderRadius:99, overflow:"hidden" }}>
                <div style={{ height:"100%", borderRadius:99, width:`${incPct||0}%`,
                  background:incMet?"#25D366":"#128C7E", transition:"width 0.6s" }}/>
              </div>
              {incMet
                ? <div style={{ fontSize:11, color:"#2E7D32", fontWeight:800, marginTop:5 }}>🎉 Overall income target met!</div>
                : <div style={{ fontSize:11, color:"#888", marginTop:5 }}>{fmtAmt(budgetInc-actualBudgetedInc,currency)} still to reach target</div>}
            </div>
          )}
          <div style={{ fontSize:11, fontWeight:800, color:"#aaa", textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>By Category</div>
          {budgetedIncCats.map(cat=>(
            <CatRow key={cat} cat={cat} budgeted={incCatBudgets[cat]||0} actual={catActualInc[cat]||0} type="income"/>
          ))}
        </div>
      )}

      {/* ── EXPENSE SECTION ────────────────────────────────── */}
      {budgetedExpCats.length > 0 && (
        <div className="lb-section" style={{ marginBottom:14, padding:isDesktop?"22px 24px":"16px 18px" }}>
          <div style={{ fontWeight:900, fontSize:15, color:"#1a1a1a", marginBottom:4 }}>📤 Expense Performance</div>
          {budgetExp > 0 && (
            <div style={{ marginBottom:16 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#888", marginBottom:5 }}>
                <span>Overall expense limit</span>
                <span style={{ fontWeight:800, color:expOver?"#c62828":"#555" }}>
                  {Math.round(expPct||0)}% · {fmtAmt(actualBudgetedExp,currency)} of {fmtAmt(budgetExp,currency)}
                </span>
              </div>
              <div style={{ height:9, background:"#f0f0f0", borderRadius:99, overflow:"hidden" }}>
                <div style={{ height:"100%", borderRadius:99, width:`${expPct||0}%`,
                  background:expOver?"#ef5350":"#FF9800", transition:"width 0.6s" }}/>
              </div>
              {expOver
                ? <div style={{ fontSize:11, color:"#c62828", fontWeight:800, marginTop:5 }}>⚠️ Over budget by {fmtAmt(actualBudgetedExp-budgetExp,currency)}</div>
                : <div style={{ fontSize:11, color:"#888", marginTop:5 }}>{fmtAmt(budgetExp-actualBudgetedExp,currency)} remaining</div>}
            </div>
          )}
          <div style={{ fontSize:11, fontWeight:800, color:"#aaa", textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>By Category</div>
          {budgetedExpCats.map(cat=>(
            <CatRow key={cat} cat={cat} budgeted={expCatBudgets[cat]||0} actual={catActualExp[cat]||0} type="expense"/>
          ))}
        </div>
      )}

      {/* ── UNBUDGETED / OTHER FACTORS ─────────────────────── */}
      {(unbudgetedIncCats.length > 0 || unbudgetedExpCats.length > 0) && (
        <div className="lb-section" style={{ marginBottom:14, padding:isDesktop?"22px 24px":"16px 18px",
          border:"1.5px dashed #e0e0e0", background:"#fafafa" }}>
          <div style={{ fontWeight:900, fontSize:15, color:"#1a1a1a", marginBottom:4 }}>📎 Other Factors</div>
          <div style={{ fontSize:12, color:"#888", lineHeight:1.65, marginBottom:14 }}>
            The following transactions occurred during the budget period but were <strong>not included in your budget plan</strong>. They have influenced your overall financial position but fall outside the scope of this budget's targets.
          </div>

          {unbudgetedIncCats.length > 0 && (
            <>
              <div style={{ fontSize:11, fontWeight:800, color:"#2E7D32", textTransform:"uppercase",
                letterSpacing:1, marginBottom:8 }}>💰 Unplanned Income</div>
              {unbudgetedIncCats.map(cat=>(
                <div key={cat} style={{ display:"flex", justifyContent:"space-between",
                  padding:"9px 0", borderBottom:"1px solid #eee", alignItems:"center" }}>
                  <span style={{ fontSize:13, color:"#444", fontWeight:600 }}>💰 {cat}</span>
                  <span style={{ fontWeight:800, fontSize:13, color:"#2E7D32" }}>+{fmtAmt(catActualInc[cat]||0,currency)}</span>
                </div>
              ))}
              <div style={{ display:"flex", justifyContent:"space-between", padding:"10px 0 4px",
                fontSize:13, fontWeight:900, color:"#2E7D32" }}>
                <span>Total unplanned income</span>
                <span>+{fmtAmt(unbudgetedInc,currency)}</span>
              </div>
            </>
          )}

          {unbudgetedExpCats.length > 0 && (
            <div style={{ marginTop: unbudgetedIncCats.length>0?14:0 }}>
              <div style={{ fontSize:11, fontWeight:800, color:"#E65100", textTransform:"uppercase",
                letterSpacing:1, marginBottom:8 }}>📤 Unplanned Expenses</div>
              {unbudgetedExpCats.map(cat=>(
                <div key={cat} style={{ display:"flex", justifyContent:"space-between",
                  padding:"9px 0", borderBottom:"1px solid #eee", alignItems:"center" }}>
                  <span style={{ fontSize:13, color:"#444", fontWeight:600 }}>📤 {cat}</span>
                  <span style={{ fontWeight:800, fontSize:13, color:"#E65100" }}>-{fmtAmt(catActualExp[cat]||0,currency)}</span>
                </div>
              ))}
              <div style={{ display:"flex", justifyContent:"space-between", padding:"10px 0 4px",
                fontSize:13, fontWeight:900, color:"#E65100" }}>
                <span>Total unplanned expenses</span>
                <span>-{fmtAmt(unbudgetedExp,currency)}</span>
              </div>
            </div>
          )}

          {/* Net impact of other factors */}
          <div style={{ marginTop:14, background:"#fff", borderRadius:12, padding:"12px 16px",
            border:"1px solid #e0e0e0", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:13, fontWeight:800, color:"#555" }}>Net impact of other factors</span>
            <span style={{ fontSize:14, fontWeight:900,
              color:(unbudgetedInc-unbudgetedExp)>=0?"#2E7D32":"#c62828" }}>
              {(unbudgetedInc-unbudgetedExp)>=0?"+":""}{fmtAmt(unbudgetedInc-unbudgetedExp,currency)}
            </span>
          </div>
        </div>
      )}

      {/* ── TRANSACTIONS ────────────────────────────────────── */}
      {inRange.length > 0 && (
        <div className="lb-section" style={{ padding:isDesktop?"22px 24px":"16px 18px" }}>
          <div style={{ fontWeight:900, fontSize:15, color:"#1a1a1a", marginBottom:14 }}>
            🧾 All Transactions in Period ({inRange.length})
          </div>
          {inRange.slice(0,12).map(e=>(
            <div key={e.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
              padding:"9px 0", borderBottom:"1px solid #f5f5f5" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:30, height:30, borderRadius:"50%",
                  background:e.type==="income"?"#E8F5E9":"#FFF3E0",
                  display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, flexShrink:0 }}>
                  {e.type==="income"?"💰":"📤"}
                </div>
                <div>
                  <div style={{ fontWeight:700, fontSize:13 }}>{e.category}
                    {/* Flag unbudgeted */}
                    {((e.type==="income"&&!budgetedIncCats.includes(e.category))||(e.type==="expense"&&!budgetedExpCats.includes(e.category)))&&(
                      <span style={{ marginLeft:6, fontSize:10, background:"#f5f5f5", color:"#aaa",
                        borderRadius:6, padding:"1px 6px", fontWeight:600 }}>unplanned</span>
                    )}
                  </div>
                  <div style={{ fontSize:11, color:"#aaa" }}>{fmtDate(e.date)}{e.note&&` · ${e.note}`}</div>
                </div>
              </div>
              <div style={{ fontWeight:800, fontSize:13, color:e.type==="income"?"#2E7D32":"#E65100" }}>
                {e.type==="income"?"+":"-"}{fmtAmt(e.amount,currency)}
              </div>
            </div>
          ))}
          {inRange.length>12&&<div style={{ textAlign:"center", color:"#aaa", fontSize:12, paddingTop:12 }}>+{inRange.length-12} more transactions</div>}
        </div>
      )}
    </div>
  );
}

