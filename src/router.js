export function Router() {
  const routes = [];
  const add = (method, pattern, handler) => routes.push({ method, pattern, handler });
  const toRe = (pattern) => new RegExp("^" + pattern.replace(/:[^/]+/g, "([^/]+)") + "$");
  const match = (urlPath, pattern) => {
    const names = (pattern.match(/:[^/]+/g) || []).map(s => s.slice(1));
    const m = urlPath.match(toRe(pattern));
    if (!m) return null;
    const params = {}; names.forEach((n, i) => params[n] = decodeURIComponent(m[i+1]));
    return params;
  };
  const handle = async (req, env, ctx) => {
    const url = new URL(req.url);
    for (const r of routes) {
      if (r.method !== req.method && r.method !== "ANY") continue;
      const params = match(url.pathname, r.pattern);
      if (params) return r.handler(req, env, ctx, params);
    }
    return new Response("Not Found", { status: 404 });
  };
  return { add, handle };
}
