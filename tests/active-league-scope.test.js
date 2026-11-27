const test = require('node:test');
const assert = require('node:assert/strict');
const scope = require('../active-league-scope.js');

const activeIds = ['203','204','39','40','140','78','135','61','88','94','2','3','848','1','4','5'];

test('the active front-end scope contains exactly the requested 16 competitions', () => {
  assert.deepEqual([...scope.activeIds].sort(), [...activeIds].sort());
  for (const id of activeIds) assert.equal(scope.isActiveLeagueId(id), true, `league ${id} must stay active`);
  for (const id of ['6','9','15','39.2','141','143','79','81','136','137','62','66','144','179','253','71','128','262','98','188','169','307']) {
    assert.equal(scope.isActiveLeagueId(id), false, `league ${id} must stay hidden`);
  }
});

test('canonical provider IDs take precedence and alternate source slugs are recognized', () => {
  for (const [id, slug] of [['203','tur.1'],['204','tur.2'],['39','eng.1'],['40','eng.2'],['140','esp.1'],['78','ger.1'],['135','ita.1'],['61','fra.1'],['88','ned.1'],['94','por.1'],['2','uefa.champions'],['3','uefa.europa'],['848','uefa.europa.conf'],['1','fifa.world'],['4','uefa.euro'],['5','uefa.nations']]) {
    assert.equal(scope.leagueIdFor({league:{id, name:'unknown'}}), id);
    assert.equal(scope.leagueIdFor({league:{slug}}), id);
  }
  assert.equal(scope.isActiveMatch({league:{id:'307',name:'UEFA Champions League'}}), false);
});

test('provider names are accepted only as exact competition names with compatible country', () => {
  assert.equal(scope.isActiveMatch({league:{name:'UEFA Champions League',country:'Europe'}}), true);
  assert.equal(scope.isActiveMatch({league:{name:'Premier League',country:'England'}}), true);
  assert.equal(scope.isActiveMatch({league:{name:'Serie A',country:'Italy'}}), true);
  assert.equal(scope.isActiveMatch({league:{name:'Serie A',country:'Brazil'}}), false);
  assert.equal(scope.isActiveMatch({league:{name:'World Cup Qualifying',country:'World'}}), false);
  assert.equal(scope.isActiveMatch({league:{name:'Copa del Rey',country:'Spain'}}), false);
});

test('front-end visibility is a view filter; historical data remains intact', () => {
  const rows = [
    {fixture:{id:'active'}, league:{id:'203'}, teams:{home:{id:'1',name:'Team A'},away:{id:'2',name:'Team B'}}},
    {fixture:{id:'history'}, league:{id:'143'}, teams:{home:{id:'1',name:'Team A'},away:{id:'3',name:'Team C'}}}
  ];
  const visible = rows.filter(scope.isActiveMatch);
  assert.equal(visible.length, 1);
  assert.equal(rows.length, 2);
  assert.equal(scope.isActiveTeam({id:'1'}, rows), true);
  assert.equal(scope.isActiveTeam({id:'3'}, rows), false);
});

test('empty or all-passive selectors do not emit repeated fallback change events', () => {
  const run = select => {
    const root = {
      querySelectorAll(selector) {
        return selector === 'select#league' ? [select] : [];
      },
      querySelector() { return null; }
    };
    scope.applyLeagueControls(root);
  };
  const emptyEvents = [];
  const empty = {options:[],value:'',dispatchEvent:event=>emptyEvents.push(event.type)};
  run(empty);
  assert.deepEqual(emptyEvents, []);

  const passiveEvents = [];
  const passive = {options:[{value:'141',hidden:false}],value:'141',dispatchEvent:event=>passiveEvents.push(event.type)};
  run(passive);
  assert.equal(passive.options[0].hidden, true);
  assert.deepEqual(passiveEvents, []);
  assert.equal(passive.value, '141');

  const activeEvents = [];
  const mixed = {options:[{value:'141',hidden:false},{value:'203',hidden:false}],value:'141',dispatchEvent:event=>activeEvents.push(event.type)};
  run(mixed);
  assert.equal(mixed.options[0].hidden, true);
  assert.equal(mixed.value, '203');
  assert.deepEqual(activeEvents, ['change']);
});
