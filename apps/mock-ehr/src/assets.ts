import { readFile } from "node:fs/promises";
import type { Context } from "hono";

// Self-hosted RheumAI fonts (SIL OFL 1.1), served from ../public: src/ in dev and dist/ in the image are both siblings
// of public/. Only the names below are served, so the path never comes from the request.
const FONTS = new Set(["source-serif-4.woff2", "manrope.woff2", "funnel-display.woff2", "ibm-plex-mono-400.woff2"]);
const cache = new Map<string, Buffer>();

export async function fontAsset(c: Context) {
  const name = c.req.param("file") ?? "";
  if (!FONTS.has(name)) return c.notFound();
  let body = cache.get(name);
  if (!body) {
    try {
      body = await readFile(new URL(`../public/fonts/${name}`, import.meta.url));
    } catch {
      return c.notFound();
    }
    cache.set(name, body);
  }
  return c.body(new Uint8Array(body), 200, { "Content-Type": "font/woff2", "Cache-Control": "public, max-age=604800" });
}
