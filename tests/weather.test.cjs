const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { app, forecast, script, when } = require('./app-helper.cjs');

test('refreshes an expired forecast while the farm remains stationary', async () => {
  const requests = [];
  const fixture = app();
  forecast(fixture, 0, 270);
  const row = JSON.parse(fixture("JSON.stringify(openMeteoWeather.cache.get('0.00,0.00'))"));
  row.hourly.wind_speed_10m = [0, 0];
  const run = app('open-meteo', async url => {
    requests.push(new URL(url));
    const response = structuredClone(row);
    if (requests.length > 1) response.hourly.wind_speed_10m = [20, 20];
    return { ok: true, json: async () => response };
  });
  const prime = async () => {
    run('openMeteoWeather.prime([{lat: sim.lat, lon: sim.lon}], 2)');
    await new Promise(resolve => setImmediate(resolve));
  };
  await prime();
  run('readState()');
  assert.equal(run('sim.drift'), 0);
  run(`Date.now = () => ${when + 15 * 60000 - 1}; readState()`);
  await prime();
  assert.equal(requests.length, 1);
  run(`Date.now = () => ${when + 15 * 60000}; readState()`);
  assert.equal(run('sim.lat'), 0);
  assert.equal(run('sim.lon'), 0);
  await prime();
  assert.equal(requests.length, 2);
  assert.equal(requests[0].search, requests[1].search);
  run('readState()');
  assert.equal(run('sim.drift'), 20);
});

test('page script parses', () => { new vm.Script(script); });

test('failed refresh keeps cached wind and waits a minute before retrying', async () => {
  for (const failure of ['network', 'http', 'invalid body']) {
    let requests = 0;
    const run = app('open-meteo', async () => {
      requests++;
      if (failure === 'network') throw new Error('offline');
      return { ok: failure !== 'http', json: async () => ({ error: true }) };
    });
    forecast(run, 12, 270);
    const prime = async () => {
      run('openMeteoWeather.prime([{lat: 0, lon: 0}], 2)');
      await new Promise(resolve => setImmediate(resolve));
    };
    await prime();
    run('readState()');
    assert.equal(run('sim.drift'), 12);
    run(`Date.now = () => ${when + 59999}`);
    await prime();
    assert.equal(requests, 1);
    run(`Date.now = () => ${when + 60000}`);
    await prime();
    assert.equal(requests, 2);
    assert.equal(run('openMeteoWeather.at(0, 0, Date.now()).wind_speed_10m'), 12);
  }
});

test('simulated wind drives speed and heading and varies with time', () => {
  const run = app();
  run('readState()');
  assert.equal(run('sim.drift'), run('simulatedWeather.at(0, 0, Date.now()).wind_speed_10m'));
  assert.ok(run('sim.hdg >= 38 && sim.hdg <= 82'));
  assert.notEqual(run('sim.drift'), run('simulatedWeather.at(0, 0, Date.now() + 86400000).wind_speed_10m'));
});

test('forecast wind drives state and selects the nearest hour', () => {
  const run = app('open-meteo');
  forecast(run);
  run('readState()');
  assert.equal(run('sim.drift'), 24);
  assert.equal(run('sim.hdg'), 90);
  assert.equal(run('openMeteoWeather.at(0, 0, Date.now() + 3600000).wind_speed_10m'), 32);
});

test('wind bearings convert to travel bearings, including wraparound', () => {
  for (const [direction, heading] of [[0, 180], [90, 270], [180, 0], [270, 90], [360, 180]]) {
    const run = app('open-meteo');
    forecast(run, 24, direction);
    run('readState()');
    assert.equal(run('sim.hdg'), heading);
  }
});

test('calm wind remains zero', () => {
  const run = app('open-meteo');
  forecast(run, 0, 0);
  run('readState()');
  assert.equal(run('sim.drift'), 0);
});

test('missing coverage or invalid wind falls back to simulated wind', () => {
  for (const mutation of [null, 'hourly.wind_speed_10m[0] = null',
    'delete hourly.wind_direction_10m', 'hourly.wind_speed_10m[0] = -1',
    'hourly.wind_direction_10m[0] = NaN', 'daily.time = [0]']) {
    const run = app('open-meteo');
    if (mutation) { forecast(run); run(mutation); }
    run('readState()');
    assert.equal(run('sim.drift'), run('simulatedWeather.at(0, 0, Date.now()).wind_speed_10m'));
    assert.equal(run('sim.hdg'), run('(simulatedWeather.at(0, 0, Date.now()).wind_direction_10m + 180) % 360'));
  }
});

test('forecast request includes both wind fields and explicit km/h units', async () => {
  let url;
  const run = app('open-meteo', async value => {
    url = new URL(value);
    return { ok: true, json: async () => ({}) };
  });
  run('openMeteoWeather.prime([{lat: 0, lon: 0}], 2)');
  assert.equal(url.searchParams.get('wind_speed_unit'), 'kmh');
  const fields = url.searchParams.get('hourly').split(',');
  assert.ok(fields.includes('wind_speed_10m'));
  assert.ok(fields.includes('wind_direction_10m'));
});

test('arrival estimates refresh when wind speed changes at the same location', () => {
  const run = app('open-meteo');
  forecast(run);
  run(script.slice(script.indexOf('  function dayMs('), script.indexOf('  const STALL_RATE')));
  run(`
    const outlook = { key: null, rows: null };
    const CANDIDATES = [{ dist: 240, dLat: 2, dLon: 0.81 }];
    function buildTrack() { return { segs: [], stall: null }; }
  `);
  run(script.slice(script.indexOf('  function candidateOutlooks('),
    script.indexOf('  function candidateOutlooks(') + script.slice(script.indexOf('  function candidateOutlooks(')).indexOf('\n  }') + 4));
  run('readState()');
  assert.equal(run('candidateOutlooks(0, 0, Date.now(), 4, 140)[0].eta'), 10);
  run('hourly.wind_speed_10m[0] = 48; readState()');
  assert.equal(run('candidateOutlooks(0, 0, Date.now(), 4, 140)[0].eta'), 5);
});
