const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app, forecast, script, when } = require('./app-helper.cjs');

function steadyWind(run, speed, direction) {
  run(`weather = { at: () => ({ wind_speed_10m: ${speed}, wind_direction_10m: ${direction} }) }`);
}

test('surface drift south of Hawaii catches up using forecast wind along the entire route', async () => {
  const fixture = app('open-meteo');
  forecast(fixture, 27, 62);
  fixture('hourly.wind_speed_10m = [27, 27]; hourly.wind_direction_10m = [62, 62]');
  const row = JSON.parse(fixture("JSON.stringify(openMeteoWeather.cache.get('0.00,0.00'))"));
  row.hourly.time = Array.from({length: 9}, (_, i) => when / 1000 + i * 3600);
  for (const field of Object.keys(row.hourly)) {
    if (field !== 'time') row.hourly[field] = Array(9).fill(row.hourly[field][0]);
  }
  let requests = 0;
  const run = app('open-meteo', async () => {
    requests++;
    return { ok: true, json: async () => structuredClone(row) };
  });
  run(`sim.lat = 18.01; sim.lon = -154.28; readState()`);
  const end = when + 8 * 3600000;
  run(`Date.now = () => ${end}; readState()`);
  assert.equal(run('confirmedPosition.lon'), -154.28, 'missing initial forecast must not confirm simulated drift');
  assert.equal(run('positionTime'), when, 'elapsed time must be retained while waiting for forecasts');
  let previousLon = -154.28;
  for (let i = 0; i < 1000 && run('positionTime') < end; i++) {
    await new Promise(resolve => setImmediate(resolve));
    run('readState()');
    assert.ok(run('confirmedPosition.lon') <= previousLon, 'every catch-up step must travel west with the supplied wind');
    previousLon = run('confirmedPosition.lon');
  }
  assert.equal(run('positionTime'), end);
  assert.ok(requests > 1);
  assert.ok(run('confirmedPosition.lon < -156 && confirmedPosition.lat < 18.01'));
  assert.ok(run('positionTrail.every((point, i) => i === 0 || point.lon <= positionTrail[i - 1].lon)'));
});

test('unavailable surface wind keeps the confirmed checkpoint while displaying an estimate', () => {
  for (const mutation of ['openMeteoWeather.cache.clear()', 'daily.time = [0]',
    'delete hourly.wind_speed_10m', 'hourly.wind_speed_10m[0] = -1',
    'hourly.wind_direction_10m[0] = null', 'hourly.wind_direction_10m[0] = 361']) {
    const run = app('open-meteo');
    forecast(run, 27, 62);
    run(mutation);
    run(`readState(); Date.now = () => ${when + 60000}; readState()`);
    assert.equal(run('confirmedPosition.lon'), 0, mutation);
    assert.notEqual(run('sim.lon'), 0, mutation);
    assert.equal(run('confirmedPosition.lat'), 0, mutation);
    assert.equal(run('sim.weatherEstimated'), true, mutation);
  }
});

test('overnight 1000 hPa movement retains elapsed time while fetching wind along the route', async () => {
  const fixture = app('open-meteo');
  forecast(fixture);
  fixture(`
    hourly.wind_speed_1000hPa = [24, 24];
    hourly.wind_direction_1000hPa = [270, 270];
    hourly.geopotential_height_1000hPa = [100, 100];
  `);
  const row = JSON.parse(fixture("JSON.stringify(openMeteoWeather.cache.get('0.00,0.00'))"));
  row.hourly.time = Array.from({length: 9}, (_, i) => when / 1000 + i * 3600);
  for (const field of Object.keys(row.hourly)) {
    if (field !== 'time') row.hourly[field] = Array(9).fill(row.hourly[field][0]);
  }
  let requests = 0;
  const run = app('open-meteo', async () => {
    requests++;
    return { ok: true, json: async () => structuredClone(row) };
  });
  run(`openMeteoWeather.cache.set('0.00,0.00', ${JSON.stringify(row)}); selectPressureLevel(1000)`);
  const end = when + 8 * 3600000;
  run(`Date.now = () => ${end}; readState()`);
  assert.ok(run('positionTime') < end);
  for (let i = 0; i < 1000 && run('positionTime') < end; i++) {
    await new Promise(resolve => setImmediate(resolve));
    run('readState()');
  }
  assert.equal(run('positionTime'), end);
  assert.ok(requests > 1);
  assert.ok(Math.abs(run('confirmedPosition.lon * Math.PI / 180 * 6371') - 192) < 1e-7);
});

test('selecting another pressure level changes drift to that level wind', () => {
  const run = app('open-meteo');
  forecast(run);
  run(`
    hourly.wind_speed_900hPa = [24, 24];
    hourly.wind_direction_900hPa = [270, 270];
    hourly.geopotential_height_900hPa = [980, 980];
    hourly.wind_speed_850hPa = [12, 12];
    hourly.wind_direction_850hPa = [90, 90];
    hourly.geopotential_height_850hPa = [1480, 1480];
    selectPressureLevel(900);
    Date.now = () => ${when + 60000}; readState();
  `);
  const east = run('sim.lon');
  assert.ok(Math.abs(east * Math.PI / 180 * 6371 - 0.4) < 1e-8);
  run('selectPressureLevel(850); readState()');
  assert.equal(run('sim.alt'), 1480);
  assert.equal(run('sim.lon'), east);
  assert.equal(run('sim.hdg'), 270);
  assert.equal(run('sim.drift'), 12);
  run(`Date.now = () => ${when + 120000}; readState()`);
  assert.ok(Math.abs((east - run('sim.lon')) * Math.PI / 180 * 6371 - 0.2) < 1e-8);
});

test('position starts here and now, then travels the expected distance in real time', () => {
  const run = app();
  steadyWind(run, 60, 270);
  run('readState()');
  assert.equal(run('sim.lon'), 0);
  run(`Date.now = () => ${when + 3600000}; readState()`);
  assert.ok(Math.abs(run('sim.lon') - 0.53959296) < 0.000001);
  assert.ok(Math.abs(run('sim.lat')) < 0.000001);
});

test('switching levels settles elapsed movement using the previous wind', () => {
  const run = app('open-meteo');
  forecast(run, 24, 270);
  run('readState()');
  run(`Date.now = () => ${when + 60000}; selectPressureLevel(850)`);
  assert.ok(Math.abs(run('sim.lon') * Math.PI / 180 * 6371 - 0.4) < 1e-8);
});

test('unavailable level wind keeps the confirmed checkpoint and labels generated movement', () => {
  for (const mutation of ['delete hourly.wind_speed_850hPa',
    'hourly.wind_direction_850hPa[0] = null', 'hourly.wind_speed_850hPa[0] = -1',
    'hourly.geopotential_height_850hPa[0] = null', 'openMeteoWeather.cache.clear()']) {
    const run = app('open-meteo');
    forecast(run, 24, 270);
    run(mutation);
    run(`selectPressureLevel(850); Date.now = () => ${when + 60000}; readState()`);
    assert.equal(run('confirmedPosition.lon'), 0);
    assert.equal(run('confirmedPosition.lat'), 0);
    assert.equal(run('sim.weatherEstimated'), true);
    assert.ok(run('Number.isFinite(sim.alt)'));
    assert.equal(run('flightAt(0, 0, Date.now(), 850)'), null);
  }
});

test('only documented discrete pressure levels can be selected', () => {
  const run = app();
  assert.throws(() => run('selectPressureLevel(875)'), /Unknown pressure level/);
  assert.equal(run('pressureLevel'), null);
});

test('movement uses the selected Open-Meteo adapter wind', () => {
  const run = app('open-meteo');
  forecast(run, 24, 270);
  run('readState()');
  run(`Date.now = () => ${when + 60000}; readState()`);
  assert.ok(Math.abs(run('sim.lon') - 0.00359729) < 0.000001);
});

test('movement is independent of frame rate', () => {
  const slow = app(), fast = app();
  for (const run of [slow, fast]) {
    steadyWind(run, 60, 180);
    run(`advancePosition(${when})`);
  }
  slow(`advancePosition(${when + 60000})`);
  for (let i = 1; i <= 60; i++) fast(`advancePosition(${when + i * 1000})`);
  assert.ok(Math.abs(slow('sim.lat') - fast('sim.lat')) < 1e-10);
});

test('calm wind and non-increasing timestamps do not move the platform', () => {
  const run = app();
  steadyWind(run, 0, 270);
  run(`advancePosition(${when}); advancePosition(${when + 3600000})`);
  assert.equal(run('sim.lat'), 0);
  assert.equal(run('sim.lon'), 0);
  steadyWind(run, 60, 270);
  run(`advancePosition(${when + 3600000}); advancePosition(${when})`);
  assert.equal(run('sim.lon'), 0);
});

test('movement wraps the date line and stays finite near a pole', () => {
  const run = app();
  steadyWind(run, 60, 270);
  run(`sim.lon = 179.99; advancePosition(${when}); advancePosition(${when + 3600000})`);
  assert.ok(run('sim.lon < -179 && sim.lon >= -180'));
  steadyWind(run, 60, 180);
  run(`sim.lat = 89.999; advancePosition(${when + 7200000})`);
  assert.ok(run('Number.isFinite(sim.lon) && Number.isFinite(sim.lat) && Math.abs(sim.lat) <= 90'));
});

test('catch-up samples wind along the route and bounds work for long gaps', () => {
  const run = app();
  run(`
    const samples = [];
    weather = { at: (lat, lon, time) => {
      samples.push({ lat, lon, time });
      return { wind_speed_10m: 60, wind_direction_10m: 270 };
    } };
    advancePosition(${when}); advancePosition(${when + 86400000});
  `);
  assert.equal(run('samples.length'), 240);
  assert.ok(run('samples[1].lon > samples[0].lon && samples[1].time > samples[0].time'));
  assert.ok(Math.abs(run('sim.lon') - 12.9502311) < 0.000001);
});

test('manual relocation starts a fresh movement interval', () => {
  const run = app();
  steadyWind(run, 60, 270);
  run(`
    let fixNote, mapDirty;
    const document = { getElementById: () => null };
    function syncMapCtl() {}
  `);
  run(script.slice(script.indexOf('  function dayMs('), script.indexOf('  const canvas =')));
  run(script.slice(script.indexOf('  function setPosition('), script.indexOf('  function weatherNote(')));
  run(`advancePosition(${when - 3600000}); setPosition(0, 20, 'map'); advancePosition(${when + 60000})`);
  assert.ok(Math.abs(run('sim.lon') - 20.00899322) < 0.000001);
});
