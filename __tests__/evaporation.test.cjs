const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app, forecast, script, when } = require('./app-helper.cjs');

function evaporationForecast() {
  const run = app('open-meteo');
  forecast(run);
  run(`
    hourly.time = Array.from({length: 25}, (_, i) => ${when / 1000 - 43200} + i * 3600);
    hourly.shortwave_radiation = Array.from({length: 25}, (_, i) => i >= 9 && i <= 16 ? 400 : 0);
    hourly.cloud_cover = Array(25).fill(40);
    for (const level of PRESSURE_LEVELS) hourly['cloud_cover_' + level + 'hPa'] = Array(25).fill(40);
    hourly.temperature_850hPa = Array(25).fill(20);
    hourly.relative_humidity_850hPa = Array(25).fill(60);
    hourly.geopotential_height_850hPa = Array(25).fill(1500);
    selectPressureLevel(850);
  `);
  return run;
}

test('radiation at altitude produces positive daily evaporation independent of drift wind', () => {
  const run = evaporationForecast();
  const et = run('readState().et0');
  assert.ok(Math.abs(et - 2.2584297616) < 1e-8);
  run('hourly.wind_speed_850hPa = Array(25).fill(150); hourly.wind_direction_850hPa = Array(25).fill(270)');
  assert.equal(run('readState().et0'), et);
  run('hourly.shortwave_radiation = hourly.shortwave_radiation.map(v => v / 2)');
  assert.ok(run('readState().et0') < et);
  run('hourly.shortwave_radiation.fill(0)');
  assert.equal(run('readState().et0'), 0);
});

test('incomplete daily temperature, humidity or height leaves evaporation unavailable', () => {
  for (const mutation of ['hourly.temperature_850hPa[0] = null',
    'hourly.relative_humidity_850hPa[0] = null', 'hourly.relative_humidity_850hPa[0] = 101',
    'hourly.geopotential_height_850hPa[0] = null', 'hourly.shortwave_radiation[12] = null']) {
    const run = evaporationForecast();
    run(mutation);
    assert.equal(run('Number.isNaN(pressureWeatherAt(sim.lat, sim.lon, gameNow()).et0_fao_evapotranspiration)'), true, mutation);
  }
});

test('daily water demand applies crop stage and planted area, with unknown phases kept unavailable', () => {
  const run = evaporationForecast();
  run(script.slice(script.indexOf('  function dayMs('), script.indexOf('  const canvas =')));
  run(`const waterTracks = CROPS.map(() => ({sown: null, unknownFrom: null, segs: []}));`);
  assert.equal(run('waterDemand(waterTracks, 4, 2)'), 0);
  run('waterTracks[0] = {sown: 4, unknownFrom: null, segs: [{from: 4, to: 5, idx: 0}]}');
  assert.equal(run('waterDemand(waterTracks, 4, 2)'), 0.196);
  run('waterTracks[0].segs[0].idx = 2');
  assert.ok(Math.abs(run('waterDemand(waterTracks, 4, 2)') - 0.4508) < 1e-10);
  run('waterTracks[0].unknownFrom = 4');
  assert.equal(run('Number.isNaN(waterDemand(waterTracks, 4, 2))'), true);
});
