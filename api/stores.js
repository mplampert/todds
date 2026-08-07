// api/stores.js  —  deploy into mplampert/todds (Vercel)
// Live URL: https://todd-one.vercel.app/api/stores
//
// Proxies Chipply's public dealer store feed, adds CORS so the GHL page can
// read it, normalizes names, and builds each store URL from accessUrl + storeId.

const FEED = 'https://tsgonline.chipply.com/api/Dealer/Stores';
const BASE = 'https://tsgonline.chipply.com';

// ── EDIT THESE TWO LISTS ─────────────────────────────────────────────────
// Stores kept OFF the public directory. Match on storeId — names change.
// Department, corporate, and reseller stores are access-controlled buying
// programs, not public retail. Publishing them invites the wrong orders.
const HIDE = new Set([
  432505, // Endicott Police Department
  434967, // Ipswich Police Department
  370918, // Wenham Police Department
  549991, // State 911 TERT
  436141, // North Shore Regional 911 Dispatch
  434994, // Cell Signaling Technology
  541008, // NorthPoint Mortgage
  497059, // Sand and Reef  (reseller client's store, not Todd's to promote)
  381788, // The Inner Cycle
  402610, // DaileyStrong
]);

// Optional close dates → drives the countdown and auto-greys the card.
// The feed carries no status field, so this is the only way to show one.
const CLOSES = {
  // 519670: '2026-08-21',   // Beverly Youth Hockey 26-27
  // 434964: '2026-09-05',   // Beverly High School
};
// ─────────────────────────────────────────────────────────────────────────

const SMALL = new Set(['and', 'of', 'the', 'for', 'de', 'at', 'to']);
const KEEP  = new Set(['BHS', 'PTO', 'DECA', 'REC', 'TERT', 'HWLL', 'BEV', 'CST']);

function titleCase(raw) {
  return raw.replace(/\s+/g, ' ').trim().split(' ').map((w, i) => {
    const u = w.toUpperCase();
    if (KEEP.has(u)) return u;
    if (/^[\d\-–&']+$/.test(w)) return w;
    if (i > 0 && SMALL.has(w.toLowerCase())) return w.toLowerCase();
    if (w.includes("'")) {
      const [a, b] = w.split(/'(.*)/);
      return a.charAt(0).toUpperCase() + a.slice(1).toLowerCase() + "'" + b.toLowerCase();
    }
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  // 1h fresh, serve stale up to 24h while revalidating — a Chipply outage
  // shows yesterday's list instead of an empty page.
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const r = await fetch(FEED, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'todds-directory/1.0' },
    });
    if (!r.ok) throw new Error('feed ' + r.status);

    const raw = (await r.json()).dealerStores || [];

    const stores = raw
      .filter(s => s.storeId && s.accessUrl && !HIDE.has(s.storeId))
      .map(s => ({
        id:    s.storeId,
        name:  titleCase(s.storeName),
        url:   `${BASE}/${s.accessUrl}/store.html?eid=${s.storeId}&action=viewall`,
        logo:  s.imageUrl || '',
        closes: CLOSES[s.storeId] || '',
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return res.status(200).json({ ok: true, count: stores.length, updated: new Date().toISOString(), stores });
  } catch (e) {
    // Page falls back to its built-in list on a non-ok response.
    return res.status(502).json({ ok: false, error: String(e.message || e), stores: [] });
  }
}
