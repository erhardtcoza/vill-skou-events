// /src/ui/qr.js
export function qrImg(data, size = 220, alt = "QR") {
  const enc = encodeURIComponent(data);
  return `<img src="/api/qr/svg/${enc}" width="${size}" height="${size}" alt="${alt}" loading="eager" decoding="async" />`;
}

// Backwards-compatible alias
export const qrIMG = qrImg;
