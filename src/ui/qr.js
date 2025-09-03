// /src/ui/qr.js
//
// Tiny helper to render QR codes via the qrserver.com CDN.
// We keep it tiny to avoid bundling a full QR lib.
// Usage: qrIMG('payload', 220) -> <img ... />

export function qrIMG(data, size = 220, alt = "QR") {
  const enc = encodeURIComponent(data);
  const s = `${size}x${size}`;
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${s}&data=${enc}&margin=0`;
  return `<img src="${url}" width="${size}" height="${size}" alt="${alt}" loading="eager" decoding="async" />`;
}
