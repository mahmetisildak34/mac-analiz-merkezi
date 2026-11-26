(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MAMDataCenterClient = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  const validScore = value => Number.isInteger(value) && value >= 0;
  const validDate = value => Number.isFinite(Date.parse(value));

  function mapTeamHistory(bundle, side, providerTeamId) {
    const analysis = bundle?.analyses?.[side];
    const payload = analysis?.payload;
    const expectedKey = bundle?.fixture?.teamAnalysisKeys?.[side];
    if (!payload || !expectedKey || analysis.key !== expectedKey || payload.historyCount !== 10 ||
        !Array.isArray(payload.history) || payload.history.length !== 10) return null;
    const kickoff = bundle.fixture.kickoff;
    if (!validDate(kickoff) || !Number.isFinite(Number(providerTeamId))) return null;
    const mapped = [];
    for (const item of payload.history) {
      if (!item || !validDate(item.kickoff) || Date.parse(item.kickoff) >= Date.parse(kickoff) ||
          !validScore(item.goalsFor) || !validScore(item.goalsAgainst) || !["home", "away"].includes(item.venue)) return null;
      const ownIsHome = item.venue === "home";
      const halftime = item.halftime && validScore(item.halftime.homeScore) && validScore(item.halftime.awayScore)
        ? { home: item.halftime.homeScore, away: item.halftime.awayScore } : null;
      mapped.push({
        fixture: { id: item.archiveRef, date: item.kickoff, status: { short: "FT" } },
        teams: { home: { id: ownIsHome ? Number(providerTeamId) : 0 }, away: { id: ownIsHome ? 0 : Number(providerTeamId) } },
        goals: { home: ownIsHome ? item.goalsFor : item.goalsAgainst, away: ownIsHome ? item.goalsAgainst : item.goalsFor },
        score: halftime ? { halftime } : null,
        statistics: [{ team: { id: Number(providerTeamId) }, statistics: (Array.isArray(item.statistics) ? item.statistics : [])
          .filter(stat => stat?.verified === true && Number.isFinite(Number(stat.value)))
          .map(stat => ({ type: String(stat.name || ""), value: stat.value })) }],
        mamPreparedStats: Array.isArray(item.statistics) ? item.statistics : [],
        mamPreparedHistory: true
      });
    }
    return mapped;
  }

  async function loadPreparedAnalysis(fetchBundle, request) {
    if (typeof fetchBundle !== "function" || !request?.provider || !request?.fixtureId ||
        !request?.kickoff || !Number.isFinite(Date.parse(request.kickoff))) return null;
    try {
      const bundle = await fetchBundle({ provider: String(request.provider).toLowerCase(), fixtureId: String(request.fixtureId) });
      const fixture = bundle?.fixture;
      if (!fixture || String(fixture.provider || "").toLowerCase() !== String(request.provider).toLowerCase() ||
          String(fixture.providerFixtureId || "") !== String(request.fixtureId) ||
          !validDate(fixture.kickoff) || Math.abs(Date.parse(fixture.kickoff) - Date.parse(request.kickoff)) > 10 * 60 * 1000 ||
          fixture.status !== "scheduled") return null;
      const homeHistory = mapTeamHistory(bundle, "home", request.homeTeamId);
      const awayHistory = mapTeamHistory(bundle, "away", request.awayTeamId);
      if (!homeHistory || !awayHistory) return null;
      return { homeHistory, awayHistory, source: "prepared" };
    } catch (_) {
      return null;
    }
  }

  return Object.freeze({ mapTeamHistory, loadPreparedAnalysis });
});
