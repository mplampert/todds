const https = require('https');

module.exports = async function handler(req, res) {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  const skuParam = req.query.skus;
  if (!skuParam) return res.status(400).json({ error: 'Provide ?skus=SKU1,SKU2' });
  const skus = skuParam.split(',').map(s => s.trim()).filter(Boolean);
  if (skus.length > 10) return res.status(400).json({ error: 'Max 10 SKUs' });

  const skuXml = skus.map(s => '<arr:string>' + s + '</arr:string>').join('');
  const envelope = '<?xml version="1.0" encoding="utf-8"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/envelope/">' +
    '<s:Body>' +
    '<CheckProductAvailability xmlns="http://tempuri.org/">' +
    '<request xmlns:a="http://schemas.datacontract.org/2004/07/Kroll.Dealer.EBusiness" xmlns:arr="http://schemas.microsoft.com/2003/10/Serialization/Arrays">' +
    '<a:DealerAccountNumber>' + process.env.KROLL_DEALER_ACCOUNT + '</a:DealerAccountNumber>' +
    '<a:Password>' + process.env.KROLL_PASSWORD + '</a:Password>' +
    '<a:SkuList>' + skuXml + '</a:SkuList>' +
    '<a:UserId>' + process.env.KROLL_USER_ID + '</a:UserId>' +
    '</request>' +
    '</CheckProductAvailability>' +
    '</s:Body>' +
    '</s:Envelope>';

  const body = Buffer.from(envelope, 'utf8');

  return new Promise((resolve) => {
    const request = https.request({
      hostname: 'api.krollcorp.com',
      path: '/EBusiness/Kroll.Dealer.EBusiness.svc/Basic',
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '"http://tempuri.org/IEBusinessService/CheckProductAvailability"',
        'Content-Length': body.length,
      },
    }, (response) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        if (!data || data.length === 0) {
          res.status(200).json({ debug: 'Empty response', status: response.statusCode });
          return resolve();
        }
        if (data.includes('AuthenticationFailed>true')) {
          res.status(401).json({ error: 'Kroll auth failed' });
          return resolve();
        }

        const items = [];
        const regex = /CheckProductAvailabilityResponse[^>]*>([\s\S]*?)<\/[^:]*:?CheckProductAvailabilityResponse>/g;
        let match;
        while ((match = regex.exec(data)) !== null) {
          const b = match[1];
          const get = (tag) => { const m = b.match(new RegExp('<[^:]*:?' + tag + '[^>]*>([\\s\\S]*?)<\\/[^:]*:?' + tag + '>')); return m ? m[1] : null; };
          items.push({
            sku: get('Sku'), found: get('SkuFound') === 'true',
            qty: parseInt(get('QuantityAvailable') || '0'),
            dealerCost: parseFloat(get('DealerCost') || '0'),
            msrp: parseFloat(get('SuggestedRetailPrice') || '0'),
          });
        }

        const markup = parseFloat(process.env.MARKUP_PERCENT || '30');
        const enriched = items.map(item => ({
          ...item,
          sellPrice: item.found ? parseFloat((item.dealerCost * (1 + markup / 100)).toFixed(2)) : null,
        }));

        res.status(200).json({ markup: markup + '%', results: enriched, httpStatus: response.statusCode, rawLen: data.length });
        resolve();
      });
    });

    request.on('error', (err) => {
      res.status(500).json({ error: err.message });
      reso
rm -f api/check-sku.js api/health.js api/sync-inventory.js api/webhook-order.js api/debug-sku.js
rm -rf api/kroll lib

cat > api/check-sku.js << 'EOF'
const soap = require('soap');
const WSDL = 'https://api.krollcorp.com/EBusiness/Kroll.Dealer.EBusiness.svc/Docs?singleWsdl';
const ENDPOINT = 'https://api.krollcorp.com/EBusiness/Kroll.Dealer.EBusiness.svc/Basic';

module.exports = async function handler(req, res) {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  const skuParam = req.query.skus;
  if (!skuParam) return res.status(400).json({ error: 'Provide ?skus=SKU1,SKU2' });
  const skus = skuParam.split(',').map(s => s.trim()).filter(Boolean);
  if (skus.length > 10) return res.status(400).json({ error: 'Max 10 SKUs' });

  try {
    const client = await soap.createClientAsync(WSDL, { endpoint: ENDPOINT });

    const skuXml = skus.map(s =>
      '<string xmlns="http://schemas.microsoft.com/2003/10/Serialization/Arrays">' + s + '</string>'
    ).join('');

    const [result] = await client.CheckProductAvailabilityAsync({
      request: {
        DealerAccountNumber: process.env.KROLL_DEALER_ACCOUNT,
        Password: process.env.KROLL_PASSWORD,
        SkuList: { $xml: skuXml },
        UserId: process.env.KROLL_USER_ID,
      }
    });

    const data = result.CheckProductAvailabilityResult;
    if (data.AuthenticationFailed) return res.status(401).json({ error: 'Kroll auth failed' });
    if (!data.List) return res.status(200).json({ markup: process.env.MARKUP_PERCENT + '%', results: [], raw: data });

    const items = data.List.CheckProductAvailabilityResponse;
    const list = Array.isArray(items) ? items : items ? [items] : [];
    const markup = parseFloat(process.env.MARKUP_PERCENT || '30');

    const enriched = list.map(item => {
      const cost = item.DealerCost || 0;
      let price = cost * (1 + markup / 100);
      if (item.SuggestedRetailPrice && price > item.SuggestedRetailPrice) price = item.SuggestedRetailPrice;
      return {
        sku: item.Sku,
        found: item.SkuFound,
        qty: item.QuantityAvailable,
        dealerCost: cost,
        msrp: item.SuggestedRetailPrice,
        sellPrice: item.SkuFound ? parseFloat(price.toFixed(2)) : null,
      };
    });

    return res.status(200).json({ markup: markup + '%', results: enriched });
  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
};
