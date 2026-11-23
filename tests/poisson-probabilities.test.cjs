const test=require("node:test");
const assert=require("node:assert/strict");
const {poisson,distribution,markets}=require("../src/poisson-probabilities.js");
const near=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
test("zero expected goals yields certain 0-0",()=>{
  const m=markets(0,0);near(m.draw,1);near(m.homeWin,0);near(m.over25,0);near(m.btts,0);
  assert.deepEqual(m.topScores[0],{home:0,away:0,probability:1});
});
test("symmetric teams have symmetric win probabilities",()=>{
  const m=markets(1.7,1.7);near(m.homeWin,m.awayWin);near(m.homeWin+m.draw+m.awayWin,1);
});
test("probabilities remain normalized for high goal expectations",()=>{
  for(const x of [0,0.1,1.4,3.8,12,30]){
    const d=distribution(x);near(d.reduce((a,b)=>a+b,0),1);
    const m=markets(x,x/2);near(m.homeWin+m.draw+m.awayWin,1);
    for(const v of [m.homeWin,m.draw,m.awayWin,m.over25,m.btts])assert.ok(v>=0&&v<=1);
  }
});
test("Poisson mass at k=0 and k=1",()=>{near(poisson(2,0),Math.exp(-2));near(poisson(2,1),2*Math.exp(-2));});
test("reject invalid inputs",()=>{
  for(const x of [-1,NaN,Infinity,"2",101])assert.throws(()=>distribution(x),RangeError);
  assert.throws(()=>poisson(1,-1),RangeError);
});
test("over 2.5 and BTTS match analytical formulas",()=>{
  const h=1.3,a=1.1,m=markets(h,a),total=h+a;
  near(m.over25,1-Math.exp(-total)*(1+total+total*total/2));
  near(m.btts,(1-Math.exp(-h))*(1-Math.exp(-a)));
});

test("tiny rates preserve the upper-tail and both-teams-to-score probabilities", () => {
  const m = markets(1e-12, 2e-12);
  assert.ok(Math.abs(m.over25 / (4.5e-36) - 1) < 1e-10);
  assert.ok(Math.abs(m.btts / (2e-24) - 1) < 1e-10);
  assert.ok(m.over15 > m.over25 && m.over25 > m.over35 && m.over35 > 0);
});

test("goal thresholds match the frontend and high-rate score modes are retained", () => {
  const realistic = markets(2, 1.5);
  near(realistic.over15, 1 - poisson(3.5, 0) - poisson(3.5, 1));
  near(realistic.over35, 1 - [0, 1, 2, 3].reduce((sum, goal) => sum + poisson(3.5, goal), 0));
  const high = markets(100, 80);
  near(high.homeWin + high.draw + high.awayWin, 1);
  assert.ok([99, 100].includes(high.topScores[0].home));
  assert.ok([79, 80].includes(high.topScores[0].away));
  near(high.topScores[0].probability, poisson(100, 100) * poisson(80, 80));
  assert.equal(poisson(100, Number.MAX_SAFE_INTEGER), 0);
  assert.throws(() => distribution(1, "0.1"), RangeError);
  assert.throws(() => poisson(1, Number.MAX_SAFE_INTEGER + 1), RangeError);
});

test("first-half and full-time markets normalize independently, including 0.5 goals", () => {
  for (const [home, away] of [[0, 0], [0.45, 0.35], [1.45, 1.1], [1e-16, 2e-16], [100, 100]]) {
    const m = markets(home, away);
    near(m.homeWin + m.draw + m.awayWin, 1);
    near(distribution(home).reduce((a, b) => a + b, 0), 1);
    assert.ok(m.over05 >= m.over15 && m.over15 >= m.over25 && m.over25 >= m.over35);
    near(m.over05, -Math.expm1(-home - away));
  }
  assert.ok(markets(0.45, 0.35).over05 < markets(1.45, 1.1).over05);
  assert.ok(markets(1e-16, 2e-16).over05 > 0);
  assert.throws(() => markets(undefined, 1), RangeError);
});
