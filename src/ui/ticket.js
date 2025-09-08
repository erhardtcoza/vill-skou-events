// /src/ui/ticket.js
import { esc } from "../utils/html.js";

export function ticketHTML(code) {
  const safe = esc(code || "");

  return /*html*/`
<!doctype html>
<html lang="af">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Jou kaartjies · ${safe}</title>
  <link rel="icon" href="/favicon.ico" />
  <style>
    :root {
      --bg:#f7f7f7; --panel:#fff; --ink:#111; --muted:#6b7280;
      --brand:#166534; --brand-ink:#fff; --chip:#e5e7eb;
      --ok:#065f46; --warn:#92400e; --void:#991b1b;
    }
    * { box-sizing:border-box }
    html,body { margin:0; background:var(--bg); color:var(--ink);
      font:16px/1.45 system-ui,-apple-system,Segoe UI,Roboto,"Helvetica Neue",Arial }
    a { color:var(--brand); text-decoration:none }
    header { max-width:960px; margin:20px auto 0; padding:0 16px; }
    h1 { margin:0 0 8px; font-size:28px }
    .lead { color:var(--muted); margin:0 0 20px }
    .toolbar-page { max-width:960px; margin:0 auto 16px; padding:0 16px; display:flex; gap:8px; }
    .grid { max-width:960px; margin:0 auto 40px; padding:0 16px;
      display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:16px; }
    .card { background:var(--panel); border-radius:14px; box-shadow:0 1px 2px rgba(0,0,0,.05);
      padding:14px; display:flex; flex-direction:column; gap:10px; }
    .row { display:flex; gap:10px; align-items:center; justify-content:space-between; }
    .tt { font-weight:600; }
    .pill { display:inline-block; padding:2px 8px; border-radius:999px; background:var(--chip); color:#111; font-size:12px }
    .state-unused { color:var(--ok) }
    .state-in { color:var(--ok) }
    .state-out { color:var(--warn) }
    .state-void { color:var(--void) }
    .qr { align-self:center; background:#fff; padding:8px; border-radius:8px; }
    .qr img { display:block; width:200px; height:200px; image-rendering: pixelated; }
    .muted { color:var(--muted); font-size:13px }
    .toolbar { display:flex; gap:8px; flex-wrap:wrap; }
    .btn { display:inline-flex; align-items:center; justify-content:center; padding:8px 12px;
      border-radius:10px; background:var(--brand); color:var(--brand-ink); font-weight:600; border:0; cursor:pointer }
    .btn.secondary { background:#111; color:#fff }
    .btn.ghost { background:#e5e7eb; color:#111 }
    .empty { max-width:960px; margin:24px auto; padding:0 16px; color:var(--muted) }

    /* Print-friendly: one ticket per page, big QR */
    @media print {
      header, .toolbar-page { display:none !important; }
      body { background:#fff; }
      .grid { display:block; max-width:700px; }
      .card { page-break-after:always; border-radius:0; box-shadow:none; border:1px solid #ccc; }
      .qr img { width:360px; height:360px; }
      .toolbar, .muted:last-child { display:none !important; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Jou kaartjies · ${safe}</h1>
    <p class="lead">Wys die QR by die hek sodat dit gescan kan word.</p>
  </header>

  <div class="toolbar-page">
    <button id="printAll" class="btn">Druk | Stoor as PDF</button>
  </div>

  <div id="root" class="grid" aria-live="polite"></div>
  <p id="empty" class="empty" hidden>Kon nie kaartjies vind met kode <strong>${safe}</strong> nie.</p>

  <script type="module">
    const code = ${JSON.stringify(String(code || ""))};
    const esc = (s) => String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
    const money = (c) => "R" + (Number(c||0)/100).toFixed(2);
    const qrURL = (data, size=220, fmt='png') =>
      \`https://api.qrserver.com/v1/create-qr-code/?format=\${fmt}&size=\${size}x\${size}&data=\${encodeURIComponent(data)}\`;

    document.getElementById("printAll").addEventListener("click", () => window.print());

    function stateClass(s) {
      return s === "in" ? "state-in" :
             s === "out" ? "state-out" :
             s === "void" ? "state-void" : "state-unused";
    }

    async function downloadPNG(data, filename) {
      // Larger QR for download
      const url = qrURL(data, 600, "png");
      const res = await fetch(url, { mode: "cors" });
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename || "ticket.png";
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(a.href);
      a.remove();
    }

    function render(tickets) {
      const root = document.getElementById("root");
      const empty = document.getElementById("empty");
      root.innerHTML = "";
      if (!tickets || !tickets.length) {
        empty.hidden = false;
        return;
      }
      empty.hidden = true;

      for (const t of tickets) {
        const fullName = [t.attendee_first, t.attendee_last].filter(Boolean).join(" ") || "Besitter";
        const price = typeof t.price_cents === "number" ? money(t.price_cents) : "";

        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = \`
          <div class="row">
            <div class="tt">\${esc(t.type_name || "Kaartjie")}</div>
            <span class="pill \${stateClass(t.state)}">\${esc(t.state || "unused")}</span>
          </div>
          <div class="qr"><img alt="QR vir toegang" src="\${qrURL(t.qr)}"></div>
          <div class="muted">\${esc(fullName)}</div>
          \${price ? '<div class="muted">'+esc(price)+'</div>' : ''}
          <div class="toolbar">
            <button class="btn ghost dl">Download PNG</button>
          </div>
          <div class="muted">Orderkode: \${esc(t.short_code || "")} · Ticket #\${t.id}</div>
        \`;

        card.querySelector(".dl").addEventListener("click", () =>
          downloadPNG(t.qr, \`ticket-\${t.id}.png\`)
        );

        root.appendChild(card);
      }
    }

    async function load() {
      try {
        const r = await fetch(\`/api/public/tickets/by-code/\${encodeURIComponent(code)}\`, { credentials:"include" });
        const j = await r.json().catch(() => ({}));
        if (!j.ok) throw new Error(j.error || "kon nie laai nie");
        render(j.tickets || []);
      } catch (e) {
        document.getElementById("empty").textContent = "Kon nie kaartjies laai nie: " + (e.message || "fout");
        document.getElementById("empty").hidden = false;
      }
    }

    load();
  </script>
</body>
</html>`;
}
