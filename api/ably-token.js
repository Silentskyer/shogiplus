const Ably = require("ably");

module.exports = (req, res) => {
  const ablyKey =
    process.env.ABLY_KEY ||
    process.env.ABLY_API_KEY ||
    process.env.ABLY_APIKEY ||
    "";

  if (!ablyKey) {
    res.status(500).json({ error: "Missing Ably env var" });
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    let clientId = "player";
    if (req.query && req.query.clientId) {
      clientId = String(req.query.clientId);
    }
    try {
      const parsed = body ? JSON.parse(body) : null;
      if (parsed && parsed.clientId) {
        clientId = String(parsed.clientId);
      }
    } catch {
      // ignore invalid JSON
    }

    const rest = new Ably.Rest({ key: ablyKey });
    rest.auth.createTokenRequest({ clientId }, (err, tokenRequest) => {
      if (err) {
        res.status(500).json({ error: "Token request failed" });
        return;
      }
      res.status(200).json(tokenRequest);
    });
  });
};
