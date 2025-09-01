export const json = (data, init={}) =>
  new Response(JSON.stringify(data), { headers: { "content-type": "application/json" }, ...init });

export const bad = (msg, code=400) => json({ ok:false, error: msg }, { status: code });

export function withCORS(handler) {
  return async (req, env, ctx, params) => {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        }
      });
    }
    const res = await handler(req, env, ctx, params);
    const h = new Headers(res.headers);
    h.set("Access-Control-Allow-Origin", "*");
    return new Response(res.body, { status: res.status, headers: h });
  };
}
