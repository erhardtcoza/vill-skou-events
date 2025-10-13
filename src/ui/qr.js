// /src/ui/qr.js
//
// Helpers to render QR images using your internal Worker routes.
// Prefer SVG (vector, self-contained) from `/api/qr/svg/:data`.
// Optionally fall back to the PNG endpoint.
//
// Usage:
//   qrImg('payload', 220)                -> <img ... src="/api/qr/svg/...">
//   qrImgPNG('payload', 220)             -> <img ... src="/api/qr/png?data=...">
//   qrSvgURL('payload') / qrPngURL(...)
// Back-compat: also exports qrIMG as an alias of qrImg.

function escAttr(s = "") {
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

export function qrSvgURL(data) {
  return `/api/qr/svg/${encodeURIComponent(String(data))}`;
}

export function qrPngURL(data, size = 256) {
  // If your /api/qr/png supports size, keep this; otherwise drop &size
  return `/api/qr/png?data=${encodeURIComponent(String(data))}&size=${Number(size)||256}`;
}

/**
 * Preferred: SVG QR served by Worker. If a client can’t render that URL
 * for any reason, we can optionally add a PNG fallback via `onerror`.
 */
export function qrImg(data, size = 220, alt = "QR", withPngFallback = true) {
  const svg = qrSvgURL(data);
  const w = Number(size) || 220;
  const h = w;
  const safeAlt = escAttr(alt);
  if (withPngFallback) {
    const png = qrPngURL(data, w);
    // PNG fallback only fires when the SVG URL fails to load.
    return `<img src="${svg}" width="${w}" height="${h}" alt="${safeAlt}" loading="eager" decoding="async" onerror="this.onerror=null;this.src='${png}'" />`;
  }
  return `<img src="${svg}" width="${w}" height="${h}" alt="${safeAlt}" loading="eager" decoding="async" />`;
}

/** Explicit PNG helper (rarely needed) */
export function qrImgPNG(data, size = 220, alt = "QR") {
  const png = qrPngURL(data, size);
  const w = Number(size) || 220;
  const h = w;
  const safeAlt = escAttr(alt);
  return `<img src="${png}" width="${w}" height="${h}" alt="${safeAlt}" loading="eager" decoding="async" />`;
}

// Backwards-compatible alias
export const qrIMG = qrImg;
