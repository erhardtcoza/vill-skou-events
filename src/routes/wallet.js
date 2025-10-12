// src/routes/wallet.js
import { json, bad } from "../utils/http.js";

/* ------------- Google Wallet integration notes -------------
You’ll need a small service module at ../services/gpay.js that exposes:
  async function buildSaveUrl(env, ticketRow) => string|undefined

Typical approach:
- Use a Google service account (issuer) JSON (store in a secret/kv).
- Create a JWT with the class/object payload for the ticket.
- Return the "Save to Google Wallet" URL: https://pay.google.com/gp/v/save/<JWT>

This route ONLY wires the ticket lookup + response.
-------------------------------------------------------------- */

export function mountWallet(router) {
  /* Return a Save-to-Google-Wallet URL for a given ticket token */
  router.add("GET", "/api/wallet/gpay/save/:token", async (_req, env, _ctx, { token }) => {
    const tok = String(token || "").trim();
    if (!tok) return bad("token required");

    // Fetch a ticket + event + type context to build the pass
    const row = await env.DB.prepare(
      `SELECT
          t.id, t.qr, t.token, t.state, t.attendee_first, t.attendee_last,
          tt.name  AS type_name, tt.price_cents,
          e.name   AS event_name, e.venue, e.starts_at, e.ends_at
        FROM tickets t
        JOIN orders o      ON o.id = t.order_id
        JOIN ticket_types tt ON tt.id = t.ticket_type_id
        JOIN events e      ON e.id = t.event_id
       WHERE t.token = ?1
       LIMIT 1`
    ).bind(tok).first();
    if (!row) return bad("not_found", 404);

    let gpayUrl;
    try {
      const svc = await import("../services/gpay.js"); // you implement buildSaveUrl
      if (svc?.buildSaveUrl) {
        gpayUrl = await svc.buildSaveUrl(env, row);
      }
    } catch { /* fall through */ }

    if (!gpayUrl) {
      // Not configured yet
      return json({
        ok: false,
        error: "gpay_not_configured",
        hint: "Implement services/gpay.buildSaveUrl(env, ticketRow) and set GOOGLE_WALLET_* secrets.",
      }, 501);
    }

    return json({ ok: true, url: gpayUrl });
  });

  /* (Optional) Apple Wallet stub so the UI can show/hide CTA cleanly */
  router.add("GET", "/api/wallet/apple/save/:token", async (_req, _env, _ctx, { token }) => {
    return json({
      ok: false,
      error: "apple_not_configured",
      hint: "Implement Apple pass endpoint when ready.",
      token
    }, 501);
  });

  /* Tiny helper that returns CTA image URLs (if you prefer JSON-driven UI) */
  router.add("GET", "/api/wallet/ctas", async (_req, env) => {
    const base = env.PUBLIC_BASE_URL || "";
    return json({
      ok: true,
      google: { text: "Save to Google Wallet", href: `${base}/assets/google-wallet-badge.svg` },
      apple:  { text: "Add to Apple Wallet",   href: `${base}/assets/apple-wallet-badge.svg` }
    });
  });
}
