// /src/routes/scan.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

/** Scanner endpoints: gate list + scan/in-out toggle with validations */
export function mountScan(router) {
  const guard = (fn) => requireRole("scan", fn);

  // ---- List gates for the currently-active event(s)
  // Returns: { ok:true, events:[{id,name,slug}], gates:[{id,name,event_id}] }
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

    const gQ = await env.DB.prepare(
      `SELECT id, name, event_id FROM gates ORDER BY name ASC`
    ).all();

    return json({
      ok: true,
      events,
      gates: (gQ.results || [])
    });
  }));

  // ---- Scan a ticket QR (toggle IN/OUT) -----------------------------------
  // Body: { code: "<qr>", gate_id:number|null, gender?: "male"|"female"|"other"|null }
  // Response:
  //   { ok:true, action: "in"|"out", need_gender:false, ticket:{...minimal} }
  // or { ok:false, error:"...", reason:"unpaid|cancelled|wrong_date|void|not_found" }
  router.add("POST", "/api/scan/scan", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const code   = String(b?.code || "").trim();
    const gateId = Number(b?.gate_id || 0) || null;
    const gender = (b?.gender ? String(b.gender).toLowerCase() : null);

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
      WHERE t.qr = ?1
      LIMIT 1`
    ).bind(code).first();

    if (!t) return json({ ok:false, error:"Nie gevind nie.", reason:"not_found" }, 404);

    // Validate order paid
    if (String(t.order_status||"").toLowerCase() !== "paid") {
      return json({ ok:false, error:"Betaling nie ontvang nie.", reason:"unpaid" }, 400);
    }

    // Validate event date (today within [starts_at, ends_at])
    const now = Math.floor(Date.now()/1000);
    if (t.starts_at && now < Number(t.starts_at) - 86400) {
      return json({ ok:false, error:"Verkeerde datum (te vroeg).", reason:"wrong_date" }, 400);
    }
    if (t.ends_at && now > Number(t.ends_at) + 86400) {
      return json({ ok:false, error:"Verkeerde datum (verby).", reason:"wrong_date" }, 400);
    }

    // Validate not void
    if (t.state === "void") {
      return json({ ok:false, error:"Kaartjie is ongeldig/void.", reason:"void" }, 400);
    }

    // Gender requirement: if required and empty AND no gender provided, ask UI to collect
    const requiresGender = Number(t.requires_gender || 0) === 1;
    const hasGender = !!(t.gender && String(t.gender).trim());
    if (requiresGender && !hasGender && !gender) {
      return json({
        ok:true,
        action:"pending",
        need_gender:true,
        ticket:{
          id: t.id, qr: t.qr, name: (t.attendee_first||"") + " " + (t.attendee_last||""),
          type: t.type_name, phone: t.phone || ""
        }
      });
    }

    // If UI supplied gender now, persist it (first time only)
    if (requiresGender && !hasGender && gender) {
      await env.DB.prepare(
        `UPDATE tickets SET gender=?2 WHERE id=?1`
      ).bind(t.id, gender).run();
      t.gender = gender;
    }

    // Toggle state: unused/out -> IN,   in -> OUT
    let newState, action;
    if (t.state === "in") {
      newState = "out";
      action   = "out";
    } else { // "unused" or "out" or anything else
      newState = "in";
      action   = "in";
    }

    // Save toggle
    const nowTs = Math.floor(Date.now()/1000);
    await env.DB.prepare(
      `UPDATE tickets
          SET state=?2,
              first_in_at = COALESCE(first_in_at, CASE WHEN ?2='in' THEN ?3 ELSE first_in_at END),
              last_out_at = CASE WHEN ?2='out' THEN ?3 ELSE last_out_at END
        WHERE id=?1`
    ).bind(t.id, newState, nowTs).run();

    // Optionally write a lightweight trail (if you have a table; safe to ignore failures)
    try {
      await env.DB.prepare(
        `INSERT INTO scan_logs (ticket_id, gate_id, action, at)
         VALUES (?1, ?2, ?3, ?4)`
      ).bind(t.id, gateId, action, nowTs).run();
    } catch {}

    return json({
      ok:true,
      action,
      need_gender:false,
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
