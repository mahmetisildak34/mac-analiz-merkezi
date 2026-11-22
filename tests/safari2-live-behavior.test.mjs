// Behavioral tests execute the exact predicate extracted from the production index.html.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('function mamCanonicalMatchStatus(');
const end=html.indexOf('function mamIstanbulDay(',start);
const liveStart=html.indexOf('function mamIsCrediblyLive(');
const liveEnd=html.indexOf('function mamIsFutureUnplayed(',liveStart);
assert.ok(start>=0&&end>start&&liveStart>=0&&liveEnd>liveStart);
const ctx={Date,Number,Set,Intl};vm.createContext(ctx);
vm.runInContext(html.slice(start,end)+html.slice(liveStart,liveEnd),ctx);
const now=Date.parse('2026-11-22T15:00:00Z');
const fixture=(status,date,updated,elapsed)=>({fixture:{date,status:{short:status,updated,elapsed}}});
test('rejects stale LIVE labels even with no fresh evidence',()=>{
 assert.equal(ctx.mamIsCrediblyLive(fixture('LIVE','2026-11-20T12:00:00Z'),now),false);
});
test('accepts ordinary active match within kickoff window',()=>{
 assert.equal(ctx.mamIsCrediblyLive(fixture('2H','2026-11-22T13:00:00Z'),now),true);
});
test('allows penalty shootout with recent provider update beyond four hours',()=>{
 assert.equal(ctx.mamIsCrediblyLive(fixture('P','2026-11-22T09:00:00Z','2026-11-22T14:55:00Z'),now),true);
});
test('allows suspended and resumed fixture with recent update',()=>{
 assert.equal(ctx.mamIsCrediblyLive(fixture('SUSP','2026-11-21T10:00:00Z','2026-11-22T14:50:00Z'),now),true);
});
test('rejects stale interrupted fixture without a recent update',()=>{
 assert.equal(ctx.mamIsCrediblyLive(fixture('INT','2026-11-20T10:00:00Z','2026-11-20T10:30:00Z'),now),false);
});
test('rejects completed and scheduled fixtures',()=>{
 assert.equal(ctx.mamIsCrediblyLive(fixture('FT','2026-11-22T13:00:00Z'),now),false);
 assert.equal(ctx.mamIsCrediblyLive(fixture('NS','2026-11-22T16:00:00Z'),now),false);
});

test('fresh fetch alone does not revive a stale LIVE match',()=>{
 assert.equal(ctx.mamIsCrediblyLive(fixture('LIVE','2026-11-20T12:00:00Z'),now,true),false);
});
test('Today live count excludes stale labels using production predicate',()=>{
 const matches=[fixture('LIVE','2026-11-20T12:00:00Z'),fixture('2H','2026-11-22T13:00:00Z'),fixture('FT','2026-11-22T12:00:00Z')];
 assert.equal(matches.filter(m=>ctx.mamIsCrediblyLive(m,now)).length,1);
});

test('recent update cannot revive a completed fixture',()=>{
 assert.equal(ctx.mamIsCrediblyLive(fixture('FT','2026-11-22T09:00:00Z','2026-11-22T14:59:00Z',120),now),false);
});
test('future kickoff cannot be live from an erroneous LIVE label',()=>{
 assert.equal(ctx.mamIsCrediblyLive(fixture('LIVE','2026-11-22T17:00:00Z'),now),false);
});
test('missing kickoff is not proof of a live fixture',()=>{
 assert.equal(ctx.mamIsCrediblyLive(fixture('LIVE',''),now),false);
});
test('provider update must not be in the future or older than twenty minutes',()=>{
 assert.equal(ctx.mamIsCrediblyLive(fixture('P','2026-11-22T09:00:00Z','2026-11-22T15:01:00Z',120),now),false);
 assert.equal(ctx.mamIsCrediblyLive(fixture('P','2026-11-22T09:00:00Z','2026-11-22T14:39:00Z',120),now),false);
});
