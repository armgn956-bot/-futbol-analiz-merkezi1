const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.FOOTBALL_DATA_TOKEN;

const SPORTSDB_URL = "https://www.thesportsdb.com/api/v1/json/123";

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
        id: 4339,
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

app.get("/api/matches", async function (req, res) {
  const code = String(req.query.competition || "");

  try {
    if (code === "TSL") {
      const season = String(
        req.query.season || "2026-2027"
      );

      if (!/^\d{4}-\d{4}$/.test(season)) {
        return res.status(400).json({
          error: "Sezon formati hatali. Ornek: 2026-2027"
        });
      }

      const data = await sportsDbApi(
        "/eventsseason.php?id=4339&s=" +
        encodeURIComponent(season)
      );

      const matches = (data.events || []).map(function (match) {
        return {
          id: match.idEvent,
          date: match.strTimestamp || match.dateEvent,
          status: match.strStatus || "SCHEDULED",
          home: match.strHomeTeam,
          away: match.strAwayTeam,
          homeId: match.idHomeTeam,
          awayId: match.idAwayTeam,
          homeGoals:
            match.intHomeScore == null
              ? null
              : Number(match.intHomeScore),
          awayGoals:
            match.intAwayScore == null
              ? null
              : Number(match.intAwayScore)
        };
      });

      return res.json({
        competition: "Turkiye Super Ligi",
        season: season,
        matches: matches,
        source: "TheSportsDB",
        warning: matches.length === 0
          ? "Bu sezon icin mac verisi bulunamadi."
          : "Ucretsiz veri kaynaginda eksik maclar olabilir."
      });
    }

    if (!/^[A-Z0-9]{2,5}$/.test(code)) {
      return res.status(400).json({
        error: "Gecerli bir lig kodu secin."
      });
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

    res.json({
      competition: data.competition
        ? data.competition.name
        : code,
      matches: matches
    });
  } catch (error) {
    res.status(error.status || 500).json({
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