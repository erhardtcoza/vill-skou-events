// src/routes/qr.js
import { bad } from "../utils/http.js";

/*
  Pluggable QR endpoints.
  Implement ../services/qr.js with:
    export async function renderSVG(data, size, margin) => string
  to return a full <svg>…</svg> markup.

  Until implemented, these endpoints will return 501 (not configured).
*/

export function mountQR(router) {
  // Pure SVG response (recommended)
  router.add("GET", "/api/qr/svg/:data", async (_req, env, _ctx, { data }) => {
    const payload = decodeURIComponent(String(data || ""));
    let svg;
    try {
      const svc = await import("../services/qr.js");
      if (svc?.renderSVG) {
        // default: 256px with 2 modules margin
        svg = await svc.renderSVG(payload, 256, 2);
      }
    } catch { /* ignore */ }

    if (!svg) {
      return new Response(JSON.stringify({
        ok: false,
        error: "qr_not_configured",
        hint: "Provide services/qr.renderSVG(data, size, margin) to enable QR output."
      }), { status: 501, headers: { "content-type": "application/json" }});
    }

    return new Response(svg, {
      headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=86400" }
    });
  });

  // “PNG” endpoint for <img> tags — serves SVG for now (widely supported)
  router.add("GET", "/api/qr/png/:data", async (req, env, ctx, params) => {
    // Delegate to the SVG handler to avoid duplication
    const u = new URL(req.url);
    const svgURL = new URL(`/api/qr/svg/${encodeURIComponent(params.data)}`, u.origin);
    // Re-hydrate a sub-request with same method/headers
    const res = await router.handle(new Request(svgURL.toString(), { method: "GET" }), env, ctx);
    // If success, just forward the body but keep content-type as SVG
    if (res && res.ok) return res;
    return bad("QR not available", 501);
  });
}
