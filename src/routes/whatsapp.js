// Add inside /src/routes/whatsapp.js (or a new file mounted similarly)
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

function norm(msisdn){ return String(msisdn||'').replace(/\D+/g,''); }

export function mountWhatsAppAdminExtras(router){
  const guard = (fn) => requireRole("admin", fn);

  // Inbox list
  router.add("GET", "/api/admin/whatsapp/inbox", guard(async (req, env)=>{
    const u = new URL(req.url);
    const limit = Math.min(Math.max(Number(u.searchParams.get("limit")||100),1),500);
    const rows = await env.DB.prepare(
      `SELECT id, wa_id, from_msisdn, to_msisdn, direction, body, type, received_at,
              replied_auto, replied_manual
         FROM wa_inbox
        ORDER BY received_at DESC
        LIMIT ?1`
    ).bind(limit).all();
    return json({ ok:true, inbox: rows.results||[] });
  }));

  // Reply to one inbound message (plain text)
  router.add("POST", "/api/admin/whatsapp/reply", guard(async (req, env)=>{
    let b; try{ b = await req.json(); }catch{ return bad("Bad JSON"); }
    const id = Number(b?.id||0); const text = String(b?.text||'').trim();
    if(!id || !text) return bad("id and text required");

    const row = await env.DB.prepare(`SELECT from_msisdn FROM wa_inbox WHERE id=?1`).bind(id).first();
    if(!row?.from_msisdn) return bad("Message not found", 404);

    // Try to send via service
    let svc=null; try{ svc = await import("../services/whatsapp.js"); }catch{}
    if(svc?.sendWhatsAppText){
      await svc.sendWhatsAppText(env, norm(row.from_msisdn), text);
    } else if(svc?.sendWhatsAppTextIfSession){
      await svc.sendWhatsAppTextIfSession(env, norm(row.from_msisdn), text);
    }

    await env.DB.prepare(`UPDATE wa_inbox SET replied_manual=1 WHERE id=?1`).bind(id).run();
    return json({ ok:true });
  }));

  // Delete a message
  router.add("POST", "/api/admin/whatsapp/delete", guard(async (req, env)=>{
    let b; try{ b = await req.json(); }catch{ return bad("Bad JSON"); }
    const id = Number(b?.id||0); if(!id) return bad("id required");
    await env.DB.prepare(`DELETE FROM wa_inbox WHERE id=?1`).bind(id).run();
    return json({ ok:true });
  }));

  // Send plain text
  router.add("POST", "/api/admin/whatsapp/send-text", guard(async (req, env)=>{
    let b; try{ b = await req.json(); }catch{ return bad("Bad JSON"); }
    const to = norm(b?.to||''); const text = String(b?.text||'').trim();
    if(!to || !text) return bad("to and text required");

    let svc=null; try{ svc = await import("../services/whatsapp.js"); }catch{}
    if(svc?.sendWhatsAppText){
      await svc.sendWhatsAppText(env, to, text);
    } else if(svc?.sendWhatsAppTextIfSession){
      await svc.sendWhatsAppTextIfSession(env, to, text);
    } else {
      return bad("WhatsApp service not available", 500);
    }
    return json({ ok:true });
  }));
}
