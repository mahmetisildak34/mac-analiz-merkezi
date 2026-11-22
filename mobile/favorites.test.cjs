const test=require("node:test");
const assert=require("node:assert/strict");
const {normalizeFavorites,toggleFavorite,mergeFavoriteUpdates,normalizeTeamFavorites,toggleTeamFavorite}=require("./favorites");
const match=(id,home="Göztepe",away="Erzurumspor",score=1)=>({fixture:{id,date:"2026-11-22T12:00:00Z"},teams:{home:{id:1,name:home},away:{id:2,name:away}},goals:{home:score,away:0}});
test("match favorites toggle, deduplicate and preserve valid fixtures",()=>{
 const a=match(1),b=match(2);
 assert.deepEqual(normalizeFavorites([a,a,{fixture:{id:null}}]),[a]);
 assert.deepEqual(toggleFavorite([a],a).favorites,[]);
 assert.deepEqual(toggleFavorite([],b).favorites,[b]);
});
test("favorite match refresh replaces score without dropping saved identity",()=>{
 const old=match(1,"Göztepe","Erzurumspor",0),fresh=match(1,"Göztepe","Erzurumspor",2);
 assert.equal(mergeFavoriteUpdates([old],[fresh])[0].goals.home,2);
 assert.equal(mergeFavoriteUpdates([old],[])[0].goals.home,0);
});
test("team favorites toggle by stable ID and normalize duplicate records",()=>{
 const team={id:35,name:"Göztepe",logo:"logo.png"};
 assert.deepEqual(normalizeTeamFavorites([team,team]),[team]);
 assert.deepEqual(toggleTeamFavorite([],team).favorites,[team]);
 assert.deepEqual(toggleTeamFavorite([team],team).favorites,[]);
});
test("invalid favorite inputs fail closed without adding entries",()=>{
 assert.equal(toggleFavorite([],{}).changed,false);
 assert.equal(toggleTeamFavorite([],{}).changed,false);
 assert.deepEqual(normalizeFavorites("bad"),[]);
 assert.deepEqual(normalizeTeamFavorites(null),[]);
});
