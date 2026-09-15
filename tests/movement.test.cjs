const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app, forecast, script, when } = require('./app-helper.cjs');

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
