// --- WhatsApp Template Mappings Tab ---
const tabTplMappings = el("div", { class: "tab-content", style: "display:none;" });
tabTplMappings.innerHTML = `
  <h3>Template Mappings</h3>
  <p>Map WhatsApp template variables ({{1}}, {{2}}, etc.) to data fields or static values.</p>
  <div id="waTplMapList">Loading templates...</div>
`;
tabs["wa_tpl_mappings"] = tabTplMappings;
tabContainer.appendChild(tabTplMappings);

// Function: load and display templates with variable mapping editor
async function loadTemplateMappings() {
  const listEl = document.getElementById("waTplMapList");
  listEl.innerHTML = "<p>Loading...</p>";

  const [tplRes, mapRes] = await Promise.all([
    fetch("/api/whatsapp/templates").then(r=>r.json()).catch(()=>({})),
    fetch("/api/admin/whatsapp/mappings").then(r=>r.json()).catch(()=>({}))
  ]);

  if (!tplRes.ok) {
    listEl.innerHTML = "<p class='error'>Failed to load templates</p>";
    return;
  }

  const templates = tplRes.templates || [];
  const mappings = mapRes.ok ? mapRes.mappings || [] : [];

  const mapByKey = {};
  for (const m of mappings) mapByKey[m.template_key + ":" + m.context] = m;

  const frag = document.createElement("div");

  for (const tpl of templates) {
    const key = tpl.name + ":" + tpl.language;
    const components = JSON.parse(tpl.components_json || "[]");
    const body = components.find(c => c.type === "BODY");
    const text = body?.text || "";
    const matches = [...text.matchAll(/\{\{(\d+)\}\}/g)];
    const vars = matches.map(m => m[1]);
    const existing = Object.values(mapByKey).find(m => m.template_key === key);
    const mapObj = existing ? JSON.parse(existing.mapping_json) : { vars: [] };
    const ctx = existing ? existing.context : "";

    const item = document.createElement("div");
    item.className = "wa-tpl-map-item";
    item.style = "border:1px solid #ddd;padding:10px;margin:10px 0;border-radius:4px;";
    item.innerHTML = `
      <h4>${tpl.name} (${tpl.language})</h4>
      <label>Context:
        <select class="ctx">
          <option value="">Select context</option>
          <option value="order" ${ctx==="order"?"selected":""}>Order</option>
          <option value="ticket" ${ctx==="ticket"?"selected":""}>Ticket</option>
          <option value="visitor" ${ctx==="visitor"?"selected":""}>Visitor</option>
        </select>
      </label>
      <table class="var-table" style="margin-top:8px;width:100%;border-collapse:collapse;">
        <thead><tr><th style="text-align:left;">Variable</th><th>Source</th><th>Value</th><th>Fallback</th></tr></thead>
        <tbody>
          ${vars.map(v=>{
            const existingVar = (mapObj.vars || []).find(x => x.variable == v);
            return `
              <tr>
                <td>{{${v}}}</td>
                <td>
                  <select class="source">
                    <option value="field" ${existingVar?.source==="field"?"selected":""}>field</option>
                    <option value="static" ${existingVar?.source==="static"?"selected":""}>static</option>
                    <option value="compute" ${existingVar?.source==="compute"?"selected":""}>compute</option>
                  </select>
                </td>
                <td><input class="value" value="${existingVar?.value || ""}" placeholder="Value or field name"></td>
                <td><input class="fallback" value="${existingVar?.fallback || ""}" placeholder="Fallback (optional)"></td>
              </tr>`;
          }).join("")}
        </tbody>
      </table>
      <button class="saveBtn">💾 Save Mapping</button>
    `;
    frag.appendChild(item);

    item.querySelector(".saveBtn").addEventListener("click", async ()=>{
      const context = item.querySelector(".ctx").value.trim();
      if (!context) return alert("Please select context first");

      const rows = [...item.querySelectorAll("tbody tr")];
      const mapping = {
        vars: rows.map(r => ({
          variable: r.children[0].innerText.replace(/[{}]/g,""),
          source: r.querySelector(".source").value,
          value: r.querySelector(".value").value.trim(),
          fallback: r.querySelector(".fallback").value.trim()
        }))
      };

      const res = await fetch("/api/admin/whatsapp/mappings/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_key: key, context, mapping })
      }).then(r=>r.json()).catch(()=>({}));

      if (res.ok) alert(`Mapping saved for ${tpl.name}`);
      else alert("Save failed");
    });
  }

  listEl.innerHTML = "";
  listEl.appendChild(frag);
}

// Hook it to tab switching
addTab("wa_tpl_mappings", "Template Mappings", loadTemplateMappings);
