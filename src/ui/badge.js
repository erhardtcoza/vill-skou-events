// /src/ui/badge.js
import { qrImg } from "./qr.js";

/**
 * Simple printable badge (A6-ish) used for Vendor / Staff / Vehicle.
 * Pass an object:
 * {
 *   title: 'VENDOR'|'STAFF'|'VEHICLE',
 *   name: 'John Doe',
 *   org: 'Coffee Co.',
 *   plate: 'CA 123-456' // optional
 *   code: 'VND-ABC123', // encoded in QR
 *   event: { name, venue, starts_at, ends_at }
 * }
 */
export function badgeHTML(b) {
  const when = (s, e) => {
    const sd = new Date((s || 0) * 1000);
    const ed = new Date((e || 0) * 1000);
    const fmt = (d) =>
      d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
    return `${fmt(sd)} – ${fmt(ed)}`;
  };

  const qr = qrImg(b.code || "", 180, "Badge QR");
  const plate = b.plate ? `<div class="plate">${b.plate}</div>` : "";

  return `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${b.title || "PASS"}</title>
<style>
  @page { size: A6; margin: 10mm; }
  body{font-family:system-ui;margin:0;background:#fff;color:#111}
  .card{border:2px solid #0a7d2b;border-radius:16px;padding:14px;display:grid;grid-template-columns:1fr 180px;gap:12px}
  h1{margin:0 0 6px;font-size:20px;letter-spacing:.5px}
  .sub{color:#555;font-size:13px}
  .big{font-weight:800;font-size:28px}
  .plate{margin-top:6px;padding:6px 10px;border:2px dashed #999;border-radius:10px;font-weight:700;display:inline-block}
  .qr{text-align:center}
  .qr small{display:block;color:#666;margin-top:6px}
  @media print {.print-hide{display:none}}
</style></head><body>
<div class="card">
  <div>
    <div class="big">${b.title || "PASS"}</div>
    <h1>${b.name || ""}</h1>
    <div class="sub">${b.org || ""}</div>
    ${plate}
    <div class="sub" style="margin-top:10px;">
      ${b.event?.name || ""} · ${when(b.event?.starts_at, b.event?.ends_at)}
      <div>${b.event?.venue || ""}</div>
    </div>
  </div>
  <div class="qr">
    ${qr}
    <small>${b.code || ""}</small>
    <div class="print-hide" style="margin-top:8px;"><button onclick="window.print()">Print</button></div>
  </div>
</div>
</body></html>`;
}
