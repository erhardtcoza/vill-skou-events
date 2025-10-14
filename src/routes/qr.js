// /src/routes/qr.js
import { bad } from "../utils/http.js";
import { renderSVG } from "../services/qr.js";

/**
 * Endpoints:
 *  - GET /api/qr/svg/:data  -> self-contained SVG (vector if possible, otherwise PNG embedded)
 *  - GET /api/qr/png?data=  -> PNG proxy (optional fallback)
 */

function toBase64(u8) {
  // Workers-safe base64 for Uint8Array
  let bin = "";
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  // btoa expects binary string
  return btoa(bin);
}

export function mountQR(router) {
  // Self-contained SVG route
  router.add("GET", "/api/qr/svg/:data", async (req, _env, _ctx, params) => {
    const url = new URL(req.url);
    const raw = params?.data ?? url.searchParams.get("data");
    if (!raw) return bad(400, "missing_data");

    // 1) Try vector SVG
    try {
      const svg = await renderSVG(raw, 512, 2, "M");
      if (svg) {
        return new Response(svg, {
          headers: {
            "content-type": "image/svg+xml; charset=utf-8",
            "cache-control": "public, max-age=86400",
          },
        });
      }
    } catch (_) {
      // fall through to PNG embed
    }

    // 2) Fallback: embed PNG as data URI inside SVG (still self-contained)
    try {
      const size = 512;
      const src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(
        raw
      )}&margin=0`;
      const res = await fetch(src, {
        cf: { cacheTtl: 3600, cacheEverything: true },
      });
      if (!res.ok) {
        return new Response("QR fallback failed", { status: 502 });
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      const b64 = toBase64(buf);
      const svg =
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
        `<image href="data:image/png;base64,${b64}" width="${size}" height="${size}" />` +
        `</svg>`;

      return new Response(svg, {
        headers: {
          "content-type": "image/svg+xml; charset=utf-8",
          "cache-control": "public, max-age=3600",
        },
      });
    } catch (e) {
      return new Response("QR generation failed", { status: 500 });
    }
  });

  // Optional PNG proxy (unchanged)
  router.add("GET", "/api/qr/png", async (req) => {
    const url = new URL(req.url);
    const data = url.searchParams.get("data");
    if (!data) return bad(400, "missing_data");
    const size = Number(url.searchParams.get("size") || 256);
    const src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(
      data
    )}&margin=0`;
    const res = await fetch(src, { cf: { cacheTtl: 3600, cacheEverything: true } });
    return new Response(res.body, {
      headers: {
        "content-type": "image/png",
        "cache-control": "public, max-age=3600",
      },
    });
  });
}
