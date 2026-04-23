const API_VERSION = '2024-10';
function headers() { return { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN }; }
function url(path) { const store = process.env.SHOPIFY_STORE_URL.replace(/^https?:\/\//, '').replace(/\/$/, ''); return `https://${store}/admin/api/${API_VERSION}${path}`; }
async function shopify(method, path, body = null) { const opts = { method, headers: headers() }; if (body) opts.body = JSON.stringify(body); const res = await fetch(url(path), opts); if (res.status === 429) { const wait = parseInt(res.headers.get('Retry-After') || '2', 10); await sleep(wait * 1000); return shopify(method, path, body); } if (!res.ok) { const text = await res.text(); throw new Error(`Shopify ${method} ${path}: ${res.status} - ${text}`); } return res.status === 204 ? null : res.json(); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function getProductsByTag(tag) { const data = await shopify('GET', `/products.json?limit=250&status=active`); return data.products.filter(p => p.tags && p.tags.toLowerCase().includes(tag.toLowerCase())); }
async function updateVariantPrice(variantId, price, compareAtPrice) { const variant = { id: variantId, price: price.toString() }; if (compareAtPrice) variant.compare_at_price = compareAtPrice.toString(); return shopify('PUT', `/variants/${variantId}.json`, { variant }); }
async function setInventory(inventoryItemId, locationId, quantity) { return shopify('POST', '/inventory_levels/set.json', { location_id: locationId, inventory_item_id: inventoryItemId, available: Math.max(0, quantity) }); }
async function getLocationId() { const data = await shopify('GET', '/locations.json'); return data.locations[0]?.id; }
async function getOrder(orderId) { const data = await shopify('GET', `/orders/${orderId}.json`); return data.order; }
async function tagOrder(orderId, krollConfirmation) { return shopify('PUT', `/orders/${orderId}.json`, { order: { id: orderId, tags: 'kroll-submitted', note_attributes: [{ name: 'kroll_confirmation', value: krollConfirmation }] } }); }
function calcPrice(dealerCost, suggestedRetail) { const markup = parseFloat(process.env.MARKUP_PERCENT || '30'); let price = dealerCost * (1 + markup / 100); if (suggestedRetail && price > suggestedRetail) price = suggestedRetail; return parseFloat(price.toFixed(2)); }
module.exports = { shopify, getProductsByTag, updateVariantPrice, setInventory, getLocationId, getOrder, tagOrder, calcPrice, sleep };
