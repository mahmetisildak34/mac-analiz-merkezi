import test from "node:test";
import assert from "node:assert/strict";
import favoriteUtils from "../mobile/favorites.js";\nconst {normalizeFavorites,toggleFavorite,mergeFavoriteUpdates,normalizeTeamFavorites,toggleTeamFavorite}=favoriteUtils;

const match=(id,home="Göztepe",away="Erzurumspor",homeGoals=1)=>({
 fixture:{id,status:{short:"FT"}},teams:{home:{name:home},away:{name:away}},goals:{home:homeGoals,away:0}
});

test("favorite toggle adds and removes by stable fixture ID",()=>{
 const first=toggleFavorite([],match(1));
 assert.equal(first.added,true);assert.equal(first.favorites.length,1);
 const second=toggleFavorite(first.favorites,match(1));
 assert.equal(second.added,false);assert.equal(second.favorites.length,0);
});

test("invalid fixtures are never persisted as favorites",()=>{
 assert.deepEqual(toggleFavorite([],{}),{favorites:[],changed:false,added:false});
 assert.equal(normalizeFavorites([{},match(1),match(1)]).length,1);
});

test("favorite snapshots refresh when newer fixture data arrives",()=>{
 const old=match(1,"Göztepe","Erzurumspor",1);
 const newer=match(1,"Göztepe","Erzurumspor",2);
 const untouched=match(2,"Fenerbahçe","Galatasaray",0);
 const merged=mergeFavoriteUpdates([old,untouched],[newer]);
 assert.equal(merged[0].goals.home,2);
 assert.equal(merged[1].fixture.id,2);
});

test("cross-league fixture IDs remain independently addressable as strings",()=>{
 const rows=normalizeFavorites([match(1),match("1")]);
 assert.equal(rows.length,1);
 assert.equal(toggleFavorite(rows,match("2")).favorites.length,2);
});

test("team favorites deduplicate stable IDs and normalize Turkish names",()=>{
 const first=toggleTeamFavorite([], {name:"Iğdır FK",id:203});
 assert.equal(first.added,true);
 assert.equal(normalizeTeamFavorites([{name:"Iğdır FK"},{name:"Iğdır-FK"}]).length,1);
 const removed=toggleTeamFavorite(first.favorites,{name:"Iğdır FK",id:203});
 assert.equal(removed.favorites.length,0);
});

test("team favorites reject empty names and retain distinct provider IDs",()=>{
 assert.equal(toggleTeamFavorite([],{}).changed,false);
 const rows=normalizeTeamFavorites([{name:"Göztepe",id:1},{name:"Göztepe",id:2}]);
 assert.equal(rows.length,2);
});
