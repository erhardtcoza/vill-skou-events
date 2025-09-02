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
  // POST /api/auth/login  { role: 'admin'|'pos'|'scan', token, name? }
  router.add("POST", "/api/auth/login", async (req, env) => {
    const b = await req.json().catch(()=>null);
    const role = String(b?.role || "").toLowerCase().trim();
    const token = String(b?.token || "").trim();
    const name  = String(b?.name  || "").trim();

    if (!["admin","pos","scan"].includes(role)) return bad("Invalid role");
    const good = tokenForRole(env, role);
    if (!good || token !== good) return bad("Unauthorized", 401);

    const sess = await signSession(env, { role, name, ts: Date.now() });

    // Allow insecure cookie for local dev if you really need it
    const insecure = (env.COOKIE_INSECURE === "1");
    const headers = new Headers({ "content-type": "application/json" });
    headers.append("Set-Cookie", setCookie("vs_sess", sess, { secure: !insecure }));

    return new Response(JSON.stringify({ ok:true, role, name }), { status: 200, headers });
  });

  // GET /api/auth/logout  → clears cookie
  router.add("GET", "/api/auth/logout", async (_req, env) => {
    const insecure = (env.COOKIE_INSECURE === "1");
    const parts = [
      "vs_sess=",
      "Path=/",
      "Max-Age=0",
      "HttpOnly",
      "SameSite=Lax",
    ];
    if (!insecure) parts.push("Secure");
    const headers = new Headers({ "content-type": "application/json", "Set-Cookie": parts.join("; ") });
    return new Response(JSON.stringify({ ok:true }), { status: 200, headers });
  });

  // GET /api/auth/whoami  → returns current session (role/name) or 401
  router.add("GET", "/api/auth/whoami", async (req, env) => {
    const raw = getCookie(req, "vs_sess");
    const sess = await verifySession(env, raw);
    if (!sess) return bad("Unauthorized", 401);
    return json({ ok:true, role: sess.role, name: sess.name || "" });
  });
}