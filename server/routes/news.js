const router = require("express").Router();

// Fixed publisher feeds, never user-supplied network destinations.
const feeds = {
  world: "https://feeds.bbci.co.uk/news/world/rss.xml",
  africa: "https://feeds.bbci.co.uk/news/world/africa/rss.xml",
  business: "https://feeds.bbci.co.uk/news/business/rss.xml",
  technology: "https://feeds.bbci.co.uk/news/technology/rss.xml",
  sport: "https://feeds.bbci.co.uk/sport/rss.xml"
};
const cache = new Map();
const pending = new Map();
function plain(value) {
  return String(value || "").replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, "")
    .replace(/<[^>]*>/g, "").replace(/&(amp|lt|gt|quot|apos|#39|#x27);/g, (_, entity) =>
      ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", "#x27": "'" }[entity]))
    .trim();
}
function parseFeed(xml) {
  const field = (item, tag) => plain(item.match(new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + tag + ">", "i"))?.[1]);
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].slice(0, 30).flatMap(([, item]) => {
    const title = field(item, "title");
    const link = field(item, "link");
    let url;
    try { url = new URL(link); } catch { return []; }
    if (url.protocol !== "https:" || !/^(?:[\w-]+\.)?bbc\.(?:com|co\.uk)$/.test(url.hostname)) return [];
    const date = new Date(field(item, "pubDate"));
    return title ? [{ title, url: url.href, source: "BBC News", publishedAt: Number.isNaN(date.getTime()) ? null : date.toISOString() }] : [];
  });
}
async function refresh(category) {
  const response = await fetch(feeds[category], { signal: AbortSignal.timeout(8000), redirect: "error" });
  if (!response.ok) throw new Error("Publisher feed unavailable");
  const articles = parseFeed(await response.text());
  if (!articles.length) throw new Error("No headlines returned");
  const result = { articles, updatedAt: new Date().toISOString() };
  cache.set(category, result);
  return result;
}
router.get("/", async (req, res) => {
  const category = String(req.query.category || "world");
  if (!Object.hasOwn(feeds, category)) return res.status(400).json({ message: "Unknown news category." });
  const previous = cache.get(category);
  if (previous && Date.now() - Date.parse(previous.updatedAt) < 10 * 60 * 1000) return res.json(previous);
  if (!pending.has(category)) pending.set(category, refresh(category).finally(() => pending.delete(category)));
  try { res.json(await pending.get(category)); }
  catch { if (previous) res.json({ ...previous, stale: true }); else res.status(503).json({ message: "News is temporarily unavailable. Please try again later." }); }
});
module.exports = router;
module.exports.parseFeed = parseFeed;
