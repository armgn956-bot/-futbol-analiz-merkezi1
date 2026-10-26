const express = require(“express”);
const path = require(“path”);

const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.FOOTBALL_DATA_TOKEN;

const SPORTSDB_URL = “https://www.thesportsdb.com/api/v1/json/123”;

app.use(express.static(path.join(__dirname, “public”)));
app.use(express.json());

async function footballApi(pathname) {
if (!TOKEN) {
const e = new Error(“Canlı veri anahtarı ayarlanmamış. Render ortamındaki FOOTBALL_DATA_TOKEN ayarını kontrol edin.”);
e.status = 503;
throw e;
}

const r = await fetch(“https://api.football-data.org/v4” + pathname, {
headers: { “X-Auth-Token”: TOKEN }
});

if (!r.ok) {
const messages = {
400: “İstek geçersiz. Lig kodunu kontrol edin.”,
403: “Bu lig mevcut API planında desteklenmiyor olabilir.”,
429: “API istek sınırına ulaşıldı. Biraz bekleyip tekrar deneyin.”
};

const e = new Error(messages[r.status] || ("Veri sağlayıcısı hata döndürdü (" + r.status + ")."));
e.status = r.status;
throw e;

}

return r.json();
}

async function sportsDbApi(pathname) {
const r = await fetch(SPORTSDB_URL + pathname);

if (!r.ok) {
const e = new Error(“Süper Lig veri kaynağı hata döndürdü (” + r.status + “).”);
e.status = r.status;
throw e;
}

return r.json();
}

app.get(”/api/status”, (_req, res) => {
res.json({
connected: Boolean(TOKEN),
provider: “football-data.org + TheSportsDB”,
note: “API anahtarı yalnızca sunucuda saklanır.”
});
});

app.get(”/api/competitions”, async (_req, res) => {
try {
let competitions = [];

if (TOKEN) {
  const d = await footballApi("/competitions");
  competitions = (d.competitions || [])
    .map(c => ({
      id: c.id,
      name: c.name,
      code: c.code,
      area: c.area?.name,
      currentSeason: c.currentSeason?.startDate
    }))
    .filter(c => c.code);
}
if (!competitions.some(c => c.code === "TSL")) {
  competitions.push({
    id: 4339,
    name: "Türkiye Süper Ligi",
    code: "TSL",
    area: "Türkiye",
    currentSeason: "2026-08-01"
  });
}
res.json(competitions);

} catch (e) {
res.status(e.status || 500).json({ error: e.message });
}
});

app.get(”/api/matches”, async (req, res) => {
const code = String(req.query.competition || “”);

try {
if (code === “TSL”) {
const season = String(req.query.season || “2026-2027”);

  if (!/^\d{4}-\d{4}$/.test(season)) {
    return res.status(400).json({
      error: "Sezon biçimi geçersiz. Örnek: 2026-2027"
    });
  }
  const d = await sportsDbApi(
    "/eventsseason.php?id=4339&s=" + encodeURIComponent(season)
  );
  const matches = (d.events || []).map(m => ({
    id: m.idEvent,
    date: m.strTimestamp || m.dateEvent,
    status: m.strStatus || "SCHEDULED",
    home: m.strHomeTeam,
    away: m.strAwayTeam,
    homeId: m.idHomeTeam,
    awayId: m.idAwayTeam,
    homeGoals: m.intHomeScore == null ? null : Number(m.intHomeScore),
    awayGoals: m.intAwayScore == null ? null : Number(m.intAwayScore)
  }));
  return res.json({
    competition: "Türkiye Süper Ligi",
    season,
    matches,
    source: "TheSportsDB",
    warning: matches.length === 0
      ? "Bu sezon için maç verisi gelmedi. Sezon kaydı veya API kapsamı kontrol edilmeli."
      : "Ücretsiz veri kaynağında maç kapsamı sınırlı olabilir."
  });
}
if (!/^[A-Z0-9]{2,5}$/.test(code)) {
  return res.status(400).json({ error: "Geçerli bir lig kodu seçin." });
}
const d = await footballApi(
  "/competitions/" + encodeURIComponent(code) + "/matches"
);
const matches = (d.matches || []).map(m => ({
  id: m.id,
  date: m.utcDate,
  status: m.status,
  home: m.homeTeam?.name,
  away: m.awayTeam?.name,
  homeId: m.homeTeam?.id,
  awayId: m.awayTeam?.id,
  homeGoals: m.score?.fullTime?.home,
  awayGoals: m.score?.fullTime?.away
}));
res.json({ competition: d.competition?.name || code, matches });

} catch (e) {
res.status(e.status || 500).json({ error: e.message });
}
});

app.get(”/api/health”, (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
console.log(“Futbol Analiz Merkezi “ + PORT + “ portunda çalışıyor.”);
});