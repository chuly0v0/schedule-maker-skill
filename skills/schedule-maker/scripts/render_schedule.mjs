#!/usr/bin/env node
// Node 22+; no npm dependencies. Chrome/Edge is used only with an isolated profile.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { normalizeSchedule, createEditUrl, verifyEditUrl } from './prepare_schedule.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const started = Date.now();
let stage = 'arguments';
let child, socket, profile;
const pending = new Map();
const args = process.argv.slice(2);
const options = {};
let input;
function rejectPending(error) {
  for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error); }
  pending.clear();
}
async function main() {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help') {
      console.log('Usage: node render_schedule.mjs INPUT.json --output OUTPUT.png [--browser PATH] [--scale 1|2] [--timeout-ms 45000]');
      return;
    }
    if (['--output', '--browser', '--scale', '--timeout-ms'].includes(args[i])) {
      const name = args[i].slice(2);
      if (!args[++i]) throw new Error(`Missing value for --${name}`);
      options[name] = args[i];
    } else if (!input && !args[i].startsWith('--')) input = args[i];
    else throw new Error(`Unknown argument: ${args[i]}`);
  }
  if (!input || !options.output) throw new Error('INPUT.json and --output OUTPUT.png are required');
  if (typeof WebSocket === 'undefined') throw new Error('Node 22+ is required');
  const scale = Number(options.scale || 1);
  const timeout = Number(options['timeout-ms'] || 45000);
  if (![1, 2].includes(scale) || !Number.isFinite(timeout) || timeout < 1000 || timeout > 120000) throw new Error('Invalid scale or timeout (1000–120000 ms)');
  const deadline = Date.now() + timeout;
  const remaining = () => {
    if (Date.now() >= deadline) throw new Error(`Timed out after ${timeout} ms`);
    return deadline - Date.now();
  };
  const output = path.resolve(options.output);
  if (path.extname(output).toLowerCase() !== '.png') throw new Error('--output must end in .png');
  const resultPath = output.replace(/\.png$/i, '.result.json');
  const markdownPath = output.replace(/\.png$/i, '.edit.md');
  stage = 'validate';
  const raw = JSON.parse((await fs.readFile(input, 'utf8')).replace(/^\uFEFF/, ''));
  const { schedule, cardCount } = normalizeSchedule(raw);
  const editUrl = createEditUrl(schedule);
  verifyEditUrl(editUrl, schedule);
  const editMarkdown = `[在线编辑日程](${editUrl})`;
  await fs.mkdir(path.dirname(output), { recursive: true });
  // Retain a usable, verified link even if browser rendering fails.
  await fs.writeFile(markdownPath, editMarkdown + '\n');

  stage = 'browser';
  const candidates = options.browser ? [options.browser] : [
    process.env.SCHEDULE_MAKER_BROWSER,
    ...[process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
      .filter(Boolean).flatMap(root => [path.join(root, 'Google/Chrome/Application/chrome.exe'), path.join(root, 'Microsoft/Edge/Application/msedge.exe')]),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].filter(Boolean);
  let browser;
  for (const candidate of candidates) { try { await fs.access(candidate); browser = candidate; break; } catch {} }
  if (!browser) throw new Error('Chrome/Edge not found; pass --browser PATH');
  profile = await fs.mkdtemp(path.join(os.tmpdir(), 'schedule-maker-'));
  child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let launchError;
  child.on('error', error => { launchError = error; });
  let port;
  while (!port) {
    remaining();
    if (launchError) throw launchError;
    if (child.exitCode !== null) throw new Error(`Browser exited: ${child.exitCode}`);
    try { port = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); } catch {}
    if (!port) await sleep(100);
  }
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(remaining()) }).then(r => r.json());
  const target = targets.find(t => t.type === 'page');
  if (!target) throw new Error('Browser has no page target');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Browser connection timed out')), remaining());
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Browser connection failed')); }, { once: true });
  });
  let id = 0;
  socket.addEventListener('close', () => rejectPending(new Error('Browser connection closed')));
  socket.addEventListener('message', event => {
    const msg = JSON.parse(event.data);
    const item = pending.get(msg.id);
    if (!item) return;
    clearTimeout(item.timer); pending.delete(msg.id);
    if (msg.error) item.reject(new Error(msg.error.message)); else item.resolve(msg.result);
  });
  function send(method, params = {}) {
    const duration = remaining();
    return new Promise((resolve, reject) => {
      const key = ++id;
      const timer = setTimeout(() => { pending.delete(key); reject(new Error(`${method} timed out`)); }, duration);
      pending.set(key, { resolve, reject, timer });
      socket.send(JSON.stringify({ id: key, method, params }));
    });
  }
  async function evaluate(expression) {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  }
  stage = 'load-page';
  const navigation = await send('Page.navigate', { url: editUrl });
  if (navigation.errorText) throw new Error(navigation.errorText);
  while (!(await evaluate('Boolean(window.ScheduleMaker?.getSvg && window.ScheduleMaker?.getSchedule)'))) { remaining(); await sleep(150); }
  stage = 'export';
  const dimensions = await evaluate(`(async () => {
    const api = window.ScheduleMaker;
    const expected = ${JSON.stringify(schedule)};
    const actual = await api.getSchedule();
    // Compare supported fields, independent of object-key order.
    const pick = s => ({title:s.title,dateRange:s.dateRange,description:s.description,rows:s.rows.map(r=>({date:r.date,title:r.title,label:r.label,content:r.content,highlight:r.highlight}))});
    if (JSON.stringify(pick(actual)) !== JSON.stringify(expected)) throw new Error('Imported schedule does not match the verified edit URL');
    const exported = await api.getSvg();
    if (!exported || typeof exported.svg !== 'string' || !Number.isFinite(exported.width) || !Number.isFinite(exported.height) || exported.width <= 0 || exported.height <= 0) throw new Error('Unexpected getSvg contract: expected {filename,width,height,svg}');
    document.head.innerHTML = '<style>html,body{margin:0;padding:0;background:white}svg{display:block}</style>';
    document.body.innerHTML = exported.svg;
    if (!document.querySelector('svg')) throw new Error('Export contains no SVG');
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {width:Math.ceil(exported.width),height:Math.ceil(exported.height)};
  })()`);
  await send('Emulation.setDeviceMetricsOverride', { ...dimensions, deviceScaleFactor: scale, mobile: false });
  const screenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: true, clip: { x: 0, y: 0, ...dimensions, scale: 1 } });
  const png = Buffer.from(screenshot.data, 'base64');
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Browser did not return PNG');
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  if (width !== dimensions.width * scale || height !== dimensions.height * scale) throw new Error('PNG dimensions do not match export');
  await fs.writeFile(output, png);
  await fs.writeFile(resultPath, JSON.stringify({ outputPath: output, width, height, rowCount: schedule.rows.length, cardCount, editUrl, editMarkdown }, null, 2) + '\n');
  console.log(JSON.stringify({ outputPath: output, width, height, rowCount: schedule.rows.length, cardCount, resultPath, editMarkdownPath: markdownPath, elapsedMs: Date.now() - started }));
}

try { await main(); }
catch (error) { console.error(`schedule-maker [${stage}]: ${error.message}`); process.exitCode = 1; }
finally {
  // Only close the browser launched here, never an existing user session.
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ id: 2147483647, method: 'Browser.close' }));
  socket?.close();
  rejectPending(new Error('Renderer shutting down'));
  if (child && child.exitCode === null) {
    for (let i = 0; i < 20 && child.exitCode === null; i++) await sleep(100);
    if (child.exitCode === null) child.kill();
  }
  if (profile && path.dirname(profile) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('schedule-maker-')) {
    try { await fs.rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
    catch { console.error(`Temporary profile could not be removed: ${profile}`); }
  }
}
