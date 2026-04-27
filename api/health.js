module.exports = async function handler(req, res) {
  const checks = {
    KROLL_DEALER_ACCOUNT: !!process.env.KROLL_DEALER_ACCOUNT,
    KROLL_USER_ID: !!process.env.KROLL_USER_ID,
    KROLL_PASSWORD: !!process.env.KROLL_PASSWORD,
    CRON_SECRET: !!process.env.CRON_SECRET,
  };
  const ok = Object.values(checks).every(v => v);
  return res.status(ok ? 200 : 503).json({ status: ok ? 'ready' : 'missing_config', checks });
};
