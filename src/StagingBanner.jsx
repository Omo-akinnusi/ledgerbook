// src/StagingBanner.jsx
// Renders a persistent banner when running in staging environment.
// Helps prevent accidental staging data being treated as real.
// Imported in App.jsx and rendered at the top level.

const IS_STAGING = import.meta.env.VITE_ENV === "staging"
  || window.location.hostname.includes("staging")
  || window.location.hostname.includes("vercel.app");

export default function StagingBanner() {
  if (!IS_STAGING) return null;

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 99999,
      background: "linear-gradient(90deg,#854d0e,#a16207)",
      padding: "6px 16px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
    }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="#fef08a" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
        style={{ width: 14, height: 14, flexShrink: 0 }}>
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <span style={{
        fontSize: 12, fontWeight: 700, color: "#fef08a",
        letterSpacing: ".5px", textTransform: "uppercase",
      }}>
        Staging environment — Test data only. Not connected to live users.
      </span>
    </div>
  );
}
