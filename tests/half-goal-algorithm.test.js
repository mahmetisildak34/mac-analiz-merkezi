"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {halfTeamKey,halfTeamStats,halfTeamMetrics,halfPassesThreshold,halfMatchQualification}=require("../half-goal-algorithm.js");
const match=(overrides={})=>({leagueId:39,kickoff:"2026-11-01T15:00:00Z",home:"Alpha FC",away:"Beta FC",halftimeHome:1,halftimeAway:0,homeGoals:2,awayGoals:1,...overrides});
test("counts first-half and second-half scoring independently",()=>{
 const m=halfTeamMetrics(halfTeamStats([match()]).get("39|alpha fc"));
 assert.equal(m.firstScored,100);assert.equal(m.secondScored,100);assert.equal(m.bothScored,100);
});
test("deduplicates reversed provider fixture rows",()=>{
 const rows=[match(),match({home:"Beta FC",away:"Alpha FC",halftimeHome:0,halftimeAway:1,homeGoals:1,awayGoals:2})];
 const stats=halfTeamStats(rows);assert.equal(stats.get("39|alpha fc").matches,1);
});
test("rejects impossible or incomplete score records",()=>{
 const stats=halfTeamStats([match({homeGoals:0}),match({halftimeHome:"x"})]);
 assert.equal(stats.size,0);
});
test("keeps league identity separate for same-named teams",()=>{
 const stats=halfTeamStats([match(),match({leagueId:140})]);
 assert.ok(stats.has("39|alpha fc"));assert.ok(stats.has("140|alpha fc"));
});
test("recent five uses latest kickoff records",()=>{
 const rows=Array.from({length:6},(_,i)=>match({kickoff:`2026-11-${String(i+1).padStart(2,"0")}T15:00:00Z`,halftimeHome:i===5?0:1,homeGoals:i===5?0:2}));
 const m=halfTeamMetrics(halfTeamStats(rows).get("39|alpha fc"));
 assert.equal(m.samples,6);assert.equal(m.recent5.samples,5);assert.equal(m.recent5.firstScored,80);
});
test("threshold tests scoring, not conceding, and uses inclusive boundary",()=>{
 const metrics={firstScored:70,secondScored:20,bothScored:10};
 assert.equal(halfPassesThreshold(metrics,"first",70),true);
 assert.equal(halfPassesThreshold(metrics,"second",70),false);
 assert.equal(halfPassesThreshold(metrics,"all",70),true);
 assert.equal(halfPassesThreshold(null,"first",70),false);
});

test("requires both teams to score in both halves at 60%, and marks 70% all-four as favorite",()=>{
 const team=(firstScored,secondScored)=>({firstScored,secondScored});
 assert.deepEqual(halfMatchQualification(team(60,69),team(70,60)),{eligible:true,favorite:false,rates:{homeFirst:60,homeSecond:69,awayFirst:70,awaySecond:60}});
 assert.equal(halfMatchQualification(team(70,75),team(80,70)).favorite,true);
 assert.equal(halfMatchQualification(team(90,90),team(59,100)).eligible,false);
 assert.equal(halfMatchQualification(team(null,90),team(90,90)).eligible,false);
});

test("uses one canonical team key for Turkish and accented names",()=>{
 assert.equal(halfTeamKey("İstanbul Başakşehir"),halfTeamKey("istanbul basaksehir"));
 assert.equal(halfTeamKey("Fenerbahçe"),halfTeamKey("FENERBAHCE"));
});
test("does not treat missing halftime scores as zero",()=>{
 const stats=halfTeamStats([match({halftimeHome:null}),match({halftimeAway:""})]);
 assert.equal(stats.size,0);
});
test("preserves zero as a valid verified score",()=>{
 const stats=halfTeamStats([match({halftimeHome:0,halftimeAway:0,homeGoals:0,awayGoals:0})]);
 assert.equal(stats.get("39|alpha fc").matches,1);
 assert.equal(halfTeamMetrics(stats.get("39|alpha fc")).firstScored,0);
});
test("team matching keys keep same-name teams isolated by league",()=>{
 const stats=halfTeamStats([match({home:"İstanbul Başakşehir"}),match({leagueId:140,home:"Istanbul Basaksehir"})]);
 assert.ok(stats.has("39|istanbul basaksehir"));
 assert.ok(stats.has("140|istanbul basaksehir"));
});
