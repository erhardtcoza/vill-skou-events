// src/services/qr.js
// Stub. Replace with a real QR implementation.
// Return a valid <svg>…</svg> string that draws the QR for `data`.

export async function renderSVG(data, size = 256, margin = 2) {
  // Return undefined to signal “not configured”.
  // Once you wire a real encoder, remove the return below and generate proper QR.
  return undefined;

  /* Example shape (pseudo; replace with real QR):
  const cell = 8, n = 21; // v1 QR is 21x21 modules
  const dim = n * cell + margin * 2 * cell;
  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${size}" height="${size}">`;
  out += `<rect width="100%" height="100%" fill="#fff"/>`;
  // draw modules: out += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="#000"/>`;
  out += `</svg>`;
  return out;
  */
}
