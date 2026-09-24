const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, script } = require('./app-helper.cjs');

function planner() {
  const run = app('open-meteo');
  run(script.slice(script.indexOf('  function dayMs('), script.indexOf('  function tracksFor(')));
  run(script.slice(script.indexOf('  function bandMiss('), script.indexOf("  el.candlist.addEventListener('click'")));
  run(`
    const good = { temperature_2m_min: 15, temperature_2m_max: 24,
      shortwave_radiation_sum: 20, daylight_duration: 43200, vapour_pressure_deficit: 0.8 };
    weather.at = (lat, lon, time, level) => ({ ...good, temperature_2m_min: level === 850 ? 15 : 2 });
    flightAt = (lat, lon, time, level) => ({ speed: 24, direction: level === 850 ? 270 : 90, altitude: 1000 });
    sim.positionUncertain = false;
    var rows;
  `);
  return run;
}

test('weather guidance replaces the fixed relocation destinations with route actions', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.ok(html.includes("Find better weather"));
  assert.match(html, /Preview route/);
  assert.match(html, /Set flight level/);
  assert.doesNotMatch(html, /Relocation candidates|hold station/);
});

test('guidance ranks reachable weather using each flight level and actual wind direction', () => {
  const run = planner();
  run('rows = weatherRoutes(0, 0, Date.now())');
  assert.equal(run('rows[0].level'), 850, 'the route with suitable crop weather should rank first');
  assert.ok(run('rows[0].path.at(-1).lon > 0'), 'westerly wind should carry the route east');
  assert.ok(run('rows.find(row => row.level === null).path.at(-1).lon < 0'));
  assert.equal(run('pressureLevel'), null, 'comparing levels must not change the flight');
  assert.equal(run('rows[0].suitableHours'), 12);
});

test('missing wind or estimated crop forecasts never become recommended routes', () => {
  const run = planner();
  run('flightAt = () => null; rows = weatherRoutes(0, 0, Date.now())');
  assert.equal(run('rows.length'), 0);
  assert.ok(run('outlook.pending.length > 0'));
  run('outlook.key = null; flightAt = () => ({speed: 24, direction: 270}); weather.at = () => ({...good, estimated: true}); rows = weatherRoutes(0, 0, Date.now())');
  assert.equal(run('rows.length'), 0);
});

test('guidance uses the existing crop phase and refreshes on a forecast revision', () => {
  const run = planner();
  run('sown[0] = 0; rows = weatherRoutes(0, 0, Date.now(), CROPS[0].need[2], 35)');
  assert.equal(run('rows[0].score'), run('fitScore(good, CROPS[0], CROPS[0].need[2], 35)'));
  run('weather.at = () => ({...good, temperature_2m_min: 0}); weather.revision++; rows = weatherRoutes(0, 0, Date.now(), CROPS[0].need[2], 35)');
  assert.ok(run('rows[0].score < 88'));
});

test('route weather fetches can progress past an unavailable level to a later forecast day', () => {
  const run = planner();
  run(`
    outlook.pending = [{lat: 0, lon: 0, time: Date.now()}, {lat: 1, lon: 1, time: Date.now() + 86400000}];
    const requests = [];
    weather.prime = (points, past, force, time) => {
      requests.push(time);
      if (time > Date.now()) weather.pending = true;
    };
    primeRouteWeather(0);
  `);
  assert.equal(run('requests.length'), 2);
  assert.equal(run('weather.pending'), true);
});

test('forecast routes use the requested historical day cache at each step', () => {
  const run = app('open-meteo');
  run(`
    replayClock = {time: Date.now() - 10 * 86400000, speed: 0, lastReal: Date.now()};
    const future = gameNow() + 86400000;
    const row = { hourly: {time: [future / 1000], temperature_2m: [18], relative_humidity_2m: [60],
      vapour_pressure_deficit: [0.8], cloud_cover: [20]}, daily: {time: [Math.floor(future / 86400000) * 86400],
      temperature_2m_max: [24], temperature_2m_min: [15], shortwave_radiation_sum: [20], daylight_duration: [43200], et0_fao_evapotranspiration: [3]} };
    openMeteoWeather.cache.set(openMeteoWeather.key(0, 0, future), row);
  `);
  assert.equal(run('openMeteoWeather.at(0, 0, future, null).temperature_2m'), 18);
});

test('a refreshed wind forecast changes the predicted route', () => {
  const run = planner();
  run('rows = weatherRoutes(0, 0, Date.now()); var originalLon = rows[0].path.at(-1).lon');
  run('flightAt = () => ({speed: 48, direction: 270}); weather.revision++; rows = weatherRoutes(0, 0, Date.now())');
  assert.ok(Math.abs(run('rows[0].path.at(-1).lon / originalLon') - 2) < 0.001);
});

function actions() {
  const run = planner();
  run(`
    let routeClick;
    const el = { candlist: { addEventListener: (name, handler) => { routeClick = handler; } } };
    const map = {lon: null, lat: null, zi: 0};
    const mapc = {getBoundingClientRect: () => ({width: 400, height: 300})};
    const posPanel = {classList: {remove() {}}};
    const ZOOMS = [1, 2, 4, 8, 16, 32, 64];
    function mercY(lat) { return lat / 360; }
    function syncMapCtl() {}
    let mapDirty = false;
    const levelControl = {value: 0};
    function syncFlightLevel() {}
    function weatherNote() { return 'forecast'; }
    const document = {getElementById: () => ({})};
    advancePosition = () => {};
    readState = () => {};
    sown[0] = 3;
    weatherRoutes(0, 0, Date.now());
  `);
  run(script.slice(script.indexOf("  el.candlist.addEventListener('click'"), script.indexOf("  document.querySelectorAll('.panel .ttl')")));
  return run;
}

test('route preview leaves flight and crops unchanged, and setting a level synchronizes the slider', () => {
  const run = actions();
  const originalPosition = run('JSON.stringify([sim.lat, sim.lon])');
  run('routeClick({target: {closest: () => ({dataset: {preview: "850"}})}})');
  assert.equal(run('outlook.preview'), '850');
  assert.equal(run('pressureLevel'), null);
  assert.equal(run('sown[0]'), 3);
  run('routeClick({target: {closest: () => ({dataset: {level: "850"}})}})');
  assert.equal(run('pressureLevel'), 850);
  assert.equal(run('PRESSURE_LEVELS[levelControl.value - 1]'), 850);
  assert.equal(run('sown[0]'), 3);
  assert.equal(run('JSON.stringify([sim.lat, sim.lon])'), originalPosition);
});

test('uncertain position prevents route actions', () => {
  const run = actions();
  run('sim.positionUncertain = true; routeClick({target: {closest: () => ({dataset: {level: "850"}})}})');
  assert.equal(run('pressureLevel'), null);
});

test('guidance retains usable route coverage when a later forecast point is missing', () => {
  const run = planner();
  run(`
    flightAt = (lat, lon, time) => time <= Date.now() + 2 * 3600000 ? {speed: 24, direction: 270} : null;
    rows = weatherRoutes(0, 0, Date.now());
  `);
  assert.ok(run('rows.length > 0'), 'two known hours should be shown instead of an empty panel');
  assert.equal(run('rows[0].forecastHours'), 2);
  assert.equal(run('rows[0].suitableHours'), 2);
  assert.equal(run('rows[0].path.length'), 3);
  assert.equal(run('outlook.pending[0].time'), run('Date.now() + 3 * 3600000'));
});

test('guidance shows current level conditions while the first destination forecast loads', () => {
  const run = planner();
  run(`
    flightAt = (lat, lon, time) => time === Date.now() ? {speed: 24, direction: 270} : null;
    const elements = {};
    const document = {getElementById: id => elements[id] ||= {}};
    const el = {candlist: {innerHTML: ''}};
    renderWeatherGuidance({wx: good, now: Date.now()}, CROPS[0].need[0], 15);
  `);
  assert.match(run('el.candlist.innerHTML'), /Current conditions only/);
  assert.match(run('el.candlist.innerHTML'), /data-preview="850" disabled/);
  assert.match(run('el.candlist.innerHTML'), /data-level="850" disabled/);
});

test('guidance defaults to a planted crop and lets the player choose another crop', () => {
  const run = planner();
  run('sown[1] = 0');
  assert.equal(run('typeof guidanceCropIndex === "function" && guidanceCropIndex()'), 1);
  run('guidanceCrop = 2');
  assert.equal(run('guidanceCropIndex()'), 2);
});

test('crop selection changes route scoring without changing sowing dates', () => {
  const run = planner();
  run('sown[1] = 0; rows = weatherRoutes(0, 0, Date.now(), CROPS[1].need[0], CROPS[1].days * SPLIT[0], 1)');
  assert.equal(run('rows[0].score'), run('fitScore(good, CROPS[1], CROPS[1].need[0], CROPS[1].days * SPLIT[0])'));
  assert.equal(run('sown[1]'), 0);
});

test('routes flag worsening conditions for other planted crops', () => {
  const run = planner();
  run('sown[0] = 0; sown[1] = 0');
  assert.equal(run('typeof routeTradeoffs'), 'function');
  run(`
    var warnings = routeTradeoffs({weatherSamples: [{...good, temperature_2m_min: 3}]}, good,
      CROPS.map(crop => crop.need[0]), 0);
  `);
  assert.match(run('warnings.join(" ")'), /tomato/);
  assert.doesNotMatch(run('warnings.join(" ")'), /onion/);
  assert.match(run('warnings.join(" ")'), /warmer nights/);
});
