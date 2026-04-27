const https = require('https');

const ENDPOINT = 'https://api.krollcorp.com/EBusiness/Kroll.Dealer.EBusiness.svc/Basic';

function soapRequest(action, bodyXml) {
  return new Promise((resolve, reject) => {
    const envelope = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/envelope/">
<s:Body>${bodyXml}</s:Body>
</s:Envelope>`;

    const url = new URL(ENDPOINT);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': action,
        'Content-Length': Buffer.byteLength(envelope),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (data.includes('s:Fault') || data.includes(':Fault')) {
          const faultMatch = data.match(/<(?:\w+:)?Text[^>]*>([\s\S]*?)<\/(?:\w+:)?Text>/);
          const detailMatch = data.match(/<(?:\w+:)?Detail[^>]*>([\s\S]*?)<\/(?:\w+:)?Detail>/);
          reject(new Error(faultMatch ? faultMatch[1] : detailMatch ? detailMatch[1] : data));
        } else {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.write(envelope);
    req.end();
  });
}

function escapeXml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function checkProductAvailability(skus) {
  const ns = 'http://schemas.datacontract.org/2004/07/Kroll.Dealer.EBusiness';
  const arr = 'http://schemas.microsoft.com/2003/10/Serialization/Arrays';

  const skuXml = skus.map(s => `<b:string>${escapeXml(s)}</b:string>`).join('');

  const body = `<CheckProductAvailability xmlns="http://tempuri.org/">
<request xmlns:a="${ns}" xmlns:b="${arr}">
<a:DealerAccountNumber>${escapeXml(process.env.KROLL_DEALER_ACCOUNT)}</a:DealerAccountNumber>
<a:Password>${escapeXml(process.env.KROLL_PASSWORD)}</a:Password>
<a:SkuList>${skuXml}</a:SkuList>
<a:UserId>${escapeXml(process.env.KROLL_USER_ID)}</a:UserId>
</request>
</CheckProductAvailability>`;

  const xml = await soapRequest('http://tempuri.org/IEBusinessService/CheckProductAvailability', body);

  // Parse response
  const authFailed = xml.includes('<a:AuthenticationFailed>true</a:AuthenticationFailed>');
  if (authFailed) throw new Error('Kroll auth failed. Check credentials.');

  const items = [];
  const itemRegex = /<a:CheckProductAvailabilityResponse>([\s\S]*?)<\/a:CheckProductAvailabilityResponse>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    items.push({
      Sku: extractTag(block, 'Sku'),
      SkuFound: extractTag(block, 'SkuFound') === 'true',
      QuantityAvailable: parseInt(extractTag(block, 'QuantityAvailable') || '0'),
      DealerCost: parseFloat(extractTag(block, 'DealerCost') || '0'),
      SuggestedRetailPrice: parseFloat(extractTag(block, 'SuggestedRetailPrice') || '0'),
    });
  }
  return items;
}

async function submitPurchaseOrder(order) {
  const ns = 'http://schemas.datacontract.org/2004/07/Kroll.Dealer.EBusiness';

  const linesXml = order.items.map((item, i) => `<a:PurchaseOrderDetailLine>
<a:LineNumber>${item.lineNumber || i + 1}</a:LineNumber>
<a:QuantityOrdered>${item.quantity}</a:QuantityOrdered>
<a:Sku>${escapeXml(item.sku)}</a:Sku>
</a:PurchaseOrderDetailLine>`).join('');

  const body = `<SubmitPurchaseOrder xmlns="http://tempuri.org/">
<request xmlns:a="${ns}">
<a:BypassAddressValidation>false</a:BypassAddressValidation>
<a:ConfirmToEmailAddress>${escapeXml(order.confirmEmail || process.env.KROLL_CONFIRM_EMAIL)}</a:ConfirmToEmailAddress>
<a:ConfirmToName>${escapeXml(order.confirmName || process.env.KROLL_CONFIRM_NAME)}</a:ConfirmToName>
<a:DealerAccountNumber>${escapeXml(process.env.KROLL_DEALER_ACCOUNT)}</a:DealerAccountNumber>
<a:DetailLines>${linesXml}</a:DetailLines>
<a:ExternalPO>${escapeXml(order.externalPO || '')}</a:ExternalPO>
<a:FulfillmentMethod>${order.fulfillmentMethod || 'ShipProductThatIsAvailableNowAndOtherProductWhenAvailable'}</a:FulfillmentMethod>
<a:IsDropShip>${order.isDropShip !== false}</a:IsDropShip>
<a:Password>${escapeXml(process.env.KROLL_PASSWORD)}</a:Password>
<a:PaymentMethod>AccountTerms</a:PaymentMethod>
<a:PurchaseOrderNumber>${escapeXml(order.poNumber)}</a:PurchaseOrderNumber>
<a:ShipToAddress1>${escapeXml(order.shipTo.address1)}</a:ShipToAddress1>
<a:ShipToAddress2>${escapeXml(order.shipTo.address2 || '')}</a:ShipToAddress2>
<a:ShipToAddress3>${escapeXml(order.shipTo.address3 || '')}</a:ShipToAddress3>
<a:ShipToCity>${escapeXml(order.shipTo.city)}</a:ShipToCity>
<a:ShipToCountryCode>${escapeXml(order.shipTo.country || 'US')}</a:ShipToCountryCode>
<a:ShipToName>${escapeXml(order.shipTo.name)}</a:ShipToName>
<a:ShipToPostalCode>${escapeXml(order.shipTo.zip)}</a:ShipToPostalCode>
<a:ShipToStateProvince>${escapeXml(order.shipTo.state)}</a:ShipToStateProvince>
<a:ShipToTelephoneNumber>${escapeXml(order.shipTo.phone || '')}</a:ShipToTelephoneNumber>
<a:ShipVia>${order.shipVia || 'FedExGround'}</a:ShipVia>
<a:SignatureRequired>${order.signatureRequired || false}</a:SignatureRequired>
<a:UserId>${escapeXml(process.env.KROLL_USER_ID)}</a:UserId>
</request>
</SubmitPurchaseOrder>`;

  const xml = await soapRequest('http://tempuri.org/IEBusinessService/SubmitPurchaseOrder', body);
  return {
    AuthenticationFailed: xml.includes('<a:AuthenticationFailed>true'),
    FulfillmentStatus: extractTag(xml, 'FulfillmentStatus'),
    OrderConfirmationNumber: extractTag(xml, 'OrderConfirmationNumber'),
    TotalProductAmount: parseFloat(extractTag(xml, 'TotalProductAmount') || '0'),
    Comment: extractTag(xml, 'Comment'),
    PurchaseOrderNumber: extractTag(xml, 'PurchaseOrderNumber'),
  };
}

async function checkOrderStatus(confirmationNumber) {
  const ns = 'http://schemas.datacontract.org/2004/07/Kroll.Dealer.EBusiness';
  const body = `<CheckOrderStatus xmlns="http://tempuri.org/">
<request xmlns:a="${ns}">
<a:DealerAccountNumber>${escapeXml(process.env.KROLL_DEALER_ACCOUNT)}</a:DealerAccountNumber>
<a:OrderConfirmationNumber>${escapeXml(confirmationNumber)}</a:OrderConfirmationNumber>
<a:Password>${escapeXml(process.env.KROLL_PASSWORD)}</a:Password>
<a:UserId>${escapeXml(process.env.KROLL_USER_ID)}</a:UserId>
</request>
</CheckOrderStatus>`;

  const xml = await soapRequest('http://tempuri.org/IEBusinessService/CheckOrderStatus', body);
  return {
    OrderStatus: extractTag(xml, 'OrderStatus'),
    OrderDate: extractTag(xml, 'OrderDate'),
    OrderConfirmationNumber: extractTag(xml, 'OrderConfirmationNumber'),
    PurchaseOrderNumber: extractTag(xml, 'PurchaseOrderNumber'),
  };
}

async function validateAddress(address) {
  const ns = 'http://schemas.datacontract.org/2004/07/Kroll.Dealer.EBusiness';
  const body = `<ValidateAddress xmlns="http://tempuri.org/">
<addressToValidate xmlns:a="${ns}">
<a:Address1>${escapeXml(address.address1)}</a:Address1>
<a:Address2>${escapeXml(address.address2 || '')}</a:Address2>
<a:City>${escapeXml(address.city)}</a:City>
<a:Country>${escapeXml(address.country || 'US')}</a:Country>
<a:PostalCode>${escapeXml(address.zip)}</a:PostalCode>
<a:State>${escapeXml(address.state)}</a:State>
</addressToValidate>
</ValidateAddress>`;

  const xml = await soapRequest('http://tempuri.org/IEBusinessService/ValidateAddress', body);
  return {
    AddressValid: xml.includes('<a:AddressValid>true'),
    Score: parseFloat(extractTag(xml, 'Score') || '0'),
    ReturnedAddress1: extractTag(xml, 'ReturnedAddress1'),
    ReturnedAddressCity: extractTag(xml, 'ReturnedAddressCity'),
    ReturnedAddressState: extractTag(xml, 'ReturnedAddressState'),
    ReturnedAddressPostalCode: extractTag(xml, 'ReturnedAddressPostalCode'),
  };
}

function extractTag(xml, tag) {
  const regex = new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`);
  const m = xml.match(regex);
  return m ? m[1] : null;
}

module.exports = { checkProductAvailability, submitPurchaseOrder, checkOrderStatus, validateAddress };
