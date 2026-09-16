const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app, script } = require('./app-helper.cjs');

function timeline() {
  const run = app();
  run(`
    const strokes = [], labels = [], saved = [];
    let path = [], dash = [], geom = null;
    const BACK = 35, FWD = 105, hatch = null;
    const tlc = { getBoundingClientRect: () => ({ width: 800, height: 156 }) };
    const tctx = new Proxy({
      lineWidth: 1,
      beginPath() { path = []; },
      moveTo(x, y) { path.push([x, y]); },
      lineTo(x, y) { path.push([x, y]); },
      setLineDash(value) { dash = value.slice(); },
      stroke() { strokes.push({ path: path.slice(), color: this.strokeStyle, width: this.lineWidth, dash: dash.slice() }); },
      fillText(text, x, y) { labels.push({ text, x, y, color: this.fillStyle, align: this.textAlign, baseline: this.textBaseline, font: this.font }); },
      save() { saved.push({ properties: { ...this }, dash: dash.slice() }); },
      restore() { const state = saved.pop(); Object.assign(this, state.properties); dash = state.dash; }
    }, { get: (target, key) => key in target ? target[key] : () => {} });
    const tracks = CROPS.map(() => ({ sown: null, stall: null, unknownFrom: null, segs: [] }));
    tracks[0].sown = 20;
    tracks[0].stall = 30;
  `);
  run(script.slice(script.indexOf('  function sizeTimeline('), script.indexOf('  function dayFromX(')));
  return run;
}

const x = day => 88 + day / 140 * 698;

test('timeline preserves distinct sown, stalled, forecast and scrubbed marker appearance', () => {
  const run = timeline();
  run('scrub = 15; drawTimeline({ missionDay: 10 }, 15, tracks)');
  const strokes = JSON.parse(run('JSON.stringify(strokes)'));
  for (const expected of [
    { path: [[x(20), 21], [x(20), 51]], color: '#6fe0ff', width: 1.2, dash: [] },
    { path: [[x(30), 22], [x(30), 50]], color: '#ff7a6e', width: 1.5, dash: [] },
    { path: [[x(26), 10], [x(26), 139]], color: 'rgba(111,224,255,0.35)', width: 1, dash: [2, 3] },
    { path: [[x(10), 8], [x(10), 138]], color: 'rgba(255,200,97,0.30)', width: 1, dash: [3, 3] },
    { path: [[x(15), 6], [x(15), 138]], color: '#6fe0ff', width: 1.8, dash: [] }
  ]) {
    assert.deepEqual(strokes.find(stroke => stroke.color === expected.color && stroke.width === expected.width), expected);
  }
  const labels = JSON.parse(run("JSON.stringify(labels.filter(label => /^(sown D|stall D|projected)/.test(label.text)))"));
  assert.deepEqual(labels, [
    { text: 'sown D20', x: x(20) + 3, y: 22, color: '#6fe0ff', align: 'left', baseline: 'bottom', font: '8.5px ui-monospace, Menlo, monospace' },
    { text: 'stall D30', x: x(30) + 3, y: 23, color: '#ff7a6e', align: 'left', baseline: 'bottom', font: '8.5px ui-monospace, Menlo, monospace' },
    { text: 'projected', x: x(26) + 3, y: 2, color: 'rgba(122,163,184,0.85)', align: 'left', baseline: 'top', font: '8.5px ui-monospace, Menlo, monospace' }
  ]);
});

test('live timeline has a solid amber marker and omits offscreen crop markers', () => {
  const run = timeline();
  run('tracks[0].sown = 200; tracks[0].stall = 200; drawTimeline({ missionDay: 10 }, 10, tracks)');
  assert.equal(run("labels.some(label => /^(sown D|stall D)/.test(label.text))"), false);
  assert.equal(run("strokes.some(stroke => stroke.color === 'rgba(255,200,97,0.30)')"), false);
  assert.deepEqual(JSON.parse(run("JSON.stringify(strokes.find(stroke => stroke.color === '#ffc861'))")),
    { path: [[x(10), 6], [x(10), 138]], color: '#ffc861', width: 1.8, dash: [] });
});
