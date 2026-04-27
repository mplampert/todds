module.exports = async function handler(req, res) {
  const checks = { KROLL_DEALER_ACCOUNT: !!process.env.KROLL_DEALER_ACCOUNT, KROLL_USER_ID: !!process.env.KROLL_USER_ID, KROLL_PASSWORD: !!process.env.KROLL_PASSWORD, MARKUP_PERCENT: process.env.MARKUP_PERCENT || '30', CRON_SECRET: !!process.env.CRON_SECRET };
  const allSet = checks.KROLL_DEALER_ACCOUNT && checks.KROLL_USER_ID && checks.KROLL_PASSWORD && checks.CRON_SECRET;
  return res.status(allSet ? 200 : 503).json({ status: allSet ? 'ready' : 'missing_config', checks });
};
// force deploy
