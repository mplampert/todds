const { processOrder } = require('../lib/sync');
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try { const result = await processOrder(req.body); return res.status(200).json(result); }
  catch (err) { return res.status(500).json({ status: 'error', error: err.message }); }
};
