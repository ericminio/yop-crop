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

test('mission day advances at local solar midnight while crop age stays elapsed', () => {
  const run = mission();
  run("setPosition(0, 15, 'map'); advancePosition = () => {}; sown[0] = 0");
  run(`Date.now = () => ${when + 11 * 3600000 - 1}`);
  assert.equal(displayedDay(run), 1);
  run(`Date.now = () => ${when + 11 * 3600000}`);
  assert.equal(displayedDay(run), 2);
  assert.equal(run('st.lst'), 0);
  assert.equal(run('st.missionDay'), 11 / 24);
  assert.equal(run('sown[0]'), 0);
  assert.equal(run('dayMs(1)'), when + 86400000);
});

test('longitude corrections cannot reverse or count the same solar midnight twice', () => {
  const run = mission();
  run(`advancePosition = () => {}; Date.now = () => ${when + 12 * 3600000 - 60000}`);
  assert.equal(displayedDay(run), 1);
  run('sim.lon = 1');
  assert.equal(displayedDay(run), 2);
  run('sim.lon = -1');
  assert.equal(displayedDay(run), 2);
  run('sim.lon = 1');
  assert.equal(displayedDay(run), 2);
  run(`Date.now = () => ${when + 36 * 3600000 - 60000}`);
  assert.equal(displayedDay(run), 3);
});

test('crossing the antimeridian keeps the solar day continuous in both directions', () => {
  for (const direction of [1, -1]) {
    const run = mission(when - 12 * 3600000);
    run(`setPosition(0, ${direction * 179}, 'map'); advancePosition = () => {}`);
    assert.equal(displayedDay(run), 1);
    run(`sim.lon = ${-direction * 179}`);
    assert.equal(displayedDay(run), 1);
    run(`Date.now = () => ${when + 12 * 3600000}`);
    assert.equal(displayedDay(run), 2);
  }
});

test('a mission starting at solar midnight begins on day 1 and survives multi-day gaps', () => {
  const run = mission(when - 12 * 3600000);
  run('advancePosition = () => {}');
  assert.equal(displayedDay(run), 1);
  run(`Date.now = () => ${when - 12 * 3600000 + 3 * 86400000}`);
  assert.equal(displayedDay(run), 4);
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
