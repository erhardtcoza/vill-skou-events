// /src/routes/auth.js
import { json, bad } from "../utils/http.js";
import { signSession, setCookie, getCookie, verifySession } from "../utils/auth.js";

function tokenForRole(env, role) {
  if (role === "admin") return env.ADMIN_TOKEN || "";
  if (role === "pos")   return env.POS_TOKEN || "";
  if (role === "scan")  return env.SCAN_TOKEN || "";
  return "";
}

export function mountAuth(router) {
  // Login: { role: 'admin'|'pos'|'scan', token, name?, gate_name? }
  router.add("POST", "/api/auth/login", async (req, env) => {
    const b = await req.json().catch(()=>null);
    const role = String(b?.role || "").toLowerCase().trim();
    const token = String(b?.token || "").trim();
    const name  = String(b?.name  || "").trim();
    const gate  = role === "scan" ? String(b?.gate_name || "").trim() : "";

    if (!["admin","pos","scan"].includes(role)) return bad("Invalid role");
    const good = tokenForRole(env, role);
    if (!good || token !== good) return bad("Unauthorized", 401);

    // Store gate in session only for scanners
    const sess = await signSession(env, { role, name, gate, ts: Date.now() });
    const headers = new Headers({ "content-type": "application/json" });
    headers.append("Set-Cookie", setCookie("vs_sess", sess));
    return new Response(JSON.stringify({ ok:true, role, name, gate }), { status: 200, headers });
  });

  // Logout
  router.add("GET", "/api/auth/logout", async (_req, _env) => {
    const headers = new Headers({ "content-type": "application/json" });
    headers.append("Set-Cookie", "vs_sess=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure");
    return new Response(JSON.stringify({ ok:true }), { status: 200, headers });
  });

  // Who am I (now returns gate if present)
  router.add("GET", "/api/auth/whoami", async (req, env) => {
    const raw = getCookie(req, "vs_sess");
    const sess = await verifySession(env, raw);
    if (!sess) return bad("Unauthorized", 401);
    return json({ ok:true, role: sess.role, name: sess.name || "", gate: sess.gate || "" });
  });
}