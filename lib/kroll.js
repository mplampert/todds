const soap = require('soap');
const WSDL_URL = 'https://apiv2.krollcorp.com/EBusiness/Kroll.Dealer.EBusiness.svc/Docs?singleWsdl';
const ENDPOINT = 'https://apiv2.krollcorp.com/EBusiness/Kroll.Dealer.EBusiness.svc/Basic';
let clientInstance = null;
async function getClient() {
  if (clientInstance) return clientInstance;
  clientInstance = await soap.createClientAsync(WSDL_URL, { endpoint: ENDPOINT, wsdl_options: { timeout: 30000 } });
  return clientInstance;
}
function getCreds() {
  return { DealerAccountNumber: process.env.KROLL_DEALER_ACCOUNT, UserId: process.env.KROLL_USER_ID, Password: process.env.KROLL_PASSWORD };
}
async function checkProductAvailability(skus) {
  const client = await getClient();
  const creds = getCreds();
  const [result] = await client.CheckProductAvailabilityAsync({ request: { ...creds, SkuList: { string: skus } } });
  const data = result.CheckProductAvailabilityResult;
  if (data.AuthenticationFailed) throw new Error('Kroll auth failed. Check credentials.');
  return ensureArray(data.List?.CheckProductAvailabilityResponse);
}
async function submitPurchaseOrder(order) {
  const client = await getClient();
  const creds = getCreds();
  const [result] = await client.SubmitPurchaseOrderAsync({ request: { ...creds, PurchaseOrderNumber: order.poNumber, ExternalPO: order.externalPO || '', IsDropShip: order.isDropShip !== false, ConfirmToEmailAddress: order.confirmEmail || process.env.KROLL_CONFIRM_EMAIL, ConfirmToName: order.confirmName || process.env.KROLL_CONFIRM_NAME, PaymentMethod: 'AccountTerms', FulfillmentMethod: order.fulfillmentMethod || 'ShipProductThatIsAvailableNowAndOtherProductWhenAvailable', ShipVia: order.shipVia || 'FedExGround', BypassAddressValidation: false, SignatureRequired: order.signatureRequired || false, ShipToName: order.shipTo.name, ShipToAddress1: order.shipTo.address1, ShipToAddress2: order.shipTo.address2 || '', ShipToAddress3: order.shipTo.address3 || '', ShipToCity: order.shipTo.city, ShipToStateProvince: order.shipTo.state, ShipToPostalCode: order.shipTo.zip, ShipToCountryCode: order.shipTo.country || 'US', ShipToTelephoneNumber: order.shipTo.phone || '', DetailLines: { PurchaseOrderDetailLine: order.items.map((item, i) => ({ LineNumber: item.lineNumber || i + 1, Sku: item.sku, QuantityOrdered: item.quantity })) } } });
  return result.SubmitPurchaseOrderResult;
}
async function checkOrderStatus(confirmationNumber) {
  const client = await getClient();
  const creds = getCreds();
  const [result] = await client.CheckOrderStatusAsync({ request: { ...creds, OrderConfirmationNumber: confirmationNumber } });
  return result.CheckOrderStatusResult;
}
async function validateAddress(address) {
  const client = await getClient();
  const [result] = await client.ValidateAddressAsync({ addressToValidate: { Address1: address.address1, Address2: address.address2 || '', City: address.city, State: address.state, PostalCode: address.zip, Country: address.country || 'US' } });
  return result.ValidateAddressResult;
}
function ensureArray(val) { if (!val) return []; return Array.isArray(val) ? val : [val]; }
const SHIP_VIA = { FEDEX_GROUND: 'FedExGround', FEDEX_2DAY: 'FedExTwoDay', UPS_GROUND: 'UPSGround', USPS_PRIORITY: 'PriorityMail', FLAT_RATE: 'FlatRate' };
module.exports = { checkProductAvailability, submitPurchaseOrder, checkOrderStatus, validateAddress, SHIP_VIA };
