const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app, forecast, script, when } = require('./app-helper.cjs');

const settle = () => new Promise(resolve => setImmediate(resolve));
const km = lon => lon * Math.PI / 180 * 6371;

function cached(run, speed = 0.1) {
  forecast(run, speed, 270);
  run("openMeteoWeather.fetchedAt.set('0.00,0.00', Date.now()); hourly.wind_speed_10m[1] = hourly.wind_speed_10m[0]; hourly.wind_direction_10m[1] = 270");
}

test('invalid wind retains the checkpoint and replays the missing interval after recovery', () => {
  const run = app('open-meteo');
  cached(run);
  run(`readState(); hourly.wind_speed_10m[0] = null; Date.now = () => ${when + 60000}; readState()`);
  assert.equal(run('positionTime'), when, 'unavailable wind must not consume movement time');
  assert.equal(run('sim.positionUncertain'), true);
  run('hourly.wind_speed_10m[0] = 0.1; readState()');
  assert.equal(run('positionTime'), when + 60000);
  assert.ok(Math.abs(km(run('confirmedPosition.lon')) - 0.1 / 60) < 1e-8);
  assert.equal(run('sim.positionUncertain'), true);
});

test('expired wind cannot confirm movement and fresh historical wind reconstructs the gap', async () => {
  const fixture = app('open-meteo');
  cached(fixture);
  const row = JSON.parse(fixture("JSON.stringify(openMeteoWeather.cache.get('0.00,0.00'))"));
  row.hourly.wind_direction_10m = [90, 90];
  let resolve;
  const run = app('open-meteo', () => resolve
    ? Promise.resolve({ok: true, json: async () => row})
    : new Promise(done => { resolve = done; }));
  cached(run);
  run(`readState(); Date.now = () => ${when + 20 * 60000}; readState()`);
  assert.equal(run('confirmedPosition.lon'), 0, 'stale wind must not advance the confirmed route');
  assert.equal(run('positionTime'), when);
  assert.equal(run('sim.positionUncertain'), true);
  assert.equal(typeof resolve, 'function');
  resolve({ok: true, json: async () => row});
  for (let i = 0; i < 5 && run('positionTime') < when + 20 * 60000; i++) {
    await settle();
    run('readState()');
  }
  assert.ok(Math.abs(km(run('confirmedPosition.lon')) + 0.1 / 3) < 1e-8);
  assert.equal(run('positionTime'), when + 20 * 60000);
  assert.equal(run('sim.positionUncertain'), true);
  assert.ok(run('positionTrail.every(point => point.lon <= 0)'));
});

test('a level change during an outage preserves the wind selection for each interval', () => {
  const run = app('open-meteo');
  cached(run);
  run(`hourly.wind_speed_850hPa = [0.2, 0.2]; hourly.wind_direction_850hPa = [90, 90];
    readState(); hourly.wind_speed_10m[0] = null;
    Date.now = () => ${when + 60000}; selectPressureLevel(850);
    Date.now = () => ${when + 120000}; readState()`);
  assert.equal(run('positionTime'), when);
  assert.equal(run('confirmedPosition.lon'), 0);
  run('hourly.wind_speed_10m[0] = 0.1; readState()');
  assert.ok(Math.abs(km(run('confirmedPosition.lon')) + 0.1 / 60) < 1e-8);
  assert.equal(run('positionTime'), when + 120000);
  assert.equal(run('pressureLevel'), 850);
});

test('fresh current weather cannot substitute for unavailable historical hours', () => {
  const run = app('open-meteo');
  cached(run);
  run(`readState(); Date.now = () => ${when + 3600000};
    hourly.time = hourly.time.map(t => t + 3600);
    openMeteoWeather.fetchedAt.set('0.00,0.00', Date.now()); readState()`);
  assert.equal(run('positionTime'), when);
  assert.equal(run('confirmedPosition.lon'), 0);
  assert.equal(run('sim.positionUncertain'), true);
  assert.equal(run('sim.flightAvailable'), true);
});

test('manual relocation clears the unresolved route and level history', () => {
  const run = app('open-meteo');
  cached(run);
  run(`readState(); hourly.wind_speed_10m[0] = null;
    Date.now = () => ${when + 60000}; selectPressureLevel(850);
    let fixNote, mapDirty;
    const document = {getElementById: () => null}; function syncMapCtl() {}`);
  run(script.slice(script.indexOf('  function dayMs('), script.indexOf('  const canvas =')));
  run(script.slice(script.indexOf('  function setPosition('), script.indexOf('  function weatherNote(')));
  run("setPosition(0, 0, 'map'); readState()");
  assert.equal(run('positionTime'), when + 60000);
  assert.equal(run('sim.positionUncertain'), false);
  assert.equal(run('positionTrail.length'), 1);
});

test('catch-up cannot integrate beyond the final hourly wind sample', () => {
  const run = app('open-meteo');
  cached(run);
  run(`readState(); hourly.time = [${when / 1000}, ${when / 1000 + 30}];
    Date.now = () => ${when + 60000}; readState()`);
  assert.ok(run('positionTime') <= when + 30000);
  assert.ok(km(run('confirmedPosition.lon')) <= 0.1 / 120 + 1e-8);
  assert.equal(run('sim.positionUncertain'), true);
});

test('a hole in hourly wind coverage cannot be filled by a distant sample', () => {
  const run = app('open-meteo');
  cached(run);
  run(`hourly.time = [${when / 1000}, ${when / 1000 + 3 * 3600}];
    positionTime = ${when + 3600000}; Date.now = () => ${when + 3660000};
    openMeteoWeather.fetchedAt.set('0.00,0.00', Date.now()); readState()`);
  assert.equal(run('positionTime'), when + 3600000);
  assert.equal(run('confirmedPosition.lon'), 0);
  assert.equal(run('sim.positionUncertain'), true);
});

test('incomplete wind is retried every 15 seconds without discarding the checkpoint', async () => {
  let requests = 0;
  const fixture = app('open-meteo');
  cached(fixture);
  fixture('hourly.wind_speed_10m = [null, null]');
  const row = JSON.parse(fixture("JSON.stringify(openMeteoWeather.cache.get('0.00,0.00'))"));
  const run = app('open-meteo', async () => {
    requests++;
    return {ok: true, json: async () => row};
  });
  cached(run);
  run(`readState(); hourly.wind_speed_10m = [null, null]; Date.now = () => ${when + 60000}; readState()`);
  await settle();
  assert.equal(requests, 1);
  run(`Date.now = () => ${when + 74999}; readState(); readState()`);
  await settle();
  assert.equal(requests, 1);
  run(`Date.now = () => ${when + 75000}; readState()`);
  await settle();
  assert.equal(requests, 2);
  assert.equal(run('positionTime'), when);
  assert.equal(run('confirmedPosition.lon'), 0);
});

test('position uncertainty is visible even when current wind has recovered', () => {
  const run = app('open-meteo');
  cached(run);
  run(`readState(); const el = {latlon: {}, drift: {}};
    sim.positionUncertain = true; sim.flightAvailable = true; sim.drift = 12;`);
  const display = script.slice(script.indexOf('    el.latlon.title ='), script.indexOf('    const scored =', script.indexOf('    el.latlon.title =')));
  run(display);
  assert.match(run('el.drift.textContent'), /estimated position/);
  assert.match(run('el.latlon.title'), /2026-09-14T12:00:00/);
  run('sim.positionUncertain = false');
  run(display);
  assert.equal(run('el.drift.textContent'), '12 km/h');
  assert.equal(run('el.latlon.title'), '');
});
