const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const hook = path.join(__dirname, '../pre-push-duplication.cjs');
const zero = '0'.repeat(40);
const calculation = (name, factor = 2) => `function ${name}(value) {
  const scaled = value * ${factor};
  const offset = scaled + ${factor};
  const limited = Math.max(${factor}, offset);
  const rounded = Math.round(limited);
  const result = rounded / ${factor};
  return result + ${factor};
}`;

function repository(t, baseline = calculation('first')) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'yop-pre-push-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q', '--initial-branch=main');
  git('config', 'user.name', 'Hook test');
  git('config', 'user.email', 'hook@example.test');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'duplication.baseRef', 'refs/heads/main');
  const write = source => fs.writeFileSync(path.join(cwd, 'index.html'), `<script>\n${source}\n</script>\n`);
  const commit = source => {
    write(source);
    git('add', 'index.html');
    git('commit', '-qm', 'Fixture', '--allow-empty');
    return git('rev-parse', 'HEAD');
  };
  commit(baseline);
  git('switch', '-qc', 'topic');
  const run = (sha = git('rev-parse', 'HEAD')) => spawnSync(process.execPath, [hook, 'origin'], {
    cwd, encoding: 'utf8', input: `refs/heads/topic ${sha} refs/heads/topic ${zero}\n`
  });
  return { cwd, git, write, commit, run };
}

test('pre-push blocks committed duplication even when the working tree has removed it', t => {
  const repo = repository(t);
  const sha = repo.commit(calculation('first') + '\n' + calculation('second'));
  repo.write(calculation('first'));
  const result = repo.run(sha);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /new duplicated/);
  assert.match(result.stdout, /index\.html:\d+/);
});

test('pre-push ignores uncommitted duplication when the pushed commit is clean', t => {
  const repo = repository(t);
  const sha = repo.commit(calculation('first'));
  repo.write(calculation('first') + '\n' + calculation('second'));
  const result = repo.run(sha);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /no new duplication/);
});

test('existing duplication can move without blocking but adding a third copy is blocked', t => {
  const baseline = calculation('first') + '\n' + calculation('second');
  const repo = repository(t, baseline);
  repo.commit('\n\n' + baseline);
  assert.equal(repo.run().status, 0);
  repo.commit(baseline + '\n' + calculation('third'));
  assert.equal(repo.run().status, 1);
});

test('removing old duplication does not offset introducing a different duplicate', t => {
  const repo = repository(t, calculation('first') + '\n' + calculation('second'));
  repo.commit(calculation('replacement', 7) + '\n' + calculation('copy', 7));
  assert.equal(repo.run().status, 1);
});

test('scan errors and missing comparison bases block with an explicit error', t => {
  const repo = repository(t);
  repo.commit('const broken = "');
  let result = repo.run();
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unterminated literal/);
  repo.git('config', 'duplication.baseRef', 'refs/heads/missing');
  result = repo.run();
  assert.equal(result.status, 2);
  assert.match(result.stderr, /missing/);
});

test('branch deletions require no scan', t => {
  const repo = repository(t);
  repo.git('config', 'duplication.baseRef', 'refs/heads/missing');
  assert.equal(repo.run(zero).status, 0);
});

test('script tests in __tests__ are excluded from the pre-push source scan', t => {
  const repo = repository(t);
  const directory = path.join(repo.cwd, 'scripts', '__tests__');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'fixture.js'), calculation('first') + '\n' + calculation('second'));
  repo.git('add', 'scripts/__tests__/fixture.js');
  repo.git('commit', '-qm', 'Add script test fixture');
  assert.equal(repo.run().status, 0);
});
