const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('premium-dark-red.css','utf8');
assert.match(html,/<link rel="stylesheet" href="\.\/premium-dark-red\.css">/);
assert.match(html,/<meta name="theme-color" content="#080b11">/);
for(const selector of ['#mamTeamSearch','#mamTeamHistoryScreen','.match-detail-overlay','#mamFavoritePanel','#mamStandingsScreen','#mamSpecialScreen','#mamHalfGoalScreen','#couponPanel','#mamAuthGate','.mam-bottom-nav','.match-modern','.team-logo']){
 assert.ok(html.includes(selector.replace(/^[.#]/,'')), 'Missing existing screen '+selector);
 assert.ok(css.includes(selector),'Missing theme coverage '+selector);
}
for(const token of ['--bg:#080b11','--panel:#151a23','--accent:#e63742'])assert.ok(css.includes(token));
assert.ok(!/fetch\s*\(/.test(css),'Theme should not fetch data');
console.log('Premium theme source checks passed');
