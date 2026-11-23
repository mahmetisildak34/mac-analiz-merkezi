const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const { parseCsv, parseDate, cleanArchive } = require("../scripts/poisson-football-data.cjs");
const { evaluate, frontendRates, legacyMarkets, normalizedMarkets, summarize, walkForward } = require("../scripts/backtest-poisson.cjs");

const header = "Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,FTR,Extra\r\n";
const file = (rows, metadata) => ({
  name: "archive.csv", bytes: Buffer.from(header + rows.join("\r\n")), ...metadata
});

function fixtures() {
  const rows = [];
  for (let i = 1; i <= 10; i++) {
    const day = `2024-08-${String(i).padStart(2, "0")}`;
    rows.push(`SP1,${day},Alpha,Host ${i},2,1,H`, `SP1,${day},Visitor ${i},Beta,0,1,A`);
  }
  return rows;
}

test("CSV accepts BOM, quoted commas, escaped quotes and multiline unused fields", () => {
  const rows = parseCsv('\uFEFF' + header + 'SP1,09/08/24,"Club, ""Real""",Away,0,0,D,"first\r\nsecond"\r\n');
  assert.equal(rows[0].HomeTeam, 'Club, "Real"');
  assert.equal(rows[0].FTHG, "0");
  assert.throws(() => parseCsv("not football data"), /columns/);
  assert.throws(() => parseCsv(header + 'SP1,"unclosed'), /quote/);
  const bytes = Buffer.from(header + 'SP1,09/08/24,Atlético,Away,0,0,D', "latin1");
  assert.equal(cleanArchive([{ bytes, name: "latin.csv" }]).fixtures[0].home, "Atlético");
});

test("calendar dates validate day lengths, leap years and European two-digit years", () => {
  assert.equal(parseDate("29/02/24"), "2024-02-29");
  assert.equal(parseDate("2024-02-29"), "2024-02-29");
  assert.equal(parseDate("1-8-99"), "1999-08-01");
  for (const value of ["29/02/23", "31/04/2024", "2024-13-01", "5/6-2024", "0/09/2025"]) {
    assert.equal(parseDate(value), null);
  }
});

test("archives sort by date and exclude missing scores, conflicting fixtures and known rulings", () => {
  const rows = [
    "T1,09/02/2025,Galatasaray,Ad. Demirspor,3,0,H",
    "T1,2024-09-01,A,B,1,2,A", "T1,2024-08-01,B,A,0,0,D",
    "T1,2024-09-01,A,B,1,2,A", "T1,2024-08-02,C,D,,,",
    "T1,2024-08-03,D,C,1,0,A",
    "T1,2024-10-03,E,F,1,0,H", "T1,2024-10-03,E,F,2,0,H"
  ];
  const { fixtures: matches, reports: [report] } = cleanArchive([file(rows, { league: "T1", season: 2024 })]);
  assert.deepEqual(matches.map(m => m.day), ["2024-08-01", "2024-09-01"]);
  assert.deepEqual([report.valid, report.invalid, report.nonStandard, report.duplicates, report.conflicts], [2, 2, 1, 1, 2]);
  assert.throws(() => cleanArchive([file(rows, { league: "D1" })]), /mismatch/);
});

test("changing target, same-day and future results cannot alter the target prediction", () => {
  const run = (sameDayScore, targetScore, futureScore) => {
    const rows = [
      `SP1,2024-08-12,Alpha,After,${futureScore},0,H`,
      `SP1,2024-08-11,Aardvark,Beta,${sameDayScore},0,H`,
      `SP1,2024-08-11,Alpha,Beta,${targetScore},0,H`,
      ...fixtures().reverse()
    ];
    const data = cleanArchive([file(rows)]).fixtures;
    return [...walkForward(data, "2024-08-11")].find(x => x.match.home === "Alpha" && x.match.away === "Beta");
  };
  const early = run(1, 1, 1);
  const changed = run(15, 12, 13);
  assert.deepEqual(early.rates, [1, 1]);
  assert.deepEqual(early.models, changed.models);
});

test("same-day results cannot supply a team's tenth required historical match", () => {
  const input = file([...fixtures().slice(0, -2),
    "SP1,2024-08-10,Aardvark,Beta,1,0,H",
    "SP1,2024-08-10,Alpha,Away,1,0,H",
    "SP1,2024-08-10,Alpha,Beta,1,0,H"]);
  const matches = [...walkForward(cleanArchive([input]).fixtures, "2024-08-10")];
  assert.equal(matches.find(x => x.match.home === "Alpha" && x.match.away === "Beta").rates, null);
});

test("continuous top-flight history carries forward, with a fresh sample on return after a gap", () => {
  const rows = [...fixtures(), "SP1,2025-08-08,Alpha,Beta,0,0,D",
    "SP1,2027-08-08,Alpha,Beta,1,0,H", "E0,2025-08-08,Alpha,Beta,0,0,D"];
  const matches = [...walkForward(cleanArchive([file(rows)]).fixtures, "2025-01-01")];
  assert.deepEqual(matches.find(x => x.league === "SP1" && x.season === 2025).rates, [1, 1]);
  assert.equal(matches.find(x => x.season === 2027).rates, null);
  assert.equal(matches.find(x => x.league === "E0").rates, null);
});

test("frontend rates respect ten matches, venue fallback and lambda bounds", () => {
  const recent = Array(10).fill({ venue: "away", gf: 10, ga: 0 });
  const away = Array(10).fill({ venue: "away", gf: 0, ga: 10 });
  assert.equal(frontendRates(recent.slice(1), away), null);
  assert.deepEqual(frontendRates(recent, away), [4, 0.15]);
});

test("legacy oracle matches current index.html for representative and cutoff-sensitive rates", () => {
  const source = readFileSync(join(__dirname, "../index.html"), "utf8");
  const functions = ["poisson", "overProb", "topScores"].map(name =>
    source.match(new RegExp(`function ${name}\\([^]*?^}`, "m"))?.[0]);
  assert.ok(functions.every(Boolean));
  const grid = source.match(/let win=0,draw=0,lose=0;\s*for\(let h=0;h<=10;[^]*?\n  }/)?.[0];
  assert.ok(grid);
  for (const [lh, la] of [[0.15, 0.15], [1, 1], [1.3, 1.1], [4, 3.8], [12, 8]]) {
    const expected = runInNewContext(`${functions.join("\n")}\n${grid}
      JSON.stringify({
        probabilities: [win, draw, lose], over25: overProb(lh + la, 3),
        btts: (1 - Math.exp(-lh)) * (1 - Math.exp(-la)),
        scores: topScores(lh, la).map(({ h, a }) => [h, a])
      });`, { lh, la });
    assert.deepEqual(legacyMarkets(lh, la), JSON.parse(expected));
    const next = normalizedMarkets(lh, la);
    assert.ok(Math.abs(next.probabilities.reduce((a, b) => a + b, 0) - 1) < 1e-12);
    assert.ok(Math.abs(next.over25 - JSON.parse(expected).over25) < 1e-12);
  }
});

test("multiclass, binary and calibration metrics match hand-calculated counts", () => {
  const forecast = { probabilities: [0.5, 0.3, 0.2], btts: 0.8, over25: 0.25, scores: [[1, 0], [1, 1]] };
  const rows = [[1, 0], [1, 1]].map(([hg, ag]) => ({ match: { hg, ag }, models: { model: forecast } }));
  const result = summarize(rows, "model");
  assert.equal(result.accuracy, 0.5);
  assert.equal(result.calibration[0].from, 0.5);
  assert.equal(result.calibration[0].observedRate, 0.5);
  assert.ok(result.calibration[0].wilson95[0] < 0.5 && result.calibration[0].wilson95[1] > 0.5);
  assert.equal(result.ece, 0);
  assert.ok(Math.abs(result.logLoss + Math.log(0.15) / 2) < 1e-12);
  assert.ok(Math.abs(result.multiclassBrier - 0.58) < 1e-12);
  assert.equal(result.binary.over25.accuracy, 1);
  assert.equal(result.binary.btts.accuracy, 0.5);
  assert.equal(result.topScoreAccuracy, 0.5);
  assert.equal(result.top5ScoreAccuracy, 1);
});

test("chronological evaluation reports a common cohort and fails closed without eligible matches", () => {
  const result = evaluate([file([...fixtures(), "SP1,2024-08-11,Alpha,Beta,1,1,D"])], { testStart: "2024-08-11" });
  const league = result.groups["SP1/2024"];
  assert.equal(league.train, 20);
  assert.equal(league.test, 1);
  assert.equal(league.paired, 1);
  assert.deepEqual(Object.values(league.models).map(model => model.matches), [1, 1]);
  assert.throws(() => evaluate([file(fixtures())], { testStart: "2024-08-10" }), /No matches/);
});

test("floating point ties share the same 1-X-2 rule and preserve the strict UI metric", () => {
  const m = { probabilities: [0.4, 0.1999999999999999, 0.4000000000000001],
    btts: 0.5, over25: 0.5, scores: [[1, 0]] };
  const report = summarize([{ match: { hg: 1, ag: 0 }, models: { m } }], "m");
  assert.equal(report.accuracy, 1);
  assert.equal(report.strictAccuracy, 0);
});

test("half-time CSV evidence has its own validity and conflicts", () => {
  const rows = [
    "SP1,2024-08-01,A,B,3,2,H,1,0,H",
    "SP1,2024-08-02,B,A,2,2,D,0,0,D",
    "SP1,2024-08-02,B,A,2,2,D,1,1,D",
    "SP1,2024-08-03,B,C,1,1,D,2,0,H",
    "SP1,2024-08-04,C,B,1,1,D,-1,0,D",
    "SP1,2024-08-05,A,C,1,1,D,,,",
    "SP1,2024-08-06,C,A,1,1,D,0,1,H"
  ];
  const bytes = Buffer.from("Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,FTR,HTHG,HTAG,HTR\n" + rows.join("\n"));
  const { fixtures: matches } = cleanArchive([{ name: "half.csv", bytes }]);
  assert.deepEqual(matches.map(match => match.half), [[1, 0], null, null, null, null, null]);
  assert.equal(matches.length, 6);
});

test("half-time replay scores the first-half outcome and never imputes missing scores from full time", () => {
  const rows = fixtures().map(row => row + ",0,0,D");
  rows.push("SP1,2024-08-11,Alpha,Beta,3,0,H,0,0,D", "SP1,2024-08-12,Beta,Alpha,2,1,H,,,");
  const bytes = Buffer.from("Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,FTR,HTHG,HTAG,HTR\n" + rows.join("\n"));
  const result = evaluate([{ name: "archive-half.csv", bytes }], { testStart: "2024-08-11", period: "half" });
  assert.equal(result.cleanFullTime, 22);
  assert.equal(result.periodFixtures, 21);
  assert.equal(result.groups.overall.paired, 1);
  assert.equal(result.groups.overall.models["Frontend normalized"].accuracy, 1);
  assert.equal(result.groups.overall.models["Frontend normalized"].topScoreAccuracy, 1);
});
