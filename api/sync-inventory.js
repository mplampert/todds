module.exports = async function handler(req, res) {
  return res.status(200).json({ status: 'disabled', message: 'Sync not configured yet' });
};
