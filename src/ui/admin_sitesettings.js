// /src/ui/admin_sitesettings.js
// Export a JS source string that admin.js will inject into its <script> tag.
export const adminSiteSettingsJS = `
(function(){
  const API = {
    settings_get: "/api/admin/settings",
    settings_set: "/api/admin/settings/update",
    wa_templates: "/api/admin/whatsapp/templates",
    wa_sync: "/api/admin/whatsapp/sync",
    wa_diag: "/api/admin/whatsapp/diag"
  };

  const esc = window.esc || (s=>String(s||"").replace(/[&<>"]/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c])));
  const $  = window.$;

  function el(html){
    const d = document.createElement("div");
    d.innerHTML = html.trim();
    return d.firstElementChild;
  }

  function pills(){ return \`<span class="pill" style="display:inline-block;padding:4px 8px;border:1px solid #e5e7eb;border-radius:999px;font-size:12px;color:#444"></span>\`; }

  function subTabsHTML(active){
    return [
      "<div class='tabs' style='gap:8px;margin:0 0 12px'>",
        "<button class='tab", (active==="gen"?" active":""), "' data-sub='gen'>General</button>",
        "<button class='tab", (active==="wa" ?" active":""), "' data-sub='wa'>WhatsApp</button>",
        "<button class='tab", (active==="yoco"?" active":""), "' data-sub='yoco'>Yoco</button>",
      "</div>"
    ].join("");
  }

  function panelHTML(){
    return [
      "<style>",
      ".tab{padding:8px 12px;border:1px solid #e5e7eb;border-radius:999px;background:#fff;cursor:pointer}",
      ".tab.active{background:#0a7d2b;color:#fff;border-color:transparent}",
      ".row{display:grid;grid-template-columns:1fr 1fr;gap:12px}",
      "@media (max-width:900px){.row{grid-template-columns:1fr}}",
      "label{display:block;font-size:13px;color:#444;margin:8px 0 6px}",
      "input,select,textarea{width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px;font:inherit;background:#fff}",
      ".split{display:flex;gap:10px;align-items:center;flex-wrap:wrap}",
      ".pill{display:inline-block;font-size:12px;padding:4px 8px;border-radius:999px;border:1px solid #e5e7eb;color:#444}",
      ".hide{display:none}",
      "</style>",

      subTabsHTML("gen"),

      "<div id='settings-gen'>",
        "<div class='row'>",
          "<div><label>Site Name</label><input id='SITE_NAME'></div>",
          "<div><label>Logo URL</label><input id='SITE_LOGO_URL'></div>",
        "</div>",
        "<div class='row'>",
          "<div><label>Public Base URL (https)</label><input id='PUBLIC_BASE_URL' placeholder='https://tickets.example.com'></div>",
          "<div><label>VERIFY_TOKEN (Webhook verify)</label><input id='VERIFY_TOKEN' placeholder='vs-verify-2025'></div>",
        "</div>",
        "<div class='split' style='margin-top:10px'><button class='btn primary' id='saveGen'>Save General</button><span id='msgGen' class='muted'></span></div>",
        "<hr style='margin:16px 0'/>",
      "</div>",

      "<div id='settings-wa' class='hide'>",
        "<h3>WhatsApp Settings</h3>",
        "<div class='row'>",
          "<div><label>Access Token</label><input id='WHATSAPP_TOKEN'></div>",
          "<div><label>Phone Number ID</label><input id='PHONE_NUMBER_ID'></div>",
        "</div>",
        "<div class='row'>",
          "<div><label>Business (WABA) ID</label><input id='BUSINESS_ID'></div>",
          "<div></div>",
        "</div>",

        "<h4 style='margin-top:14px'>Template selectors</h4>",
        "<div class='row'>",
          "<div><label>Order confirmation</label><select id='WA_TMP_ORDER_CONFIRM'></select></div>",
          "<div><label>Payment confirmation</label><select id='WA_TMP_PAYMENT_CONFIRM'></select></div>",
        "</div>",
        "<div class='row'>",
          "<div><label>Ticket delivery</label><select id='WA_TMP_TICKET_DELIVERY'></select></div>",
          "<div><label>Skou reminders</label><select id='WA_TMP_SKOU_SALES'></select></div>",
        "</div>",
        "<div class='split' style='margin-top:10px'>",
          "<button class='btn primary' id='saveWA'>Save WhatsApp</button>",
          "<button class='btn' id='syncWA'>Sync templates</button>",
          "<span id='msgWA' class='muted'></span>",
        "</div>",
        "<h3 style='margin-top:16px'>Templates</h3>",
        "<div id='waTable' class='muted'>Loading templates…</div>",
        "<hr style='margin:16px 0'/>",
      "</div>",

      "<div id='settings-yoco' class='hide'>",
        "<div class='row'>",
          "<div>",
            "<label>Mode</label>",
            "<select id='YOCO_MODE'>",
              "<option value='sandbox'>Sandbox</option>",
              "<option value='live'>Live</option>",
            "</select>",
          "</div>",
          "<div></div>",
        "</div>",
        "<div class='row'>",
          "<div><label>Sandbox (Test) Public Key</label><input id='YOCO_TEST_PUBLIC_KEY'></div>",
          "<div><label>Sandbox (Test) Secret Key</label><input id='YOCO_TEST_SECRET_KEY'></div>",
        "</div>",
        "<div class='row'>",
          "<div><label>Live Public Key</label><input id='YOCO_LIVE_PUBLIC_KEY'></div>",
          "<div><label>Live Secret Key</label><input id='YOCO_LIVE_SECRET_KEY'></div>",
        "</div>",
        "<div class='split' style='margin-top:10px'><button class='btn primary' id='saveYoco'>Save Yoco</button><span id='msgYoco' class='muted'></span></div>",
      "</div>"
    ].join("");
  }

  async function saveSettings(updates, msgEl){
    if (msgEl) msgEl.textContent = "Saving…";
    const r = await fetch(API.settings_set, {
      method:"POST",
      headers:{ "content-type":"application/json" },
      body: JSON.stringify({ updates })
    });
    const j = await r.json().catch(()=>({ok:false}));
    if (msgEl) msgEl.textContent = j.ok ? "Saved." : "Failed.";
    if (!j.ok) alert("Save failed");
  }

  function fillSelectors(templates){
    const opts = ["<option value=''>—</option>"]
      .concat((templates||[]).map(t=>\`<option value="\${esc(t.name)}:\${esc(t.language)}">\${esc(t.name)} (\${esc((t.language||'').replace('_','-'))})</option>\`))
      .join("");
    ["WA_TMP_ORDER_CONFIRM","WA_TMP_PAYMENT_CONFIRM","WA_TMP_TICKET_DELIVERY","WA_TMP_SKOU_SALES"].forEach(id=>{
      const sel = document.getElementById(id);
      const prev = sel?.dataset?.value || "";
      if (sel){ sel.innerHTML = opts; if (prev) sel.value = prev; }
    });
  }

  async function loadTemplates(){
    const box = document.getElementById("waTable");
    if (!box) return;
    box.textContent = "Loading templates…";
    const r = await fetch(API.wa_templates).catch(()=>null);
    const j = r ? await r.json().catch(()=>({ok:false})) : {ok:false};
    if (!j.ok){ box.textContent = "Failed to load."; return; }
    const rows = j.templates || [];
    fillSelectors(rows);
    if (!rows.length){ box.textContent = "No templates in database."; return; }
    box.innerHTML = [
      "<table><thead><tr><th>Name</th><th>Language</th><th>Status</th><th>Category</th></tr></thead><tbody>",
      ...rows.map(t=>[
        "<tr>",
          "<td>", esc(t.name), "</td>",
          "<td><span class='pill'>", esc(t.language||""), "</span></td>",
          "<td>", esc(t.status||""), "</td>",
          "<td>", esc(t.category||""), "</td>",
        "</tr>"
      ].join("")),
      "</tbody></table>"
    ].join("");
  }

  // Render function the admin shell calls when "Site Settings" tab is selected
  window.AdminPanels.settings = async function(){
    const host = document.getElementById("panel-settings");
    if (!host) return;
    host.innerHTML = panelHTML();

    // Sub-tab wiring
    const subBtns = host.querySelectorAll(".tabs .tab");
    const gen = host.querySelector("#settings-gen");
    const wa  = host.querySelector("#settings-wa");
    const yo  = host.querySelector("#settings-yoco");
    function show(which){
      subBtns.forEach(b=>b.classList.toggle("active", b.dataset.sub===which));
      gen.classList.toggle("hide", which!=="gen");
      wa .classList.toggle("hide", which!=="wa");
      yo .classList.toggle("hide", which!=="yoco");
    }
    subBtns.forEach(b=> b.onclick = ()=> show(b.dataset.sub));

    // Save handlers
    host.querySelector("#saveGen").onclick = ()=> saveSettings({
      SITE_NAME:        host.querySelector("#SITE_NAME").value,
      SITE_LOGO_URL:    host.querySelector("#SITE_LOGO_URL").value,
      PUBLIC_BASE_URL:  host.querySelector("#PUBLIC_BASE_URL").value,
      VERIFY_TOKEN:     host.querySelector("#VERIFY_TOKEN").value
    }, host.querySelector("#msgGen"));

    host.querySelector("#saveYoco").onclick = ()=> saveSettings({
      YOCO_MODE:              host.querySelector("#YOCO_MODE").value,
      YOCO_TEST_PUBLIC_KEY:   host.querySelector("#YOCO_TEST_PUBLIC_KEY").value,
      YOCO_TEST_SECRET_KEY:   host.querySelector("#YOCO_TEST_SECRET_KEY").value,
      YOCO_LIVE_PUBLIC_KEY:   host.querySelector("#YOCO_LIVE_PUBLIC_KEY").value,
      YOCO_LIVE_SECRET_KEY:   host.querySelector("#YOCO_LIVE_SECRET_KEY").value
    }, host.querySelector("#msgYoco"));

    host.querySelector("#saveWA").onclick = ()=> saveSettings({
      WHATSAPP_TOKEN:         host.querySelector("#WHATSAPP_TOKEN").value,
      PHONE_NUMBER_ID:        host.querySelector("#PHONE_NUMBER_ID").value,
      BUSINESS_ID:            host.querySelector("#BUSINESS_ID").value,
      WA_TMP_ORDER_CONFIRM:   host.querySelector("#WA_TMP_ORDER_CONFIRM").value,
      WA_TMP_PAYMENT_CONFIRM: host.querySelector("#WA_TMP_PAYMENT_CONFIRM").value,
      WA_TMP_TICKET_DELIVERY: host.querySelector("#WA_TMP_TICKET_DELIVERY").value,
      WA_TMP_SKOU_SALES:      host.querySelector("#WA_TMP_SKOU_SALES").value
    }, host.querySelector("#msgWA"));

    host.querySelector("#syncWA").onclick = async ()=>{
      host.querySelector("#msgWA").textContent = "Syncing…";
      const r = await fetch(API.wa_sync, { method:"POST" }).catch(()=>null);
      const j = r ? await r.json().catch(()=>({ok:false})) : {ok:false};
      if (!j.ok){
        const dR = await fetch(API.wa_diag).catch(()=>null);
        const d  = dR ? await dR.json().catch(()=>({})) : {};
        const extra = d?.metaError?.message || d?.error || "";
        alert("Sync failed: " + (j.error||"unknown") + (extra?("\\n"+extra):""));
      } else {
        alert("Templates synced. Added/updated: " + (j.fetched||0) + " · In DB: " + (j.total||0));
      }
      host.querySelector("#msgWA").textContent = "";
      loadTemplates();
    };

    // Load settings values
    const r = await fetch(API.settings_get).catch(()=>null);
    const j = r ? await r.json().catch(()=>({ok:false})) : {ok:false};
    const s = j.ok ? (j.settings||{}) : {};

    // Populate fields
    ["SITE_NAME","SITE_LOGO_URL","PUBLIC_BASE_URL","VERIFY_TOKEN"].forEach(k=>{
      const n = host.querySelector("#"+k); if (n && s[k]!=null) n.value = s[k];
    });

    host.querySelector("#WHATSAPP_TOKEN").value  = s.WHATSAPP_TOKEN || "";
    host.querySelector("#PHONE_NUMBER_ID").value = s.PHONE_NUMBER_ID || "";
    host.querySelector("#BUSINESS_ID").value     = s.BUSINESS_ID || "";

    ["WA_TMP_ORDER_CONFIRM","WA_TMP_PAYMENT_CONFIRM","WA_TMP_TICKET_DELIVERY","WA_TMP_SKOU_SALES"].forEach(id=>{
      const n = host.querySelector("#"+id);
      if (n) n.dataset.value = s[id] || "";
    });

    host.querySelector("#YOCO_MODE").value             = (s.YOCO_MODE||"sandbox").toLowerCase();
    host.querySelector("#YOCO_TEST_PUBLIC_KEY").value  = s.YOCO_TEST_PUBLIC_KEY || "";
    host.querySelector("#YOCO_TEST_SECRET_KEY").value  = s.YOCO_TEST_SECRET_KEY || "";
    host.querySelector("#YOCO_LIVE_PUBLIC_KEY").value  = s.YOCO_LIVE_PUBLIC_KEY || "";
    host.querySelector("#YOCO_LIVE_SECRET_KEY").value  = s.YOCO_LIVE_SECRET_KEY || "";

    // Default visible sub-panel + templates
    show("gen");
    loadTemplates();
  };

  // Allow deep-link like #settings:wa or programmatic switch from admin.js
  window.AdminPanels.settingsSwitch = function(sub){
    const host = document.getElementById("panel-settings");
    if (!host) return;
    const tab = host.querySelector(\`.tabs .tab[data-sub="\${sub}"]\`);
    if (tab) tab.click();
  };
})();`;

export default adminSiteSettingsJS;
