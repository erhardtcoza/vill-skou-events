// /src/ui/admin_vendors.js
export const adminVendorsJS = `
window.AdminPanels.vendors = async function renderVendors(){
  const el = $("panel-vendors");
  el.innerHTML = "<h2>Vendors</h2><div class='muted'>Kies 'n event om vendors te sien.</div>";

  const evs = await fetch("/api/admin/events").then(r=>r.json()).catch(()=>({ok:false,events:[]}));
  if (!evs.ok || !evs.events?.length) return;

  const picker = document.createElement("div");
  picker.style.display="flex"; picker.style.gap="8px"; picker.style.alignItems="center";
  picker.innerHTML = "<label>Event</label>";
  const sel = document.createElement("select");
  sel.innerHTML = evs.events.map(ev=>"<option value='"+ev.id+"'>"+esc(ev.name)+"</option>").join("");
  picker.appendChild(sel);
  el.appendChild(picker);

  const box = document.createElement("div");
  box.style.marginTop = "10px";
  el.appendChild(box);

  async function loadV(){
    const id = Number(sel.value||0);
    const j = await fetch("/api/admin/vendors?event_id="+id).then(r=>r.json()).catch(()=>({ok:false}));
    if (!j.ok){ box.innerHTML = "<div class='muted'>Kon nie vendors laai nie</div>"; return; }

    const rows = (j.vendors||[]).map(v=>{
      return "<tr>"
        +"<td>"+esc(v.name)+"</td>"
        +"<td>"+esc(v.contact_name||"")+" · "+esc(v.phone||"")+"</td>"
        +"<td>"+esc(v.stand_number||"")+"</td>"
        +"</tr>";
    }).join("");

    box.innerHTML = [
      "<table style='width:100%;border-collapse:collapse'>",
      "<thead><tr><th>Name</th><th>Contact</th><th>Stand</th></tr></thead>",
      "<tbody>", rows || "<tr><td colspan='3' class='muted'>No vendors</td></tr>", "</tbody>",
      "</table>"
    ].join("");
  }
  sel.onchange = loadV;
  loadV();
};
`;
