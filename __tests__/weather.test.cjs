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

test('crop thermal and moisture conditions follow the selected pressure level', () => {
  const run = app('open-meteo');
  forecast(run);
  run(`
    hourly.time = Array.from({length: 24}, (_, i) => ${when / 1000 - 43200} + i * 3600);
    hourly.temperature_2m = Array(24).fill(35);
    hourly.relative_humidity_2m = Array(24).fill(15);
    for (const [level, low, high, rh] of [[900, 20, 28, 40], [850, 10, 18, 80]]) {
      hourly['temperature_' + level + 'hPa'] = Array.from({length: 24}, (_, i) => i < 12 ? low : high);
      hourly['relative_humidity_' + level + 'hPa'] = Array(24).fill(rh);
      hourly['cloud_cover_' + level + 'hPa'] = Array(24).fill(60);
    }
    selectPressureLevel(900);
  `);
  assert.equal(run('readState().temp'), 28);
  assert.equal(run('readState().rh'), 40);
  assert.equal(run('axesOf(readState().wx, {tBase: 5}).gddRate'), 19);
  const warmVpd = run('readState().vpd');
  run('selectPressureLevel(850)');
  assert.equal(run('readState().temp'), 18);
  assert.equal(run('readState().rh'), 80);
  assert.equal(run('axesOf(readState().wx, {tBase: 5}).gddRate'), 9);
  assert.equal(run('axesOf(readState().wx, {tBase: 5}).nightMin'), 10);
  assert.ok(Math.abs(run('readState().vpd') - 0.413) < 0.001);
  assert.ok(run('readState().vpd') < warmVpd);
  assert.equal(run('readState().wx.cloud_cover'), 60);
  assert.equal(run('Number.isNaN(readState().et0)'), true);
  assert.equal(run('Number.isNaN(readState().dli)'), true);
  run(script.slice(script.indexOf('  function dayMs('), script.indexOf('  const canvas =')));
  run('sown[0] = 4');
  const coolRate = run('tracksFor(0, 0, 4, 4, 6)[0].rate[4]');
  assert.equal(run('tracksFor(0, 0, 4, 4, 6)[0].unknownFrom'), 5);
  assert.equal(run('tracksFor(0, 0, 4, 4, 6)[0].stall'), null);
  run('selectPressureLevel(900)');
  assert.equal(run('tracksFor(0, 0, 4, 4, 6)[0].rate[4]') - coolRate, 10);
  assert.equal(run('phaseAt(tracksFor(0, 0, 4, 4, 6)[0], 5).phase'), 'weather unavailable');
});

test('missing pressure-level crop data never falls back to surface weather', () => {
  const run = app('open-meteo');
  forecast(run);
  run('selectPressureLevel(850); delete hourly.temperature_850hPa; delete hourly.relative_humidity_850hPa');
  assert.equal(run('Number.isNaN(readState().temp)'), true);
  assert.equal(run('Number.isNaN(readState().vpd)'), true);
  assert.equal(run('Number.isNaN(axesOf(readState().wx, {tBase: 5}).gddRate)'), true);
  run('openMeteoWeather.cache.clear()');
  assert.equal(run('Number.isNaN(readState().temp)'), true);
});

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
    assert.equal(run('flightAt(0, 0, Date.now()).speed'), 12);
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
  assert.equal(run('flightAt(0, 0, Date.now() + 3600000).speed'), 32);
});

test('Open-Meteo crop weather never exposes a separate flight wind, including surface fallback', () => {
  for (const level of [null, 850]) {
    for (const mutation of ['', 'openMeteoWeather.cache.clear()', 'daily.time = [0]',
      'hourly.wind_speed_10m[0] = null']) {
      const run = app('open-meteo');
      forecast(run, 24, 270);
      run(`pressureLevel = ${level}; ${mutation}`);
      assert.equal(run("'wind_speed_10m' in openMeteoWeather.at(0, 0, Date.now())"), false);
      assert.equal(run("'wind_direction_10m' in openMeteoWeather.at(0, 0, Date.now())"), false);
      if (level === null) {
        assert.equal(run('openMeteoWeather.at(0, 0, Date.now()).temperature_2m'),
          mutation === 'openMeteoWeather.cache.clear()' || mutation === 'daily.time = [0]'
            ? run('simulatedWeather.at(0, 0, Date.now()).temperature_2m') : 10);
      }
    }
  }
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

test('missing coverage or invalid wind leaves the flight heading unavailable', () => {
  for (const mutation of [null, 'hourly.wind_speed_10m[0] = null',
    'delete hourly.wind_direction_10m', 'hourly.wind_speed_10m[0] = -1',
    'hourly.wind_direction_10m[0] = NaN', 'daily.time = [0]']) {
    const run = app('open-meteo');
    if (mutation) { forecast(run); run(mutation); }
    run('readState()');
    assert.equal(run('sim.flightAvailable'), false);
    assert.equal(run('sim.drift'), 0);
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
  assert.ok(fields.includes('shortwave_radiation'));
  for (const level of [900, 850]) {
    for (const field of ['wind_speed_', 'wind_direction_', 'geopotential_height_',
      'temperature_', 'relative_humidity_', 'cloud_cover_']) {
      assert.ok(fields.includes(field + level + 'hPa'));
    }
  }
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
