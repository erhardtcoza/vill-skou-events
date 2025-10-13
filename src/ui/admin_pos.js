// /src/ui/admin_pos.js
export const adminPOSJS = `
window.AdminPanels.pos = async function renderPOS(){
  const el = $("panel-pos");
  el.innerHTML = "<h2>POS Sessions</h2><div class='muted'>Loading…</div>";
  const j = await fetch("/api/admin/pos/sessions").then(r=>r.json()).catch(()=>({ok:false}));
  if (!j.ok){ el.innerHTML = "<div class='muted'>Kon nie laai nie</div>"; return; }

  function fmt(ts){ return ts ? new Date((Number(ts)||0)*1000).toLocaleString() : ""; }

  const rows = (j.sessions||[]).map(s=>{
    return "<tr>"
      +"<td>"+String(s.id)+"</td>"
      +"<td>"+esc(s.cashier_name||"")+"</td>"
      +"<td>"+esc(s.gate_name||s.gate||"")+"</td>"
      +"<td>"+fmt(s.opened_at)+"</td>"
      +"<td>"+fmt(s.closed_at)+"</td>"
      +"<td>"+rands(s.cash_cents||0)+"</td>"
      +"<td>"+rands(s.card_cents||0)+"</td>"
      +"<td>"+esc(s.closing_manager||s.manager_name||"")+"</td>"
      +"</tr>";
  }).join("");

  el.innerHTML = [
    "<h2>POS Sessions</h2>",
    "<table style='width:100%;border-collapse:collapse'>",
      "<thead><tr>",
        "<th>ID</th><th>Cashier</th><th>Gate</th><th>Opened</th><th>Closed</th>",
        "<th>Cash</th><th>Card</th><th>Closed by</th>",
      "</tr></thead>",
      "<tbody>", rows || "<tr><td colspan='8' class='muted'>No sessions</td></tr>", "</tbody>",
    "</table>"
  ].join("");
};
`;
