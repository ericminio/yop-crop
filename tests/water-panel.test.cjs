const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app, script } = require('./app-helper.cjs');

function waterPanel() {
  const run = app();
  run(script.slice(script.indexOf('  function dayMs('), script.indexOf('  const canvas =')));
  run(script.slice(script.indexOf('  function formatWeather('), script.indexOf('  function updateHUD(')));
  run(`
    const el = Object.fromEntries(['wres', 'wdraw', 'et', 'wcap', 'wdays'].map(id => [id, {}]));
    const waterState = {missionDay: 4, et0: 2, wx: {evaporation_estimated: true, cloud_cover: 40}};
    const waterTracks = CROPS.map(() => ({sown: null, unknownFrom: null, segs: []}));
    waterTracks[0] = {sown: 4, unknownFrom: null, segs: [{from: 4, to: 5, idx: 0}]};
  `);
  return run;
}

test('water panel shows estimated ET, draw and depletion time for planted potatoes', () => {
  const run = waterPanel();
  run('updateWaterPanel(waterState, waterTracks)');
  assert.equal(run('el.et.textContent'), '~2.0 mm/d');
  assert.equal(run('el.wdraw.textContent'), '~0.20 t/d');
  assert.equal(run('el.wdays.textContent'), '~49.0 d');
  run('waterTracks[0].segs[0].idx = 2; updateWaterPanel(waterState, waterTracks)');
  assert.equal(run('el.wdraw.textContent'), '~0.45 t/d');
  assert.equal(run('el.wdays.textContent'), '~21.3 d');
});

test('empty beds and zero evaporation show no depletion', () => {
  const run = waterPanel();
  run('waterState.et0 = 0; updateWaterPanel(waterState, waterTracks)');
  assert.equal(run('el.wdraw.textContent'), '~0.00 t/d');
  assert.equal(run('el.wdays.textContent'), '∞ (no draw)');
  run('waterState.et0 = 2; waterTracks[0].sown = null; waterTracks[0].segs = []; updateWaterPanel(waterState, waterTracks)');
  assert.equal(run('el.wdraw.textContent'), '~0.00 t/d');
  assert.equal(run('el.wdays.textContent'), '∞ (no draw)');
});

test('unknown crop phase or evaporation displays unavailable instead of zero demand', () => {
  const run = waterPanel();
  run('waterTracks[0].unknownFrom = 4; updateWaterPanel(waterState, waterTracks)');
  assert.equal(run('el.wdraw.textContent'), '— t/d');
  assert.equal(run('el.wdays.textContent'), '— d');
  run('waterState.et0 = NaN; updateWaterPanel(waterState, waterTracks)');
  assert.equal(run('el.et.textContent'), '— mm/d');
});

test('surface data clears altitude estimate markers and explanations', () => {
  const run = waterPanel();
  run('updateWaterPanel(waterState, waterTracks); waterState.wx.evaporation_estimated = false; updateWaterPanel(waterState, waterTracks)');
  assert.equal(run('el.et.textContent'), '2.0 mm/d');
  assert.equal(run('el.wdraw.textContent'), '0.20 t/d');
  assert.equal(run('el.wdays.textContent'), '49.0 d');
  assert.equal(run('el.et.title'), '');
  assert.equal(run('el.wdraw.title'), '');
});
