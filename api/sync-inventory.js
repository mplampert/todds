const { syncInventory } = require('../lib/sync');
module.exports = async function handler(req, res) {
  const auth = req.headers['authorization'];
  const secret = req.query.secret;
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && secret !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  try { const result = await syncInventory(); return res.status(200).json({ status: 'success', ...result }); }
  catch (err) { return res.status(500).json({ status: 'error', error: err.message }); }
};
