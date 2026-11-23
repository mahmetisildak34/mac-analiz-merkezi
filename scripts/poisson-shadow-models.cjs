const { frontendRates, legacyMarkets, normalizedMarkets } = require("./backtest-poisson.cjs");
const { models } = require("./poisson-shadow-ledger.cjs");

const aliases = {
  "tur.1": {
    "amed sfk": "Amedspor", "caykur rizespor": "Rizespor", "erzurum bb": "Erzurumspor",
    "gaziantep fk": "Gaziantep", "goztepe": "Goztep", "istanbul basaksehir": "Buyuksehyr", "corum fk": "Corum"
  },
  "eng.1": {
    "afc bournemouth": "Bournemouth", "brighton hove albion": "Brighton", "coventry city": "Coventry",
    "hull city": "Hull", "ipswich town": "Ipswich", "leeds united": "Leeds", "manchester city": "Man City",
    "manchester united": "Man United", "newcastle united": "Newcastle", "nottingham forest": "Nott'm Forest",
    "tottenham hotspur": "Tottenham", "west ham united": "West Ham", "wolverhampton wanderers": "Wolves"
  },
  "ger.1": {
    "1 fc union berlin": "Union Berlin", "bayer leverkusen": "Leverkusen",
    "borussia dortmund": "Dortmund", "borussia monchengladbach": "M'gladbach",
    "eintracht frankfurt": "Ein Frankfurt", "fc augsburg": "Augsburg", "fc cologne": "FC Koln",
    "hamburg sv": "Hamburg", "sc freiburg": "Freiburg", "sc paderborn 07": "Paderborn",
    "sv elversberg": "Elversberg", "tsg hoffenheim": "Hoffenheim", "vfb stuttgart": "Stuttgart"
  },
  "esp.1": {
    "athletic club": "Ath Bilbao", "atletico madrid": "Ath Madrid", "celta vigo": "Celta",
    "deportivo": "La Coruna", "espanyol": "Espanol", "racing santander": "Santander",
    "rayo vallecano": "Vallecano", "real betis": "Betis", "real sociedad": "Sociedad"
  },
  "ita.1": { "ac milan": "Milan", "as roma": "Roma", "internazionale": "Inter" },
  "fra.1": {
    "aj auxerre": "Auxerre", "as monaco": "Monaco", "le havre ac": "Le Havre",
    "paris saint germain": "Paris SG", "stade rennais": "Rennes"
  }
};
const normalizeName = value => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/ı/g, "i").replace(/[^a-z0-9 ]/g, " ").trim().replace(/ +/g, " ");

function archiveName(names, league, name) {
  const key = normalizeName(name);
  const alias = aliases[league]?.[key];
  const matches = [...names].filter(team => alias ? team === alias : normalizeName(team) === key);
  return matches.length === 1 ? matches[0] : null;
}

function preparePeriod(rows, worker, trainingCutoff, period) {
  const league = worker.createLeague(trainingCutoff, { detailed: true });
  const teams = new Map();
  const names = new Map();
  const rowsForPeriod = period === "full" ? rows : rows.filter(r => r.half);
  const targetFor = (kickoff, home, away) => ({
    kickoff, home_team: names.get(home).key, away_team: names.get(away).key
  });
  function admitClub(name, season) {
    const prior = names.get(name);
    if (!prior || season > prior.season + 1) {
      names.set(name, { key: `${name} [${season}]`, season });
      teams.delete(name);
    } else prior.season = season;
  }
  for (let start = 0; start < rowsForPeriod.length;) {
    const day = rowsForPeriod[start].day;
    let end = start + 1;
    while (end < rowsForPeriod.length && rowsForPeriod[end].day === day) end++;
    const observations = rowsForPeriod.slice(start, end).map(row => {
      admitClub(row.home, row.season);
      admitClub(row.away, row.season);
      const target = targetFor(day, row.home, row.away);
      const [hg, ag] = period === "full" ? [row.hg, row.ag] : row.half;
      return { row, target, hg, ag, forecast: day < trainingCutoff ? league.predict(target) : {} };
    });
    for (const { row, target, hg, ag, forecast } of observations) {
      league.observe(target, { id: row.id, hg, ag }, forecast);
      for (const [team, venue, gf, ga] of [[row.home, "home", hg, ag], [row.away, "away", ag, hg]]) {
        const history = teams.get(team) ?? [];
        history.push({ venue, gf, ga });
        teams.set(team, history);
      }
    }
    start = end;
  }
  function forecast(asOf, home, away) {
    const h = teams.get(home) ?? [];
    const a = teams.get(away) ?? [];
    const rates = frontendRates(h, a);
    const baseline = rates ? Object.fromEntries([
      [models[0], legacyMarkets(...rates, true)], [models[1], normalizedMarkets(...rates, true)]
    ].map(([name, value]) => [name, { ...value, rates,
      venueMatches: [h.slice(-10).filter(m => m.venue === "home").length, a.slice(-10).filter(m => m.venue === "away").length] }])) : {};
    const research = names.has(home) && names.has(away) ? league.predict(targetFor(asOf, home, away)).models ?? {} : {};
    return { ...baseline, ...research };
  }
  return { forecast, names: new Set(names.keys()), rows: rowsForPeriod.length };
}

function predictGroup(fixture, sourceAt, periods, revisions) {
  const home = archiveName(periods.full.names, fixture.league, fixture.home.name);
  const away = archiveName(periods.full.names, fixture.league, fixture.away.name);
  if (!home || !away || home === away) return { reason: "unmatched_archive_team" };
  const full = periods.full.forecast(sourceAt, home, away);
  if (!models.every(name => full[name])) return { reason: "insufficient_shared_market_history",
    available: Object.keys(full) };
  const half = periods.half.forecast(sourceAt, home, away);
  const enrich = market => market ? {
    ...market, under25: 1 - market.over25, noBtts: 1 - market.btts,
    reliability: { max1x2: Math.max(...market.probabilities), observedVenueMatches: market.venueMatches,
      meaning: "Uncalibrated model confidence and input sample size" }
  } : null;
  return { home, away, models: Object.fromEntries(models.map((name, i) => [name, {
    version: ["legacy", "normalized", "1.2", "1.3", "1.4"][i], revision: i < 2 ? revisions.front : revisions.worker,
    full: enrich(full[name]), half: enrich(half[name])
  }])) };
}

module.exports = { archiveName, normalizeName, predictGroup, preparePeriod };
