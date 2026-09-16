const fs = require('node:fs');

function tokenize(source, offset) {
  const tokens = [];
  let index = 0, line = offset + 1;
  const advance = end => {
    line += (source.slice(index, end).match(/\n/g) || []).length;
    index = end;
  };
  while (index < source.length) {
    const rest = source.slice(index), character = source[index];
    if (/\s/.test(character)) { advance(index + 1); continue; }
    if (rest.startsWith('//')) {
      const end = source.indexOf('\n', index);
      advance(end < 0 ? source.length : end);
      continue;
    }
    if (rest.startsWith('/*')) {
      const end = source.indexOf('*/', index + 2);
      if (end < 0) throw new Error(`Unterminated comment at line ${line}`);
      advance(end + 2);
      continue;
    }
    const previous = tokens.at(-1)?.value;
    const regex = character === '/' && (!previous ||
      ['=', '(', '[', '{', ',', ':', ';', '!', '&&', '||', '??', 'return', '=>'].includes(previous));
    if (['"', "'", '`'].includes(character) || regex) {
      const quote = character;
      let end = index + 1, inClass = false;
      for (; end < source.length; end++) {
        if (source[end] === '\\') { end++; continue; }
        if (regex && source[end] === '[') inClass = true;
        if (regex && source[end] === ']') inClass = false;
        if (source[end] === quote && !inClass) break;
      }
      if (end >= source.length) throw new Error(`Unterminated literal at line ${line}`);
      let literalEnd = end + 1;
      if (regex) while (literalEnd < source.length && /[a-z]/i.test(source[literalEnd])) literalEnd++;
      tokens.push({ type: regex ? 'regex' : quote === '`' ? 'template' : 'string',
        value: regex ? source.slice(index, literalEnd) : source.slice(index + 1, end), line,
        endLine: line + (source.slice(index, end + 1).match(/\n/g) || []).length });
      advance(literalEnd);
      continue;
    }
    const identifier = rest.match(/^[A-Za-z_$][\w$]*/);
    const number = rest.match(/^(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?[\d_]+)?)n?/);
    const value = identifier?.[0] ?? number?.[0] ??
      rest.match(/^(?:>>>=|===|!==|\*\*=|&&=|\|\|=|\?\?=|>>>|<<=|>>=|=>|\?\.|&&|\|\||\?\?|==|!=|>=|<=|\+\+|--|\*\*|<<|>>|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|\.\.\.)/)?.[0] ?? character;
    tokens.push({ value, type: identifier ? 'identifier' : number ? 'number' : 'punctuation', line, endLine: line });
    advance(index + value.length);
  }
  return tokens;
}

function sourceScripts(source, filename) {
  if (!/\.html?$/i.test(filename)) return [{ code: source, offset: 0 }];
  return [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .filter(match => {
      const type = match[1].match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1];
      return !type || ['module', 'text/javascript', 'application/javascript'].includes(type.toLowerCase());
    })
    .map(match => ({
      code: match[2],
      offset: source.slice(0, match.index + match[0].indexOf('>') + 1).split('\n').length - 1
    }));
}

const KEYWORDS = new Set(('async await break case catch class const continue debugger default delete do else ' +
  'export extends false finally for function if import in instanceof let new null of return static super ' +
  'switch this throw true try typeof var void while with yield').split(' '));

function isPropertyName(tokens, index) {
  const before = tokens[index - 1]?.value, after = tokens[index + 1]?.value;
  if (['.', '?.'].includes(before) || after === ':') return true;
  if (['{', ','].includes(before) && ['}', ','].includes(after)) return true;
  if (!['{', ',', ';', '}'].includes(before) || after !== '(') return false;
  let depth = 0;
  for (let i = index + 1; i < tokens.length; i++) {
    if (tokens[i].type !== 'punctuation') continue;
    if (tokens[i].value === '(') depth++;
    if (tokens[i].value === ')' && --depth === 0) return tokens[i + 1]?.value === '{';
  }
  return false;
}

function normalizedToken(token, mode, tokens, index) {
  if (mode === 'normalized') {
    if (token.type === 'identifier' && !KEYWORDS.has(token.value) && !isPropertyName(tokens, index)) return 'identifier';
  }
  return JSON.stringify([token.type, token.value]);
}

function analyzeClones(sources, options = {}, collectInventory = false) {
  const { minTokens = 50, minLines = 5, mode = 'normalized' } = options;
  if (!Number.isInteger(minTokens) || minTokens < 2 || !Number.isInteger(minLines) || minLines < 1 ||
      !['normalized', 'exact'].includes(mode)) throw new Error('Invalid mode or minimum token/line count');
  const units = sources.flatMap(({ source, file }) => sourceScripts(source, file).map(({ code, offset }) => {
    const tokens = tokenize(code, offset);
    return { file, tokens, values: tokens.map((token, index) => normalizedToken(token, mode, tokens, index)) };
  }));
  const windows = new Map(), findings = [], inventory = new Map();
  for (let unit = 0; unit < units.length; unit++) {
    const current = units[unit];
    for (let start = 0; start <= current.values.length - minTokens; start++) {
      const key = JSON.stringify(current.values.slice(start, start + minTokens));
      const previous = windows.get(key) || [];
      for (const match of previous) {
        const other = units[match.unit], sameUnit = match.unit === unit;
        if (sameUnit && match.start + minTokens > start) continue;
        if (match.start > 0 && start > 0 && other.values[match.start - 1] === current.values[start - 1]) continue;
        let length = minTokens;
        const limit = sameUnit ? start - match.start : Infinity;
        while (length < limit && match.start + length < other.values.length && start + length < current.values.length &&
               other.values[match.start + length] === current.values[start + length]) length++;
        const identifiers = current.tokens.slice(start, start + length).filter(token => token.type === 'identifier').length;
        if (identifiers < Math.max(4, Math.ceil(length / 10))) continue;
        const location = (source, index) => ({ file: source.file,
          startLine: source.tokens[index].line, endLine: source.tokens[index + length - 1].endLine,
          startToken: index, endToken: index + length - 1 });
        const first = location(other, match.start), second = location(current, start);
        if ([first, second].some(side => side.endLine - side.startLine + 1 < minLines)) continue;
        findings.push({ first, second, tokens: length, mode });
        if (collectInventory) for (let offset = 0; offset <= length - minTokens; offset++) {
          const signature = JSON.stringify(current.values.slice(start + offset, start + offset + minTokens));
          const occurrences = inventory.get(signature) || new Map();
          for (const [unitIndex, tokenIndex] of [[match.unit, match.start + offset], [unit, start + offset]]) {
            const source = units[unitIndex];
            occurrences.set(`${unitIndex}:${tokenIndex}`, { file: source.file,
              line: source.tokens[tokenIndex].line, endLine: source.tokens[tokenIndex + minTokens - 1].endLine });
          }
          inventory.set(signature, occurrences);
        }
      }
      previous.push({ unit, start });
      windows.set(key, previous);
    }
  }
  findings.sort((a, b) => b.tokens - a.tokens || a.first.file.localeCompare(b.first.file) ||
    a.first.startLine - b.first.startLine || a.second.startLine - b.second.startLine);
  return { findings, inventory };
}

function findClones(sources, options) {
  return analyzeClones(sources, options).findings;
}

function findCloneInventory(sources, options) {
  return analyzeClones(sources, options, true).inventory;
}

function main(args) {
  if (args.includes('--help')) {
    console.log('Usage: node scripts/check-duplication.cjs [--json] [--mode normalized|exact] [--min-tokens N] [--min-lines N] [files...]');
    console.log('Finds repeated code-token sequences within and across JavaScript files and inline HTML scripts.');
    console.log('Defaults: normalized variable names, literal values and property names preserved, 50 tokens, 5 lines, index.html.');
    console.log('Exit codes: 0 no clones, 1 clones found, 2 input/tokenization error.');
    return;
  }
  try {
    const options = {}, files = [];
    let json = false;
    for (let i = 0; i < args.length; i++) {
      const argument = args[i];
      if (argument === '--json') json = true;
      else if (argument === '--mode') options.mode = args[++i];
      else if (argument === '--min-tokens') options.minTokens = Number(args[++i]);
      else if (argument === '--min-lines') options.minLines = Number(args[++i]);
      else if (argument.startsWith('-')) throw new Error('Unknown option: ' + argument);
      else files.push(argument);
      if (['--mode', '--min-tokens', '--min-lines'].includes(argument) && i >= args.length) {
        throw new Error('Missing value for ' + argument);
      }
    }
    if (!files.length) files.push('index.html');
    const sources = [...new Set(files)].map(file => ({ file, source: fs.readFileSync(file, 'utf8') }));
    const findings = findClones(sources, options);
    if (json) console.log(JSON.stringify(findings, null, 2));
    else {
      console.log(`${findings.length} code-clone pair(s)`);
      for (const finding of findings) {
        console.log(`  ${finding.tokens} tokens (${finding.mode})`);
        for (const side of [finding.first, finding.second]) {
          console.log(`    ${side.file}:${side.startLine}-${side.endLine}`);
        }
      }
    }
    process.exitCode = findings.length ? 1 : 0;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { findClones, findCloneInventory };
