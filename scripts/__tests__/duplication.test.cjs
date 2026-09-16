const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findClones } = require('../check-duplication.cjs');

const calculation = `function total(prices, tax) {
  let sum = 0;
  for (const price of prices) {
    sum += price * tax;
  }
  return Math.round(sum * 100) / 100;
}`;
const renamed = calculation.replaceAll('total', 'cost').replaceAll('prices', 'items')
  .replaceAll('price', 'item').replaceAll('tax', 'factor').replaceAll('sum', 'result');
const options = { minTokens: 25, minLines: 3 };

test('detects duplicated calculations across files despite renamed identifiers', () => {
  const findings = findClones([{ file: 'first.js', source: calculation }, { file: 'second.js', source: renamed }], options);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].first.file, 'first.js');
  assert.equal(findings[0].second.file, 'second.js');
  assert.equal(findings[0].first.startLine, 1);
  assert.equal(findings[0].first.endLine, 7);
  assert.ok(findings[0].tokens >= 25);
});

test('normalization preserves numeric literals instead of matching different calculations', () => {
  const source = number => `function adjust(value) {
    const scaled = value * ${number};
    return scaled / ${number};
  }`;
  for (const [first, second] of [['4', '5'], ['1.2', '1.5'], ['1e2', '1e3'], ['0x10', '0x20'], ['1n', '2n']]) {
    assert.deepEqual(findClones([{ file: 'a.js', source: source(first) }, { file: 'b.js', source: source(second) }],
      { minTokens: 15, minLines: 2 }), [], `${first} and ${second} must remain distinct`);
  }
});

test('finds clones inside one file without reporting overlapping copies or nested matches', () => {
  const findings = findClones([{ file: 'both.js', source: calculation + '\n' + renamed }], options);
  assert.equal(findings.length, 1);
  assert.ok(findings[0].first.endLine < findings[0].second.startLine);
});

test('normalization preserves strings, templates and regular-expression literals including flags', () => {
  const source = literal => `function register(target) {
    const event = ${literal};
    return target.addEventListener(event, event);
  }`;
  for (const [first, second] of [["'click'", "'wheel'"], ['`hello`', '`goodbye`'],
    ['/click/', '/wheel/'], ['/event/g', '/event/i'], ['`event`', '/event/']]) {
    assert.deepEqual(findClones([{ file: 'a.js', source: source(first) }, { file: 'b.js', source: source(second) }],
      { minTokens: 18, minLines: 2 }), [], `${first} and ${second} must remain distinct`);
  }
});

test('normalization preserves dot-access, optional-access and object property names', () => {
  const variants = [
    field => `function read(data) { const value = data.${field}; return data.${field} + value; }`,
    field => `function read(data) { const value = data?.${field}; return data?.${field} + value; }`,
    field => `function wrap(value) { const result = { ${field}: value }; return { ${field}: result }; }`,
    field => `function wrap(${field}) { const result = { ${field} }; return { ${field}, result }; }`,
    field => `const object = { ${field}(value) { return value + 1; }, other() { return 2; } };`
  ];
  for (const source of variants) {
    const findings = findClones([{ file: 'a.js', source: source('speed') }, { file: 'b.js', source: source('direction') }],
      { minTokens: 15, minLines: 1 });
    const fieldTokens = source('speed').match(/\w+|\?\.|[^\s]/g)
      .flatMap((token, index) => token === 'speed' ? [index] : []);
    assert.ok(findings.every(finding => fieldTokens.every(index =>
      index < finding.first.startToken || index > finding.first.endToken)), 'a match must not cross a changed property name');
  }
});

test('compares arrow functions, drawing code and shorthand methods without special domain rules', () => {
  const source = `const render = (ctx, point) => {
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(point.x + 20, point.y + 10);
    ctx.stroke();
  };`;
  const copy = source.replaceAll('render', 'draw').replaceAll('point', 'location');
  for (const code of [source, source.replace('const render = (ctx, point) =>', 'const painter = { render(ctx, point)').replace('};', '} };')]) {
    const findings = findClones([{ file: 'draw.js', source: code }, { file: 'copy.js', source: copy }], options);
    assert.ok(findings.length > 0);
  }
});

test('exact mode ignores formatting and comments but retains names, values and operators', () => {
  const commented = calculation.replace('sum +=', `${'/' + '*'} explanation ${'*' + '/'}\n    sum   +=`);
  assert.equal(findClones([{ file: 'a.js', source: calculation }, { file: 'b.js', source: commented }],
    { ...options, mode: 'exact' }).length, 1);
  assert.deepEqual(findClones([{ file: 'a.js', source: calculation }, { file: 'b.js', source: renamed }],
    { ...options, mode: 'exact' }), []);
  assert.deepEqual(findClones([{ file: 'a.js', source: calculation },
    { file: 'b.js', source: calculation.replace('+=', '-=').replaceAll('*', '/') }],
    { minTokens: 40, minLines: 3 }), []);
});

test('preserves HTML line numbers and does not scan markup, comments or literal contents as code', () => {
  const html = '<html>\n<body>\n<script>\n' + calculation + '\n</script>\n</body></html>';
  const findings = findClones([{ file: 'app.html', source: html }, { file: 'copy.js', source: calculation }], options);
  assert.equal(findings[0]?.first.startLine, 4);
  const literals = `const text = ${JSON.stringify(calculation)}; const template = \`${calculation}\`;`;
  assert.deepEqual(findClones([{ file: 'literals.js', source: literals }], options), []);
  assert.deepEqual(findClones([{ file: 'data.html', source: `<script type="application/json">${JSON.stringify(calculation)}</script>` },
    { file: 'copy.js', source: calculation }], options), []);
});

test('respects minimum token and line thresholds', () => {
  const sources = [{ file: 'a.js', source: calculation }, { file: 'b.js', source: calculation }];
  assert.deepEqual(findClones(sources, { minTokens: 1000, minLines: 3 }), []);
  assert.deepEqual(findClones(sources, { minTokens: 25, minLines: 20 }), []);
});

test('does not turn long literal-data lists into code clones through normalization', () => {
  const list = name => `const ${name} = [\n` + Array.from({ length: 60 }, (_, i) => JSON.stringify(name + i)).join(',\n') + '\n];';
  assert.deepEqual(findClones([{ file: 'data.js', source: list('first') + '\n' + list('second') }]), []);
});

test('CLI supports JSON, thresholds and distinct success, finding and error statuses', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yop-duplication-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const first = path.join(directory, 'first.js'), second = path.join(directory, 'second.js');
  fs.writeFileSync(first, calculation);
  fs.writeFileSync(second, renamed);
  const run = args => spawnSync(process.execPath, ['scripts/check-duplication.cjs', ...args], {
    cwd: path.join(__dirname, '../..'), encoding: 'utf8'
  });
  const duplicates = run(['--json', '--min-tokens', '25', '--min-lines', '3', first, second]);
  assert.equal(duplicates.status, 1);
  assert.equal(JSON.parse(duplicates.stdout).length, 1);
  assert.equal(run([first]).status, 0);
  assert.equal(run(['--min-tokens', 'nonsense', first]).status, 2);
  assert.equal(run([path.join(directory, 'missing.js')]).status, 2);
});
