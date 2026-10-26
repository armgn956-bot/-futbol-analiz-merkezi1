const express = require("express");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.FOOTBALL_DATA_TOKEN;

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

async function api(pathname) {
  if (!TOKEN) {
    const e = new Error("Canlı veri anahtarı ayarlanmamış. Hosting ortamına FOOTBALL_DATA_TOKEN ekleyin.");
    e.status = 503; throw e;
  }
  const r = await fetch("https://api.football-data.org/v4" + pathname, {
    headers: { "X-Auth-Token": TOKEN }
  });
  if (!r.ok) {
    const messages = {
      400: "İstek geçersiz. Lig kodunu kontrol edin.",
      403: "Bu lig veya veri türü mevcut API planında olmayabilir.",
      429: "API istek sınırına ulaşıldı. Biraz bekleyip tekrar deneyin."
    };
    const e = new Error(messages[r.status] || ("Veri sağlayıcısı hata döndürdü (" + r.status + ")."));
    e.status = r.status; throw e;
  }
  return r.json();
}
app.get("/api/status", (_req, res) => res.json({
  connected: Boolean(TOKEN),
  provider: "football-data.org",
  note: "API anahtarı yalnızca sunucuda saklanır."
}));
app.get("/api/competitions", async (_req, res) => {
  try {
    const d = await api("/competitions");
    res.json((d.competitions || []).map(c => ({
      id: c.id, name: c.name, code: c.code, area: c.area?.name,
      currentSeason: c.currentSeason?.startDate
    })).filter(c => c.code));
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});
app.get("/api/matches", async (req, res) => {
  const code = String(req.query.competition || "");
  if (!/^[A-Z0-9]{2,5}$/.test(code)) return res.status(400).json({ error: "Geçerli bir lig kodu seçin." });
  try {
    const d = await api("/competitions/" + encodeURIComponent(code) + "/matches");
    const matches = (d.matches || []).map(m => ({
      id: m.id, date: m.utcDate, status: m.status,
      home: m.homeTeam?.name, away: m.awayTeam?.name,
      homeId: m.homeTeam?.id, awayId: m.awayTeam?.id,
      homeGoals: m.score?.fullTime?.home, awayGoals: m.score?.fullTime?.away
    }));
    res.json({ competition: d.competition?.name || code, matches });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.listen(PORT, () => console.log("Futbol Analiz Merkezi " + PORT + " portunda çalışıyor."));
