const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const when = Date.UTC(2026, 8, 14, 12);

function app(provider = 'simulated', fetch = async () => { throw Error('offline'); }) {
  const context = vm.createContext({
    URLSearchParams, location: { search: '?weather=' + provider }, fetch,
    Date: class extends Date { static now() { return when; } }
  });
  // Load the actual adapter/state code without starting the canvas UI.
  vm.runInContext(script.slice(script.indexOf("  'use strict';"),
    script.indexOf('  function dayMs(')), context);
  return expression => vm.runInContext(expression, context);
}

function forecast(run, speed = 24, direction = 270) {
  run(`
    const hourly = { time: [${when / 1000}, ${when / 1000 + 3600}] };
    for (const field of openMeteoWeather.hourly) hourly[field] = [10, 10];
    hourly.wind_speed_10m = [${speed}, 32];
    hourly.wind_direction_10m = [${direction}, 90];
    const daily = { time: [${when / 1000 - 43200}] };
    for (const field of openMeteoWeather.daily) daily[field] = [20];
    openMeteoWeather.cache.set('0.00,0.00', { hourly, daily });
  `);
}

test('page script parses', () => { new vm.Script(script); });

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
    return { json: async () => ({}) };
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

function steadyWind(run, speed, direction) {
  run(`weather = { at: () => ({ wind_speed_10m: ${speed}, wind_direction_10m: ${direction} }) }`);
}

test('position starts here and now, then travels the expected distance in real time', () => {
  const run = app();
  steadyWind(run, 60, 270);
  run('readState()');
  assert.equal(run('sim.lon'), 0);
  run(`Date.now = () => ${when + 3600000}; readState()`);
  assert.ok(Math.abs(run('sim.lon') - 0.53959296) < 0.000001);
  assert.ok(Math.abs(run('sim.lat')) < 0.000001);
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
  run(script.slice(script.indexOf('  function setPosition('), script.indexOf('  function weatherNote(')));
  run(`advancePosition(${when - 3600000}); setPosition(0, 20, 'map'); advancePosition(${when + 60000})`);
  assert.ok(Math.abs(run('sim.lon') - 20.00899322) < 0.000001);
});
