const soap = require('soap');
const WSDL = 'https://api.krollcorp.com/EBusiness/Kroll.Dealer.EBusiness.svc/Docs?singleWsdl';
const ENDPOINT = 'https://api.krollcorp.com/EBusiness/Kroll.Dealer.EBusiness.svc/Basic';
let client = null;

async function getClient() {
  if (client) return client;
  client = await soap.createClientAsync(WSDL, { endpoint: ENDPOINT });
  return client;
}

async function checkProductAvailability(skus) {
  const c = await getClient();
  const [result] = await c.CheckProductAvailabilityAsync({
    request: {
      DealerAccountNumber: process.env.KROLL_DEALER_ACCOUNT,
      Password: process.env.KROLL_PASSWORD,
      SkuList: { string: skus },
      UserId: process.env.KROLL_USER_ID,
    }
  });
  const data = result.CheckProductAvailabilityResult;
  if (data.AuthenticationFailed) throw new Error('Kroll auth failed');
  if (!data.List) return [];
  const items = data.List.CheckProductAvailabilityResponse;
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
}

async function submitPurchaseOrder(order) {
  const c = await getClient();
  const [result] = await c.SubmitPurchaseOrderAsync({
    request: {
      ConfirmToEmailAddress: order.confirmEmail || process.env.KROLL_CONFIRM_EMAIL,
      ConfirmToName: order.confirmName || process.env.KROLL_CONFIRM_NAME,
      DealerAccountNumber: process.env.KROLL_DEALER_ACCOUNT,
      DetailLines: { PurchaseOrderDetailLine: order.items.map((item, i) => ({ LineNumber: i + 1, QuantityOrdered: item.quantity, Sku: item.sku })) },
      FulfillmentMethod: order.fulfillmentMethod || 'ShipProductThatIsAvailableNowAndOtherProductWhenAvailable',
      IsDropShip: order.isDropShip !== false,
      Password: process.env.KROLL_PASSWORD,
      PaymentMethod: 'AccountTerms',
      PurchaseOrderNumber: order.poNumber,
      ShipToAddress1: order.shipTo.address1,
      ShipToAddress2: order.shipTo.address2 || '',
      ShipToCity: order.shipTo.city,
      ShipToCountryCode: order.shipTo.country || 'USA',
      ShipToName: order.shipTo.name,
      ShipToPostalCode: order.shipTo.zip,
      ShipToStateProvince: order.shipTo.state,
      ShipVia: order.shipVia || 'Ground',
      UserId: process.env.KROLL_USER_ID,
    }
  });
  return result.SubmitPurchaseOrderResult;
}

async function checkOrderStatus(confirmationNumber) {
  const c = await getClient();
  const [result] = await c.CheckOrderStatusAsync({
    request: {
      DealerAccountNumber: process.env.KROLL_DEALER_ACCOUNT,
      OrderConfirmationNumber: confirmationNumber,
      Password: process.env.KROLL_PASSWORD,
      UserId: process.env.KROLL_USER_ID,
    }
  });
  return result.CheckOrderStatusResult;
}

function calcPrice(dealerCost, suggestedRetail) {
  const markup = parseFloat(process.env.MARKUP_PERCENT || '30');
  let price = dealerCost * (1 + markup / 100);
  if (suggestedRetail && price > suggestedRetail) price = suggestedRetail;
  return parseFloat(price.toFixed(2));
}

module.exports = { checkProductAvailability, submitPurchaseOrder, checkOrderStatus, calcPrice };
