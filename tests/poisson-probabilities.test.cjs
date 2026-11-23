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
