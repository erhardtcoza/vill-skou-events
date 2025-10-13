// /src/routes/qr.js
import { bad } from "../utils/http.js";

export function mountQR(router) {
  // Helper to read ?data= or path /:data
  function readData(req, params) {
    const url = new URL(req.url);
    const q = url.searchParams.get("data") || url.searchParams.get("d");
    return q || params?.data || "";
  }

  // PNG proxy (fast + cacheable)
  router.add("GET", "/api/qr/png/:data", async (req, env, _ctx, params) => {
    const data = readData(req, params);
    if (!data) return bad(400, "missing_data");
    const src = `${env.QR_CDN}${encodeURIComponent(data)}`;
    const up = await fetch(src, { cf: { cacheTtl: 3600, cacheEverything: true } });
    if (!up.ok) return new Response("QR upstream failed", { status: 502 });
    // Ensure PNG content-type
    return new Response(up.body, {
      status: 200,
      headers: {
        "content-type": "image/png",
        "cache-control": "public, max-age=3600"
      }
    });
  });

  router.add("GET", "/api/qr/png", async (req, env) => {
    const data = readData(req);
    if (!data) return bad(400, "missing_data");
    const src = `${env.QR_CDN}${encodeURIComponent(data)}`;
    const up = await fetch(src, { cf: { cacheTtl: 3600, cacheEverything: true } });
    if (!up.ok) return new Response("QR upstream failed", { status: 502 });
    return new Response(up.body, {
      status: 200,
      headers: {
        "content-type": "image/png",
        "cache-control": "public, max-age=3600"
      }
    });
  });

  // SVG wrapper that *embeds* the PNG we proxy above
  router.add("GET", "/api/qr/svg/:data", async (req, env, _ctx, params) => {
    const data = readData(req, params);
    if (!data) return bad(400, "missing_data");
    const pngURL = `/api/qr/png?data=${encodeURIComponent(data)}`;
    const size = Number(new URL(req.url).searchParams.get("size") || 512);
    const svg =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      `<image href="${pngURL}" width="${size}" height="${size}" />` +
      `</svg>`;
    return new Response(svg, {
      status: 200,
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        "cache-control": "public, max-age=3600"
      }
    });
  });

  router.add("GET", "/api/qr/svg", async (req) => {
    const url = new URL(req.url);
    const data = url.searchParams.get("data") || url.searchParams.get("d") || "";
    if (!data) return bad(400, "missing_data");
    const size = Number(url.searchParams.get("size") || 512);
    const pngURL = `/api/qr/png?data=${encodeURIComponent(data)}`;
    const svg =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      `<image href="${pngURL}" width="${size}" height="${size}" />` +
      `</svg>`;
    return new Response(svg, {
      status: 200,
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        "cache-control": "public, max-age=3600"
      }
    });
  });
}
