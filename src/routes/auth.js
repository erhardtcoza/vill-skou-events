// /src/routes/auth.js
import { json, bad } from "../utils/http.js";
import { signSession, setCookie } from "../utils/auth.js";

export function mountAuth(router) {
  // Login with username + password only. Role is read from DB.
  router.add("POST", "/api/auth/login", async (req, env) => {
    const b = await req.json().catch(() => null);
    const username = (b?.username || "").trim();
    const password = (b?.password || "").trim();
    if (!username || !password) return bad("Missing credentials", 400);

    // Look up user
    const user = await env.DB.prepare(
      `SELECT id, username, role, password_hash FROM users WHERE username = ?1`
    ).bind(username).first();

    if (!user) return bad("Invalid login", 401);

    // Very simple check for now:
    // - if password_hash is NULL, accept the provided password as-is only if it matches env.DEFAULT_ADMIN_PASS (optional)
    // - if password_hash is set and starts with "plain:", compare plain text after prefix
    // - (you can swap this to bcrypt later)
    let ok = false;
    if (user.password_hash == null) {
      const fallback = env.DEFAULT_ADMIN_PASS || "password123";
      ok = password === fallback;
    } else if (user.password_hash.startsWith("plain:")) {
      ok = password === user.password_hash.slice("plain:".length);
    } else {
      // unknown scheme
      ok = false;
    }

    if (!ok) return bad("Invalid login", 401);

    const sess = await signSession(env, {
      role: user.role,         // 'admin' | 'pos' | 'scan'
      name: user.username,
      ts: Date.now()
    });

    const headers = new Headers({ "content-type": "application/json" });
    headers.append("Set-Cookie", setCookie("vs_sess", sess));
    return new Response(JSON.stringify({ ok: true, role: user.role }), { status: 200, headers });
  });

  // Logout (clears cookie)
  router.add("GET", "/api/auth/logout", async (_req, _env) => {
    const headers = new Headers({ "content-type": "application/json" });
    headers.append("Set-Cookie", "vs_sess=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure");
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  });
}
