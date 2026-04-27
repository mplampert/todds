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

  try {
    const response = await fetch('https://api.krollcorp.com/EBusiness/Kroll.Dealer.EBusiness.svc/Basic', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://tempuri.org/IEBusinessService/CheckProductAvailability',
      },
      body: envelope,
    });
    const xml = await response.text();

    if (!xml || xml.length === 0) {
      return res.status(200).json({ debug: 'Empty response from Kroll', status: response.status, skusSent: skus, envelope: envelope.substring(0, 500) });
    }

    if (xml.includes('AuthenticationFailed>true')) {
      return res.status(401).json({ error: 'Kroll auth failed' });
    }

    const items = [];
    const regex = /<[^:]*:?CheckProductAvailabilityResponse[^>]*>([\s\S]*?)<\/[^:]*:?CheckProductAvailabilityResponse>/g;
    let match;
    while ((match = regex.exec(xml)) !== null) {
      const b = match[1];
      const get = (tag) => { const m = b.match(new RegExp('<[^:]*:?' + tag + '[^>]*>([\\s\\S]*?)<\\/[^:]*:?' + tag + '>')); return m ? m[1] : null; };
      items.push({
        sku: get('Sku'),
        found: get('SkuFound') === 'true',
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

    return res.status(200).json({ markup: markup + '%', results: enriched, rawLength: xml.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
