const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, forecast, script, when } = require('./app-helper.cjs');

const settle = () => new Promise(resolve => setImmediate(resolve));

test('manual retry bypasses fresh cache and failure cooldown without changing the scenario', async () => {
  let requests = 0;
  const run = app('open-meteo', async () => {
    requests++;
    throw Error('offline');
  });
  forecast(run);
  run(script.slice(script.indexOf('  function dayMs('), script.indexOf('  const canvas =')));
  run(`pressureLevel = 850; sown[0] = 7;
    openMeteoWeather.fetchedAt.set('0.00,0.00', Date.now());
    openMeteoWeather.retryAt = Date.now() + 60000;
    openMeteoWeather.prime([{lat: sim.lat, lon: sim.lon}], 2, true)`);
  await settle();
  assert.equal(requests, 1, 'manual retry must request fresh weather immediately');
  assert.equal(run('pressureLevel'), 850);
  assert.equal(run('sown[0]'), 7);
  assert.equal(run('sim.lat'), 0);
  assert.equal(run('sim.lon'), 0);
  assert.equal(run('openMeteoWeather.cache.size'), 1);
});

test('hung requests time out, retain cached wind, and allow an automatic retry', async () => {
  let timeout;
  let signal;
  let finishOld;
  let requests = 0;
  const run = app('open-meteo', (url, options) => {
    requests++;
    signal = options?.signal;
    return new Promise(resolve => { finishOld = resolve; });
  }, {
    setTimeout(callback, delay) { timeout = callback; assert.equal(delay, 15000); return 1; },
    clearTimeout() {}
  });
  forecast(run, 12, 270);
  run(`openMeteoWeather.fetchedAt.set('0.00,0.00', ${when - 15 * 60000})`);
  run('openMeteoWeather.prime([{lat: 0, lon: 0}], 2)');
  assert.equal(typeof timeout, 'function', 'weather requests need a timeout');
  run('openMeteoWeather.prime([{lat: 0, lon: 0}], 2, true)');
  assert.equal(requests, 1, 'clicking during a request must not duplicate it');
  run(`Date.now = () => ${when + 15000}`);
  timeout();
  await settle();
  assert.equal(signal.aborted, true);
  assert.equal(run('openMeteoWeather.pending'), false);
  assert.equal(run("openMeteoWeather.cache.get('0.00,0.00').hourly.wind_speed_10m[0]"), 12);
  assert.equal(run('flightAt(0, 0, Date.now())'), null);
  run(`Date.now = () => ${when + 74999}; openMeteoWeather.prime([{lat: 0, lon: 0}], 2)`);
  assert.equal(requests, 1);
  const stale = finishOld;
  run(`Date.now = () => ${when + 75000}; openMeteoWeather.prime([{lat: 0, lon: 0}], 2)`);
  assert.equal(requests, 2);
  stale({ok: true, json: async () => ({hourly: {time: [1]}, daily: {time: [1]}})});
  await settle();
  assert.equal(run('openMeteoWeather.pending'), true);
  assert.equal(run("openMeteoWeather.cache.get('0.00,0.00').hourly.wind_speed_10m[0]"), 12);
  assert.equal(run('flightAt(0, 0, Date.now())'), null);
  timeout();
  await settle();
});

test('weather status is a native retry button for unavailable crop weather or wind', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.match(html, /<button[^>]*id="status"[^>]*>/);
  const run = app('open-meteo');
  run(`const el = {status: {style: {}}};
    const tracks = CROPS.map(() => ({stall: null}));
    const inBand = true, marg = 4;
    const st = {temp: NaN, dli: 20, missionDay: 4};`);
  const status = script.slice(script.indexOf('    const stallDay = tracks[SCORE_CROP].stall;'), script.indexOf('\n  function frame('));
  const update = () => run('{ ' + status.slice(0, status.lastIndexOf('\n  }')) + ' }');
  update();
  assert.equal(run('el.status.disabled'), false);
  assert.match(run('el.status.textContent'), /retry/i);
  run('openMeteoWeather.pending = true');
  update();
  assert.equal(run('el.status.disabled'), true);
  assert.match(run('el.status.textContent'), /retrying/i);
  run('openMeteoWeather.pending = false; st.temp = 20; sim.flightAvailable = false');
  update();
  assert.equal(run('el.status.disabled'), false);
  run('sim.flightAvailable = true');
  update();
  assert.equal(run('el.status.disabled'), true);
  assert.equal(run('el.status.textContent'), 'nominal');
  run('sim.positionUncertain = true');
  update();
  assert.equal(run('el.status.disabled'), false);
  assert.match(run('el.status.textContent'), /retry/i);
});

test('clicking the status retries the current location and restores forecast wind', async () => {
  const fixture = app();
  forecast(fixture, 18, 270);
  const row = JSON.parse(fixture("JSON.stringify(openMeteoWeather.cache.get('0.00,0.00'))"));
  let requested;
  const run = app('open-meteo', async url => {
    requested = new URL(url);
    return {ok: true, json: async () => row};
  });
  run(`const handlers = {};
    const el = {status: {disabled: false, addEventListener: (name, handler) => handlers[name] = handler}};
    sim.lat = 48; sim.lon = -123; pressureLevel = 850;
    openMeteoWeather.retryAt = Date.now() + 60000;`);
  run(script.slice(script.indexOf("  el.status.addEventListener('click'"), script.indexOf('  function hhmm(')));
  run('handlers.click(); handlers.click()');
  assert.equal(run('el.status.disabled'), true);
  assert.equal(requested.searchParams.get('latitude'), '48.0000');
  assert.equal(requested.searchParams.get('longitude'), '-123.0000');
  await settle();
  run('readState()');
  assert.equal(run('sim.flightAvailable'), true);
  assert.equal(run('sim.drift'), 10);
  assert.equal(run('pressureLevel'), 850);
  assert.equal(run('sim.lat'), 48);
  assert.equal(run('sim.lon'), -123);
  assert.equal(run('openMeteoWeather.pending'), false);
  assert.equal(run('openMeteoWeather.retryAt'), 0);
});
