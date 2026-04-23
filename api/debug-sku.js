const soap = require('soap');
const WSDL = 'https://apiv2.krollcorp.com/EBusiness/Kroll.Dealer.EBusiness.svc/Docs?singleWsdl';
const ENDPOINT = 'https://apiv2.krollcorp.com/EBusiness/Kroll.Dealer.EBusiness.svc/Basic';

module.exports = async function handler(req, res) {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  const sku = req.query.sku || '1255839002MD';
  try {
    const client = await soap.createClientAsync(WSDL, { endpoint: ENDPOINT });
    try {
      const [result] = await client.CheckProductAvailabilityAsync({
        request: {
          DealerAccountNumber: process.env.KROLL_DEALER_ACCOUNT,
          Password: process.env.KROLL_PASSWORD,
          SkuList: { string: [sku] },
          UserId: process.env.KROLL_USER_ID,
        }
      });
      return res.status(200).json({ success: true, result: result, lastRequest: client.lastRequest });
    } catch (err) {
      return res.status(200).json({ error: err.message, lastRequest: client.lastRequest, lastResponse: client.lastResponse });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
};
