const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app, script, when } = require('./app-helper.cjs');

function mission(start = when) {
  const run = app('simulated', undefined, {
    Date: class extends Date { static now() { return start; } }
  });
  run(script.slice(script.indexOf('  function dayMs('), script.indexOf('  const canvas =')));
  run(`let fixNote, mapDirty;
    const document = {getElementById: () => null};
    function syncMapCtl() {}
    const el = {mday: {}};`);
  run(script.slice(script.indexOf('  function setPosition('), script.indexOf('  function weatherNote(')));
  return run;
}

function displayedDay(run) {
  run('var st = readState()');
  run(script.match(/    el\.mday\.textContent = .*;/)[0]);
  return run('el.mday.textContent');
}

test('each page load starts on day 1 using the current calendar date', () => {
  for (const start of [when, when + 10 * 86400000]) {
    const run = mission(start);
    assert.equal(displayedDay(run), 1);
    assert.equal(run('dayMs(0)'), start);
    assert.equal(run('st.now'), start);
  }
});

test('wind drift advances the mission clock without resetting sowing dates', () => {
  const run = mission();
  run(`readState(); sown[0] = 0; Date.now = () => ${when + 86400000 - 1}`);
  assert.equal(displayedDay(run), 1);
  run(`Date.now = () => ${when + 86400000}`);
  assert.equal(displayedDay(run), 2);
  assert.notEqual(run('sim.lon'), 0);
  assert.equal(run('sown[0]'), 0);
});

test('manual relocation starts a fresh mission and discards the previous crop timeline', () => {
  const run = mission();
  run(`readState(); sown[0] = 2; sown[1] = 8; scrub = 12;
    devel.key = 'previous'; outlook.key = 'previous';
    Date.now = () => ${when + 3 * 86400000};
    setPosition(25, 40, 'map')`);
  assert.equal(displayedDay(run), 1);
  assert.equal(run('dayMs(0)'), when + 3 * 86400000);
  assert.equal(run('sown.every(day => day === null)'), true);
  assert.equal(run('scrub'), null);
  assert.equal(run('nowDay'), 0);
  assert.equal(run('devel.key'), null);
  assert.equal(run('outlook.key'), null);
  assert.equal(run('positionTrail.length'), 1);
  assert.equal(run('sim.lat'), 25);
  assert.equal(run('sim.lon'), 40);
});
