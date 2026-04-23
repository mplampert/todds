const kroll = require('./kroll');
const shop = require('./shopify');
async function syncInventory() {
  const log = { started: new Date().toISOString(), checked: 0, updated: 0, errors: [] };
  try {
    const products = await shop.getProductsByTag('kroll');
    if (products.length === 0) { log.completed = new Date().toISOString(); return log; }
    const variantMap = {};
    for (const p of products) { for (const v of p.variants) { if (v.sku) variantMap[v.sku] = { variantId: v.id, inventoryItemId: v.inventory_item_id, currentPrice: parseFloat(v.price) }; } }
    const allSkus = Object.keys(variantMap);
    const locationId = await shop.getLocationId();
    for (let i = 0; i < allSkus.length; i += 100) {
      const batch = allSkus.slice(i, i + 100);
      try {
        const results = await kroll.checkProductAvailability(batch);
        log.checked += batch.length;
        for (const item of results) {
          if (!item.SkuFound) continue;
          const variant = variantMap[item.Sku];
          if (!variant) continue;
          try {
            await shop.setInventory(variant.inventoryItemId, locationId, item.QuantityAvailable);
            const newPrice = shop.calcPrice(item.DealerCost, item.SuggestedRetailPrice);
            if (Math.abs(newPrice - variant.currentPrice) > 0.01) await shop.updateVariantPrice(variant.variantId, newPrice, item.SuggestedRetailPrice > newPrice ? item.SuggestedRetailPrice : null);
            log.updated++;
            await shop.sleep(300);
          } catch (err) { log.errors.push({ sku: item.Sku, error: err.message }); }
        }
      } catch (err) { log.errors.push({ batch: `${i}`, error: err.message }); }
      await shop.sleep(1000);
    }
  } catch (err) { log.errors.push({ step: 'global', error: err.message }); }
  log.completed = new Date().toISOString();
  return log;
}
async function processOrder(shopifyOrder) {
  const log = { orderId: shopifyOrder.id, orderName: shopifyOrder.name };
  try {
    const krollItems = shopifyOrder.line_items.filter(i => i.sku).map(i => ({ sku: i.sku, quantity: i.quantity }));
    if (krollItems.length === 0) { log.status = 'skipped'; return log; }
    const ship = shopifyOrder.shipping_address;
    const poResult = await kroll.submitPurchaseOrder({ poNumber: `TODDS-${shopifyOrder.name}`, externalPO: shopifyOrder.id.toString(), isDropShip: true, shipVia: 'FedExGround', fulfillmentMethod: 'ShipProductThatIsAvailableNowAndOtherProductWhenAvailable', shipTo: { name: `${ship.first_name} ${ship.last_name}`, address1: ship.address1, address2: ship.address2 || '', city: ship.city, state: ship.province_code, zip: ship.zip, country: ship.country_code || 'US', phone: ship.phone || '' }, items: krollItems });
    log.krollResponse = { status: poResult.FulfillmentStatus, confirmationNumber: poResult.OrderConfirmationNumber, totalAmount: poResult.TotalProductAmount };
    if (poResult.OrderConfirmationNumber) await shop.tagOrder(shopifyOrder.id, poResult.OrderConfirmationNumber);
    log.status = poResult.FulfillmentStatus === 'OrderAccepted' ? 'success' : 'rejected';
  } catch (err) { log.status = 'error'; log.error = err.message; }
  return log;
}
module.exports = { syncInventory, processOrder };
