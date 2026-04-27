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
    return res.status(200).json({ result: result.CheckProductAvailabilityResult, lastRequest: client.lastRequest });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
