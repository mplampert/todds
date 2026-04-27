const soap = require('soap');
const WSDL = 'https://api.krollcorp.com/EBusiness/Kroll.Dealer.EBusiness.svc/Docs?singleWsdl';
const ENDPOINT = 'https://api.krollcorp.com/EBusiness/Kroll.Dealer.EBusiness.svc/Basic';

module.exports = async function handler(req, res) {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  const skuParam = req.query.skus;
  if (!skuParam) return res.status(400).json({ error: 'Provide ?skus=SKU1,SKU2' });
  const skus = skuParam.split(',').map(s => s.trim()).filter(Boolean);
  try {
    const client = await soap.createClientAsync(WSDL, { endpoint: ENDPOINT });
    const [result] = await client.CheckProductAvailabilityAsync({
      request: {
        DealerAccountNumber: process.env.KROLL_DEALER_ACCOUNT,
        Password: process.env.KROLL_PASSWORD,
        SkuList: { string: skus },
        UserId: process.env.KROLL_USER_ID,
      }
    });
    const data = result.CheckProductAvailabilityResult;
    if (data.AuthenticationFailed) return res.status(401).json({ error: 'Kroll auth failed' });
    if (!data.List) return res.status(200).json({ markup: process.env.MARKUP_PERCENT + '%', results: [] });
    const items = data.List.CheckProductAvailabilityResponse;
    const list = Array.isArray(items) ? items : items ? [items] : [];
    const markup = parseFloat(process.env.MARKUP_PERCENT || '30');
    const enriched = list.map(item => {
      const cost = item.DealerCost || 0;
      let price = cost * (1 + markup / 100);
      if (item.SuggestedRetailPrice && price > item.SuggestedRetailPrice) price = item.SuggestedRetailPrice;
      return { sku: item.Sku, found: item.SkuFound, qty: item.QuantityAvailable, dealerCost: cost, msrp: item.SuggestedRetailPrice, sellPrice: item.SkuFound ? parseFloat(price.toFixed(2)) : null };
    });
    return res.status(200).json({ markup: markup + '%', results: enriched });
  } catch (err) { return res.status(500).json({ error: err.message }); }
};
