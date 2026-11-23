#!/usr/bin/env node
// Chronological, pre-match-only backtest; no network, Worker or D1 access.
// Usage: node scripts/backtest-poisson.cjs /path/to/football-data.csv
const fs=require("node:fs");
const {markets}=require("../src/poisson-probabilities.js");
const input=process.argv[2];
if(!input){console.error("Usage: node scripts/backtest-poisson.cjs results.csv");process.exit(2);}
function csv(text){
  const rows=[];let row=[],field="",quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(field);field="";}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.trim()))rows.push(row);row=[];field="";}
    else field+=c;
  }
  row.push(field);if(row.some(x=>x.trim()))rows.push(row);
  const header=rows.shift().map(x=>x.trim());
  return rows.map(r=>Object.fromEntries(header.map((h,i)=>[h,(r[i]||"").trim()])));
}
function dateValue(s){
  const p=s.split(/[/-]/).map(Number);
  if(p.length!==3||p.some(x=>!Number.isFinite(x)))return NaN;
  const [d,m,y]=p;return Date.UTC(y<100?2000+y:y,m-1,d);
}
function run(rows){
  const valid=rows.map((r,i)=>({...r,_i:i,_date:dateValue(r.Date),_hg:Number(r.FTHG),_ag:Number(r.FTAG)}))
    .filter(r=>Number.isFinite(r._date)&&r.HomeTeam&&r.AwayTeam&&r.FTHG!==""&&r.FTAG!==""&&Number.isInteger(r._hg)&&Number.isInteger(r._ag)&&r._hg>=0&&r._ag>=0)
    .sort((a,b)=>a._date-b._date||a._i-b._i);
  const history=new Map();let n=0,logLoss=0,brier=0,correct=0;
  const bins=Array.from({length:10},()=>({n:0,p:0,actual:0}));
  // Matches on the same calendar date are predicted together before updating histories.
  for(let i=0;i<valid.length;){
    let j=i+1;while(j<valid.length&&valid[j]._date===valid[i]._date)j++;
    for(const r of valid.slice(i,j)){
      const h=history.get(r.HomeTeam)||[],a=history.get(r.AwayTeam)||[];
      if(h.length<5||a.length<5)continue;
      const recentH=h.slice(-10),recentA=a.slice(-10);
      const avg=(arr,key)=>arr.reduce((s,x)=>s+x[key],0)/arr.length;
      // Prior goals only; fixed smoothing avoids overfitting tiny samples.
      const lambdaH=Math.max(0.05,Math.min(8,(avg(recentH,"scored")+avg(recentA,"conceded"))/2));
      const lambdaA=Math.max(0.05,Math.min(8,(avg(recentA,"scored")+avg(recentH,"conceded"))/2));
      const m=markets(lambdaH,lambdaA),p=[m.homeWin,m.draw,m.awayWin];
      const outcome=r._hg>r._ag?0:r._hg===r._ag?1:2;
      logLoss-=Math.log(Math.max(1e-15,p[outcome]));
      brier+=p.reduce((s,x,k)=>s+(x-(k===outcome?1:0))**2,0);
      const winner=p.indexOf(Math.max(...p));if(winner===outcome)correct++;
      const b=Math.min(9,Math.floor(p[winner]*10));
      bins[b].n++;bins[b].p+=p[winner];bins[b].actual+=Number(winner===outcome);
      n++;
    }
    for(const r of valid.slice(i,j)){
      const h=history.get(r.HomeTeam)||[];h.push({scored:r._hg,conceded:r._ag});history.set(r.HomeTeam,h);
      const a=history.get(r.AwayTeam)||[];a.push({scored:r._ag,conceded:r._hg});history.set(r.AwayTeam,a);
    }
    i=j;
  }
  if(!n)throw new Error("No eligible matches with at least five earlier matches per team");
  return {matches:n,accuracy:correct/n,logLoss:logLoss/n,multiclassBrier:brier/n,calibration:bins.filter(x=>x.n).map(x=>({n:x.n,meanConfidence:x.p/x.n,observedAccuracy:x.actual/x.n}))};
}
try{console.log(JSON.stringify(run(csv(fs.readFileSync(input,"utf8"))),null,2));}
catch(e){console.error(e.message);process.exitCode=1;}
