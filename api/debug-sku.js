module.exports = async function handler(req, res) {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  const sku = req.query.sku || '1255839002MD';
  const ns = 'http://schemas.datacontract.org/2004/07/Kroll.Dealer.EBusiness';
  const arr = 'http://schemas.microsoft.com/2003/10/Serialization/Arrays';
  const envelope = '<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/envelope/"><s:Body><CheckProductAvailability xmlns="http://tempuri.org/"><request xmlns:a="' + ns + '" xmlns:b="' + arr + '"><a:DealerAccountNumber>' + process.env.KROLL_DEALER_ACCOUNT + '</a:DealerAccountNumber><a:Password>' + process.env.KROLL_PASSWORD + '</a:Password><a:SkuList><b:string>' + sku + '</b:string></a:SkuList><a:UserId>' + process.env.KROLL_USER_ID + '</a:UserId></request></CheckProductAvailability></s:Body></s:Envelope>';
  try {
    const response = await fetch('https://apiv2.krollcorp.com/EBusiness/Kroll.Dealer.EBusiness.svc/Basic', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://tempuri.org/IEBusinessService/CheckProductAvailability',
      },
      body: envelope,
    });
    const text = await response.text();
    return res.status(200).json({ status: response.status, rawXml: text });
  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
};
