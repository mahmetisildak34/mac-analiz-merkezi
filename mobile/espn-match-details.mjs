// Read-only ESPN soccer summary normalization. No network or storage side effects.
const asArray = value => Array.isArray(value) ? value : [];
const safeText = value => value == null ? "" : String(value).trim();
const teamId = value => safeText(value?.team?.id ?? value?.id);
export function normalizeMatchDetails(summary = {}) {
  const competition = asArray(summary?.header?.competitions)[0] ?? asArray(summary?.boxscore?.competitions)[0] ?? {};
  const competitors = asArray(competition.competitors).length
    ? asArray(competition.competitors) : asArray(summary?.boxscore?.players);
  const teams = competitors.map(item => ({
    id: teamId(item),
    name: safeText(item?.team?.displayName ?? item?.team?.name),
    side: ["home", "away"].includes(item?.homeAway) ? item.homeAway : null
  }));
  const events = asArray(summary?.details).map((event, index) => ({
    id: safeText(event?.id) || `event-${index}`,
    minute: safeText(event?.clock?.displayValue ?? event?.clock?.value ?? event?.displayClock),
    type: safeText(event?.type?.text ?? event?.type?.displayName ?? event?.type?.name ?? event?.text),
    text: safeText(event?.text ?? event?.shortText),
    teamId: teamId(event?.team),
    participants: asArray(event?.participants).map(p => safeText(p?.athlete?.displayName)).filter(Boolean)
  }));
  const statistics = asArray(summary?.boxscore?.players).flatMap(entry =>
    asArray(entry?.statistics).map(group => ({
      teamId: teamId(entry),
      category: safeText(group?.name ?? group?.displayName),
      labels: asArray(group?.labels).map(safeText),
      athletes: asArray(group?.athletes).map(player => ({
        id: safeText(player?.athlete?.id),
        name: safeText(player?.athlete?.displayName),
        stats: asArray(player?.stats).map(safeText)
      }))
    }))
  );
  const teamStats = asArray(summary?.boxscore?.teams).map(entry => ({
    teamId: teamId(entry),
    statistics: asArray(entry?.statistics).map(s => ({
      name: safeText(s?.name ?? s?.label),
      value: safeText(s?.displayValue ?? s?.value)
    }))
  }));
  const lineups = asArray(summary?.rosters).map(roster => ({
    teamId: teamId(roster),
    athletes: asArray(roster?.roster).map(player => ({
      id: safeText(player?.athlete?.id ?? player?.id),
      name: safeText(player?.athlete?.displayName ?? player?.displayName),
      starter: player?.starter === true,
      position: safeText(player?.position?.abbreviation ?? player?.position?.name)
    }))
  }));
  return { teams, events, teamStats, statistics, lineups,
    availability: {
      events: events.length > 0,
      statistics: teamStats.some(t => t.statistics.length > 0) || statistics.length > 0,
      lineups: lineups.some(t => t.athletes.length > 0)
    }
  };
}
