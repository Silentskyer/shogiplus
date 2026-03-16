module.exports = (req, res) => {
  const ablyKey =
    process.env.ABLY_KEY ||
    process.env.ABLY_API_KEY ||
    process.env.ABLY_APIKEY ||
    "";

  if (!ablyKey) {
    res.status(500).json({
      error: "Missing Ably env var",
      hasAblyKey: false,
      env: process.env.VERCEL_ENV || "",
      url: process.env.VERCEL_URL || "",
      region: process.env.VERCEL_REGION || "",
      ablyVarsPresent: Object.keys(process.env).filter((key) =>
        key.toUpperCase().includes("ABLY")
      ),
    });
    return;
  }

  res.status(200).json({
    ablyKey,
  });
};
