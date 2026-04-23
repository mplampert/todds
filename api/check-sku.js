const { checkProductAvailability } = require('../lib/kroll');
const { calcPrice } = require('../lib/shopify');
module.exports = async function handler(req, res) {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  const skuParam = req.query.skus;
  if (!skuParam) return res.status(400).json({ error: 'Provide ?skus=SKU1,SKU2' });
  const skus = skuParam.split(',').map(s => s.trim()).filter(Boolean);
  try {
    const results = await checkProductAvailability(skus);
    const enriched = results.map(item => ({ sku: item.Sku, found: item.SkuFound, qty: item.QuantityAvailable, dealerCost: item.DealerCost, msrp: item.SuggestedRetailPrice, sellPrice: item.SkuFound ? calcPrice(item.DealerCost, item.SuggestedRetailPrice) : null }));
    return res.status(200).json({ markup: `${process.env.MARKUP_PERCENT || 30}%`, results: enriched });
  } catch (err) { return res.status(500).json({ error: err.message }); }
};
