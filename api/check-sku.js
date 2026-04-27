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

    // Build correct SkuList XML with Arrays namespace
    const skuXml = skus.map(s =>
      '<arr:string xmlns:arr="http://schemas.microsoft.com/2003/10/Serialization/Arrays">' + s + '</arr:string>'
    ).join('');

    // Intercept outgoing XML to fix namespace
    client.on('message', function(xml) {
      // This fires but can't modify - we use it for logging only
    });

    // Make the call with a placeholder
    const [result, rawResponse, soapHeader, rawRequest] = await client.CheckProductAvailabilityAsync({
      request: {
        DealerAccountNumber: process.env.KROLL_DEALER_ACCOUNT,
        Password: process.env.KROLL_PASSWORD,
        SkuList: { string: skus },
        UserId: process.env.KROLL_USER_ID,git status
      }
    });

    const data = result.CheckProductAvailabilityResult;

    // If List is null, the namespace is wrong - retry with raw XML
    if (!data.List && skus.length > 0) {
      const lastXml = client.lastRequest;
      // Fix the namespace on string elements inside SkuList
      const fixed = lastXml.replace(
        /<([^:]+):SkuList[^>]*>([\s\S]*?)<\/\1:SkuList>/,
        function(match, prefix) {
          return '<' + prefix + ':SkuList xmlns:' + prefix + '="http://schemas.datacontract.org/2004/07/Kroll.Dealer.EBusiness">' + skuXml + '</' + prefix + ':SkuList>';
        }
      );

      // Send fixed XML manually
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': '"http://tempuri.org/IEBusinessService/CheckProductAvailability"',
        },
        body: fixed,
      });
      const xmlText = await response.text();

      if (xmlText.includes('AuthenticationFailed>true')) {
        return res.status(401).json({ error: 'Kroll auth failed' });
      }

      // Parse response
      const items = [];
      const regex = /CheckProductAvailabilityResponse[^>]*>([\s\S]*?)<\/[^:]*:?CheckProductAvailabilityResponse>/g;
      let match;
      while ((match = regex.exec(xmlText)) !== null) {
        const b = match[1];
        const get = (tag) => { const m = b.match(new RegExp('<[^:]*:?' + tag + '[^>]*>([\\s\\S]*?)<\\/[^:]*:?' + tag + '>')); return m ? m[1] : null; };
        const cost = parseFloat(get('DealerCost') || '0');
        const msrp = parseFloat(get('SuggestedRetailPrice') || '0');
        const markup = parseFloat(process.env.MARKUP_PERCENT || '30');
        let price = cost * (1 + markup / 100);
        if (msrp && price > msrp) price = msrp;
        items.push({
          sku: get('Sku'),
          found: get('SkuFound') === 'true',
          qty: parseInt(get('QuantityAvailable') || '0'),
          dealerCost: cost,
          msrp: msrp,
          sellPrice: get('SkuFound') === 'true' ? parseFloat(price.toFixed(2)) : null,
        });
      }

      const markup = parseFloat(process.env.MARKUP_PERCENT || '30');
      return res.status(200).json({ markup: markup + '%', results: items, method: 'fixed-xml' });
    }

    return res.status(200).json({ result: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
