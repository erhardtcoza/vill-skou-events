// /src/routes/vendor_portal.js
import { json, bad } from "../utils/http.js";

function now(){ return Math.floor(Date.now()/1000); }

export function mountVendorPortal(router) {
  // Public: fetch vendor & existing profile by token
  router.add("GET", "/api/vendor/:token", async (_req, env, _ctx, { token }) => {
    const v = await env.DB.prepare(
      `SELECT id, name, event_id, portal_status, profile_json, assigned_json
         FROM vendors WHERE portal_token=?1 LIMIT 1`
    ).bind(String(token)).first();
    if (!v) return bad(404, "not_found");
    let profile=null, assigned=null;
    try { profile = v.profile_json ? JSON.parse(v.profile_json) : null; } catch {}
    try { assigned = v.assigned_json ? JSON.parse(v.assigned_json) : null; } catch {}
    return json({ ok:true, vendor:{ id:v.id, name:v.name, event_id:v.event_id, portal_status:v.portal_status }, profile, assigned });
  });

  // Public: submit/update profile by token
  router.add("POST", "/api/vendor/:token/submit", async (req, env, _ctx, { token }) => {
    let b; try { b = await req.json(); } catch { return bad(400, "bad_json"); }
    const v = await env.DB.prepare(
      `SELECT id FROM vendors WHERE portal_token=?1 LIMIT 1`
    ).bind(String(token)).first();
    if (!v) return bad(404, "not_found");

    await env.DB.prepare(
      `UPDATE vendors SET profile_json=?1, portal_status='submitted' WHERE id=?2`
    ).bind(JSON.stringify(b||{}), Number(v.id)).run();

    return json({ ok:true });
  });

  // Public page: form shell
  router.add("GET", "/vendor/:token", async (_req, env, _ctx, { token }) => {
    const js = await (await import("../ui/vendor_portal.js")).vendorPortalJS;
    const html = `<!doctype html><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Vendor Portal</title>
<link rel="icon" href="data:,">
<style>body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;background:#f7f7f8;color:#111}
.wrap{max-width:880px;margin:18px auto;padding:0 14px}
.card{background:#fff;border-radius:14px;box-shadow:0 12px 26px rgba(0,0,0,.08);padding:18px}
</style>
<div class="wrap"><div id="app" class="card"></div></div>
<script>window.__VENDOR_TOKEN__=${JSON.stringify(token)};</script>
<script type="module">
${js}
window.renderVendorPortal(document.getElementById('app'), window.__VENDOR_TOKEN__);
</script>`;
    return new Response(html, { headers: { "content-type":"text/html; charset=utf-8" }});
  });

  // Public page: final pack
  router.add("GET", "/vendor/:token/pack", async (_req, env, _ctx, { token }) => {
    const js = await (await import("../ui/vendor_pack.js")).vendorPackJS;
    const html = `<!doctype html><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Vendor Pack</title>
<link rel="icon" href="data:,">
<style>body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;background:#f7f7f8;color:#111}
.wrap{max-width:880px;margin:18px auto;padding:0 14px}
.card{background:#fff;border-radius:14px;box-shadow:0 12px 26px rgba(0,0,0,.08);padding:18px}
</style>
<div class="wrap"><div id="pack" class="card"></div></div>
<script>window.__VENDOR_TOKEN__=${JSON.stringify(token)};</script>
<script type="module">
${js}
window.renderVendorPack(document.getElementById('pack'), window.__VENDOR_TOKEN__);
</script>`;
    return new Response(html, { headers: { "content-type":"text/html; charset=utf-8" }});
  });
}
