const express = require("express");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.FOOTBALL_DATA_TOKEN;
const TFF_API_KEY = process.env.TFF_API_KEY;
const THESTATSAPI_KEY = process.env.THESTATSAPI_KEY;
const SPORTSDB_URL = "https://www.thesportsdb.com/api/v1/json/123";
const SUPER_LEAGUE_ID = 4339;
const SUPER_LEAGUE_SEASONS = [
  "2023-2024",
  "2024-2025",
  "2025-2026",
  "2026-2027"
];
const CACHE_TTL = 15 * 60 * 1000;
const cache = new Map();
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
async function footballApi(pathname) {
  if (!TOKEN) {
    const error = new Error(
      "Canli veri anahtari ayarlanmamis. Render ayarlarindaki FOOTBALL_DATA_TOKEN degerini kontrol edin."
    );
    error.status = 503;
    throw error;
  }
  const response = await fetch(
    "https://api.football-data.org/v4" + pathname,
    {
      headers: {
        "X-Auth-Token": TOKEN
      }
    }
  );
  if (!response.ok) {
    const messages = {
      400: "Gecersiz istek. Lig kodunu kontrol edin.",
      403: "Bu lig mevcut API planinizda desteklenmiyor olabilir.",
      429: "API istek sinirina ulasildi. Biraz bekleyin."
    };
    const error = new Error(
      messages[response.status] ||
      ("Veri saglayicisi hata dondurdu: " + response.status)
    );
    error.status = response.status;
    throw error;
  }
  return response.json();
}
async function sportsDbApi(pathname) {
  const response = await fetch(SPORTSDB_URL + pathname);
  if (!response.ok) {
    const error = new Error(
      "Super Lig veri kaynagi hata dondurdu: " + response.status
    );
    error.status = response.status;
    throw error;
  }
  return response.json();
}
function cached(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.time > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return item.value;
}
function saveCache(key, value) {
  cache.set(key, {
    time: Date.now(),
    value: value
  });
}
function normalizeSuperLeagueMatch(match, season) {
  return {
    id: match.idEvent || null,
    date: match.strTimestamp || match.dateEvent || null,
    status: match.strStatus || "SCHEDULED",
    home: match.strHomeTeam || null,
    away: match.strAwayTeam || null,
    homeId: match.idHomeTeam || null,
    awayId: match.idAwayTeam || null,
    homeGoals:
      match.intHomeScore == null ||
      match.intHomeScore === ""
        ? null
        : Number(match.intHomeScore),
    awayGoals:
      match.intAwayScore == null ||
      match.intAwayScore === ""
        ? null
        : Number(match.intAwayScore),
    season: season
  };
}
async function getSuperLeagueMatches() {
  const key = "super-league-all-seasons";
  const existing = cached(key);
  if (existing) return existing;
  const results = await Promise.all(
    SUPER_LEAGUE_SEASONS.map(async function (season) {
      try {
        const data = await sportsDbApi(
          "/eventsseason.php?id=" +
          SUPER_LEAGUE_ID +
          "&s=" +
          encodeURIComponent(season)
        );
        return {
          season: season,
          matches: (data.events || []).map(function (match) {
            return normalizeSuperLeagueMatch(match, season);
          }),
          error: null
        };
      } catch (error) {
        return {
          season: season,
          matches: [],
          error: error.message
        };
      }
    })
  );
  const allMatches = [];
  const seen = new Set();
  for (const result of results) {
    for (const match of result.matches) {
      const keyParts = [
        match.id,
        match.date,
        match.home,
        match.away
      ];
      const uniqueKey = match.id
        ? String(match.id)
        : keyParts.join("|");
      if (seen.has(uniqueKey)) continue;
      seen.add(uniqueKey);
      allMatches.push(match);
    }
  }
  allMatches.sort(function (a, b) {
    return new Date(a.date || 0) - new Date(b.date || 0);
  });
  const response = {
    competition: "Turkiye Super Ligi",
    seasons: results.map(function (item) {
      return {
        season: item.season,
        matchCount: item.matches.length,
        error: item.error
      };
    }),
    matches: allMatches,
    source: "TheSportsDB",
    warning:
      results.some(function (item) {
        return Boolean(item.error);
      })
        ? "Bazi sezonlar yuklenemedi. Veri kaynagi veya istek siniri kontrol edilmeli."
        : "Veriler birden fazla sezondan birlestirildi. Kaynakta eksik maclar bulunabilir."
  };
  saveCache(key, response);
  return response;
}
app.get("/api/status", function (_req, res) {
  res.json({
    connected: Boolean(TOKEN),
    provider: "football-data.org + TheSportsDB",
    note: "API anahtari sunucuda saklanir."
  });
});
app.get("/api/competitions", async function (_req, res) {
  try {
    let competitions = [];
    if (TOKEN) {
      const data = await footballApi("/competitions");
      competitions = (data.competitions || [])
        .map(function (competition) {
          return {
            id: competition.id,
            name: competition.name,
            code: competition.code,
            area: competition.area
              ? competition.area.name
              : null,
            currentSeason: competition.currentSeason
              ? competition.currentSeason.startDate
              : null
          };
        })
        .filter(function (competition) {
          return Boolean(competition.code);
        });
    }
    if (
      !competitions.some(function (competition) {
        return competition.code === "TSL";
      })
    ) {
      competitions.push({
        id: SUPER_LEAGUE_ID,
        name: "Turkiye Super Ligi",
        code: "TSL",
        area: "Turkiye",
        currentSeason: "2026-2027"
      });
    }
    res.json(competitions);
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message
    });
  }
});
app.get("/api/1lig/fixtures", async function (_req, res) {
  try {
    if (!THESTATSAPI_KEY) {
      return res.status(500).json({
        error: "THESTATSAPI_KEY bulunamadı."
      });
    }

    const url = new URL(
      "https://api.thestatsapi.com/api/football/matches"
    );

    url.searchParams.set("competition_id", "comp_8448");
    url.searchParams.set("per_page", "100");

    const response = await fetch(url, {
      headers: {
        Authorization: "Bearer " + THESTATSAPI_KEY,
        Accept: "application/json"
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "TheStatsAPI isteği başarısız oldu."
      });
    }

    const matches = (data.data || []).map(function (match) {
      return {
        id: match.id,
        date: match.utc_date,
        status: match.status,
        home: match.home_team ? match.home_team.name : null,
        away: match.away_team ? match.away_team.name : null,
        homeGoals: match.home_team
          ? match.home_team.score
          : null,
        awayGoals: match.away_team
          ? match.away_team.score
          : null
      };
    });

    res.json({
      competition: "Türkiye 1. Lig",
      matches: matches,
      pagination: data.meta || null
    });
  } catch (_error) {
    res.status(502).json({
      error: "Türkiye 1. Lig verileri alınamadı."
    });
  }
});
app.get("/api/matches", async function (req, res) {
  const code = String(req.query.competition || "");
  try {
    if (code === "TSL") {
      const season = req.query.season
        ? String(req.query.season)
        : null;
      if (season && !/^\d{4}-\d{4}$/.test(season)) {
        return res.status(400).json({
          error: "Sezon formati hatali. Ornek: 2026-2027"
        });
      }
      if (season) {
        const data = await sportsDbApi(
          "/eventsseason.php?id=" +
          SUPER_LEAGUE_ID +
          "&s=" +
          encodeURIComponent(season)
        );
        const matches = (data.events || []).map(function (match) {
          return normalizeSuperLeagueMatch(match, season);
        });
        return res.json({
          competition: "Turkiye Super Ligi",
          season: season,
          matches: matches,
          source: "TheSportsDB",
          warning: matches.length === 0
            ? "Bu sezon icin mac verisi bulunamadi."
            : "Veri kaynaginda eksik maclar olabilir."
        });
      }
      return res.json(await getSuperLeagueMatches());
    }
    if (!/^[A-Z0-9]{2,5}$/.test(code)) {
      return res.status(400).json({
        error: "Gecerli bir lig kodu secin."
      });
    }
    const cacheKey = "competition-" + code;
    const existing = cached(cacheKey);
    if (existing) {
      return res.json(existing);
    }
    const data = await footballApi(
      "/competitions/" +
      encodeURIComponent(code) +
      "/matches"
    );
    const matches = (data.matches || []).map(function (match) {
      return {
        id: match.id,
        date: match.utcDate,
        status: match.status,
        home: match.homeTeam
          ? match.homeTeam.name
          : null,
        away: match.awayTeam
          ? match.awayTeam.name
          : null,
        homeId: match.homeTeam
          ? match.homeTeam.id
          : null,
        awayId: match.awayTeam
          ? match.awayTeam.id
          : null,
        homeGoals: match.score &&
          match.score.fullTime
            ? match.score.fullTime.home
            : null,
        awayGoals: match.score &&
          match.score.fullTime
            ? match.score.fullTime.away
            : null
      };
    });
    const result = {
      competition: data.competition
        ? data.competition.name
        : code,
      matches: matches
    };
    saveCache(cacheKey, result);
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message
    });
  }
});
async function tffApi(type, week) {
  if (!TFF_API_KEY) {
    throw new Error("TFF_API_KEY Render ortam değişkeninde bulunamadı.");
  }

  const params = new URLSearchParams({
    apikey: TFF_API_KEY,
    tip: type
  });

  if (type === "fiktur" && week) {
    params.set("hafta", String(week));
  }

  const response = await fetch(
    "https://tff.kkerem.com/?" + params.toString()
  );

  if (!response.ok) {
    throw new Error("TFF API HTTP hatası: " + response.status);
  }

  return response.json();
}

app.get("/api/tsl/fixtures", async function (req, res) {
  try {
    const week = req.query.hafta
      ? Number(req.query.hafta)
      : null;

    if (week !== null &&
        (!Number.isInteger(week) || week < 1 || week > 34)) {
      return res.status(400).json({
        error: "Hafta 1 ile 34 arasında olmalıdır."
      });
    }

    const data = await tffApi("fiktur", week);
    res.json(data);
  } catch (error) {
    res.status(502).json({
      error: error.message
    });
  }
});

app.get("/api/tsl/standings", async function (_req, res) {
  try {
    const data = await tffApi("puan");
    res.json(data);
  } catch (error) {
    res.status(502).json({
      error: error.message
    });
  }
});
app.get("/api/health", function (_req, res) {
  res.json({
    ok: true
  });
});
app.listen(PORT, function () {
  console.log(
    "Futbol Analiz Merkezi " +
    PORT +
    " portunda calisiyor."
  );
});
app.get("/api/1lig/fixtures", async function (_req, res) {
  try {
    if (!THESTATSAPI_KEY) {
      return res.status(500).json({
        error: "THESTATSAPI_KEY bulunamadı."
      });
    }
    const url = new URL(
      "https://api.thestatsapi.com/api/football/matches"
    );
    url.searchParams.set("competition_id", "comp_8448");
    url.searchParams.set("per_page", "100");
    const response = await fetch(url, {
      headers: {
        Authorization: "Bearer " + THESTATSAPI_KEY,
        Accept: "application/json"
      }
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        error: "TheStatsAPI isteği başarısız oldu."
      });
    }
    const matches = (data.data || []).map(function (match) {
      return {
        id: match.id,
        date: match.utc_date || match.date || null,
        status: match.status || null,
        home: match.home_team ? match.home_team.name : null,
        away: match.away_team ? match.away_team.name : null,
        homeGoals: match.score?.home ?? match.home_team?.score ?? null,
        awayGoals: match.score?.away ?? match.away_team?.score ?? null
      };
    });
    res.json({
      competition: "Türkiye 1. Lig",
      matches: matches,
      pagination: data.meta || null
    });
  } catch (error) {
    res.status(502).json({
      error: "Türkiye 1. Lig verileri alınamadı."
    });
  }
});