// src/analytics.js
// Centralised Google Analytics 4 event tracking.
// All calls are no-ops if GA hasn't loaded (e.g. ad blockers).

const track = (eventName, params = {}) => {
  try {
    if (typeof window !== "undefined" && typeof window.trackEvent === "function") {
      window.trackEvent(eventName, params);
    }
  } catch(e) { /* never crash the app over analytics */ }
};

const page = (pageName) => {
  try {
    if (typeof window !== "undefined" && typeof window.trackPage === "function") {
      window.trackPage(pageName);
    }
  } catch(e) {}
};

// ── Auth events ───────────────────────────────────────────────
export const trackSignup         = (method)       => track("sign_up",              { method });
export const trackLogin          = (method)       => track("login",                { method });
export const trackLogout         = ()             => track("logout");
export const trackPasswordReset  = ()             => track("password_reset_request");
export const trackEmailVerified  = ()             => track("email_verified");

// ── Onboarding ────────────────────────────────────────────────
export const trackOnboardingStart    = ()         => track("onboarding_start");
export const trackOnboardingComplete = (industry) => track("onboarding_complete",  { industry });
export const trackOnboardingSkip     = ()         => track("onboarding_skip");

// ── Page views ────────────────────────────────────────────────
export const trackPage = (name) => page(name);

// ── Entries ───────────────────────────────────────────────────
export const trackEntryAdded   = (type, category) => track("entry_added",   { type, category });
export const trackEntryEdited  = (type)            => track("entry_edited",  { type });
export const trackEntryDeleted = ()                => track("entry_deleted");

// ── Upgrade & payments ────────────────────────────────────────
export const trackUpgradeModalOpen  = (reason)    => track("upgrade_modal_open",   { reason });
export const trackUpgradeInitiated  = (plan)      => track("upgrade_initiated",    { plan, currency: "NGN" });
export const trackUpgradeSuccess    = (plan)      => track("purchase",             { items: [{ item_name: `LedgerBook Pro ${plan}` }] });

// ── Free tier ─────────────────────────────────────────────────
export const trackLimitReached     = ()            => track("free_limit_reached");
export const trackAdClick          = (brand, slot) => track("ad_click",            { brand, slot });

// ── Features ─────────────────────────────────────────────────
export const trackBudgetCreated    = ()            => track("budget_created");
export const trackExportCSV        = ()            => track("export_csv");
export const trackExportPDF        = ()            => track("export_pdf");
export const trackQuickEntry       = ()            => track("quick_entry_used");
