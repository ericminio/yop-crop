const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, script } = require('./app-helper.cjs');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

function control(provider = 'open-meteo', globals = {}) {
  const run = app(provider, undefined, globals);
  run(`
    const listeners = {};
    const attributes = {};
    const slider = {
      value: '0', add() {},
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

test('flight slider remains disabled without pressure-level forecasts', () => {
  assert.equal(control('simulated')('slider.disabled'), true);
  assert.equal(control()('slider.disabled'), false);
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
