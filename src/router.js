// /src/router.js
function createRouter() {
  const routes = [];

  // Normalize trailing slashes
  const normalize = (p) => (p === "/" ? p : (p || "/").replace(/\/+$/, "")) || "/";

  // Convert "/users/:id" to regex
  const toRe = (pattern) => new RegExp("^" + pattern.replace(/:[^/]+/g, "([^/]+)") + "$");

  // Extract params
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

  // Shortcut methods
  const get = (pattern, handler) => add("GET", pattern, handler);
  const post = (pattern, handler) => add("POST", pattern, handler);
  const put = (pattern, handler) => add("PUT", pattern, handler);
  const del = (pattern, handler) => add("DELETE", pattern, handler);
  const options = (pattern, handler) => add("OPTIONS", pattern, handler);
  const any = (pattern, handler) => add("ANY", pattern, handler);

  // Mount sub-router
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

  // Dispatch
  const handle = async (req, env, ctx) => {
    const url = new URL(req.url);
    const path = normalize(url.pathname);
    for (const r of routes) {
      if (r.method !== req.method && r.method !== "ANY") continue;
      const params = match(path, r.pattern);
      if (params) {
        try {
          return await r.handler(req, env, ctx, params);
        } catch (err) {
          console.error("Router error in", r.pattern, err);
          return new Response("Internal Server Error", { status: 500 });
        }
      }
    }
    return new Response("Not Found", { status: 404 });
  };

  return { add, get, post, put, del, options, any, mount, handle, routes };
}

// Named export
export function Router() {
  return createRouter();
}

// Default export
export default Router;
