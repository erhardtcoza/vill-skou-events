// /src/routes/auth.js
import { json, bad } from "../utils/http.js";
import { signSession, setCookie, hashPassword, verifyPassword, newSalt } from "../utils/auth.js";

async function getUserByUsername(db, username) {
  return await db.prepare(
    `SELECT id, username, display_name, role, salt, password_hash, is_active FROM users WHERE username=?1`
  ).bind(username).first();
}

export function mountAuth(router) {
  // Login with username/password
  router.add("POST", "/api/auth/login", async (req, env) => {
    const b = await req.json().catch(()=>null);
    const u = (b?.username || "").trim();
    const p = (b?.password || "").trim();
    if (!u || !p) return bad("Missing credentials", 400);

    const user = await getUserByUsername(env.DB, u);
    if (!user || !user.is_active) return bad("Unauthorized", 401);

    const ok = await verifyPassword(env, p, user.salt, user.password_hash);
    if (!ok) return bad("Unauthorized", 401);

    const sess = await signSession(env, {
      user_id: user.id,
      role: user.role,
      name: user.display_name || user.username,
      ts: Date.now()
    });
    const headers = new Headers({ "content-type": "application/json" });
    headers.append("Set-Cookie", setCookie("vs_sess", sess));
    return new Response(JSON.stringify({ ok:true, role: user.role, name: user.display_name || user.username }), { status: 200, headers });
  });

  // Logout
  router.add("GET", "/api/auth/logout", async () => {
    const headers = new Headers({ "content-type": "application/json" });
    headers.append("Set-Cookie", "vs_sess=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure");
    return new Response(JSON.stringify({ ok:true }), { status: 200, headers });
  });

  // Small ping for scanner/pos UIs
  router.add("GET", "/api/scan/ping", async (_req, env) => {
    // If cookie exists and role is scan, return ok; else 401 handled by requireRole when used
    return json({ ok: true });
  });
}
