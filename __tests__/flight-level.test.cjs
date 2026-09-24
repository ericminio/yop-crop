const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, forecast, script, when } = require('./app-helper.cjs');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

function control(provider = 'open-meteo', globals = {}) {
  const run = app(provider, undefined, globals);
  run(`
    const listeners = {};
    const attributes = {};
    const styles = {};
    const slider = {
      value: '0', add() {},
      style: { setProperty(name, value) { styles[name] = value; } },
      setAttribute(name, value) { attributes[name] = value; },
      addEventListener(name, handler) { listeners[name] = handler; }
    };
    const elements = { 'pressure-level': slider, 'flight-level-value': {}, sim: {} };
    const document = { getElementById: id => elements[id] };
    function Option() {}
    function weatherNote() { return 'weather'; }
  `);
  run(script.slice(script.indexOf('  const levelControl ='), script.indexOf('  buildRows();', script.indexOf('  const levelControl ='))));
  return run;
}

test('flight control is a discrete vertical slider inside the position panel', () => {
  const panel = html.slice(html.indexOf('<div class="panel" id="position">'), html.indexOf('<div class="col" id="colR">'));
  assert.match(panel, /<input[^>]*id="pressure-level"[^>]*type="range"[^>]*step="1"[^>]*aria-orientation="vertical"/);
  assert.doesNotMatch(html, /<select[^>]*id="pressure-level"/);
  const header = html.slice(html.indexOf('id="latlon"'), html.indexOf('<div class="lab">Air temperature'));
  for (const id of ['alt', 'hdg', 'drift', 'flight-level-value']) assert.ok(header.includes('id="' + id + '"'));
});

test('slider selects each flight level from surface upward and updates its readable value', () => {
  const run = control();
  assert.equal(run('typeof listeners.input'), 'function', 'dragging the slider must update the flight level');
  assert.equal(Number(run('slider.max')), run('PRESSURE_LEVELS.length'));
  for (let index = 0; index <= run('PRESSURE_LEVELS.length'); index++) {
    run(`slider.value = '${index}'; listeners.input()`);
    const expected = index === 0 ? null : run(`PRESSURE_LEVELS[${index - 1}]`);
    const label = expected === null ? 'surface' : expected + ' hPa';
    assert.equal(run('pressureLevel'), expected);
    assert.equal(run("elements['flight-level-value'].textContent"), label);
    assert.equal(run("attributes['aria-valuetext']"), label);
  }
  run("slider.value = '0'; listeners.input()");
  assert.equal(run('pressureLevel'), null);
});

test('flight slider supports simulated and forecast winds', () => {
  assert.equal(control('simulated')('slider.disabled'), false);
  assert.equal(control()('slider.disabled'), false);
});

test('simulated altitude winds populate every stop with varied directions and strengths without fetching', () => {
  let requests = 0;
  const run = app('simulated', () => { requests++; throw Error('unexpected request'); });
  const markup = run(`flightWindMarkup(${when})`);
  assert.doesNotMatch(markup, /wind unavailable/);
  for (const side of ['left', 'right']) assert.ok(markup.includes(`data-side="${side}"`));
  for (const length of [6, 10, 14]) assert.ok(markup.includes(`data-length="${length}"`));
  run(`var winds = PRESSURE_LEVELS.map(level => flightAt(0, 0, ${when}, level))`);
  assert.equal(run('winds.every(wind => wind && wind.speed > 0 && wind.direction >= 0 && wind.direction < 360 && wind.altitude > 0)'), true);
  assert.equal(run('new Set(winds.map(wind => wind.direction)).size'), 19);
  assert.equal(run(`JSON.stringify(flightAt(0, 0, ${when}, 850)) === JSON.stringify(flightAt(0, 0, ${when}, 850))`), true);
  assert.notEqual(run(`flightAt(0, 0, ${when}, 850).direction`), run(`flightAt(0, 0, ${when + 86400000}, 850).direction`));
  assert.equal(requests, 0);
  const simulatedControl = control('simulated');
  simulatedControl("slider.value = '6'; listeners.input()");
  assert.equal(simulatedControl('pressureLevel'), 850);
  assert.equal(simulatedControl('sim.flightAvailable'), true);
});

test('slider fill reaches the thumb from the bottom after dragging or choosing a suggested level', () => {
  const run = control();
  const fill = index => `calc(${index / 19 * 100}% + ${8 - index / 19 * 16}px)`;
  assert.equal(run("styles['--flight-fill']"), fill(0));
  for (const index of [6, 19, 0]) {
    run(`slider.value = '${index}'; listeners.input()`);
    assert.equal(run("styles['--flight-fill']"), fill(index));
  }
  run("pressureLevel = 850; slider.value = '6'; syncFlightLevel()");
  assert.equal(run("styles['--flight-fill']"), fill(6));
  for (const track of ['webkit-slider-runnable-track', 'moz-range-track']) {
    const rule = html.match(new RegExp(`#pressure-level::-${track}\\s*\\{([^}]+)`))[1];
    assert.match(rule, /linear-gradient\(to top, var\(--cyan\) var\(--flight-fill\), var\(--edge\) var\(--flight-fill\)\)/);
  }
});

test('opening the page without a weather parameter enables forecast flight levels', () => {
  const run = control(undefined, { location: { search: '' } });
  assert.equal(run('weather === openMeteoWeather'), true);
  assert.equal(run('slider.disabled'), false);
  run("slider.value = '6'; listeners.input()");
  assert.equal(run('pressureLevel'), 850);
  assert.equal(run("elements['flight-level-value'].textContent"), '850 hPa');
});

test('an unrecognized weather parameter uses forecast flight levels', () => {
  const run = control('unknown');
  assert.equal(run('weather === openMeteoWeather'), true);
  assert.equal(run('slider.disabled'), false);
});

test('each slider stop shows wind blowing toward its drift bearing with bounded strength lengths', () => {
  const run = app('open-meteo');
  forecast(run, 5, 270);
  run(`
    hourly.wind_speed_1000hPa = [25, 25];
    hourly.wind_direction_1000hPa = [0, 0];
    hourly.wind_speed_975hPa = [90, 90];
    hourly.wind_direction_975hPa = [90, 90];
  `);
  assert.equal(run('typeof flightWindMarkup'), 'function', 'flight slider must render wind at each stop');
  const markup = run(`flightWindMarkup(${when})`);
  assert.equal((markup.match(/<svg /g) || []).length, 20);
  assert.match(markup, /data-level="surface"[^>]*bottom:0%/);
  assert.match(markup, /data-level="30"[^>]*bottom:100%/);
  assert.match(markup, /surface: toward 90°, 5 km\/h/);
  assert.match(markup, /1000 hPa: toward 180°, 25 km\/h/);
  assert.match(markup, /975 hPa: toward 270°, 90 km\/h/);
  for (const length of [6, 10, 14]) assert.ok(markup.includes(`data-length="${length}"`));
  assert.match(markup, /rotate\(90 12 12\)/);
  assert.match(markup, /rotate\(180 12 12\)/);
  assert.match(markup, /rotate\(270 12 12\)/);
});

test('wind stops refresh for time and location, distinguish calm from unavailable, and mark the selected level', () => {
  const run = app('open-meteo');
  forecast(run, 0, 270);
  assert.equal(run('typeof flightWindMarkup'), 'function', 'flight slider must render wind states');
  assert.match(run(`flightWindMarkup(${when})`), /surface: calm/);
  assert.match(run(`flightWindMarkup(${when + 3600000})`), /surface: toward 270°, 32 km\/h/);
  run('pressureLevel = 850; hourly.wind_speed_850hPa[0] = null');
  assert.match(run(`flightWindMarkup(${when})`), /class="flight-wind selected" data-level="850"/);
  assert.match(run(`flightWindMarkup(${when})`), /850 hPa: wind unavailable/);
  run('sim.lat = 40');
  assert.equal((run(`flightWindMarkup(${when})`).match(/wind unavailable/g) || []).length, 20);
});

test('wind arrows use the matching side of the slider, with up on the left and down on the right', () => {
  const run = app('open-meteo');
  forecast(run, 25, 270);
  for (const [bearing, side] of [[0, 'left'], [45, 'right'], [90, 'right'], [135, 'right'],
    [180, 'right'], [225, 'left'], [270, 'left'], [315, 'left']]) {
    run(`hourly.wind_direction_10m[0] = ${(bearing + 180) % 360}`);
    const surface = run(`flightWindMarkup(${when})`).match(/<svg[^>]*data-level="surface"[^>]*>/)[0];
    assert.ok(surface.includes(`data-side="${side}"`), `bearing ${bearing} belongs on the ${side}`);
  }
});
