module.exports = (req, res) => {
  const ablyKey = process.env.ABLY_KEY || "";

  if (!ablyKey) {
    res.status(500).json({ error: "Missing Ably env var" });
    return;
  }

  res.status(200).json({
    ablyKey,
  });
};
