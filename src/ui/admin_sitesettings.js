// /src/ui/admin_sitesettings.js
export const adminSiteSettingsJS = (() => {
/* global $, esc */

// ---- API endpoints used by this panel (adjust here if your routes differ)
const API = {
  settings_get:  "/api/admin/settings",
  settings_set:  "/api/admin/settings/update",
  wa_list:       "/api/admin/wa/templates",
  wa_sync:       "/api/admin/wa/templates/sync",
  wa_create:     "/api/admin/wa/templates/create",
};

// Fallback reader: return first non-empty among the provided keys
const getAny = (obj, keys, def="") => {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).length) return v;
  }
  return def;
};

// Build the whole panel
async function render() {
  const host = document.getElementById("panel-settings");
  host.innerHTML = `<h2>Site Settings</h2><div class="muted">Loading…</div>`;

  // 1) Load settings + templates (in parallel)
  const [sRes, tRes] = await Promise.allSettled([
    fetch(API.settings_get).then(r => r.json()),
    fetch(API.wa_list).then(r => r.ok ? r.json() : { ok:false })
  ]);

  const S0 = (sRes.status === "fulfilled" && sRes.value?.ok) ? (sRes.value.settings || {}) : {};
  const T0 = (tRes.status === "fulfilled" && tRes.value?.ok) ? (tRes.value.templates || []) : [];

  // Map settings with fallbacks (handles previously saved/truncated keys)
  const S = {
    // General
    SITE_NAME:      getAny(S0, ["SITE_NAME"], ""),
    SITE_LOGO_URL:  getAny(S0, ["SITE_LOGO_URL"], ""),
    PUBLIC_BASE_URL:getAny(S0, ["PUBLIC_BASE_URL","site.PUBLIC_BASE_URL"], ""),

    // WhatsApp (DB may store WA_* but /api/admin/settings already maps; still keep fallbacks)
    WHATSAPP_TOKEN: getAny(S0, ["WHATSAPP_TOKEN","WA_TOKEN"], ""),
    PHONE_NUMBER_ID:getAny(S0, ["PHONE_NUMBER_ID","WA_PHONE_NUMBER_ID"], ""),
    BUSINESS_ID:    getAny(S0, ["BUSINESS_ID","WA_BUSINESS_ID"], ""),
    VERIFY_TOKEN:   getAny(S0, ["VERIFY_TOKEN"], ""),

    // Yoco
    YOCO_MODE:              getAny(S0, ["YOCO_MODE"], "sandbox"),
    YOCO_TEST_PUBLIC_KEY:   getAny(S0, ["YOCO_TEST_PUBLIC_KEY","YOCO_TEST_PUBLIC_K"], ""),
    YOCO_TEST_SECRET_KEY:   getAny(S0, ["YOCO_TEST_SECRET_KEY","YOCO_TEST_SECRET_K"], ""),
    YOCO_LIVE_PUBLIC_KEY:   getAny(S0, ["YOCO_LIVE_PUBLIC_KEY","YOCO_LIVE_PUBLIC_K"], ""),
    YOCO_LIVE_SECRET_KEY:   getAny(S0, ["YOCO_LIVE_SECRET_KEY","YOCO_LIVE_SECRET_K"], ""),
  };

  const callbackUrl = (S.PUBLIC_BASE_URL || location.origin) + "/api/admin/yoco/oauth/callback";

  host.innerHTML = `
    <h2>Site Settings</h2>

    <div class="tabs" id="site-subtabs" style="margin-top:0">
      <div class="tab active" data-sub="general">General</div>
      <div class="tab" data-sub="whatsapp">WhatsApp</div>
      <div class="tab" data-sub="yoco">Yoco</div>
    </div>

    <!-- General -->
    <div id="site-general">
      <div class="row">
        <div>
          <label>Site Name</label>
          <input id="SITE_NAME" value="${esc(S.SITE_NAME)}"/>
        </div>
        <div>
          <label>Logo URL</label>
          <input id="SITE_LOGO_URL" value="${esc(S.SITE_LOGO_URL)}"/>
        </div>
      </div>
      <div style="margin-top:10px">
        <button class="btn primary" id="saveGeneral">Save General</button>
      </div>
      <hr style="margin:16px 0"/>
    </div>

    <!-- WhatsApp -->
    <div id="site-whatsapp" class="hide">
      <div class="row">
        <div>
          <label>WHATSAPP_TOKEN</label>
          <input id="WHATSAPP_TOKEN" value="${esc(S.WHATSAPP_TOKEN)}"/>
        </div>
        <div>
          <label>VERIFY_TOKEN</label>
          <input id="VERIFY_TOKEN" value="${esc(S.VERIFY_TOKEN)}"/>
        </div>
      </div>
      <div class="row">
        <div>
          <label>PHONE_NUMBER_ID</label>
          <input id="PHONE_NUMBER_ID" value="${esc(S.PHONE_NUMBER_ID)}"/>
        </div>
        <div>
          <label>BUSINESS_ID</label>
          <input id="BUSINESS_ID" value="${esc(S.BUSINESS_ID)}"/>
        </div>
      </div>
      <div class="row">
        <div>
          <label>PUBLIC_BASE_URL</label>
          <input id="PUBLIC_BASE_URL" value="${esc(S.PUBLIC_BASE_URL)}"/>
        </div>
        <div></div>
      </div>

      <div class="split" style="margin-top:10px">
        <button class="btn primary" id="saveWA">Save WhatsApp</button>
        <button class="btn" id="syncWA">Sync templates</button>
        <button class="btn" id="newWATpl">New template</button>
      </div>

      <div id="wa-templates" style="margin-top:14px"></div>
      <hr style="margin:16px 0"/>
    </div>

    <!-- Yoco -->
    <div id="site-yoco" class="hide">
      <div class="row">
        <div>
          <label>Mode</label>
          <select id="YOCO_MODE">
            <option value="sandbox" ${S.YOCO_MODE !== "live" ? "selected":""}>Sandbox</option>
            <option value="live" ${S.YOCO_MODE === "live" ? "selected":""}>Live</option>
          </select>
        </div>
        <div>
          <label>OAuth Callback URL</label>
          <input value="${esc(callbackUrl)}" readonly />
        </div>
      </div>

      <h3 style="margin:16px 0 8px">Sandbox (Test) Keys</h3>
      <div class="row">
        <div>
          <label>Test Public Key</label>
          <input id="YOCO_TEST_PUBLIC_KEY" value="${esc(S.YOCO_TEST_PUBLIC_KEY)}"/>
        </div>
        <div>
          <label>Test Secret Key</label>
          <input id="YOCO_TEST_SECRET_KEY" value="${esc(S.YOCO_TEST_SECRET_KEY)}"/>
        </div>
      </div>

      <h3 style="margin:16px 0 8px">Live Keys</h3>
      <div class="row">
        <div>
          <label>Live Public Key</label>
          <input id="YOCO_LIVE_PUBLIC_KEY" value="${esc(S.YOCO_LIVE_PUBLIC_KEY)}"/>
        </div>
        <div>
          <label>Live Secret Key</label>
          <input id="YOCO_LIVE_SECRET_KEY" value="${esc(S.YOCO_LIVE_SECRET_KEY)}"/>
        </div>
      </div>

      <div class="split" style="margin-top:10px">
        <button class="btn primary" id="saveYoco">Save Yoco</button>
      </div>
    </div>
  `;

  // Subtab logic
  const subtabs = host.querySelectorAll("#site-subtabs .tab");
  const pGeneral = document.getElementById("site-general");
  const pWA      = document.getElementById("site-whatsapp");
  const pYoco    = document.getElementById("site-yoco");

  function showSub(name){
    subtabs.forEach(x => x.classList.toggle("active", x.dataset.sub === name));
    pGeneral.classList.toggle("hide", name !== "general");
    pWA.classList.toggle("hide", name !== "whatsapp");
    pYoco.classList.toggle("hide", name !== "yoco");
  }
  subtabs.forEach(t => t.onclick = () => showSub(t.dataset.sub));
  // expose for deep-link support
  window.AdminPanels.settingsSwitch = showSub;

  // Render WhatsApp templates table
  renderTemplatesTable(T0);

  // Button handlers
  document.getElementById("saveGeneral").onclick = () => saveSettings({
    SITE_NAME:      document.getElementById("SITE_NAME").value,
    SITE_LOGO_URL:  document.getElementById("SITE_LOGO_URL").value,
  });

  document.getElementById("saveWA").onclick = () => saveSettings({
    PUBLIC_BASE_URL:  document.getElementById("PUBLIC_BASE_URL").value,
    VERIFY_TOKEN:     document.getElementById("VERIFY_TOKEN").value,
    WHATSAPP_TOKEN:   document.getElementById("WHATSAPP_TOKEN").value,
    PHONE_NUMBER_ID:  document.getElementById("PHONE_NUMBER_ID").value,
    BUSINESS_ID:      document.getElementById("BUSINESS_ID").value,
  });

  document.getElementById("syncWA").onclick = async () => {
    const r = await fetch(API.wa_sync, { method:"POST" });
    if (!r.ok) { alert("Sync failed"); return; }
    await reloadTemplates();
  };

  document.getElementById("newWATpl").onclick = async () => {
    const name = prompt("Template name (snake_case):", "");
    if (!name) return;
    const lang = prompt("Language (e.g. en_US or af):", "en_US") || "en_US";
    const category = prompt("Category (TRANSACTIONAL/MARKETING):", "TRANSACTIONAL") || "TRANSACTIONAL";
    const body = prompt("Body text (placeholders like {{1}}, {{2}} allowed):", "Hallo {{1}}, jou kaartjies is gereed.") || "";
    const p = { name, language: lang, category, body };
    const r = await fetch(API.wa_create, {
      method:"POST",
      headers:{ "content-type":"application/json" },
      body: JSON.stringify(p)
    });
    if (!r.ok) { alert("Create failed"); return; }
    await reloadTemplates();
  };

  document.getElementById("saveYoco").onclick = () => saveSettings({
    YOCO_MODE:              document.getElementById("YOCO_MODE").value,
    YOCO_TEST_PUBLIC_KEY:   document.getElementById("YOCO_TEST_PUBLIC_KEY").value,
    YOCO_TEST_SECRET_KEY:   document.getElementById("YOCO_TEST_SECRET_KEY").value,
    YOCO_LIVE_PUBLIC_KEY:   document.getElementById("YOCO_LIVE_PUBLIC_KEY").value,
    YOCO_LIVE_SECRET_KEY:   document.getElementById("YOCO_LIVE_SECRET_KEY").value,
  });

  // Helpers
  async function saveSettings(updates){
    const r = await fetch(API.settings_set, {
      method:"POST",
      headers:{ "content-type":"application/json" },
      body: JSON.stringify({ updates })
    });
    if (!r.ok) { alert("Save failed"); return; }
    alert("Saved");
  }

  async function reloadTemplates(){
    const j = await fetch(API.wa_list).then(r=>r.json()).catch(()=>({ok:false}));
    if (!j.ok) { alert("Could not load templates"); return; }
    renderTemplatesTable(j.templates || []);
  }

  function renderTemplatesTable(rows){
    const box = document.getElementById("wa-templates");
    if (!rows.length){
      box.innerHTML = `<div class="muted">No templates found.</div>`;
      return;
    }
    // Try to be resilient to schema differences
    const cols = ["name","language","category","status","id","last_synced","updated_at","created_at"];
    const head = cols.filter(c => rows.some(r => r[c] !== undefined));
    box.innerHTML = [
      `<table><thead><tr>`,
      ...head.map(h => `<th>${esc(h)}</th>`),
      `</tr></thead><tbody>`,
      ...rows.map(r => [
        `<tr>`,
        ...head.map(h => `<td>${esc(String(r[h] ?? ""))}</td>`),
        `</tr>`
      ].join("")),
      `</tbody></table>`
    ].join("");
  }
}

// Register renderer with the AdminPanels registry
window.AdminPanels.settings = render;

return ""; // module export placeholder
})();
