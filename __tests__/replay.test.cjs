const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app, script, when } = require('./app-helper.cjs');

const start = Date.UTC(2026, 3, 3, 12);
const settle = () => new Promise(resolve => setImmediate(resolve));

function replay(fetch) {
  return app('open-meteo', fetch, {
    location: { search: '?replay=2026-04-03T12:00&lat=0&lon=0' }
  });
}

function row(time = start) {
  const hourly = { time: Array.from({length: 72}, (_, i) => Math.floor(time / 86400000) * 86400 + i * 3600) };
  const daily = { time: [hourly.time[0], hourly.time[24], hourly.time[48]] };
  for (const field of ['temperature_2m', 'relative_humidity_2m', 'vapour_pressure_deficit', 'cloud_cover', 'shortwave_radiation']) hourly[field] = Array(72).fill(12);
  hourly.wind_speed_10m = Array(72).fill(0);
  hourly.wind_direction_10m = Array(72).fill(270);
  for (const field of ['temperature_2m_max', 'temperature_2m_min', 'shortwave_radiation_sum', 'daylight_duration', 'et0_fao_evapotranspiration']) daily[field] = [20, 20, 20];
  return {hourly, daily};
}

async function load(run) {
  run('openMeteoWeather.prime([{lat: 0, lon: 0}], 2)');
  await settle();
}

test('replay starts paused at the requested historical calendar time', () => {
  const run = replay();
  assert.equal(run('readState().now'), start);
  assert.equal(run('missionStartedAt'), start);
  run(`Date.now = () => ${when + 86400000}`);
  assert.equal(run('readState().now'), start);
});

test('archived requests select historical weather for the current forecast window', async () => {
  const requests = [];
  const run = replay(async url => { requests.push(new URL(url)); return {ok: true, json: async () => row()}; });
  await load(run);
  assert.equal(requests[0].hostname, 'historical-forecast-api.open-meteo.com');
  assert.equal(requests[0].searchParams.get('models'), 'gfs_global');
  assert.equal(requests[0].searchParams.get('start_date'), '2026-04-01');
  assert.equal(requests[0].searchParams.get('end_date'), '2026-04-18');
  assert.equal(requests[0].searchParams.has('run'), false);
  assert.equal(requests[0].searchParams.has('past_days'), false);
  assert.equal(run(`openMeteoWeather.at(0, 0, ${start + 86400000}).temperature_2m`), 12);
  assert.equal(requests.length, 1);
});

test('speed changes and pause preserve game time and weather cache uses real time', async () => {
  const run = replay(async () => ({ok: true, json: async () => row()}));
  await load(run);
  assert.equal(run('readState().now'), start);
  run('setReplaySpeed(360)');
  run(`Date.now = () => ${when + 1000}`);
  assert.equal(run('readState().now'), start + 360000);
  run('setReplaySpeed(0)');
  run(`Date.now = () => ${when + 2000}`);
  assert.equal(run('readState().now'), start + 360000);
  assert.equal(run('sim.flightAvailable'), true);
});

test('unavailable archived wind uses estimates while retries stay on real time', async () => {
  let requests = 0;
  const run = replay(async () => { requests++; throw Error('offline'); });
  assert.equal(run('readState().now'), start);
  run('setReplaySpeed(1440)');
  run(`Date.now = () => ${when + 1000}; readState()`);
  await settle();
  assert.equal(run('readState().now'), start + 1440000);
  assert.equal(run('readState().wx.estimated'), true);
  run(`Date.now = () => ${when + 2000}; readState()`);
  await settle();
  assert.equal(requests, 1);
  run(`Date.now = () => ${when + 61000}; readState()`);
  await settle();
  assert.equal(requests, 2);
});

test('a new game day requests a new historical forecast window', async () => {
  const requests = [];
  const run = replay(async url => { requests.push(new URL(url)); return {ok: true, json: async () => row()}; });
  await load(run);
  assert.equal(run('readState().now'), start);
  run(`replayClock.time = ${start + 20 * 3600000}; positionTime = replayClock.time`);
  await load(run);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].searchParams.get('end_date'), '2026-04-19');
});

test('invalid and unavailable replay dates do not start historical missions', () => {
  for (const date of ['2021-01-01T00:00', '2099-01-01T00:00', 'nonsense']) {
    const run = app('open-meteo', undefined, {location: {search: '?replay=' + date}});
    assert.equal(run('readState().now'), when);
  }
});

test('relocation in replay resets mission at game time', () => {
  const run = replay();
  assert.equal(run('readState().now'), start);
  run(script.slice(script.indexOf('  function dayMs('), script.indexOf('  const canvas =')));
  run(`let fixNote, mapDirty; const document = {getElementById: () => null}; function syncMapCtl() {}`);
  run(script.slice(script.indexOf('  function setPosition('), script.indexOf('  function weatherNote(')));
  run('setPosition(25, 40, "map")');
  assert.equal(run('positionTime'), start);
  assert.equal(run('missionStartedAt'), start);
});

test('replay controls offer a UTC start, pause and the supported speeds', () => {
  const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
  assert.match(html, /id="replay-start"[^>]*type="datetime-local"/);
  assert.match(html, /Start time \(UTC\)/);
  for (const speed of [0, 1, 60, 360, 1440]) assert.match(html, new RegExp('<option value="' + speed + '">'));
  assert.match(html, /Start new mission/);
});


test('historical replay is available from January 2022', () => {
  const run = app('open-meteo', undefined, {location: {search: '?replay=2022-01-01T00:00'}});
  assert.equal(run('readState().now'), Date.UTC(2022, 0, 1));
});

test('nearby replay positions reuse one weather grid cell at high speed', async () => {
  const requests = [];
  const run = replay(async url => { requests.push(new URL(url)); return {ok: true, json: async () => row()}; });
  await load(run);
  run('openMeteoWeather.prime([{lat: 0.05, lon: 0.05}], 2)');
  await settle();
  assert.equal(requests.length, 1);
  assert.equal(run(`flightAt(0.05, 0.05, ${start}).speed`), 0);
});

test('a suspended replay tab does not accumulate hours of accelerated movement', async () => {
  const run = replay(async () => ({ok: true, json: async () => row()}));
  await load(run);
  run('readState(); setReplaySpeed(1440)');
  run(`Date.now = () => ${when + 3600000}`);
  assert.ok(run('readState().now') <= start + 1440000);
});

test('historical archive requests allow 45 real seconds before timing out', async () => {
  let timeoutMs;
  const run = app('open-meteo', async () => { throw Error('offline'); }, {
    location: {search: '?replay=2022-01-01T12:00'},
    setTimeout(callback, delay) { timeoutMs = delay; return 1; },
    clearTimeout() {}
  });
  await load(run);
  assert.equal(timeoutMs, 45000);
});

test('accelerated wind moves the platform while game dates and crop days advance together', async () => {
  const data = row();
  data.hourly.wind_speed_10m.fill(10);
  const run = replay(async () => ({ok: true, json: async () => data}));
  await load(run);
  run('readState(); setReplaySpeed(360)');
  run(`Date.now = () => ${when + 1000}`);
  assert.equal(run('readState().now'), start + 360000);
  assert.ok(run('sim.lon') > 0.008 && run('sim.lon') < 0.010);
  assert.equal(run('readState().missionDay'), 360000 / 86400000);
});

test('historical requests stay inside archive dates and missing outlook stays unavailable', async () => {
  const urls = [];
  const run = app('open-meteo', async url => {
    urls.push(new URL(url));
    return {ok: true, json: async () => row()};
  }, {location: {search: '?replay=2022-01-01T00:00'}});
  await load(run);
  assert.equal(urls[0].searchParams.get('start_date'), '2022-01-01');
  assert.equal(run(`Number.isNaN(openMeteoWeather.at(0, 0, ${start + 30 * 86400000}).temperature_2m)`), true);
});

test('weather fetched along a replay route retains the mission crop history', async () => {
  const urls = [];
  const run = replay(async url => { urls.push(new URL(url)); throw Error('offline'); });
  run(`replayClock.time = ${start + 10 * 86400000}; positionTime = replayClock.time; setReplaySpeed(60)`);
  run(`Date.now = () => ${when + 1000}; readState()`);
  await settle();
  assert.equal(urls[0].searchParams.get('start_date'), '2026-04-01');
});

test('replay catches the present and continues live without resetting the mission', () => {
  const nearNow = when - 60000;
  const run = app('open-meteo', undefined, {location: {search: '?replay=' + new Date(nearNow).toISOString().slice(0, 16)}});
  assert.equal(run('readState().now'), nearNow);
  run(script.slice(script.indexOf('  function dayMs('), script.indexOf('  const canvas =')));
  run('sown[0] = 0');
  const data = row(when);
  run(`openMeteoWeather.cache.set(openMeteoWeather.key(0, 0), ${JSON.stringify(data)});
    openMeteoWeather.fetchedAt.set(openMeteoWeather.key(0, 0), Date.now());
    setReplaySpeed(1440);
    Date.now = () => ${when + 1000}`);
  assert.equal(run('readState().now'), when + 1000);
  assert.equal(run('replayClock'), null);
  assert.equal(run('missionStartedAt'), nearNow);
  assert.equal(run('sown[0]'), 0);
  assert.equal(run('positionTime'), when + 1000);
  run(`Date.now = () => ${when + 2000}`);
  assert.equal(run('readState().now'), when + 2000);
});

test('replay uses the live forecast endpoint near the present', async () => {
  const urls = [];
  const date = new Date(when - 86400000).toISOString().slice(0, 16);
  const run = app('open-meteo', async url => {
    urls.push(new URL(url));
    return {ok: true, json: async () => row(when)};
  }, {location: {search: '?replay=' + date}});
  await load(run);
  assert.equal(urls[0].hostname, 'api.open-meteo.com');
  assert.ok(Number(urls[0].searchParams.get('past_days')) >= 2);
  assert.equal(urls[0].searchParams.has('start_date'), false);
});

test('changing speed at the handoff safely leaves the clock in live mode', () => {
  const nearNow = when - 60000;
  const run = app('open-meteo', undefined, {location: {search: '?replay=' + new Date(nearNow).toISOString().slice(0, 16)}});
  const data = row(when);
  run(`readState();
    openMeteoWeather.cache.set(openMeteoWeather.key(0, 0), ${JSON.stringify(data)});
    openMeteoWeather.fetchedAt.set(openMeteoWeather.key(0, 0), Date.now());
    setReplaySpeed(1440);
    Date.now = () => ${when + 1000}`);
  assert.doesNotThrow(() => run('setReplaySpeed(0)'));
  assert.equal(run('replayClock'), null);
});
