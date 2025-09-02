// /src/routes/auth.js
import { json, bad } from "../utils/http.js";
import { signSession, setCookie } from "../utils/auth.js";

function tokenForRole(env, role) {
  if (role === "admin") return env.ADMIN_TOKEN || "";
  if (role === "pos")   return env.POS_TOKEN || "";
  if (role === "scan")  return env.SCAN_TOKEN || "";
  return "";
}

export function mountAuth(router) {
  // Login (JSON): { role: 'admin'|'pos'|'scan', token, name? }
  router.add("POST", "/api/auth/login", async (req, env) => {
    const b = await req.json().catch(()=>null);
    const role = (b?.role || "").toLowerCase();
    const token = (b?.token || "").trim();
    const name = (b?.name || "").trim();
    if (!["admin","pos","scan"].includes(role)) return bad("Invalid role");

    const good = tokenForRole(env, role);
    if (!good || token !== good) return bad("Unauthorized", 401);

    const sess = await signSession(env, { role, name, ts: Date.now() });
    const headers = new Headers({ "content-type": "application/json" });
    headers.append("Set-Cookie", setCookie("vs_sess", sess));
    return new Response(JSON.stringify({ ok:true, role }), { status: 200, headers });
  });

  // Logout (clears cookie)
  router.add("GET", "/api/auth/logout", async (_req, _env) => {
    const headers = new Headers({ "content-type": "application/json" });
    headers.append("Set-Cookie", "vs_sess=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure");
    return new Response(JSON.stringify({ ok:true }), { status: 200, headers });
  });
}