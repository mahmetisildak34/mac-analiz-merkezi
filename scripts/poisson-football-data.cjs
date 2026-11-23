const { createHash } = require("node:crypto");

const required = ["Div", "Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG", "FTR"];
// The archive's numeric final scores can include awarded or partially played games.
const excluded = new Set([
  "T1|2023-12-19|Istanbulspor|Trabzonspor",
  "T1|2025-02-09|Galatasaray|Ad. Demirspor",
  "D1|2024-12-14|Union Berlin|Bochum",
  "F1|2025-03-16|Montpellier|St Etienne",
  "I1|2024-04-25|Udinese|Roma",
  "I1|2025-02-06|Fiorentina|Inter"
]);

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false, closed = false;
  text = text.replace(/^\uFEFF/, "");
  function append() {
    row.push(field.trim());
    field = "";
    closed = false;
  }
  function appendRow() {
    append();
    if (row.some(Boolean)) rows.push(row);
    row = [];
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') { field += c; i++; }
      else { quoted = false; closed = true; }
    } else if (c === ",") {
      append();
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      appendRow();
    } else if (c === '"' && !field && !closed) {
      quoted = true;
    } else if (closed || c === '"') {
      throw new Error("Malformed CSV field");
    } else {
      field += c;
    }
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  appendRow();
  const header = rows.shift();
  const names = [...required, "HTHG", "HTAG", "HTR"];
  if (!header || required.some(key => !header.includes(key))
      || names.some(key => header.indexOf(key) !== header.lastIndexOf(key))) {
    throw new Error("Missing or duplicate Football-Data columns");
  }
  const columns = names.map(key => [key, header.indexOf(key)]);
  return rows.map(values => Object.fromEntries(columns.map(([key, index]) => [key, values[index] ?? ""])));
}

function parseDate(value) {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const european = /^(\d{1,2})([/-])(\d{1,2})\2(\d{2}|\d{4})$/.exec(value);
  if (!iso && !european) return null;
  let year = Number(iso ? iso[1] : european[4]);
  if (!iso && european[4].length === 2) year += year >= 70 ? 1900 : 2000;
  const month = Number(iso ? iso[2] : european[3]);
  const day = Number(iso ? iso[3] : european[1]);
  if (year < 1900) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date.toISOString().slice(0, 10) : null;
}

function seasonOf(day) {
  const year = Number(day.slice(0, 4));
  return day.slice(5, 7) >= "07" ? year : year - 1;
}

function cleanArchive(inputs) {
  const reports = [];
  const candidates = new Map();
  const conflicts = new Set();
  const halfConflicts = new Set();
  for (const { name, bytes, league: expectedLeague, season: expectedSeason, url } of inputs) {
    // Football-Data archives can contain Windows-1252 team names.
    let decoded;
    try { decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { decoded = new TextDecoder("windows-1252").decode(bytes); }
    const rows = parseCsv(decoded);
    const report = {
      name, url, league: expectedLeague, season: expectedSeason,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      rows: rows.length, valid: 0, invalid: 0, nonStandard: 0, duplicates: 0, conflicts: 0
    };
    reports.push(report);
    for (const row of rows) {
      const { Div: league, HomeTeam: home, AwayTeam: away, FTHG, FTAG, FTR } = row;
      const day = parseDate(row.Date);
      const hg = Number(FTHG);
      const ag = Number(FTAG);
      const outcome = hg > ag ? "H" : hg < ag ? "A" : "D";
      if (!day || !/^[A-Z]{1,2}[0-9]$/.test(league) || !home || !away || home.toLowerCase() === away.toLowerCase()
          || !/^\d{1,2}$/.test(FTHG) || !/^\d{1,2}$/.test(FTAG) || hg > 30 || ag > 30 || FTR !== outcome) {
        report.invalid++;
        continue;
      }
      const season = seasonOf(day);
      if ((expectedLeague && league !== expectedLeague) || (expectedSeason && season !== expectedSeason)) {
        throw new Error(`League or season mismatch in ${name}: ${league} ${day}`);
      }
      if (excluded.has([league, day, home, away].join("|"))) {
        report.nonStandard++;
        continue;
      }
      const { HTHG, HTAG, HTR } = row;
      const halfHome = Number(HTHG);
      const halfAway = Number(HTAG);
      const halfOutcome = halfHome > halfAway ? "H" : halfHome < halfAway ? "A" : "D";
      const half = /^\d{1,2}$/.test(HTHG) && /^\d{1,2}$/.test(HTAG)
        && halfHome <= hg && halfAway <= ag && (!HTR || HTR === halfOutcome) ? [halfHome, halfAway] : null;
      // Each top-flight archive here is double round-robin, with one fixture per ordered pairing.
      const id = JSON.stringify([league, season, home, away]);
      const prior = candidates.get(id);
      if (conflicts.has(id)) {
        report.conflicts++;
      } else if (!prior) {
        const match = { id, league, season, day, home, away, hg, ag, half, report };
        candidates.set(id, match);
        report.valid++;
      } else if (prior.day === day && prior.hg === hg && prior.ag === ag) {
        report.duplicates++;
        if (half && !halfConflicts.has(id)) {
          if (!prior.half) prior.half = half;
          else if (half.some((goals, i) => goals !== prior.half[i])) {
            prior.half = null;
            halfConflicts.add(id);
          }
        }
      } else {
        prior.report.valid--;
        prior.report.conflicts++;
        report.conflicts++;
        candidates.delete(id);
        conflicts.add(id);
      }
    }
  }
  const fixtures = [...candidates.values()].map(({ report, ...match }) => match)
    .sort((a, b) => a.day.localeCompare(b.day) || a.id.localeCompare(b.id));
  return { reports, fixtures };
}

module.exports = { parseCsv, parseDate, cleanArchive };
