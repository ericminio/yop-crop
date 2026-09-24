const {test} = require('node:test');
const assert = require('node:assert/strict');
const {app, forecast, when} = require('./app-helper.cjs');

const start = Date.UTC(2022, 5, 1, 12);
const settle = () => new Promise(resolve => setImmediate(resolve));

function replay(fetch) {
  return app('open-meteo', fetch, {location: {search: '?replay=2022-06-01T12:00&lat=0&lon=0'}});
}

test('an offline replay keeps its selected speed and shows estimated weather from its first frame', async () => {
  let requests = 0;
  const run = replay(async () => { requests++; throw Error('offline'); });
  run('readState(); setReplaySpeed(1440)');
  run(`Date.now = () => ${when + 1000}`);
  assert.equal(run('readState().now'), start + 1440000);
  assert.ok(run('Number.isFinite(readState().temp)'));
  assert.ok(run('Number.isFinite(readState().dli)'));
  assert.equal(run('readState().wx.estimated'), true);
  assert.notEqual(run('sim.lon'), 0);
  await settle();
  run(`Date.now = () => ${when + 2000}; readState()`);
  await settle();
  assert.equal(requests, 1);
});

test('weather estimates retain the selected altitude during an outage', () => {
  const run = replay();
  run('selectPressureLevel(850)');
  assert.ok(run('Number.isFinite(readState().temp)'));
  assert.ok(run('sim.alt > 1000'));
  assert.equal(run('readState().wx.estimated'), true);
});

test('stale wind keeps the farm moving at the last known wind instead of freezing', () => {
  const run = app('open-meteo');
  forecast(run, 0.1, 270);
  run('hourly.wind_speed_10m[1] = 0.1; hourly.wind_direction_10m[1] = 270; readState()');
  run(`Date.now = () => ${when + 20 * 60000}; readState()`);
  assert.ok(run('sim.lon') > 0);
  assert.equal(run('positionTime'), when);
  assert.equal(run('sim.positionUncertain'), true);
  assert.equal(run('sim.weatherEstimated'), true);
});


test('recovery reconstructs the outage and eases toward the corrected route over five real seconds', () => {
  const run = app('open-meteo');
  forecast(run, 0.1, 270);
  run('hourly.wind_speed_10m[1] = 0.1; hourly.wind_direction_10m[1] = 270; readState()');
  run(`Date.now = () => ${when + 20 * 60000}; readState()`);
  const estimated = run('sim.lon');
  assert.ok(estimated > 0);
  run('hourly.wind_direction_10m = [90, 90]; openMeteoWeather.fetchedAt.set(openMeteoWeather.key(0, 0), Date.now()); readState()');
  assert.equal(run('positionTime'), when + 20 * 60000);
  assert.ok(run('confirmedPosition.lon') < 0);
  assert.ok(Math.abs(run('sim.lon') - estimated) < 1e-10);
  run(`Date.now = () => ${when + 20 * 60000 + 2500}; readState()`);
  assert.ok(run('sim.lon') < estimated && run('sim.lon > confirmedPosition.lon'));
  run(`Date.now = () => ${when + 20 * 60000 + 5000}; readState()`);
  assert.ok(Math.abs(run('sim.lon - confirmedPosition.lon')) < 1e-10);
  assert.equal(run('sim.positionUncertain'), false);
});

test('a paused replay keeps its game time while a recovered route eases into place', () => {
  const run = replay();
  run('readState(); setReplaySpeed(60)');
  run(`Date.now = () => ${when + 1000}; readState()`);
  assert.equal(run('readState().now'), start + 60000);
  run('setReplaySpeed(0)');
  run(`Date.now = () => ${when + 6000}; readState()`);
  assert.equal(run('readState().now'), start + 60000);
});

test('crossing zero coordinates reuses the same rounded weather cell', () => {
  const run = app('open-meteo');
  assert.equal(run('openMeteoWeather.key(-0.00001, -0.00001)'), run('openMeteoWeather.key(0, 0)'));
});

test('manual retry requests the confirmed checkpoint rather than the estimated position', async () => {
  const urls = [];
  const run = app('open-meteo', async url => { urls.push(new URL(url)); throw Error('offline'); });
  run('readState()');
  run(`Date.now = () => ${when + 60000}; readState()`);
  await settle();
  run(`const handlers = {}; const el = {status: {disabled: false, addEventListener: (name, fn) => handlers[name] = fn}}`);
  const {script} = require('./app-helper.cjs');
  run(script.slice(script.indexOf("  el.status.addEventListener('click'"), script.indexOf('  function hhmm(')));
  run('handlers.click()');
  assert.equal(urls[urls.length - 1].searchParams.get('latitude'), '0.0000');
  assert.equal(urls[urls.length - 1].searchParams.get('longitude'), '0.0000');
  await settle();
});

test('paused replay finishes correcting its route without advancing the game clock', () => {
  const run = replay();
  forecast(run, 0.1, 270);
  run(`hourly.time = hourly.time.map(t => t - ${(when - start) / 1000});
    daily.time = daily.time.map(t => t - ${(when - start) / 1000});
    hourly.wind_speed_10m[1] = 0.1; hourly.wind_direction_10m[1] = 270;
    openMeteoWeather.cache.set(openMeteoWeather.key(0, 0), {hourly, daily});
    openMeteoWeather.fetchedAt.set(openMeteoWeather.key(0, 0), Date.now());
    readState(); hourly.wind_speed_10m[0] = null; setReplaySpeed(60);
    Date.now = () => ${when + 1000}; readState(); setReplaySpeed(0);
    hourly.wind_speed_10m[0] = 0.1; hourly.wind_direction_10m = [90, 90]; readState()`);
  assert.equal(run('readState().now'), start + 60000);
  assert.equal(run('sim.positionUncertain'), true);
  const before = run('sim.lon');
  run(`Date.now = () => ${when + 6000}; readState()`);
  assert.equal(run('readState().now'), start + 60000);
  assert.equal(run('sim.positionUncertain'), false);
  assert.ok(run('sim.lon') < before);
  assert.ok(Math.abs(run('sim.lon - confirmedPosition.lon')) < 1e-10);
});

test('replay reaches live time during an outage without dropping the unconfirmed interval', () => {
  const nearNow = when - 60000;
  const run = app('open-meteo', undefined, {location: {search: '?replay=' + new Date(nearNow).toISOString().slice(0, 16)}});
  run(`readState(); setReplaySpeed(1440); Date.now = () => ${when + 1000}; readState()`);
  assert.equal(run('replayClock'), null);
  assert.equal(run('positionTime'), nearNow);
  assert.equal(run('readState().now'), when + 1000);
  assert.equal(run('sim.positionUncertain'), true);
  assert.notEqual(run('sim.lon'), 0);
});
