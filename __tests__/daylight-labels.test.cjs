const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app, script } = require('./app-helper.cjs');

function daylight(width = 190) {
  const run = app();
  run(`
    const el = {
      dayscale: {clientWidth: ${width}, style: {}},
      risemk: {offsetWidth: 45, style: {}},
      setmk: {offsetWidth: 45, style: {}},
      sunlab: {hidden: false},
      sunmk: {style: {}, get offsetWidth() { return el.sunlab.hidden ? 30 : 54; }}
    };
  `);
  run(script.slice(script.indexOf("  let dayLabelKey = ''"), script.indexOf('  function formatWeather(')));
  return run;
}

test('sun elevation stays centered when sunrise and sunset drift across a balanced winter day', () => {
  const run = daylight();
  run('placeDayLabels(10, 14.0001, "-12")');
  const first = run('parseFloat(el.sunmk.style.left) + el.sunmk.offsetWidth / 2');
  run('placeDayLabels(9.9999, 14, "-12")');
  const second = run('parseFloat(el.sunmk.style.left) + el.sunmk.offsetWidth / 2');
  assert.ok(Math.abs(second - first) <= 1, 'small solar changes must not send the elevation to the opposite edge');
  assert.equal(second, 95);
});

test('daylight labels keep distinct positions on narrow headers', () => {
  const run = daylight(150);
  run('placeDayLabels(10, 14, "-12")');
  assert.equal(run('el.risemk.style.left'), '0px');
  assert.equal(run('el.setmk.style.left'), '105px');
  assert.equal(run('el.sunlab.hidden'), true);
  assert.equal(run('el.sunmk.style.left'), '60px');
});

test('very narrow headers keep elevation centered on its own line', () => {
  const run = daylight(110);
  run('placeDayLabels(10, 14, "-12")');
  assert.equal(run('el.sunmk.style.left'), '40px');
  assert.equal(run('el.sunmk.style.top'), '14px');
  assert.equal(run('el.dayscale.style.height'), '26px');
  run('el.dayscale.clientWidth = 190; placeDayLabels(10, 14, "-12")');
  assert.equal(run('el.sunmk.style.top'), '0px');
  assert.equal(run('el.dayscale.style.height'), '12px');
});
