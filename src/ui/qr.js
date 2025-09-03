// /src/ui/qr.js
// Small helper to embed a QR IMG via a reliable CDN API
export function qrImg(data, size = 240, alt = "QR") {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(
    data
  )}`;
  return `<img src="${url}" width="${size}" height="${size}" alt="${alt}" loading="lazy" decoding="async" />`;
}
