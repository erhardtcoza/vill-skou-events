// src/router.js
export function Router() {
  const routes = [];

  const normalize = (p) => (p === "/" ? p : p.replace(/\/+$/, "")) || "/";

  const toRe = (pattern) =>
    new RegExp("^" + pattern.replace(/:[^/]+/g, "([^/]+)") + "$");

  const match = (urlPath, pattern) => {
    const names = (pattern.match(/:[^/]+/g) || []).map((s) => s.slice(1));
    const m = urlPath.match(toRe(pattern));
    if (!m) return null;
    const params = {};
    names.forEach((n, i) => (params[n] = decodeURIComponent(m[i + 1])));
    return params;
  };

  // Core add
  const add = (method, pattern, handler) => {
    routes.push({ method: (method || "ANY").toUpperCase(), pattern, handler });
  };

  // HTTP sugar
  const get = (pattern, handler) => add("GET", pattern, handler);
  const post = (pattern, handler) => add("POST", pattern, handler);
  const any = (pattern, handler) => add("ANY", pattern, handler);

  // Mount a sub-router under a prefix
  // Usage: parent.mount("/api/pos", sub)
  const mount = (prefix, subRouter) => {
    const base = normalize(prefix);
    if (!subRouter || !Array.isArray(subRouter.routes)) {
      throw new Error("mount(prefix, subRouter): subRouter.routes missing");
    }
    for (const r of subRouter.routes) {
      const childPath = r.pattern === "/" ? "" : r.pattern; // sub-root stays at prefix
      const full = normalize(base + (childPath.startsWith("/") ? childPath : "/" + childPath));
      routes.push({ method: r.method, pattern: full, handler: r.handler });
    }
  };

  // Request handler
  const handle = async (req, env, ctx) => {
    const url = new URL(req.url);
    const path = normalize(url.pathname);
    for (const r of routes) {
      if (r.method !== req.method && r.method !== "ANY") continue;
      const params = match(path, r.pattern);
      if (params) return r.handler(req, env, ctx, params);
    }
    return new Response("Not Found", { status: 404 });
  };

  return { add, get, post, any, mount, handle, routes };
}