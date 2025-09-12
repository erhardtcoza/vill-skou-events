// /src/routes/scan.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

/** Scanner endpoints: gates + scan/in-out toggle with validations */
export function mountScan(router) {
  const guard = (fn) => requireRole("scan", fn);

  /* ------------ helpers ------------ */

  function parseCookies(req) {
    const raw = req.headers.get("cookie") || "";
    const out = {};
    raw.split(";").forEach(part => {
      const i = part.indexOf("=");
      if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1));
    });
    return out;
  }

  function setCookie(headers, name, value, maxAgeSec = 60 * 60 * 24 * 90) {
    const attrs = [
      `${name}=${encodeURIComponent(value)}`,
      "Path=/",
      "SameSite=Lax",
      "Secure",
      `Max-Age=${maxAgeSec}`,
    ];
    headers.append("Set-Cookie", attrs.join("; "));
  }

  async function colExists(env, table, col) {
    try {
      const q = await env.DB.prepare(`PRAGMA table_info(${table})`).all();
      return (q.results || []).some(r => r.name === col);
    } catch { return false; }
  }

  /* ------------ gates ------------ */

  // Returns: { ok:true, events:[...], gates:[{id,name(,event_id?)}] }
  router.add("GET", "/api/scan/gates", guard(async (_req, env) => {
    const evQ = await env.DB.prepare(
      `SELECT id, name, slug, starts_at, ends_at
         FROM events
        WHERE status='active'
        ORDER BY starts_at ASC`
    ).all();

    const events = (evQ.results || []).map(e => ({
      id: e.id, name: e.name, slug: e.slug,
      starts_at: e.starts_at, ends_at: e.ends_at
    }));

    const hasEventId = await colExists(env, "gates", "event_id");
    let gates = [];
    if (hasEventId) {
      const gQ = await env.DB.prepare(`SELECT id, name, event_id FROM gates ORDER BY name ASC`).all();
      gates = (gQ.results || []);
    } else {
      const gQ = await env.DB.prepare(`SELECT id, name FROM gates ORDER BY name ASC`).all();
      gates = (gQ.results || []).map(g => ({ ...g, event_id: null }));
    }

    return json({ ok: true, events, gates });
  }));

  // Persist a chosen gate on the device (cookie)
  router.add("POST", "/api/scan/select-gate", guard(async (req, _env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const gate_id = Number(b?.gate_id || 0);
    if (!gate_id) return bad("gate_id required");
    const headers = new Headers({ "content-type": "application/json" });
    setCookie(headers, "scan_gate", String(gate_id));
    return new Response(JSON.stringify({ ok: true, gate_id }), { headers });
  }));

  // Read current selected gate (from cookie)
  router.add("GET", "/api/scan/status", guard(async (req, env) => {
    const gid = Number(parseCookies(req).scan_gate || 0);
    let gate = null;
    if (gid) gate = await env.DB.prepare(`SELECT id, name FROM gates WHERE id=?1`).bind(gid).first();
    return json({ ok: true, gate: gate || null });
  }));

  /* ------------ scan (toggle in/out) ------------ */
  // Body: { code, gate_id?, gender? }
  router.add("POST", "/api/scan/scan", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const code   = String(b?.code || "").trim().toUpperCase();
    const gateId = Number(b?.gate_id || 0) || null;
    const genderIn = (b?.gender ? String(b.gender).toLowerCase() : null);

    if (!code) return bad("code required");

    // Lookup ticket (+ order, type, event)
    const t = await env.DB.prepare(
      `SELECT
         t.id, t.qr, t.state, t.attendee_first, t.attendee_last, t.gender, t.phone,
         t.order_id, t.event_id, t.ticket_type_id, t.first_in_at, t.last_out_at,
         o.status AS order_status,
         e.starts_at, e.ends_at, e.name AS event_name,
         tt.name AS type_name, tt.requires_gender
       FROM tickets t
       JOIN orders o      ON o.id = t.order_id
       JOIN events e      ON e.id = t.event_id
       JOIN ticket_types tt ON tt.id = t.ticket_type_id
      WHERE UPPER(t.qr) = ?1
      LIMIT 1`
    ).bind(code).first();

    if (!t) {
      return json({
        ok:false, error:"Kode ongeldig.", reason:"not_found",
        flash:"red", haptic:"triple"
      }, 404);
    }

    // Must be paid
    if (String(t.order_status||"").toLowerCase() !== "paid") {
      return json({
        ok:false, error:"Betaling nie ontvang nie.", reason:"unpaid",
        flash:"red", haptic:"triple"
      }, 400);
    }

    // Event window (±1 day tolerance)
    const now = Math.floor(Date.now()/1000);
    if (t.starts_at && now < Number(t.starts_at) - 86400) {
      return json({ ok:false, error:"Verkeerde datum (te vroeg).", reason:"wrong_date", flash:"red", haptic:"triple" }, 400);
    }
    if (t.ends_at && now > Number(t.ends_at) + 86400) {
      return json({ ok:false, error:"Verkeerde datum (verby).", reason:"wrong_date", flash:"red", haptic:"triple" }, 400);
    }

    // Void?
    if (t.state === "void") {
      return json({ ok:false, error:"Kaartjie is ongeldig/void.", reason:"void", flash:"red", haptic:"triple" }, 400);
    }

    // Gender requirement flow (ask only once)
    const requiresGender = Number(t.requires_gender || 0) === 1;
    const hasGender = !!(t.gender && String(t.gender).trim());
    if (requiresGender && !hasGender && !genderIn) {
      return json({
        ok:true, action:"pending", need_gender:true,
        ticket:{
          id: t.id, qr: t.qr,
          name: (t.attendee_first||"") + " " + (t.attendee_last||""),
          type: t.type_name, phone: t.phone || ""
        }
      });
    }
    if (requiresGender && !hasGender && genderIn) {
      await env.DB.prepare(`UPDATE tickets SET gender=?2 WHERE id=?1`).bind(t.id, genderIn).run();
      t.gender = genderIn;
    }

    // Toggle: IN if unused/out; OUT if already in
    const newState = (t.state === "in") ? "out" : "in";
    const action   = (newState === "in") ? "in"  : "out";
    const ts = Math.floor(Date.now()/1000);

    await env.DB.prepare(
      `UPDATE tickets
          SET state=?2,
              first_in_at = COALESCE(first_in_at, CASE WHEN ?2='in' THEN ?3 ELSE first_in_at END),
              last_out_at = CASE WHEN ?2='out' THEN ?3 ELSE last_out_at END
        WHERE id=?1`
    ).bind(t.id, newState, ts).run();

    // Optional trail
    try {
      await env.DB.prepare(
        `INSERT INTO scan_logs (ticket_id, gate_id, action, at)
         VALUES (?1, ?2, ?3, ?4)`
      ).bind(t.id, gateId, action, ts).run();
    } catch {}

    // UI hints
    const ui = (action === "in")
      ? { flash:"green", haptic:"single" }
      : { flash:"amber", haptic:"none" };

    return json({
      ok:true,
      action,
      need_gender:false,
      ...ui,
      ticket:{
        id: t.id,
        qr: t.qr,
        name: (t.attendee_first||"") + " " + (t.attendee_last||""),
        type: t.type_name,
        phone: t.phone || "",
        gender: t.gender || null
      }
    });
  }));
}
