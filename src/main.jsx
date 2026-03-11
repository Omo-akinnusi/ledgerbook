import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.jsx";

// ── Initialise Sentry ────────────────────────────────────────────
Sentry.init({
  dsn: "https://fcda4ee009f7bca93a1db6be54a984e0@o4511026229542912.ingest.de.sentry.io/4511026236293200",
  integrations: [
    Sentry.browserTracingIntegration(),   // tracks page load & navigation speed
    Sentry.replayIntegration({            // records a video-like replay of the session before an error
      maskAllText: true,                  // hides sensitive text (amounts, notes) in replays
      blockAllMedia: true,
    }),
  ],
  // Capture 100% of errors, 10% of performance traces (saves quota)
  tracesSampleRate: 0.1,
  // Capture replays for 5% of sessions, 100% of sessions with errors
  replaysSessionSampleRate: 0.05,
  replaysOnErrorSampleRate: 1.0,
  // Only send errors from your live domain, not localhost
  allowUrls: [
    /ledgerbook-nu\.vercel\.app/,
    /localhost/,
  ],
  // Tag every error with the app name for easy filtering in Sentry dashboard
  initialScope: {
    tags: { app: "LedgerBook Pro" },
  },
});

// ── Mount app wrapped in Sentry error boundary ───────────────────
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Sentry.ErrorBoundary
      fallback={
        <div style={{
          minHeight: "100vh",
          background: "#075E54",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'Segoe UI', system-ui, sans-serif",
          padding: 32,
          textAlign: "center",
        }}>
          <div style={{ fontSize: 48, marginBottom: 20 }}>⚠️</div>
          <div style={{ color: "#fff", fontSize: 22, fontWeight: 900, marginBottom: 10 }}>
            Something went wrong
          </div>
          <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 15, marginBottom: 32, maxWidth: 340, lineHeight: 1.6 }}>
            LedgerBook Pro ran into an unexpected error. Our team has been notified automatically.
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: "#25D366",
              color: "#fff",
              border: "none",
              borderRadius: 14,
              padding: "14px 32px",
              fontSize: 16,
              fontWeight: 900,
              cursor: "pointer",
            }}>
            🔄 Reload App
          </button>
        </div>
      }
      onError={(error, componentStack) => {
        // Extra context automatically sent to Sentry with every crash
        Sentry.withScope((scope) => {
          scope.setExtra("componentStack", componentStack);
        });
      }}
    >
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>
);
