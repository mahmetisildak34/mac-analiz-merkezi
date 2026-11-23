/* Isolated, dependency-free Poisson probability calculations.
 * Not loaded by production until integration is separately reviewed.
 * Inputs are expected goals (lambda), not observed scorelines.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports) module.exports=api;
  else root.MAMProbability=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  function validLambda(x){return typeof x==="number"&&Number.isFinite(x)&&x>=0&&x<=100;}
  function poisson(lambda,k){
    if(!validLambda(lambda)||!Number.isInteger(k)||k<0) throw new RangeError("Invalid Poisson inputs");
    if(lambda===0)return k===0?1:0;
    let p=Math.exp(-lambda);
    for(let i=1;i<=k;i++)p*=lambda/i;
    return p;
  }
  function distribution(lambda,tolerance=1e-12){
    if(!validLambda(lambda)||!(tolerance>0&&tolerance<1))throw new RangeError("Invalid distribution inputs");
    if(lambda===0)return [1];
    const values=[Math.exp(-lambda)];
    let sum=values[0];
    for(let k=1;k<1000;k++){
      values.push(values[k-1]*lambda/k);
      sum+=values[k];
      if(k>lambda&&1-sum<=tolerance)break;
    }
    if(!(sum>0))throw new RangeError("Distribution underflow");
    return values.map(p=>p/sum);
  }
  function markets(home,away){
    const h=distribution(home),a=distribution(away);
    let win=0,draw=0,loss=0,under25=0,btts=0;
    const scores=[];
    for(let i=0;i<h.length;i++)for(let j=0;j<a.length;j++){
      const p=h[i]*a[j];
      if(i>j)win+=p;else if(i===j)draw+=p;else loss+=p;
      if(i+j<=2)under25+=p;
      if(i>0&&j>0)btts+=p;
      scores.push({home:i,away:j,probability:p});
    }
    const total=win+draw+loss;
    scores.sort((x,y)=>y.probability-x.probability||x.home-y.home||x.away-y.away);
    return {homeWin:win/total,draw:draw/total,awayWin:loss/total,over25:1-under25,btts,topScores:scores.slice(0,5)};
  }
  return Object.freeze({poisson,distribution,markets});
});
