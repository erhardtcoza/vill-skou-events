// /src/ui/admin_tickets.js
export const adminTicketsJS = `
window.AdminPanels.tickets = async function renderTickets(){
  const el = $("panel-tickets");
  if (!el) return;

  el.innerHTML = "<h2>Tickets</h2><div class='muted'>Kies 'n event om opsomming te sien.</div>";

  // ---- One-time styles for this panel ----
  (function ensureStyles(){
    const STYLE_ID = "tickets-admin-styles";
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = \`
      /* Summary table */
      table.tickets-sum { width:100%; border-collapse:collapse; }
      .tickets-sum th, .tickets-sum td { padding:6px 8px; border-bottom:1px solid #eef1f3; }
      .tickets-sum th { text-align:left; }
      .tickets-sum th.num, .tickets-sum td.num { text-align:center; }

      /* Lookup + list tables */
      table.tickets-list { width:100%; border-collapse:collapse; }
      .tickets-list th, .tickets-list td { padding:6px 8px; border-bottom:1px solid #eef1f3; }
      .tickets-list th { text-align:left; white-space:nowrap; }
      .tickets-list td.state { text-transform:uppercase; font-weight:600; letter-spacing:.02em; }
      .tickets-list td.compact { white-space:nowrap; }
      .pill { background:#f4f6f8; border:1px solid #eef1f3; padding:4px 8px; border-radius:999px; }
      .cardish h3 { margin:0 0 8px }
      .grid { display:grid; grid-template-columns: 1fr auto auto; gap:8px; }
      @media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
    \`;
    document.head.appendChild(style);
  })();

  // ---- Fetch active events for picker ----
  const evs = await fetch("/api/admin/events", { credentials:'include' })
    .then(r=>r.json()).catch(()=>({ok:false,events:[]}));
  if (!evs.ok || !evs.events?.length) return;

  const picker = document.createElement("div");
  picker.style.display = "flex";
  picker.style.gap = "8px";
  picker.style.alignItems = "center";
  picker.innerHTML = "<label>Event</label>";
  const sel = document.createElement("select");
  sel.innerHTML = evs.events.map(ev=>"<option value='"+ev.id+"'>"+esc(ev.name)+"</option>").join("");
  picker.appendChild(sel);
  el.appendChild(picker);

  const box = document.createElement("div");
  box.style.marginTop = "10px";
  el.appendChild(box);

  // --- Below summary: Lookup + List containers ---
  const tools = document.createElement("div");
  tools.style.marginTop = "14px";
  el.appendChild(tools);

  const lookupBox = document.createElement("div");
  lookupBox.className = "cardish";
  lookupBox.style.cssText = "border:1px solid #eef1f3;border-radius:12px;padding:12px;margin:12px 0;";
  lookupBox.innerHTML = [
    "<h3>Order lookup</h3>",
    "<div class='grid'>",
      "<div><input id='tix-lookup-code' placeholder='Order code (bv. CAXHIEG)'/></div>",
      "<div style='display:flex;align-items:center'><button id='tix-lookup-btn' class='btn'>Find</button></div>",
    "</div>",
    "<div id='tix-lookup-res' class='muted' style='margin-top:8px'></div>"
  ].join("");
  tools.appendChild(lookupBox);

  const listBox = document.createElement("div");
  listBox.className = "cardish";
  listBox.style.cssText = "border:1px solid #eef1f3;border-radius:12px;padding:12px;margin:12px 0;";
  listBox.innerHTML = [
    "<h3>All tickets</h3>",
    "<div class='grid'>",
      "<div><input id='tix-q' placeholder='Search: QR, name, phone, order code, buyer…'/></div>",
      "<div>",
        "<select id='tix-state'>",
          "<option value=''>Any state</option>",
          "<option value='unused'>Unused</option>",
          "<option value='in'>In</option>",
          "<option value='out'>Out</option>",
          "<option value='void'>Void</option>",
        "</select>",
      "</div>",
      "<div style='display:flex;align-items:center;gap:8px'>",
        "<button id='tix-refresh' class='btn'>Refresh</button>",
        "<span id='tix-pageinfo' class='muted' style='margin-left:8px'></span>",
      "</div>",
    "</div>",
    "<div id='tix-list' class='muted' style='margin-top:8px'>No results yet.</div>",
    "<div style='display:flex;gap:8px;margin-top:8px'>",
      "<button id='tix-prev' class='btn outline'>Prev</button>",
      "<button id='tix-next' class='btn outline'>Next</button>",
    "</div>"
  ].join("");
  tools.appendChild(listBox);

  async function loadSum(){
    const id = Number(sel.value||0);
    const j = await fetch("/api/admin/tickets/summary?event_id="+id, { credentials:'include' })
      .then(r=>r.json()).catch(()=>({ok:false}));
    if (!j.ok){ box.innerHTML = "<div class='muted'>Kon nie laai nie</div>"; return; }

    const arr = j.summary || [];
    let sold=0, unused=0, inside=0, outside=0, voided=0;
    arr.forEach(r=>{
      const t = Number(r.total||0);
      const u = Number(r.unused||0);
      const i = Number(r.inside||0);
      const o = Number(r.outside||0);
      const v = Number(r.voided||0);
      sold += t; unused += u; inside += i; outside += o; voided += v;
    });

    const rows = arr.map(r=>(
      "<tr>"
      +"<td>"+esc(r.name||"—")+"</td>"
      +"<td class='num'>"+String(r.total||0)+"</td>"
      +"<td class='num'>"+String(r.unused||0)+"</td>"
      +"<td class='num'>"+String(r.inside||0)+"</td>"
      +"<td class='num'>"+String(r.outside||0)+"</td>"
      +"<td class='num'>"+String(r.voided||0)+"</td>"
      +"</tr>"
    )).join("");

    box.innerHTML = [
      "<div style='display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px'>",
        "<span class='pill'>Sold: "+sold+"</span>",
        "<span class='pill'>Unused: "+unused+"</span>",
        "<span class='pill'>In: "+inside+"</span>",
        "<span class='pill'>Out: "+outside+"</span>",
        "<span class='pill'>Void: "+voided+"</span>",
      "</div>",
      "<table class='tickets-sum'>",
      "<thead><tr><th>Ticket Type</th><th class='num'>Total</th><th class='num'>Unused</th><th class='num'>In</th><th class='num'>Out</th><th class='num'>Void</th></tr></thead>",
      "<tbody>", rows || "<tr><td colspan='6' class='muted'>No data</td></tr>", "</tbody>",
      "</table>"
    ].join("");
  }

  // ------- Lookup logic -------
  async function doLookup(){
    const code = String(document.getElementById("tix-lookup-code").value||"").trim();
    const res = document.getElementById("tix-lookup-res");
    if (!code){ res.textContent = "Voer 'n bestel-kode in."; return; }
    res.textContent = "Loading…";
    const j = await fetch("/api/admin/orders/by-code/"+encodeURIComponent(code), { credentials:'include' })
      .then(r=>r.json()).catch(()=>({ok:false}));
    if (!j.ok){
      res.textContent = "Nie gevind nie.";
      return;
    }
    const o = j.order || {};
    const t = j.tickets || [];
    res.innerHTML = [
      "<div><b>Order</b> ",
      esc(o.short_code||""), " · ", esc(o.buyer_name||""), " · ", esc(o.buyer_phone||""), "</div>",
      "<table class='tickets-list' style='margin-top:6px'>",
      "<thead><tr><th>ID</th><th>QR</th><th>Type</th><th>Name</th><th>Phone</th><th>State</th></tr></thead>",
      "<tbody>",
      t.map(r=>("<tr>"
        +"<td class='compact'>"+r.id+"</td>"
        +"<td class='compact'>"+esc(r.qr||"")+"</td>"
        +"<td>"+esc(r.type_name||"")+"</td>"
        +"<td>"+esc(((r.attendee_first||'')+' '+(r.attendee_last||'')).trim())+"</td>"
        +"<td class='compact'>"+esc(r.phone||"")+"</td>"
        +"<td class='state'>"+esc(r.state||"")+"</td>"
      +"</tr>")).join("") || "<tr><td colspan='6' class='muted'>Geen kaartjies</td></tr>",
      "</tbody></table>"
    ].join("");
  }

  document.getElementById("tix-lookup-btn").onclick = doLookup;

  // ------- Tickets list logic -------
  let listOffset = 0, listTotal = 0, listLimit = 50;

  async function loadList(newOffset){
    if (typeof newOffset === "number") listOffset = Math.max(0, newOffset);
    const q = String(document.getElementById("tix-q").value||"").trim();
    const st = String(document.getElementById("tix-state").value||"").trim();
    const eid = Number(sel.value||0);
    const url = new URL("/api/admin/tickets/list", location.origin);
    url.searchParams.set("event_id", eid);
    url.searchParams.set("limit", String(listLimit));
    url.searchParams.set("offset", String(listOffset));
    if (q)  url.searchParams.set("q", q);
    if (st) url.searchParams.set("state", st);

    const boxList = document.getElementById("tix-list");
    boxList.textContent = "Loading…";
    const j = await fetch(url, { credentials:'include' }).then(r=>r.json()).catch(()=>({ok:false}));
    if (!j.ok){ boxList.textContent = "Kon nie laai nie."; return; }

    listTotal = Number(j.total||0);
    listLimit = Number(j.limit||50);
    listOffset = Number(j.offset||0);

    const rows = (j.tickets||[]).map(r=>(
      "<tr>"
        +"<td class='compact'>"+r.id+"</td>"
        +"<td class='compact'>"+esc(r.qr||"")+"</td>"
        +"<td>"+esc(r.type_name||"")+"</td>"
        +"<td>"+esc(((r.attendee_first||'')+' '+(r.attendee_last||'')).trim())+"</td>"
        +"<td class='compact'>"+esc(r.phone||"")+"</td>"
        +"<td class='state'>"+esc(r.state||"")+"</td>"
        +"<td class='compact'>"+esc(r.short_code||"")+"</td>"
        +"<td>"+esc(r.buyer_name||"")+"</td>"
      +"</tr>"
    )).join("");

    boxList.innerHTML = [
      "<table class='tickets-list'>",
        "<thead><tr>",
          "<th>ID</th><th>QR</th><th>Type</th><th>Name</th><th>Phone</th><th>State</th><th>Order</th><th>Buyer</th>",
        "</tr></thead>",
        "<tbody>", rows || "<tr><td colspan='8' class='muted'>No results</td></tr>", "</tbody>",
      "</table>"
    ].join("");

    // Paging UI
    const info = document.getElementById("tix-pageinfo");
    const start = listTotal ? (listOffset+1) : 0;
    const end = Math.min(listOffset + listLimit, listTotal);
    info.textContent = listTotal ? (start+"–"+end+" van "+listTotal) : "0";

    const prevBtn = document.getElementById("tix-prev");
    const nextBtn = document.getElementById("tix-next");
    prevBtn.disabled = listOffset <= 0;
    nextBtn.disabled = (listOffset + listLimit) >= listTotal;
  }

  document.getElementById("tix-refresh").onclick = ()=>loadList(0);
  document.getElementById("tix-prev").onclick    = ()=>loadList(Math.max(0, listOffset - listLimit));
  document.getElementById("tix-next").onclick    = ()=>loadList(listOffset + listLimit);

  sel.onchange = ()=>{ loadSum(); loadList(0); };

  // initial load
  loadSum();
  loadList(0);
};
`;
