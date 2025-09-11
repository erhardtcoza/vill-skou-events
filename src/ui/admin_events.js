// /src/ui/admin_events.js
export const adminEventsJS = `
window.AdminPanels.events = async function renderEvents(){
  const el = $("panel-events");
  el.innerHTML = "<h2>Events</h2><div class='muted'>Loading events…</div>";
  const j = await fetch("/api/admin/events").then(r=>r.json()).catch(()=>({ok:false}));
  if (!j.ok){ el.innerHTML = "<div class='muted'>Failed to load events</div>"; return; }

  const rows = (j.events||[]).map(ev=>{
    const when = ev.starts_at ? new Date(ev.starts_at*1000).toLocaleDateString() : "";
    return "<tr>"
      +"<td>"+String(ev.id)+"</td>"
      +"<td>"+esc(ev.name)+"</td>"
      +"<td>"+esc(ev.slug)+"</td>"
      +"<td>"+esc(ev.venue||"")+"</td>"
      +"<td>"+when+"</td>"
      +"</tr>";
  }).join("");

  el.innerHTML = [
    "<h2>Events</h2>",
    "<table style='width:100%;border-collapse:collapse'>",
    "<thead><tr><th>ID</th><th>Name</th><th>Slug</th><th>Venue</th><th>When</th></tr></thead>",
    "<tbody>", rows || "<tr><td colspan='5' class='muted'>No events</td></tr>", "</tbody>",
    "</table>"
  ].join("");
};
`;
