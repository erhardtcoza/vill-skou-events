// src/router.js
function createRouter() {
  const routes = [];
  
  // Normalize paths so "/x//" -> "/x"
  const normalize = (p) => (p === "/" ? p : (p || "/").replace(/\/+$/, "")) || "/";

  // Convert "/users/:id" -> regex with capture groups
  const toRe = (pattern) =>
    new RegExp("^" + pattern.replace(/:[^/]+/g, "([^/]+)") + "$");

  // Extract params from a URL path for a given pattern
  const match = (urlPath, pattern) => {
    const names = (pattern.match(/:[^/]+/g) || []).map((s) => s.slice(1));
    const m = urlPath.match(toRe(pattern));
    if (!m) return null;
    const params = {};
    names.forEach((n, i) => (params[n] = decodeURIComponent(m[i + 1])));
    return params;
  };

  // Register a route
  const add = (method, pattern, handler) => {
    routes.push({ method: (method || "ANY").toUpperCase(), pattern, handler });
  };

  // HTTP sugar
  const get = (pattern, handler) => add("GET", pattern, handler);
  const post = (pattern, handler) => add("POST", pattern, handler);
  const del = (pattern, handler) => add("DELETE", pattern, handler);
  const options = (pattern, handler) => add("OPTIONS", pattern, handler);
  const any = (pattern, handler) => add("ANY", pattern, handler);

  // Mount a sub-router under a prefix
  // Usage: parent.mount("/api/pos", subRouter)
  const mount = (prefix, sub) => {
    const base = normalize(prefix);
    if (!sub || !Array.isArray(sub.routes)) {
      throw new Error("mount(prefix, sub): sub.routes missing");
    }
    for (const r of sub.routes) {
      const child =
        r.pattern === "/"
          ? ""
          : r.pattern.startsWith("/")
          ? r.pattern
          : "/" + r.pattern;
      const full = normalize(base + child);
      routes.push({ method: r.method, pattern: full, handler: r.handler });
    }
  };

  // Dispatch an incoming request
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

  return { add, get, post, del, options, any, mount, handle, routes };
}

// Named export (preferred)
export function Router() {
  return createRouter();
}

// Default export (supports: import Router from "./router.js")
export default Router;
