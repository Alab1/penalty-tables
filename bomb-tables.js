#!/usr/bin/env node
'use strict';

/*
 * BOMB DEFUSER - multiplication tables game (no dependencies, Node 18+)
 *
 * Run:      node bomb-tables.js
 * Options:  --tables 3,7,6-8   which tables to practise
 *           --max 10           other factor goes from 1 to this number
 *           --time 8           seconds per bomb
 *           --questions 10     number of bombs
 *           --lives 3          lives before game over
 *           --name Leo         player name
 * Anything you don't pass is asked interactively.
 */

const readline = require('readline/promises');

// ---------- helpers ----------
const ESC = '\x1b[';
const paint = (code) => (s) => `${ESC}${code}m${s}${ESC}0m`;
const c = {
  red: paint('31'), green: paint('32'), yellow: paint('33'), cyan: paint('36'),
  magenta: paint('35'), bold: paint('1'), dim: paint('2'),
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const GOOD = [
  'Clic ! Le bon fil !', 'Bombe désamorcée. Fastoche !', 'Explosion évitée !', 'Des doigts de ninja !',
  "Les démineurs vous saluent !", 'Trop facile !', 'Désamorcée avec style !',
];
const WRONG = [
  'Mauvais fil ! Vite !', 'La bombe rigole... réessaie !', 'Raté ! Tic tac !',
  "Hmm, ça l'a énervée !", 'Pas tout à fait - réfléchis plus vite !',
];
const BOOMS = [
  'KABOUM ! Des confettis partout.', 'BOUM ! Tes sourcils ont disparu.',
  'BOUM ! La bombe te remercie d\'avoir joué.', 'KABLAM ! Plus de chance à la prochaine bombe.',
];

// ---------- args & setup ----------
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([a-z]+)(?:=(.*))?$/.exec(argv[i]);
    if (!m) continue;
    out[m[1]] = m[2] !== undefined ? m[2] : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true');
  }
  return out;
}

function parseTables(str) {
  const set = new Set();
  for (const part of String(str).split(',')) {
    const p = part.trim();
    if (!p) continue;
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(p);
    if (range) {
      let [lo, hi] = [parseInt(range[1], 10), parseInt(range[2], 10)];
      if (lo > hi) [lo, hi] = [hi, lo];
      for (let n = lo; n <= hi; n++) set.add(n);
    } else if (/^\d+$/.test(p)) {
      set.add(parseInt(p, 10));
    } else {
      return null;
    }
  }
  const list = [...set].filter((n) => n >= 1 && n <= 100).sort((a, b) => a - b);
  return list.length ? list : null;
}

async function setup(opts) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const askText = async (q, def, given) => {
    if (given !== undefined) return given;
    const a = (await rl.question(`${q} ${c.dim(`[${def}]`)} `)).trim();
    return a || String(def);
  };
  const askNum = async (q, def, given, min, max) => {
    let v = given;
    for (;;) {
      const raw = v !== undefined ? v : await askText(q, def);
      const n = parseFloat(raw);
      if (!Number.isNaN(n) && n >= min && n <= max) return n;
      console.log(c.red(`  Entre un nombre entre ${min} et ${max}.`));
      v = undefined;
    }
  };

  console.log(c.bold(c.yellow('\n  *** DÉSAMORCEUR DE BOMBES : édition multiplication ***\n')));
  const name = await askText('Nom du joueur ?', 'Héros', opts.name);

  let tables = opts.tables !== undefined ? parseTables(opts.tables) : null;
  while (!tables) {
    const raw = await askText('Quelles tables ? (ex. 7  ou  3,6,9  ou  2-5)', '2-10');
    tables = parseTables(raw);
    if (!tables) console.log(c.red("  Je n'ai pas compris. Essaie par exemple 3,7 ou 2-5."));
  }
  const max = Math.floor(await askNum("L'autre facteur va jusqu'à ?", 10, opts.max, 1, 100));
  const time = await askNum('Secondes par bombe ?', 10, opts.time, 1, 120);
  const questions = Math.floor(await askNum('Combien de bombes ?', 10, opts.questions, 1, 200));
  const lives = Math.floor(await askNum('Vies ?', 3, opts.lives, 1, 10));
  rl.close();
  return { name, tables, max, time, questions, lives };
}

function buildQuestions(cfg) {
  const pool = [];
  for (const t of cfg.tables) for (let m = 1; m <= cfg.max; m++) pool.push([t, m]);
  const list = [];
  while (list.length < cfg.questions) list.push(...shuffle([...pool]));
  return list.slice(0, cfg.questions).map(([t, m]) => (Math.random() < 0.5 ? [t, m] : [m, t]));
}

// ---------- rendering ----------
const FRAME_H = 12;
const FUSE_LEN = 30;
let lastLines = 0;

function render(lines) {
  let out = lastLines > 0 ? `${ESC}${lastLines}A` : '';
  for (const l of lines) out += `${ESC}2K${l}\n`;
  process.stdout.write(out);
  lastLines = lines.length;
}
function clearFrame() {
  if (lastLines > 0) {
    process.stdout.write(`${ESC}${lastLines}A${ESC}0J`);
    lastLines = 0;
  }
}

function header(s) {
  const hearts = c.red('♥'.repeat(s.lives)) + c.dim('♡'.repeat(s.maxLives - s.lives));
  return `  Bombe ${c.bold(`${s.q}/${s.total}`)}   Vies : ${hearts}   Score : ${c.bold(s.score)}   Série : ${c.bold(s.streak)}`;
}

function bombFrame(s) {
  const frac = Math.max(0, s.left / s.limit);
  const face = frac > 0.6 ? '(^_^)' : frac > 0.3 ? '(o_o)' : frac > 0.12 ? '(O_O)' : '(>_<)';
  const col = frac > 0.6 ? c.green : frac > 0.3 ? c.yellow : c.red;
  const off = s.shake > 0 && s.shake % 2 === 1 ? ' ' : '';
  const rem = Math.round(frac * FUSE_LEN);
  const spark = s.tick % 2 ? c.red('*') : c.yellow('+');
  const barLen = 24;
  const filled = Math.round(frac * barLen);
  const bar = col('#'.repeat(filled)) + c.dim('-'.repeat(barLen - filled));

  return [
    header(s),
    '',
    `${off}${' '.repeat(8)}${c.yellow('~'.repeat(rem))}${spark}`,
    `${off}       _|_`,
    `${off}    .-"   "-.`,
    `${off}   /  ${col(face)}  \\`,
    `${off}   |         |`,
    `${off}    \\_______/`,
    '',
    `   ${c.bold(`${s.a} x ${s.b} =`)} ${c.cyan(s.input)}${c.dim('_')}`,
    `   ${s.msg || ''}`,
    `   [${bar}] ${col((s.left / 1000).toFixed(1) + 's')}`,
  ];
}

function boomFrame(s, step) {
  const lines = [header(s), ...Array(FRAME_H - 1).fill('')];
  const R = 1 + step * 0.7;
  const Rx = 3 + step * 3;
  for (let r = 1; r < FRAME_H; r++) {
    const dy = r - 6;
    if (Math.abs(dy) > R) continue;
    const hw = Math.round(Rx * Math.sqrt(Math.max(0, 1 - (dy / R) ** 2)));
    let row = '';
    for (let i = 0; i < hw * 2 + 1; i++) {
      const ch = pick(['*', '#', '@', '%', '!', 'x', '+']);
      row += Math.random() < 0.5 ? c.red(ch) : c.yellow(ch);
    }
    lines[r] = ' '.repeat(Math.max(0, 20 - hw)) + row;
  }
  if (step >= 3) lines[6] = ' '.repeat(14) + c.bold(c.red('K A B O U M !'));
  return lines;
}

// ---------- one question ----------
function askQuestion(state, a, b, limitMs) {
  return new Promise((resolve) => {
    let input = '';
    let msg = '';
    let shake = 0;
    let tick = 0;
    let wrong = 0;
    let done = false;
    const start = Date.now();

    const draw = () =>
      render(bombFrame({
        ...state, a, b, input, msg, shake, tick,
        limit: limitMs, left: Math.max(0, limitMs - (Date.now() - start)),
      }));

    const finish = (result) => {
      if (done) return;
      done = true;
      clearInterval(timer);
      process.stdin.removeListener('data', onData);
      resolve({ result, wrong, left: Math.max(0, limitMs - (Date.now() - start)), elapsed: Date.now() - start });
    };

    const onData = (chunk) => {
      const s = chunk.toString();
      if (s.startsWith('\x1b')) return; // arrow keys etc.
      for (const ch of s) {
        if (done) return;
        if (ch === '\u0003') quit();
        if (ch >= '0' && ch <= '9') {
          if (input.length < 4) input += ch;
        } else if (ch === '\x7f' || ch === '\b') {
          input = input.slice(0, -1);
        } else if (ch === '\r' || ch === '\n') {
          if (!input) continue;
          if (parseInt(input, 10) === a * b) {
            finish('correct');
            return;
          }
          wrong++;
          msg = c.red(pick(WRONG));
          input = '';
          shake = 5;
        }
      }
      draw();
    };

    const timer = setInterval(() => {
      tick++;
      if (shake > 0) shake--;
      if (Date.now() - start >= limitMs) finish('timeout');
      else draw();
    }, 100);

    process.stdin.on('data', onData);
    draw();
  });
}

// ---------- terminal housekeeping ----------
function restoreTerminal() {
  try { if (process.stdin.isTTY) process.stdin.setRawMode(false); } catch (_) { /* ignore */ }
  process.stdout.write(`${ESC}?25h`);
}
function quit() {
  restoreTerminal();
  console.log(c.dim('\n\n  Partie arrêtée. À bientôt !\n'));
  process.exit(0);
}
process.on('exit', restoreTerminal);
process.on('SIGINT', quit);

// ---------- game ----------
async function play(cfg) {
  const questions = buildQuestions(cfg);
  const limitMs = cfg.time * 1000;
  const state = { lives: cfg.lives, maxLives: cfg.lives, score: 0, streak: 0, q: 0, total: questions.length };
  const results = [];

  console.log(c.bold(`\n  ${cfg.name}, ${questions.length} bombes tic-taquent. Tu as ${cfg.time}s pour chacune.`));
  console.log(c.dim('  Tape la réponse et appuie sur Entrée. Une mauvaise réponse n\'arrête PAS la mèche !'));
  console.log(c.dim('  Appuie sur Entrée pour commencer...'));
  process.stdin.resume(); // rl.close() in setup() paused stdin; without this node exits here
  await new Promise((r) => process.stdin.once('data', (d) => (d.toString().includes('\u0003') ? quit() : r())));

  process.stdin.setRawMode(true);
  process.stdout.write(`${ESC}?25l`);
  console.log('');

  for (let i = 0; i < questions.length; i++) {
    const [a, b] = questions[i];
    state.q = i + 1;
    const r = await askQuestion(state, a, b, limitMs);

    if (r.result === 'correct') {
      const clean = r.wrong === 0;
      state.streak = clean ? state.streak + 1 : 0;
      const gained = Math.max(2, 10 - 2 * r.wrong) + Math.ceil(r.left / 1000) + (clean && state.streak % 3 === 0 ? 5 : 0);
      state.score += gained;
      results.push({ a, b, ok: true, clean, wrong: r.wrong });
      clearFrame();
      console.log(`  ${c.green('✔')} ${a} x ${b} = ${a * b}  ${c.dim(`(${(r.elapsed / 1000).toFixed(1)}s, +${gained})`)}  ${c.green(pick(GOOD))}`);
      await sleep(350);
    } else {
      for (let step = 0; step < 8; step++) {
        render(boomFrame(state, step));
        await sleep(110);
      }
      await sleep(250);
      state.lives--;
      state.streak = 0;
      results.push({ a, b, ok: false, clean: false, wrong: r.wrong });
      clearFrame();
      console.log(`  ${c.red('✘')} ${a} x ${b} = ${c.bold(a * b)}  ${c.red(pick(BOOMS))}  ${c.dim(`(vies restantes : ${state.lives})`)}`);
      await sleep(700);
      if (state.lives <= 0) break;
    }
  }

  restoreTerminal();
  summary(cfg, state, results, questions.length);
}

function summary(cfg, state, results, planned) {
  const clean = results.filter((r) => r.clean).length;
  const answered = results.length;
  const pct = answered ? Math.round((clean / answered) * 100) : 0;
  const survived = state.lives > 0;

  console.log('\n  ' + c.bold('=== RÉSULTATS ==='));
  console.log(`  Joueur :  ${cfg.name}`);
  console.log(`  Score :   ${c.bold(state.score)}`);
  console.log(`  Bombes :  ${answered}/${planned} affrontées, ${clean} désamorcées du premier coup (${pct}%)`);
  console.log(`  Vies :    ${survived ? c.red('♥'.repeat(state.lives)) : c.dim('aucune')}`);

  let title;
  if (!survived) title = "Les démineurs ont besoin d'entraînement... réessaie !";
  else if (pct === 100) title = 'EXPERT LÉGENDAIRE EN DÉSAMORÇAGE !';
  else if (pct >= 80) title = "Démineur d'élite. Nerfs d'acier !";
  else if (pct >= 50) title = 'Bonne recrue. Continue à t\'entraîner !';
  else title = 'Rescapé ! Les bombes faisaient peur, hein ?';
  console.log(`\n  ${c.bold(c.yellow(title))}`);

  const missed = results.filter((r) => !r.clean);
  if (missed.length) {
    console.log('\n  À réviser :');
    const seen = new Set();
    for (const r of missed) {
      const key = [Math.min(r.a, r.b), Math.max(r.a, r.b)].join('x');
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`    ${r.a} x ${r.b} = ${r.a * r.b}`);
    }
  }
  console.log(c.dim('\n  Rejouer avec : node bomb-tables.js\n'));
  process.exit(0);
}

// ---------- main ----------
(async () => {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0].replace(/^[/#!* \n]+/gm, (m) => m.replace(/[/!#]/g, '')));
    process.exit(0);
  }
  if (!process.stdin.isTTY) {
    console.error('Lance ce jeu dans un vrai terminal : node bomb-tables.js');
    process.exit(1);
  }
  const cfg = await setup(opts);
  await play(cfg);
})().catch((err) => {
  restoreTerminal();
  console.error(err);
  process.exit(1);
});
