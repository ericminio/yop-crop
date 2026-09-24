const {test} = require('node:test');
const assert = require('node:assert/strict');
const {app, script} = require('./app-helper.cjs');

function crops() {
  const run = app('open-meteo', undefined, {location: {search: '?replay=2022-06-01T12:00&lat=0&lon=0'}});
  run(script.slice(script.indexOf('  function dayMs('), script.indexOf('  const canvas =')));
  run('sown[0] = 0');
  return run;
}

test('offline startup still draws provisional crop cycles through the visible window', () => {
  const run = crops();
  assert.equal(run('tracksFor(0, 0, 0, 0, 140)[0].unknownFrom'), null);
  assert.equal(run('tracksFor(0, 0, 0, 0, 140)[0].estimatedFrom'), 0);
  assert.ok(run('tracksFor(0, 0, 0, 0, 140)[0].segs.length') > 0);
  assert.equal(run('tracksFor(0, 0, 0, 0, 140)[0].stall'), null);
});

test('temporary outage retains the previous crop rates and recovery replaces estimates', () => {
  const run = crops();
  run('conditionsAt = () => ({temperature_2m_min: 20, temperature_2m_max: 20}); tracksFor(0, 0, 0, 0, 140)');
  const rate = run('devel.tracks[0].rate[10]');
  run('conditionsAt = () => ({temperature_2m_min: NaN, temperature_2m_max: NaN}); openMeteoWeather.revision++');
  assert.equal(run('tracksFor(0.1, 0, 0, 0, 140)[0].rate[10]'), rate);
  assert.equal(run('devel.tracks[0].estimatedFrom'), 0);
  run('conditionsAt = () => ({temperature_2m_min: 25, temperature_2m_max: 25}); openMeteoWeather.revision++');
  assert.equal(run('tracksFor(0.1, 0, 0, 0, 140)[0].rate[10]'), rate + 5);
  assert.equal(run('devel.tracks[0].estimatedFrom'), null);
});

test('changing altitude does not reuse crop estimates from another flight level', () => {
  const run = crops();
  run('conditionsAt = () => ({temperature_2m_min: 40, temperature_2m_max: 40}); tracksFor(0, 0, 0, 0, 140)');
  const rate = run('devel.tracks[0].rate[10]');
  run('conditionsAt = () => ({temperature_2m_min: NaN, temperature_2m_max: NaN}); selectPressureLevel(850)');
  assert.notEqual(run('tracksFor(0, 0, 0, 0, 140)[0].rate[10]'), rate);
  assert.ok(run('Number.isFinite(devel.tracks[0].rate[10])'));
});

test('a reset discards the previous mission crop estimates', () => {
  const run = crops();
  run('conditionsAt = () => ({temperature_2m_min: 40, temperature_2m_max: 40}); tracksFor(0, 0, 0, 0, 140)');
  const rate = run('devel.tracks[0].rate[10]');
  run('devel.key = null; conditionsAt = () => ({temperature_2m_min: NaN, temperature_2m_max: NaN})');
  assert.notEqual(run('tracksFor(0, 0, 0, 0, 140)[0].rate[10]'), rate);
});
