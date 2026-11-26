"use strict";
const Identity = require("./team-identity-registry.js");

const DEFAULT_HISTORY_THRESHOLD = 10;
const DEFAULT_MAX_ATTEMPTS = 2;
// Turkey is UTC+3 year-round; Worker Cron expressions are UTC.
const TURKEY_DAILY_CRON_UTC = "1 21 * * *";
const isoTime = value => {
  const n = Date.parse(value);
  return Number.isFinite(n) ? n : NaN;
};
const matchKey = match => {
  const provider = String(match.provider || "").trim().toLowerCase();
  const fixtureId = String(match.providerFixtureId || match.fixtureId || "").trim();
  return fixtureId ? `${provider}:${fixtureId}` :
    [provider, match.kickoff, match.homeTeamId, match.awayTeamId].map(x => String(x || "").trim()).join("|");
};
function validCompletedMatch(match, beforeDate) {
  if (!match || match.status !== "completed" || match.verified !== true) return false;
  const date = isoTime(match.kickoff);
  const before = isoTime(beforeDate);
  return Number.isFinite(date) && Number.isFinite(before) && date < before &&
    Number.isInteger(match.homeScore) && match.homeScore >= 0 &&
    Number.isInteger(match.awayScore) && match.awayScore >= 0 &&
    Boolean(match.homeTeamId && match.awayTeamId && match.homeTeamId !== match.awayTeamId);
}
function normalizeCandidate(record, teamId) {
  const home = String(record.homeTeamId) === teamId;
  return {
    provider: record.provider,
    providerFixtureId: String(record.providerFixtureId),
    kickoff: record.kickoff,
    homeTeamId: String(record.homeTeamId),
    awayTeamId: String(record.awayTeamId),
    homeScore: record.homeScore,
    awayScore: record.awayScore,
    subjectTeamId: teamId,
    subjectGoals: home ? record.homeScore : record.awayScore,
    opponentGoals: home ? record.awayScore : record.homeScore,
    competitionId: String(record.competitionId || ""),
    status: "completed",
    verified: true,
    source: record.source || record.provider
  };
}
async function withBoundedRetry(fn, maxAttempts, onFailure) {
  let last;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { return await fn(attempt); }
    catch (error) {
      last = error;
      if (onFailure) onFailure({ attempt, error: String(error?.message || error) });
    }
  }
  throw last;
}

/**
 * adapters:
 *  - listSupportedLeagues() -> [{id, slug}]
 *  - listFixtures(league, {from,to}) -> fixtures with home/away candidate objects
 *  - loadIdentities(), loadVerifiedHistory(teamId,beforeDate), loadExistingKeys(teamId)
 *  - fetchTeamHistory({teamId, providerTeamId, beforeDate, competitions}) -> completed candidates
 *  - recordReview(item), appendVerifiedMatches(teamId, rows), noteRetryFailure(item)
 * The processor never performs network, schedule, or database work on its own.
 */
async function runDailyHistoryAudit(adapters, options = {}) {
  const threshold = DEFAULT_HISTORY_THRESHOLD;
  const maxAttempts = Number.isInteger(options.maxAttempts)
    ? Math.max(1, Math.min(DEFAULT_MAX_ATTEMPTS, options.maxAttempts)) : DEFAULT_MAX_ATTEMPTS;
  const dryRun = options.dryRun !== false;
  const now = options.now || new Date().toISOString();
  const horizonDays = Number.isInteger(options.horizonDays) ? options.horizonDays : 14;
  const until = new Date(Date.parse(now) + horizonDays * 86400000).toISOString();
  const leagues = await adapters.listSupportedLeagues();
  const identities = await adapters.loadIdentities();
  const fixtureRows = [];
  for (const league of leagues) {
    const fixtures = await adapters.listFixtures(league, { from: now, to: until });
    for (const fixture of fixtures || []) fixtureRows.push({ league, fixture });
  }
  const seenFixtures = new Set();
  const teams = new Map();
  const review = [];
  for (const { league, fixture } of fixtureRows) {
    const fixtureId = String(fixture.providerFixtureId || fixture.fixtureId || "");
    if (!fixtureId || seenFixtures.has(`${league.id}:${fixtureId}`)) continue;
    seenFixtures.add(`${league.id}:${fixtureId}`);
    const kickoff = isoTime(fixture.kickoff);
    if (!Number.isFinite(kickoff) || kickoff < Date.parse(now) || kickoff > Date.parse(until)) continue;
    for (const side of ["home", "away"]) {
      const team = fixture[side];
      const resolution = Identity.resolveIdentity({
        provider: team.provider || fixture.provider,
        providerTeamId: team.providerTeamId,
        name: team.name,
        countryCode: team.countryCode,
        competitionId: league.id,
        eventDate: fixture.kickoff
      }, identities, await adapters.loadReviewCandidates?.() || []);
      if (resolution.status !== "matched") {
        const key = `${fixture.provider || "unknown"}:${fixtureId}:${side}:${team.providerTeamId || Identity.normalizeTeamName(team.name)}`;
        const item = { key, leagueId: String(league.id), fixtureId, side, name: team.name, resolution };
        review.push(item);
        if (!dryRun && adapters.recordReview) await adapters.recordReview(item);
        continue;
      }
      if (!teams.has(resolution.teamId)) {
        const identity = identities.find(item => item.teamId === resolution.teamId);
        const providerLink = identity?.providerIds?.find(link => link.verified === true || link.verified === 1);
        teams.set(resolution.teamId, { teamId: resolution.teamId, providerTeamId: providerLink?.providerTeamId || null, fixtures: [] });
      }
      teams.get(resolution.teamId).fixtures.push({ fixtureId, kickoff: fixture.kickoff, leagueId: String(league.id) });
    }
  }
  const report = { dryRun, leaguesChecked: leagues.length, fixturesChecked: seenFixtures.size, teamsChecked: teams.size,
    sufficientTeams: [], incompleteTeams: [], verifiedMatches: 0, newlyInsertable: 0,
    inserted: 0, unresolved: review, retryFailures: [], conflicts: [] };
  for (const team of teams.values()) {
    const beforeDate = team.fixtures.map(f => f.kickoff).sort()[0];
    const local = await adapters.loadVerifiedHistory(team.teamId, beforeDate);
    const localByKey = new Map();
    for (const match of local || []) {
      if (validCompletedMatch(match, beforeDate)) localByKey.set(matchKey(match), match);
    }
    if (localByKey.size >= threshold) {
      report.sufficientTeams.push({ teamId: team.teamId, verifiedHistory: localByKey.size });
      continue;
    }
    report.incompleteTeams.push({ teamId: team.teamId, verifiedHistory: localByKey.size });
    const knownKeys = await adapters.loadExistingKeys(team.teamId);
    const existingRecords = adapters.loadExistingMatches ? await adapters.loadExistingMatches(team.teamId, beforeDate) : [];
    const existing = new Set([...(knownKeys || []), ...localByKey.keys()]);
    const existingByKey = new Map([...localByKey, ...(existingRecords || []).map(match => [matchKey(match), match])]);
    let fetched;
    try {
      fetched = await withBoundedRetry(() => adapters.fetchTeamHistory({
        teamId: team.teamId,
        providerTeamId: team.providerTeamId,
        beforeDate,
        competitions: "all-verified-leagues-and-cups"
      }), maxAttempts, failure => report.retryFailures.push({ teamId: team.teamId, ...failure }));
    } catch (error) {
      const failure = { teamId: team.teamId, attempts: maxAttempts, error: String(error?.message || error) };
      report.retryFailures.push(failure);
      if (!dryRun && adapters.noteRetryFailure) await adapters.noteRetryFailure(failure);
      continue;
    }
    const validated = new Map();
    for (const raw of fetched || []) {
      const row = normalizeCandidate(raw, team.teamId);
      if (row.kickoff >= beforeDate || !validCompletedMatch(row, beforeDate)) continue;
      const key = matchKey(row);
      if (existing.has(key)) {
        const stored = existingByKey.get(key);
        if (stored && (Number(stored.homeScore) !== row.homeScore || Number(stored.awayScore) !== row.awayScore)) {
          const conflict = { teamId: team.teamId, key, records: [stored, row], status: "pending_review" };
          report.conflicts.push(conflict);
          if (!dryRun && adapters.recordReview) await adapters.recordReview(conflict);
        }
        continue;
      }
      const prior = validated.get(key);
      if (prior && (prior.homeScore !== row.homeScore || prior.awayScore !== row.awayScore)) {
        const conflict = { teamId: team.teamId, key, records: [prior, row], status: "pending_review" };
        report.conflicts.push(conflict);
        if (!dryRun && adapters.recordReview) await adapters.recordReview(conflict);
        validated.delete(key);
        continue;
      }
      validated.set(key, row);
    }
    const additional = [...validated.values()];
    report.verifiedMatches += additional.length;
    report.newlyInsertable += additional.length;
    if (!dryRun && additional.length && adapters.appendVerifiedMatches) {
      report.inserted += await adapters.appendVerifiedMatches(team.teamId, additional);
    }
  }
  return report;
}

module.exports = { runDailyHistoryAudit, validCompletedMatch, matchKey, DEFAULT_HISTORY_THRESHOLD, DEFAULT_MAX_ATTEMPTS, TURKEY_DAILY_CRON_UTC };
