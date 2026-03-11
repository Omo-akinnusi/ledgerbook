// ================================================================
// LedgerBook Pro v3 — Business Finance Tracker
// UI Fix: Proper mobile padding, safe-area insets, responsive layout
// ================================================================

import { useState, useEffect, useRef, useMemo } from "react";
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
`;

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

const exportPDF = (entries, currency, branding, rangeLabel) => {
  const inc  = entries.filter(e=>e.type==="income").reduce((s,e)=>s+e.amount,0);
  const exp  = entries.filter(e=>e.type==="expense").reduce((s,e)=>s+e.amount,0);
  const bal  = inc - exp;
  const hBg  = getBg(branding);
  const rows = entries.map(e=>`<tr><td>${fmtDate(e.date)}</td><td><span class="${e.type}">${e.type}</span></td><td>${e.category}</td><td class="amt ${e.type}">${e.type==="income"?"+":"-"}${fmtAmt(e.amount,currency)}</td><td class="note">${e.note||"—"}</td></tr>`).join("");
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${branding.businessName} Report</title><style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:Georgia,serif;background:#f9f9f9;color:#222;padding:32px}
.hdr{background:${hBg};color:#fff;padding:28px 32px;border-radius:16px;margin-bottom:24px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.hdr h1{font-size:24px;font-weight:900}.hdr p{opacity:.8;font-size:14px;margin-top:4px}.hdr .sub{font-size:12px;opacity:.65;margin-top:6px}
.hdr .badge{display:inline-block;background:rgba(255,255,255,.2);padding:3px 10px;border-radius:8px;font-size:13px;font-weight:700;margin-top:6px}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:24px}
.card{background:#fff;border-radius:12px;padding:18px;border-top:4px solid;box-shadow:0 2px 8px rgba(0,0,0,.06)}
.card.inc{border-color:#25D366}.card.exp{border-color:#FF9800}.card.bal{border-color:${branding.primaryColor}}
.card label{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#888}.card .v{font-size:22px;font-weight:900;margin-top:6px}
.card.inc .v{color:#1b5e20}.card.exp .v{color:#e65100}.card.bal .v{color:${bal>=0?branding.primaryColor:"#c62828"}}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.06)}
th{text-align:left;padding:12px 14px;background:#f5f5f5;font-size:12px;color:#555;font-weight:700;text-transform:uppercase}
td{padding:11px 14px;font-size:13px;border-bottom:1px solid #f0f0f0}tr:last-child td{border-bottom:none}
span.income{background:#e8f5e9;color:#1b5e20;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700}
span.expense{background:#fff3e0;color:#e65100;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700}
.amt.income{color:#1b5e20;font-weight:700}.amt.expense{color:#e65100;font-weight:700}.note{color:#888;font-size:12px}
.footer{text-align:center;color:#bbb;font-size:11px;margin-top:24px}
@media print{body{padding:16px}}
</style></head><body>
<div class="hdr"><h1>${branding.logoType==="emoji"?branding.logo+" ":""}${branding.businessName}</h1><p>${branding.tagline}</p>${rangeLabel&&rangeLabel!=="All Time"?`<div class="badge">📅 ${rangeLabel}</div>`:""}<div class="sub">Generated: ${new Date().toLocaleDateString("en-NG",{dateStyle:"full"})}</div></div>
<div class="cards"><div class="card inc"><label>Total Income</label><div class="v">${fmtAmt(inc,currency)}</div></div><div class="card exp"><label>Total Expenses</label><div class="v">${fmtAmt(exp,currency)}</div></div><div class="card bal"><label>Net Balance</label><div class="v">${fmtAmt(bal,currency)}</div></div></div>
<table><thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Amount</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table>
<div class="footer">LedgerBook Pro · ${entries.length} transactions${rangeLabel?" · "+rangeLabel:""}</div>
<script>window.onload=()=>window.print()<\/script></body></html>`;
  const url = URL.createObjectURL(new Blob([html],{type:"text/html;charset=utf-8;"}));
  const w = window.open(url,"_blank");
  if (!w) { const a=document.createElement("a"); a.href=url; a.download=`${branding.businessName.replace(/\s+/g,"_")}_report.html`; document.body.appendChild(a); a.click(); document.body.removeChild(a); }
  setTimeout(()=>URL.revokeObjectURL(url),5000);
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
        // Map Firebase user to our app's user shape
        const u = {
          id:           firebaseUser.uid,
          name:         firebaseUser.displayName || firebaseUser.email.split("@")[0],
          email:        firebaseUser.email,
          businessName: DB.get(`lb_bname_${firebaseUser.uid}`) || "My Business",
          photoURL:     firebaseUser.photoURL || null,
          createdAt:    firebaseUser.metadata.creationTime || new Date().toISOString(),
        };
        setUser(u);
      } else {
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
        }, () => setLoading(false));
      } catch(e) {
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
      showToast("❌ Failed to save. Check connection.","#c62828");
    }
  };

  // ── Delete entry — removes from Firestore ────────────────────
  const handleDel = async (id) => {
    try {
      await delEntry(uid, id);
      showToast("Removed","#888");
    } catch(e) {
      showToast("❌ Failed to delete.","#c62828");
    }
  };

  // ── Quick keyboard entry ─────────────────────────────────────
  const handleKB = async (data) => {
    if (data) {
      try {
        await addEntry(uid, { ...data, date: new Date().toISOString() });
        showToast("⌨️ Quick entry saved!");
      } catch(e) {
        showToast("❌ Failed to save.","#c62828");
      }
    }
    setShowKB(false);
  };

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

  return (
    <div style={{ fontFamily:"'Segoe UI',system-ui,sans-serif", background:"#e8e8e8", minHeight:"100vh",
      display:"flex", justifyContent:"center", alignItems:"flex-start" }}>

      {/* App Shell — centers on desktop, full safe-width on mobile */}
      <div style={{
        width:"100%", maxWidth:480, minHeight:"100vh", background:"#fff",
        display:"flex", flexDirection:"column", position:"relative",
        /* Side shadow only visible on desktop where there's bg showing */
        boxShadow:"0 0 0 1px rgba(0,0,0,0.06), 0 8px 40px rgba(0,0,0,0.14)",
        /* Ensure content never bleeds into notch/rounded corners on any device */
        paddingLeft:"env(safe-area-inset-left, 0px)",
        paddingRight:"env(safe-area-inset-right, 0px)",
      }}>

        {/* ── HEADER ── */}
        <div style={{
          background:bg,
          paddingLeft:S.px, paddingRight:S.px,
          paddingTop:`max(16px, calc(env(safe-area-inset-top,0px) + 16px))`,
          paddingBottom:14,
          position:"sticky", top:0, zIndex:10,
        }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              {branding.logoType==="image"&&branding.logoImage
                ?<img src={branding.logoImage} alt="logo" style={{ width:40, height:40, borderRadius:12, objectFit:"cover", border:"2px solid rgba(255,255,255,0.4)", flexShrink:0 }}/>
                :<div style={{ width:40, height:40, borderRadius:12, background:"rgba(255,255,255,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>{branding.logo}</div>
              }
              <div style={{ minWidth:0 }}>
                <div style={{ fontWeight:900, fontSize:16, color:"#fff", letterSpacing:.1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{branding.businessName}</div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.72)", marginTop:1 }}>{branding.tagline}</div>
              </div>
            </div>
            <div style={{ display:"flex", gap:7, flexShrink:0 }}>
              {[["⌨️",()=>setShowKB(true),"Quick Entry"],["💬",()=>setShowWA(true),"WhatsApp"],["⚙️",()=>setShowSt(true),"Settings"]].map(([icon,fn,title])=>(
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
          <div style={{ flex:1, overflowY:"auto", paddingBottom:`calc(${S.navH}px + env(safe-area-inset-bottom,0px) + 8px)` }}>
            {/* Balance card */}
            <div style={{ paddingLeft:S.px, paddingRight:S.px, paddingTop:20, paddingBottom:6 }}>
              <div style={{ background:bg, borderRadius:20, padding:"22px 22px 18px", color:"#fff", boxShadow:`0 8px 28px ${p}50` }}>
                <div style={{ fontSize:11, opacity:.8, textTransform:"uppercase", letterSpacing:1.5, marginBottom:4 }}>Net Balance · All Time</div>
                <div style={{ fontSize:34, fontWeight:900, letterSpacing:-1 }}>{fmtAmt(allInc-allExp,currency)}</div>
                <div style={{ display:"flex", marginTop:18, background:"rgba(0,0,0,0.15)", borderRadius:12, overflow:"hidden" }}>
                  <div style={{ flex:1, padding:"11px 16px" }}>
                    <div style={{ fontSize:10, opacity:.7, marginBottom:2 }}>📥 INCOME</div>
                    <div style={{ fontWeight:700, fontSize:14 }}>{fmtAmt(allInc,currency)}</div>
                  </div>
                  <div style={{ width:1, background:"rgba(255,255,255,0.15)" }}/>
                  <div style={{ flex:1, padding:"11px 16px" }}>
                    <div style={{ fontSize:10, opacity:.7, marginBottom:2 }}>📤 EXPENSE</div>
                    <div style={{ fontWeight:700, fontSize:14 }}>{fmtAmt(allExp,currency)}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div style={{ paddingLeft:S.px, paddingRight:S.px, paddingTop:14, paddingBottom:0, display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <button onClick={()=>{setForm({type:"income",amount:"",category:"",note:""});setView("add");}}
                style={{ background:"#F0FBF4", border:"2px solid #25D366", borderRadius:16, padding:"16px 14px", cursor:"pointer", textAlign:"left" }}>
                <div style={{ fontSize:24 }}>➕</div>
                <div style={{ fontWeight:800, color:"#1B5E20", fontSize:14, marginTop:6 }}>Add Income</div>
                <div style={{ fontSize:11, color:"#4CAF50", marginTop:2 }}>Sales, service, payment</div>
              </button>
              <button onClick={()=>{setForm({type:"expense",amount:"",category:"",note:""});setView("add");}}
                style={{ background:"#FFF8F0", border:"2px solid #FF9800", borderRadius:16, padding:"16px 14px", cursor:"pointer", textAlign:"left" }}>
                <div style={{ fontSize:24 }}>➖</div>
                <div style={{ fontWeight:800, color:"#E65100", fontSize:14, marginTop:6 }}>Add Expense</div>
                <div style={{ fontSize:11, color:"#FF9800", marginTop:2 }}>Cost, bill, purchase</div>
              </button>
            </div>

            {/* Export row */}
            <div style={{ paddingLeft:S.px, paddingRight:S.px, paddingTop:12, paddingBottom:0, display:"flex", gap:10 }}>
              <button onClick={()=>{exportCSV(entries,currency,branding,"All Time");showToast("📊 CSV downloaded!","#1b5e20");}}
                style={{ flex:1, padding:"10px", background:"#F0FBF0", border:"1.5px solid #C8E6C9", borderRadius:12, fontSize:12, fontWeight:700, cursor:"pointer", color:"#2E7D32" }}>
                📊 Export CSV
              </button>
              <button onClick={()=>{exportPDF(entries,currency,branding,"All Time");showToast("🖨️ Opening PDF…","#1a237e");}}
                style={{ flex:1, padding:"10px", background:"#F3F0FF", border:"1.5px solid #C5CAE9", borderRadius:12, fontSize:12, fontWeight:700, cursor:"pointer", color:"#283593" }}>
                🖨️ PDF Report
              </button>
            </div>

            {/* Recent Transactions */}
            <div style={{ paddingLeft:S.px, paddingRight:S.px, paddingTop:22, paddingBottom:8 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <div style={{ fontWeight:900, fontSize:15, color:p }}>Recent Transactions</div>
                <button onClick={()=>setView("history")} style={{ background:"none", border:"none", color:p, fontSize:13, cursor:"pointer", fontWeight:700 }}>View All →</button>
              </div>
              {entries.slice(0,6).map(e=><TxRow key={e.id} entry={e} currency={currency} onDelete={handleDel} p={p}/>)}
              {entries.length===0&&(
                <div style={{ textAlign:"center", padding:"36px 0", color:"#ccc", fontSize:14, lineHeight:2 }}>
                  <div style={{ fontSize:40, marginBottom:8 }}>📭</div>
                  No entries yet. Add your first transaction!
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ ADD ENTRY ══ */}
        {view==="add"&&(
          <div style={{ flex:1, overflowY:"auto", paddingLeft:S.px, paddingRight:S.px, paddingTop:24, paddingBottom:`calc(${S.navH}px + env(safe-area-inset-bottom,0px) + 24px)` }}>
            <div style={{ fontWeight:900, fontSize:17, color:p, marginBottom:18 }}>
              {form.type==="income"?"➕ Record Income":"➖ Record Expense"}
            </div>
            <div style={{ display:"flex", background:"#f2f2f2", borderRadius:14, padding:4, marginBottom:18 }}>
              {["income","expense"].map(t=>(
                <button key={t} onClick={()=>setForm(f=>({...f,type:t,category:""}))}
                  style={{ flex:1, padding:"11px", border:"none", borderRadius:11, fontWeight:800, fontSize:13, cursor:"pointer",
                    background:form.type===t?(t==="income"?"#25D366":"#FF9800"):"transparent", color:form.type===t?"#fff":"#888" }}>
                  {t==="income"?"💰 Income":"📤 Expense"}
                </button>
              ))}
            </div>
            <FLabel>Amount ({currency.symbol})</FLabel>
            <input type="number" placeholder="0" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))}
              style={{ width:"100%", padding:"14px 16px", border:`2.5px solid ${form.amount?p:"#e5e5e5"}`, borderRadius:14, fontSize:28,
                fontWeight:900, color:form.type==="income"?"#1B5E20":"#E65100", outline:"none", marginBottom:18, boxSizing:"border-box", background:"#fafafa" }}/>
            <FLabel>Category</FLabel>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:18 }}>
              {cats.map(c=>(
                <button key={c} onClick={()=>setForm(f=>({...f,category:c}))}
                  style={{ padding:"8px 15px", borderRadius:22, border:`2px solid ${form.category===c?p:"#e0e0e0"}`,
                    background:form.category===c?`${p}15`:"#fff", fontWeight:form.category===c?800:400,
                    color:form.category===c?p:"#666", fontSize:13, cursor:"pointer" }}>
                  {c}
                </button>
              ))}
            </div>
            <FLabel>Note (optional)</FLabel>
            <input type="text" placeholder="Customer name, description…" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}
              style={{ width:"100%", padding:"13px 16px", border:"2px solid #e5e5e5", borderRadius:14, fontSize:15, outline:"none", marginBottom:22, boxSizing:"border-box", background:"#fafafa" }}/>
            <button onClick={handleAdd}
              style={{ width:"100%", padding:"16px", background:form.type==="income"?"#25D366":"#FF9800", color:"#fff",
                border:"none", borderRadius:16, fontSize:17, fontWeight:900, cursor:"pointer",
                boxShadow:`0 4px 20px ${form.type==="income"?"#25D36640":"#FF980040"}` }}>
              Save Entry
            </button>
          </div>
        )}

        {/* ══ HISTORY ══ */}
        {view==="history"&&(
          <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
            {/* Sticky sub-header */}
            <div style={{ paddingLeft:S.px, paddingRight:S.px, paddingTop:18, paddingBottom:12, borderBottom:"1px solid #f0f0f0", background:"#fff", flexShrink:0 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <div style={{ fontWeight:900, fontSize:15, color:p }}>Transaction History</div>
                <FilterBadge preset={datePreset} dateRange={dateRange} onClick={()=>setShowDP(true)} primaryColor={p}/>
              </div>
              {/* Type filter tabs */}
              <div style={{ display:"flex", background:"#f2f2f2", borderRadius:12, padding:3 }}>
                {[["all","All"],["income","💰 Income"],["expense","📤 Expense"]].map(([f,l])=>(
                  <button key={f} onClick={()=>setTxFilter(f)}
                    style={{ flex:1, padding:"8px 4px", border:"none", borderRadius:10, fontSize:12, fontWeight:700, cursor:"pointer",
                      background:txFilter===f?p:"transparent", color:txFilter===f?"#fff":"#888" }}>
                    {l}
                  </button>
                ))}
              </div>
              {/* Active filter badge */}
              {datePreset!=="all"&&(
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                  background:`${p}10`, borderRadius:11, padding:"9px 13px", marginTop:10 }}>
                  <span style={{ fontSize:12, color:p, fontWeight:700 }}>📅 {rLabel} · {histFilt.length} transaction{histFilt.length!==1?"s":""}</span>
                  <button onClick={()=>handleDateChange("all",{from:"",to:""})} style={{ background:"none", border:"none", color:p, cursor:"pointer", fontSize:12, fontWeight:800 }}>Clear ✕</button>
                </div>
              )}
              {/* Export filtered */}
              {datePreset!=="all"&&histFilt.length>0&&(
                <div style={{ display:"flex", gap:9, marginTop:10 }}>
                  <button onClick={()=>{exportCSV(histFilt,currency,branding,rLabel);showToast("📊 Exported!","#1b5e20");}}
                    style={{ flex:1, padding:"8px", background:"#F0FBF0", border:"1.5px solid #C8E6C9", borderRadius:10, fontSize:11, fontWeight:700, cursor:"pointer", color:"#2E7D32" }}>
                    📊 CSV
                  </button>
                  <button onClick={()=>{exportPDF(histFilt,currency,branding,rLabel);showToast("🖨️ Opening…","#1a237e");}}
                    style={{ flex:1, padding:"8px", background:"#F3F0FF", border:"1.5px solid #C5CAE9", borderRadius:10, fontSize:11, fontWeight:700, cursor:"pointer", color:"#283593" }}>
                    🖨️ PDF
                  </button>
                </div>
              )}
            </div>
            {/* Scrollable list */}
            <div style={{ flex:1, overflowY:"auto", paddingLeft:S.px, paddingRight:S.px, paddingTop:14, paddingBottom:`calc(${S.navH}px + env(safe-area-inset-bottom,0px) + 10px)` }}>
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
        )}

        {/* ══ SUMMARY ══ */}
        {view==="summary"&&(
          <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
            <div style={{ paddingLeft:S.px, paddingRight:S.px, paddingTop:18, paddingBottom:12, borderBottom:"1px solid #f0f0f0", background:"#fff", flexShrink:0 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <div style={{ fontWeight:900, fontSize:15, color:p }}>Business Summary</div>
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
            <div style={{ flex:1, overflowY:"auto", paddingLeft:S.px, paddingRight:S.px, paddingTop:18, paddingBottom:`calc(${S.navH}px + env(safe-area-inset-bottom,0px) + 10px)` }}>
              {/* P&L card */}
              <div style={{ background:bg, borderRadius:20, padding:"20px 22px", marginBottom:16, color:"#fff" }}>
                <div style={{ fontSize:11, opacity:.8, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>Profit & Loss · {rLabel}</div>
                <div style={{ fontSize:30, fontWeight:900, letterSpacing:-.5, marginBottom:16 }}>{fmtAmt(balance,currency)}</div>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:13 }}>
                  <div><div style={{ opacity:.7, fontSize:10, marginBottom:2 }}>REVENUE</div><div style={{ fontWeight:700 }}>{fmtAmt(totalInc,currency)}</div></div>
                  <div><div style={{ opacity:.7, fontSize:10, marginBottom:2 }}>EXPENSES</div><div style={{ fontWeight:700 }}>{fmtAmt(totalExp,currency)}</div></div>
                  <div><div style={{ opacity:.7, fontSize:10, marginBottom:2 }}>MARGIN</div><div style={{ fontWeight:700 }}>{totalInc>0?Math.round((balance/totalInc)*100):0}%</div></div>
                </div>
              </div>
              <div style={{ background:"#fafafa", borderRadius:16, padding:18, marginBottom:14 }}>
                <div style={{ fontWeight:800, color:"#333", marginBottom:13, fontSize:14 }}>💰 Income Breakdown</div>
                <CatChart entries={dateFilt} currency={currency} type="income" color="#25D366"/>
              </div>
              <div style={{ background:"#fafafa", borderRadius:16, padding:18, marginBottom:14 }}>
                <div style={{ fontWeight:800, color:"#333", marginBottom:13, fontSize:14 }}>📤 Expense Breakdown</div>
                <CatChart entries={dateFilt} currency={currency} type="expense" color="#FF9800"/>
              </div>
              <div style={{ display:"flex", gap:10, marginBottom:12 }}>
                <button onClick={()=>{exportCSV(dateFilt,currency,branding,rLabel);showToast("📊 CSV downloaded!","#1b5e20");}}
                  style={{ flex:1, padding:"13px", background:"#F0FBF0", border:"1.5px solid #C8E6C9", borderRadius:14, fontWeight:700, cursor:"pointer", fontSize:13, color:"#2E7D32" }}>
                  📊 Export CSV
                </button>
                <button onClick={()=>{exportPDF(dateFilt,currency,branding,rLabel);showToast("🖨️ Opening PDF…","#1a237e");}}
                  style={{ flex:1, padding:"13px", background:"#F3F0FF", border:"1.5px solid #C5CAE9", borderRadius:14, fontWeight:700, cursor:"pointer", fontSize:13, color:"#283593" }}>
                  🖨️ PDF Report
                </button>
              </div>
              <button onClick={()=>setShowWA(true)}
                style={{ width:"100%", padding:"15px", background:"#25D366", color:"#fff", border:"none", borderRadius:16, fontSize:15, fontWeight:900, cursor:"pointer" }}>
                💬 Share on WhatsApp
              </button>
            </div>
          </div>
        )}

        {/* ── BOTTOM NAV ── */}
        <div style={{
          background:"#fff", borderTop:"1px solid #ebebeb", display:"flex",
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
          <div style={{ position:"fixed", bottom:`calc(${S.navH + 12}px + env(safe-area-inset-bottom,0px))`,
            left:"50%", transform:"translateX(-50%)", background:toast.color, color:"#fff",
            padding:"11px 24px", borderRadius:24, fontWeight:700, fontSize:13,
            boxShadow:"0 4px 20px rgba(0,0,0,0.2)", zIndex:300, whiteSpace:"nowrap", pointerEvents:"none" }}>
            {toast.msg}
          </div>
        )}
      </div>
    </div>
  );
}

function FLabel({ children }) {
  return <div style={{ fontSize:11, fontWeight:800, color:"#999", textTransform:"uppercase", letterSpacing:.5, marginBottom:8 }}>{children}</div>;
}
