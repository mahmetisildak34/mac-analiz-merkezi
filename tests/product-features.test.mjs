import test from 'node:test';
import assert from 'node:assert/strict';
import {toggleFavorite,favoriteMatches,favoriteTeams,teamProfile,matchDetails,leagueStandings,searchFootball,notificationCandidates,mobileNavigation,isIstanbulToday} from '../mobile/product-features.mjs';
const teams=[{id:'1',name:'Fenerbahçe'},{id:'2',name:'Galatasaray'},{id:'3',name:'Beşiktaş'}];
const match={id:'m1',homeTeamId:'1',awayTeamId:'2',homeTeamName:'Fenerbahçe',awayTeamName:'Galatasaray',homeGoals:2,awayGoals:1,status:'FT',kickoff:'2026-11-21T15:00:00Z'};
test('favorites toggle without mutating original',()=>{const ids=['x'];assert.deepEqual(toggleFavorite(ids,'y'),['x','y']);assert.deepEqual(toggleFavorite(ids,'x'),[]);assert.deepEqual(ids,['x']);});
test('favorites filter teams and matches',()=>{assert.equal(favoriteMatches([match],['m1']).length,1);assert.equal(favoriteTeams(teams,['2'])[0].name,'Galatasaray');});
test('team profile form and future fixtures',()=>{const p=teamProfile(teams[0],[match,{...match,id:'m2',status:'SCHEDULED',kickoff:'2026-11-23T15:00:00Z'}],{now:Date.parse('2026-11-22T15:00:00Z')});assert.deepEqual(p.form,['W']);assert.equal(p.future.length,1);});
test('match details sort events and do not claim unverified stats',()=>{const d=matchDetails({...match,events:[{minute:80},{minute:10}],statistics:{shots:12}});assert.equal(d.events[0].minute,10);assert.equal(d.hasVerifiedStatistics,false);});
test('standings compute 3 points and goal difference',()=>{const t=leagueStandings([match],teams);assert.equal(t[0].team.name,'Fenerbahçe');assert.equal(t[0].points,3);assert.equal(t[1].points,0);});
test('standings ignore invalid results',()=>{const t=leagueStandings([{...match,homeGoals:null}],teams);assert.equal(t[0].played,0);});
test('Turkish search matches team names',()=>{assert.equal(searchFootball({teams,leagues:[],matches:[match]},'FENERBAHÇE').teams.length,1);assert.equal(searchFootball({teams},'').teams.length,0);});
test('notifications are candidate events only, never sent',()=>{const m={...match,status:'NS',kickoff:'2026-11-22T18:05:00Z'};const n=notificationCandidates([m],['m1'],{now:Date.parse('2026-11-22T18:00:00Z')});assert.equal(n.length,1);assert.equal(n[0].type,'kickoff_soon');});
test('mobile navigation has exactly one current tab',()=>{const tabs=mobileNavigation('favorites');assert.equal(tabs.length,8);assert.equal(tabs.filter(x=>x.ariaCurrent==='page').length,1);});

test('match events sort nested elapsed minutes while preserving unknown-minute events',()=>{
 const source=[{time:{elapsed:77},type:'Card'},{time:{elapsed:12},type:'Goal'},{type:'Unknown'},{minute:45,type:'Substitution'}];
 const result=matchDetails({...match,events:source});
 assert.deepEqual(result.events.map(e=>e.type),['Goal','Substitution','Card','Unknown']);
 assert.deepEqual(source.map(e=>e.type),['Card','Goal','Unknown','Substitution']);
});

test('team profile excludes postponed cancelled and abandoned fixtures from upcoming list',()=>{
 const now=Date.parse('2026-11-22T12:00:00Z');
 const fixtures=['PST','POSTPONED','CANC','CANCELLED','ABD','ABANDONED','SCHEDULED'].map((status,i)=>({...match,id:'future-'+i,status,kickoff:'2026-11-23T15:00:00Z'}));
 const profile=teamProfile(teams[0],fixtures,{now});
 assert.deepEqual(profile.future.map(m=>m.status),['SCHEDULED']);
});

test('Istanbul today accepts raw ESPN date and API fixture date across midnight',()=>{
 const now=Date.parse('2026-11-22T22:30:00Z');
 assert.equal(isIstanbulToday({date:'2026-11-22T22:15:00Z'},now),true);
 assert.equal(isIstanbulToday({fixture:{date:'2026-11-22T22:15:00Z'}},now),true);
 assert.equal(isIstanbulToday({date:'2026-11-22T20:15:00Z'},now),false);
 assert.equal(isIstanbulToday({date:'not-a-date'},now),false);
});

test('kickoff notifications exclude cancelled postponed and finished games',()=>{
 const now=Date.parse('2026-11-22T12:00:00Z');
 const fixtures=['NS','PST','POSTPONED','CANC','CANCELLED','ABD','ABANDONED','FT','AET','PEN'].map((status,i)=>({id:String(i),status,kickoff:'2026-11-22T12:05:00Z'}));
 const ids=fixtures.map(m=>m.id);
 assert.deepEqual(notificationCandidates(fixtures,ids,{now}).map(m=>m.id),['0']);
 assert.deepEqual(notificationCandidates([{id:'nested',status:{type:{name:'CANCELLED'}},kickoff:'2026-11-22T12:05:00Z'}],['nested'],{now}),[]);
});
