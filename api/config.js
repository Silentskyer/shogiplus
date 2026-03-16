module.exports = (req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";

  if (!supabaseUrl || !supabaseAnonKey) {
    res.status(500).json({ error: "Missing Supabase env vars" });
    return;
  }

  res.status(200).json({
    supabaseUrl,
    supabaseAnonKey,
  });
};
