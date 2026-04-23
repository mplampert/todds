const https = require('https');
module.exports = async function handler(req, res) {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  const sku = req.query.sku || '1255839002MD';
  const ns = 'http://schemas.datacontract.org/2004/07/Kroll.Dealer.EBusiness';
  const arr = 'http://schemas.microsoft.com/2003/10/Serialization/Arrays';
  const envelope = '<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/envelope/"><s:Body><CheckProductAvailability xmlns="http://tempuri.org/"><request xmlns:a="' + ns + '" xmlns:b="' + arr + '"><a:DealerAccountNumber>' + process.env.KROLL_DEALER_ACCOUNT + '</a:DealerAccountNumber><a:Password>' + process.env.KROLL_PASSWORD + '</a:Password><a:SkuList><b:string>' + sku + '</b:string></a:SkuList><a:UserId>' + process.env.KROLL_USER_ID + '</a:UserId></request></CheckProductAvailability></s:Body></s:Envelope>';
  const url = new URL('https://apiv2.krollcorp.com/EBusiness/Kroll.Dealer.EBusiness.svc/Basic');
  return new Promise((resolve) => {
    const r = https.request({ hostname: url.hostname, path: url.pathname, method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': 'http://tempuri.org/IEBusinessService/CheckProductAvailability' } }, (resp) => {
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => { res.status(200).json({ rawXml: data }); resolve(); });
    });
    r.on('error', (err) => { res.status(500).json({ error: err.message }); resolve(); });
    r.write(envelope);
    r.end();
  });
};
