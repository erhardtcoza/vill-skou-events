// /src/routes/qr.js
import { bad } from "../utils/http.js";
import { renderSVG } from "../services/qr.js";

/**
 * Mounts all QR endpoints.
 * /api/qr/svg/:data  -> vector inline SVG (recommended)
 * /api/qr/png?data=  -> PNG proxy (fallback)
 */
export function mountQR(router) {
  // Self-contained SVG version
  router.add("GET", "/api/qr/svg/:data", async (req, env, _ctx, params) => {
    const data = params?.data || new URL(req.url).searchParams.get("data");
    if (!data) return bad(400, "missing_data");

    const svg = await renderSVG(data, 512, 2, "M");
    if (!svg) return new Response("QR generation failed", { status: 500 });

    return new Response(svg, {
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        "cache-control": "public, max-age=86400",
      },
    });
  });

  // PNG proxy (optional)
  router.add("GET", "/api/qr/png", async (req, env) => {
    const url = new URL(req.url);
    const data = url.searchParams.get("data");
    if (!data) return bad(400, "missing_data");
    const size = Number(url.searchParams.get("size") || 256);
    const src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;
    const res = await fetch(src, { cf: { cacheTtl: 3600, cacheEverything: true } });
    return new Response(res.body, {
      headers: {
        "content-type": "image/png",
        "cache-control": "public, max-age=3600",
      },
    });
  });
}
