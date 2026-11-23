// Compare immutable archived v1.2 forecasts with read-only public ESPN results.
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { summarize } = require("./backtest-poisson.cjs");

const model = "Archived Worker v1.2";
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const teamKey = value => String(value ?? "").normalize("NFKD").toLowerCase()
  .replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/[^a-z0-9]/g, "");
const equalTime = (a, b) => Date.parse(a) === Date.parse(b);
const completed = status => status?.type?.completed === true && status.type.state === "post"
  && ["STATUS_FULL_TIME", "STATUS_FINAL"].includes(status.type.name);
const probability = value => Number.isFinite(value) && value >= 0 && value <= 1;

function evaluateProspective(evidence, boards, asOf) {
  const generated = Date.parse(evidence.generatedAt);
  const cutoff = Date.parse(asOf);
  if (evidence.modelVersion !== "1.2" || !Number.isFinite(generated) || !(cutoff > generated)
      || evidence.predictionFields.at(-1) !== "predictionEvidenceSha256") {
    throw new Error("Invalid prospective archive or cutoff");
  }
  const rows = [];
  const exclusions = [];
  const seen = new Set();
  for (const record of evidence.predictions) {
    const item = Object.fromEntries(evidence.predictionFields.map((name, i) => [name, record[i]]));
    const { fixtureId, kickoff, providerEvidenceId } = item;
    const provider = /^espn:([a-z0-9.]+):(\d+)$/.exec(providerEvidenceId);
    const scores = item["topScorelines[home,away,probability]"];
    const probabilities = [item.homeWinProbability, item.drawProbability, item.awayWinProbability];
    if (record.length !== evidence.predictionFields.length || !provider || fixtureId !== provider[2]
        || seen.has(fixtureId) || !(generated < Date.parse(kickoff))
        || !/^[a-f0-9]{64}$/.test(item.providerPayloadSha256)
        || sha256(JSON.stringify([...record.slice(0, -1), evidence.generatedAt])) !== item.predictionEvidenceSha256
        || ![...probabilities, item.over25Probability, item.bttsYesProbability].every(probability)
        || Math.abs(probabilities.reduce((sum, p) => sum + p, 0) - 1) > 1e-9
        || scores?.length !== 3 || scores.some(([h, a, p]) =>
          ![h, a].every(x => Number.isSafeInteger(x) && x >= 0) || !probability(p))) {
      throw new Error(`Invalid prospective prediction ${fixtureId}`);
    }
    seen.add(fixtureId);
    const league = provider[1];
    const skip = reason => exclusions.push({ fixtureId, league, reason });
    if (Date.parse(kickoff) >= cutoff) {
      skip("kickoff_after_cutoff");
      continue;
    }
    const board = boards.get(league);
    const events = board?.leagues?.[0]?.slug === league && Array.isArray(board.events)
      ? board.events.filter(event => event?.id === fixtureId) : [];
    const event = events.length === 1 ? events[0] : null;
    if (!event) {
      skip("event_not_verified");
      continue;
    }
    const competition = event.competitions?.length === 1 ? event.competitions[0] : null;
    if (competition?.id !== fixtureId || !equalTime(event.date, kickoff) || !equalTime(competition.date, kickoff)
        || !completed(event.status) || !completed(competition.status)) {
      skip("full_time_or_kickoff_not_verified");
      continue;
    }
    const competitors = competition.competitors;
    const home = Array.isArray(competitors) && competitors.find(side => side?.homeAway === "home");
    const away = Array.isArray(competitors) && competitors.find(side => side?.homeAway === "away");
    if (competitors?.length !== 2 || !teamKey(item.homeTeam) || !teamKey(item.awayTeam)
        || teamKey(home?.team?.displayName) !== teamKey(item.homeTeam)
        || teamKey(away?.team?.displayName) !== teamKey(item.awayTeam)
        || ![home?.score, away?.score].every(score => /^\d{1,2}$/.test(score) && Number(score) <= 30)) {
      skip("teams_or_score_not_verified");
      continue;
    }
    rows.push({ fixtureId, league, kickoff, match: { hg: Number(home.score), ag: Number(away.score) },
      models: { [model]: { probabilities, over25: item.over25Probability, btts: item.bttsYesProbability,
        scores: scores.map(([h, a]) => [h, a]) } } });
  }
  function totals(group) {
    const { top5ScoreAccuracy: top3ScoreAccuracy, ...other } = summarize(group, model);
    return { ...other, top3ScoreAccuracy };
  }
  const leagues = [...new Set(rows.map(row => row.league))];
  return { generatedAt: evidence.generatedAt, asOf, forecasts: seen.size, scored: rows.length,
    matches: rows, exclusions, overall: totals(rows),
    byLeague: Object.fromEntries(leagues.map(league => [league, totals(rows.filter(row => row.league === league))])) };
}

if (require.main === module) {
  try {
    const [archive, boardDirectory, asOf] = process.argv.slice(2);
    if (!archive || !boardDirectory || !asOf) {
      throw new Error("Usage: node scripts/poisson-prospective.cjs FORECASTS.json ESPN_SCOREBOARD_DIR AS_OF_UTC");
    }
    const bytes = readFileSync(archive);
    const evidence = JSON.parse(bytes);
    const boards = new Map();
    const sources = [];
    const kickoffColumn = evidence.predictionFields.indexOf("kickoff");
    const providerColumn = evidence.predictionFields.indexOf("providerEvidenceId");
    for (const league of new Set(evidence.predictions
      .filter(row => Date.parse(row[kickoffColumn]) < Date.parse(asOf))
      .map(row => /^espn:([a-z0-9.]+):\d+$/.exec(row[providerColumn])?.[1]).filter(Boolean))) {
      const path = join(boardDirectory, `${league}.json`);
      let board;
      try { board = readFileSync(path); }
      catch (error) { if (error.code === "ENOENT") continue; throw error; }
      boards.set(league, JSON.parse(board));
      sources.push({ league, name: `${league}.json`, sha256: sha256(board) });
    }
    console.log(JSON.stringify({ archiveSha256: sha256(bytes), sources,
      ...evaluateProspective(evidence, boards, asOf) }, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { evaluateProspective };
