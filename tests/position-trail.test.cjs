const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app, script, when } = require('./app-helper.cjs');

function positionPanel() {
  const run = app();
  run(`
    const strokes = [];
    let path = [];
    const context = new Proxy({
      beginPath() { path = []; },
      moveTo(x, y) { path.push(['move', x, y]); },
      lineTo(x, y) { path.push(['line', x, y]); },
      stroke() { strokes.push({ color: this.strokeStyle, width: this.lineWidth, path: path.slice() }); }
    }, { get: (target, key) => key in target ? target[key] : () => {} });
    const element = {
      getContext: () => context,
      getBoundingClientRect: () => ({ width: 400, height: 300, left: 0, top: 0 }),
      parentNode: { classList: { add() {}, remove() {} } },
      style: {},
      addEventListener() {}
    };
    const document = { getElementById: () => element };
    const LAND = [];
    weather = { at: () => ({ wind_speed_10m: 60, wind_direction_10m: 270 }) };
  `);
  run(script.slice(script.indexOf('  const mapc ='), script.indexOf("  mapc.addEventListener('mousedown'")));
  run(script.slice(script.indexOf('  function setPosition('), script.indexOf('  function askPosition(')));
  return run;
}

function trail(run) {
  run('strokes.length = 0; drawMap()');
  return JSON.parse(run("JSON.stringify(strokes.filter(s => s.color === '#ffc861' && s.width === 2).flatMap(s => s.path))"));
}

test('position panel hides the direction arrow when flight wind is unavailable', () => {
  const run = positionPanel();
  run('sim.flightAvailable = true; drawMap()');
  assert.ok(run("strokes.some(s => s.color === 'rgba(111,224,255,0.85)')"));
  run('strokes.length = 0; sim.flightAvailable = false; drawMap()');
  assert.equal(run("strokes.some(s => s.color === 'rgba(111,224,255,0.85)')"), false);
});

test('position panel draws the travelled route from the start through a wind change', () => {
  const run = positionPanel();
  run(`advancePosition(${when}); advancePosition(${when + 60000})`);
  const turn = JSON.parse(run('JSON.stringify({ lat: sim.lat, lon: sim.lon })'));
  run(`weather.at = () => ({ wind_speed_10m: 60, wind_direction_10m: 180 }); advancePosition(${when + 120000})`);
  const points = trail(run);
  assert.ok(points.length >= 3, 'the map must draw a trail through past positions');
  const x = lon => 200 + (lon - run('sim.lon')) * run('view.ppd');
  const y = lat => run(`150 + (mercY(${lat}) - view.cy) * view.S`);
  for (const expected of [[x(0), y(0)], [x(turn.lon), y(turn.lat)], [200, 150]]) {
    assert.ok(points.some(p => Math.abs(p[1] - expected[0]) < 1e-8 && Math.abs(p[2] - expected[1]) < 1e-8));
  }
});

test('click relocation clears the old trail and starts a new one at the clicked position', () => {
  const run = positionPanel();
  run(`advancePosition(${when}); advancePosition(${when + 60000})`);
  assert.ok(trail(run).length > 0, 'movement must leave a visible trail before relocation');
  run('mapGrab({ clientX: 250, clientY: 150, preventDefault() {} }); mapRelease()');
  assert.deepEqual(trail(run), []);
  run(`advancePosition(${when + 60000})`);
  assert.ok(trail(run).length > 0);
});

test('date-line crossing draws short continuous trail segments on either side of the world', () => {
  const run = positionPanel();
  run(`setPosition(0, 179.99, 'map'); advancePosition(${when + 120000}); map.zi = 0; map.lon = 0; map.lat = 0`);
  const points = trail(run);
  assert.ok(points.length > 0, 'date-line movement must leave a visible trail');
  for (let i = 1; i < points.length; i++) {
    if (points[i][0] === 'line') assert.ok(Math.abs(points[i][1] - points[i - 1][1]) < 1);
  }
  assert.ok(points.some(p => p[1] < 60));
  assert.ok(points.some(p => p[1] > 340));
});
