// /src/ui/admin_tickets.js
export const adminTicketsJS = `
window.AdminPanels.tickets = async function renderTickets(){
  const el = $("panel-tickets");
  el.innerHTML = "<h2>Tickets</h2><div class='muted'>Kies 'n event om opsomming te sien.</div>";

  const evs = await fetch("/api/admin/events").then(r=>r.json()).catch(()=>({ok:false,events:[]}));
  if (!evs.ok || !evs.events?.length) return;

  const picker = document.createElement("div");
  picker.style.display = "flex"; picker.style.gap = "8px"; picker.style.alignItems = "center";
  picker.innerHTML = "<label>Event</label>";
  const sel = document.createElement("select");
  sel.innerHTML = evs.events.map(ev=>"<option value='"+ev.id+"'>"+esc(ev.name)+"</option>").join("");
  picker.appendChild(sel);
  el.appendChild(picker);

  const box = document.createElement("div");
  box.style.marginTop = "10px";
  el.appendChild(box);

  async function loadSum(){
    const id = Number(sel.value||0);
    const j = await fetch("/api/admin/tickets/summary?event_id="+id).then(r=>r.json()).catch(()=>({ok:false}));
    if (!j.ok){ box.innerHTML = "<div class='muted'>Kon nie laai nie</div>"; return; }

    // j.summary is an array per ticket_type with totals; also show a quick grand summary
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
      +"<td>"+String(r.total||0)+"</td>"
      +"<td>"+String(r.unused||0)+"</td>"
      +"<td>"+String(r.inside||0)+"</td>"
      +"<td>"+String(r.outside||0)+"</td>"
      +"<td>"+String(r.voided||0)+"</td>"
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
      "<table style='width:100%;border-collapse:collapse'>",
      "<thead><tr><th>Ticket Type</th><th>Total</th><th>Unused</th><th>In</th><th>Out</th><th>Void</th></tr></thead>",
      "<tbody>", rows || "<tr><td colspan='6' class='muted'>No data</td></tr>", "</tbody>",
      "</table>"
    ].join("");
  }
  sel.onchange = loadSum;
  loadSum();
};
`;
