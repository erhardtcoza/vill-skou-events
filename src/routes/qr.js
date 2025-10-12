// src/routes/qr.js
import { bad } from "../utils/http.js";

/*
  Pluggable QR endpoints.
  Relies on ../services/qr.js: export async function renderSVG(data, size, margin, ecc)
  We already provided a full dependency-free implementation for services/qr.js.
*/

export function mountQR(router) {
  // Pure SVG response (recommended)
  router.add("GET", "/api/qr/svg/:data", async (_req, env, _ctx, { data }) => {
    const payload = decodeURIComponent(String(data || ""));
    let svg;
    try {
      const svc = await import("../services/qr.js");
      if (svc?.renderSVG) {
        // default: 256px with 2 modules margin, ECC 'M'
        svg = await svc.renderSVG(payload, 256, 2, "M");
      }
    } catch { /* ignore */ }

    if (!svg) {
      return new Response(JSON.stringify({
        ok: false,
        error: "qr_not_configured",
        hint: "services/qr.renderSVG(data, size, margin, ecc) not available."
      }), { status: 501, headers: { "content-type": "application/json" }});
    }

    return new Response(svg, {
      headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=86400" }
    });
  });

  // “PNG” route that currently serves SVG (works in <img>)
  router.add("GET", "/api/qr/png/:data", async (req, env, ctx, params) => {
    const u = new URL(req.url);
    const svgURL = new URL(`/api/qr/svg/${encodeURIComponent(params.data)}`, u.origin);
    const res = await router.handle(new Request(svgURL.toString(), { method: "GET" }), env, ctx);
    if (res && res.ok) return res;
    return bad("QR not available", 501);
  });
}
