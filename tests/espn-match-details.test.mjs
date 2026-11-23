import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMatchDetails } from '../mobile/espn-match-details.mjs';

test('missing ESPN fields remain unavailable, not invented', () => {
 const result = normalizeMatchDetails({});
 assert.deepEqual(result.events, []);
 assert.deepEqual(result.lineups, []);
 assert.deepEqual(result.availability, {events:false,statistics:false,lineups:false});
});

test('normalizes actual ESPN-shaped match event, stats and lineups', () => {
 const result = normalizeMatchDetails({
  header:{competitions:[{competitors:[{homeAway:'home',team:{id:'1',displayName:'Home'}},{homeAway:'away',team:{id:'2',displayName:'Away'}}]}]},
  details:[{id:'goal-1',clock:{displayValue:"45'+2"},type:{text:'Goal'},team:{id:'1'},participants:[{athlete:{displayName:'Scorer'}}]}],
  boxscore:{teams:[{team:{id:'1'},statistics:[{name:'possessionPct',displayValue:'55.0'}]}]},
  rosters:[{team:{id:'1'},roster:[{athlete:{id:'9',displayName:'Player'},starter:true,position:{abbreviation:'FW'}}]}]
 });
 assert.equal(result.teams[0].name,'Home');
 assert.equal(result.events[0].minute,"45'+2");
 assert.deepEqual(result.events[0].participants,['Scorer']);
 assert.equal(result.teamStats[0].statistics[0].value,'55.0');
 assert.equal(result.lineups[0].athletes[0].starter,true);
 assert.deepEqual(result.availability,{events:true,statistics:true,lineups:true});
});

test('null and malformed optional arrays do not crash', () => {
 const result=normalizeMatchDetails({details:null,rosters:[{roster:null}],boxscore:{teams:[{statistics:null}]}});
 assert.equal(result.availability.events,false);
 assert.equal(result.availability.statistics,false);
 assert.equal(result.availability.lineups,false);
});
