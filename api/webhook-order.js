module.exports = async function handler(req, res) {
  return res.status(200).json({ status: 'disabled', message: 'Webhooks not configured yet' });
};
