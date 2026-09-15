const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app, forecast, when } = require('./app-helper.cjs');

function radiationForecast() {
  const run = app('open-meteo');
  forecast(run);
  run(`
    hourly.time = Array.from({length: 25}, (_, i) => ${when / 1000 - 43200} + i * 3600);
    hourly.shortwave_radiation = Array(25).fill(0);
    hourly.shortwave_radiation[12] = 200;
    hourly.cloud_cover = Array(25).fill(80);
    for (const level of PRESSURE_LEVELS) hourly['cloud_cover_' + level + 'hPa'] = Array(25).fill(20);
    hourly.cloud_cover_900hPa = Array(25).fill(100);
    hourly.cloud_cover_700hPa = Array(25).fill(40);
    selectPressureLevel(850);
  `);
  return run;
}

test('daily crop light uses surface radiation adjusted by maximum cloud cover at or above the platform', () => {
  const run = radiationForecast();
  assert.ok(Math.abs(run('readState().wx.shortwave_radiation_sum') - 1.26) < 1e-10);
  assert.ok(Math.abs(run('readState().dli') - run('1.26 * PAR_PER_MJ')) < 1e-10);
  run('hourly.cloud_cover_700hPa.fill(80)');
  assert.ok(Math.abs(run('readState().wx.shortwave_radiation_sum') - 0.72) < 1e-10);
  run('hourly.cloud_cover_850hPa.fill(100)');
  assert.ok(Math.abs(run('readState().wx.shortwave_radiation_sum') - 0.45) < 1e-10);
});

test('radiation is bounded under overcast surface, clear skies aloft, and at night', () => {
  const run = radiationForecast();
  run(`
    hourly.cloud_cover.fill(100);
    for (const level of PRESSURE_LEVELS) hourly['cloud_cover_' + level + 'hPa'].fill(0);
  `);
  assert.ok(Math.abs(run('readState().wx.shortwave_radiation_sum') - 2.88) < 1e-10);
  run('hourly.shortwave_radiation[12] = 1000');
  const capped = run('readState().wx.shortwave_radiation_sum');
  assert.ok(capped > 0 && capped < 5.1);
  run('hourly.shortwave_radiation.fill(0); hourly.shortwave_radiation[1] = 1000');
  assert.equal(run('readState().wx.shortwave_radiation_sum'), 0);
});

test('incomplete or invalid daytime radiation and overhead cloud data remains unavailable', () => {
  for (const mutation of ['delete hourly.cloud_cover_700hPa',
    'hourly.cloud_cover_700hPa[12] = null', 'hourly.cloud_cover[12] = 101',
    'hourly.shortwave_radiation[12] = -1', 'hourly.time.pop()']) {
    const run = radiationForecast();
    run(mutation);
    assert.equal(run('Number.isNaN(readState().dli)'), true, mutation);
  }
});
