// src/router.js
function createRouter() {
  const routes = [];

  const normalize = (p) => (p === "/" ? p : (p || "/").replace(/\/+$/, "")) || "/";
  const toRe = (pattern) => new RegExp("^" + pattern.replace(/:[^/]+/g, "([^/]+)") + "$");

  const match = (urlPath, pattern) => {
    const names = (pattern.match(/:[^/]+/g) || []).map((s) => s.slice(1));
    const m = urlPath.match(toRe(pattern));
    if (!m) return null;
    const params = {};
    names.forEach((n, i) => (params[n] = decodeURIComponent(m[i + 1])));
    return params;
  };

  const add = (method, pattern, handler) => {
    routes.push({ method: (method || "ANY").toUpperCase(), pattern, handler });
  };

  const get = (pattern, handler) => add("GET", pattern, handler);
  const post = (pattern, handler) => add("POST", pattern, handler);
  const any = (pattern, handler) => add("ANY", pattern, handler);

  // Mount sub-router under a prefix
  const mount = (prefix, sub) => {
    const base = normalize(prefix);
    if (!sub || !Array.isArray(sub.routes)) {
      throw new Error("mount(prefix, subRouter): subRouter.routes missing");
    }
    for (const r of sub.routes) {
      const child = r.pattern === "/" ? "" : (r.pattern.startsWith("/") ? r.pattern : "/" + r.pattern);
      const full = normalize(base + child);
      routes.push({ method: r.method, pattern: full, handler: r.handler });
    }
  };

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

// Named export (preferred)
export function Router() {
  return createRouter();
}

// Default export (for files doing: import Router from "./router.js")
export default Router;