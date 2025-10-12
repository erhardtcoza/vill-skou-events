// /src/routes/public_pages.js
import { vendorsMapHTML } from "../ui/vendors_map.js";

export function mountPublicPages(router){
  // … (keep the directory routes you already added)

  // Current event map
  router.get("/vendors/map", async (c) => {
    return new Response(vendorsMapHTML(null), { headers: { "content-type": "text/html; charset=utf-8" } });
  });

  // Specific event map
  router.get("/event/:eventId/vendors/map", async (c) => {
    const { eventId } = c.req.param();
    return new Response(vendorsMapHTML(eventId), { headers: { "content-type": "text/html; charset=utf-8" } });
  });
}
