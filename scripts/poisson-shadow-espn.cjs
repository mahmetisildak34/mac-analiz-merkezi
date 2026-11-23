const { digest, sha, timestamp, validScore } = require("./poisson-shadow-ledger.cjs");

const base = "https://site.api.espn.com/apis/site/v2/sports/soccer/";
const istanbul = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul",
  year: "numeric", month: "2-digit", day: "2-digit" });
const istanbulDay = ms => istanbul.format(ms);
const boardUrl = (league, day) => `${base}${league}/scoreboard?dates=${day.replaceAll("-", "")}&limit=500`;
const summaryUrl = (league, id) => `${base}${league}/summary?event=${id}`;
const statusNames = {
  scheduled: new Set(["STATUS_SCHEDULED", "STATUS_NOT_STARTED", "STATUS_PRE_GAME", "STATUS_PREGAME"]),
  postponed: new Set(["STATUS_POSTPONED", "STATUS_ABANDONED", "STATUS_SUSPENDED"]),
  cancelled: new Set(["STATUS_CANCELED", "STATUS_CANCELLED"]),
  awarded: new Set(["STATUS_AWARDED", "STATUS_WALKOVER", "STATUS_FORFEIT", "STATUS_FORFEITED"]),
  full: new Set(["STATUS_FULL_TIME", "STATUS_FINAL"])
};
const readScore = value => typeof value === "string" && /^\d{1,2}$/.test(value) && validScore(Number(value))
  ? Number(value) : null;

async function readSource(url, request = fetch) {
  async function attempt() {
    const response = await request(url, { signal: AbortSignal.timeout(18000), redirect: "error" });
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      if ([408, 429, 500, 502, 503, 504].includes(response.status)) {
        const retryAfter = response.headers.get("retry-after");
        if (retryAfter == null) error.retryDelay = 250;
        else if (/^\d+$/.test(retryAfter)) error.retryDelay = Number(retryAfter) * 1000;
        else error.retryDelay = Math.max(0, Date.parse(retryAfter) - Date.now());
      }
      await response.body?.cancel().catch(() => {});
      throw error;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const capturedAt = new Date().toISOString();
    if (bytes.length > 8_000_000) throw new Error("Public response exceeds size limit");
    return { bytes, capturedAt, url, sha256: sha(bytes) };
  }
  try { return await attempt(); }
  catch (error) {
    const transient = ["TimeoutError", "AbortError"].includes(error.name) ||
      ["ECONNRESET", "EAI_AGAIN", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET"].includes(error.cause?.code);
    const delay = transient ? 250 : error.retryDelay;
    // Respect long provider backoffs by leaving the result unverified this run.
    if (!Number.isFinite(delay) || delay > 2000) throw error;
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    return attempt();
  }
}

function boardEvents(source, league) {
  const payload = JSON.parse(source.bytes);
  if (payload?.leagues?.length !== 1 || payload.leagues[0]?.slug !== league || !Array.isArray(payload.events)) {
    throw new Error("Invalid ESPN league scoreboard");
  }
  return payload.events;
}

function sides(competition) {
  const entries = competition?.competitors;
  if (!Array.isArray(entries) || entries.length !== 2) return [];
  const teams = ["home", "away"].map(side => entries.find(t => t?.homeAway === side));
  if (teams.some(t => typeof t?.team?.id !== "string" || !/^\d+$/.test(t.team.id) ||
      (t.id != null && t.id !== t.team.id) || typeof t.team.displayName !== "string" ||
      !t.team.displayName.trim()) || teams[0].team.id === teams[1].team.id) return [];
  return teams;
}

function fixture(event, league) {
  const competition = event?.competitions?.length === 1 ? event.competitions[0] : null;
  const time = timestamp(event?.date);
  const [home, away] = sides(competition);
  if (!home || !away || typeof event.id !== "string" || !/^\d+$/.test(event.id) || competition.id !== event.id ||
      !Number.isFinite(time) || time !== timestamp(competition.date)) return null;
  const team = ({ team: t }) => ({ id: t.id, name: t.displayName });
  return {
    key: `espn:${league}:${event.id}`, league, id: event.id, kickoff: new Date(time).toISOString(),
    istanbulDay: istanbulDay(time), home: team(home), away: team(away), eventSha256: digest(event)
  };
}

function scheduled(event, when) {
  const half = event.competitions[0].status?.type;
  const status = event.status?.type;
  return [status, half].every(s => s?.state === "pre" && s.completed === false && statusNames.scheduled.has(s.name))
    && timestamp(event.date) > timestamp(when) && sides(event.competitions[0]).every(side => side.score == null || side.score === "0");
}

function completed(status) {
  return status?.type?.state === "post" && status.type.completed === true && statusNames.full.has(status.type.name);
}

function regulationScore(competition) {
  const score = sides(competition).map(side => readScore(side.score));
  return score.length === 2 && score.every(validScore) ? score : null;
}

function finishStatus(original, event, league, observedAt) {
  const current = fixture(event, league);
  if (!current || current.key !== original.key || current.home.id !== original.home.id ||
      current.away.id !== original.away.id) return { status: "identity_mismatch" };
  const status = [event.status?.type, event.competitions[0].status?.type];
  if (event.awarded === true || event.competitions[0].awarded === true ||
      status.some(s => statusNames.awarded.has(s?.name)) ||
      /\b(awarded|walkover|forfeit(?:ed)?)\b/i.test(status.map(s => `${s?.description ?? ""} ${s?.detail ?? ""}`).join(" "))) {
    return { status: "awarded" };
  }
  if (status.some(s => statusNames.cancelled.has(s?.name))) return { status: "cancelled" };
  if (status.some(s => statusNames.postponed.has(s?.name))) return { status: "postponed" };
  if (current.kickoff !== original.kickoff) return { status: "rescheduled" };
  if (scheduled(event, observedAt)) return { status: "pending" };
  if (status.some(s => s?.state === "in")) return { status: "in_progress" };
  const full = regulationScore(event.competitions[0]);
  return full && completed(event.status) && completed(event.competitions[0].status) &&
    timestamp(observedAt) > timestamp(original.kickoff) ? { status: "completed", full } : { status: "unverified" };
}

function verifiedHalf(original, full, payload) {
  const header = payload?.header;
  const c = header?.competitions?.length === 1 ? header.competitions[0] : null;
  if (header?.id !== original.id || header.league?.slug !== original.league || !c ||
      c.id !== original.id || timestamp(c.date) !== timestamp(original.kickoff) || !completed(c.status) ||
      c.awarded === true || /\b(awarded|walkover|forfeit(?:ed)?)\b/i.test(c.status.type.detail ?? "")) return null;
  const [home, away] = sides(c);
  const summaryFinal = regulationScore(c);
  if (!home || home.team.id !== original.home.id || away.team.id !== original.away.id ||
      !summaryFinal || summaryFinal.some((score, i) => score !== full[i])) return null;
  const half = [home, away].map(({ linescores }) => {
    if (!Array.isArray(linescores) || linescores.length !== 2) return null;
    const [first, second] = linescores;
    const period1 = first?.period ?? 1;
    const period2 = second?.period ?? 2;
    if (period1 !== 1 || period2 !== 2) return null;
    const h = readScore(first?.displayValue), s = readScore(second?.displayValue);
    return h === null || s === null ? null : [h, s];
  });
  return half.every((scores, i) => scores && scores[0] + scores[1] === full[i]) ? half.map(scores => scores[0]) : null;
}

module.exports = { boardEvents, boardUrl, finishStatus, fixture, istanbulDay, readSource, scheduled, summaryUrl, verifiedHalf };
