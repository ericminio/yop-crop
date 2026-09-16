const fs = require('node:fs');
const { execFileSync, spawnSync } = require('node:child_process');
const { findCloneInventory } = require('./check-duplication.cjs');

const SCAN_OPTIONS = { minTokens: 50, minLines: 5, mode: 'normalized' };

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'] });
}

function comparisonRef(remote) {
  const configured = spawnSync('git', ['config', '--get', 'duplication.baseRef'], { encoding: 'utf8' });
  if (configured.status === 0 && configured.stdout.trim()) return configured.stdout.trim();
  if (configured.status !== 1) throw new Error(configured.stderr || 'Cannot read duplication.baseRef');
  return git('symbolic-ref', `refs/remotes/${remote}/HEAD`).trim();
}

function committedSources(commit) {
  return git('ls-tree', '-rz', '--name-only', commit).split('\0').filter(file =>
    /\.(?:[cm]?js|html?)$/i.test(file) &&
    !/(^|\/)(?:tests?|__tests__|e2e|fixtures|node_modules|vendor|dist|build|coverage|\.git)(\/|$)/.test(file) &&
    !/\.(?:test|spec)\.[cm]?js$/i.test(file))
    .map(file => ({ file, source: git('show', `${commit}:${file}`) }));
}

function checkPush(input, remote = 'origin') {
  const scans = new Map();
  const scan = commit => {
    if (!scans.has(commit)) scans.set(commit, findCloneInventory(committedSources(commit), SCAN_OPTIONS));
    return scans.get(commit);
  };
  let failed = false;
  for (const line of input.split('\n').filter(line => line.trim())) {
    const fields = line.trim().split(/\s+/);
    if (fields.length !== 4 || !/^[\da-f]{40,64}$/i.test(fields[1])) throw new Error('Invalid pre-push ref update');
    const [localRef, localSha, remoteRef] = fields;
    if (/^0+$/.test(localSha) || !remoteRef.startsWith('refs/heads/')) continue;
    const baseRef = comparisonRef(remote);
    const tip = git('rev-parse', '--verify', `${localSha}^{commit}`).trim();
    const base = git('merge-base', tip, baseRef).trim();
    const baseline = scan(base), proposed = scan(tip), introduced = [];
    for (const [signature, occurrences] of proposed) {
      if (occurrences.size > (baseline.get(signature)?.size ?? 1)) introduced.push(occurrences);
    }
    if (!introduced.length) {
      console.log(`Duplication check: ${localRef} ${tip.slice(0, 8)} vs ${baseRef} ${base.slice(0, 8)}: no new duplication.`);
      continue;
    }
    failed = true;
    console.log(`Duplication check: ${localRef} has ${introduced.length} new duplicated token window(s); push blocked.`);
    const locations = new Set(introduced.flatMap(occurrences => [...occurrences.values()]
      .map(location => `${location.file}:${location.line}-${location.endLine}`)));
    for (const location of [...locations].slice(0, 20)) console.log(`  ${location}`);
    if (locations.size > 20) console.log(`  ... ${locations.size - 20} additional locations`);
  }
  return failed ? 1 : 0;
}

function main() {
  try {
    process.exitCode = checkPush(fs.readFileSync(0, 'utf8'), process.argv[2] || 'origin');
  } catch (error) {
    console.error(`Duplication check could not complete; push blocked: ${error.message}`);
    process.exitCode = 2;
  }
}

if (require.main === module) main();

module.exports = { main, checkPush };
