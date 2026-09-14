// AURORA KART / U-Speak Racers — game server.
//
// One process does two jobs: it serves dist/ as a static site, and it runs the
// rooms that let friends race together. No dependencies: the WebSocket handshake
// and framing are implemented here against RFC 6455, which is short enough to own.
//
//   node server/server.mjs [--port 8080]
//
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {extname, join, normalize, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {networkInterfaces} from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', 'dist');
const dataDir = join(here, 'data');
const recordsFile = join(dataDir, 'records.json');
const argPort = process.argv.indexOf('--port');
const PORT = Number(process.env.PORT || (argPort > 0 ? process.argv[argPort + 1] : 0) || 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2', '.wasm': 'application/wasm',
};

// ---- records (the shared scoreboard across every room) -----------------------
let records = {players: {}, updated: 0};
let saveTimer = null;
async function loadRecords() {
  try { records = JSON.parse(await readFile(recordsFile, 'utf8')); }
  catch { records = {players: {}, updated: 0}; }
  if (!records.players) records.players = {};
}
function saveRecordsSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null; records.updated = Date.now();
    try { await mkdir(dataDir, {recursive: true}); await writeFile(recordsFile, JSON.stringify(records)); }
    catch (error) { console.error('records save failed:', error.message); }
  }, 1500);
}
function recordResult(name, {time, correct, asked, rank, track, laps}) {
  const key = String(name || 'PLAYER').slice(0, 12);
  const row = records.players[key] || (records.players[key] = {races: 0, wins: 0, correct: 0, asked: 0, best: {}});
  row.races++; if (rank === 1) row.wins++;
  row.correct += correct || 0; row.asked += asked || 0;
  const slot = `${track}-${laps}`;
  if (time > 0 && (!row.best[slot] || time < row.best[slot])) row.best[slot] = Math.round(time * 1000) / 1000;
  saveRecordsSoon();
  return row;
}

// ---- rooms -------------------------------------------------------------------
const rooms = new Map();
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_PLAYERS = 8;
const LOBBY_SECONDS = 60;

function newCode() {
  let code;
  do { code = Array.from({length: 4}, () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]).join(''); }
  while (rooms.has(code));
  return code;
}
function makeRoom(code) {
  const room = {
    code, players: new Map(), hostId: null, phase: 'lobby', seed: 1, startAt: 0,
    settings: {track: 0, laps: 3, grade: 5, quiz: true, mirror: false, difficulty: 1},
    opened: Date.now(), results: [], timer: null,
  };
  rooms.set(code, room);
  room.timer = setInterval(() => tickRoom(room), 1000);
  return room;
}
function closeRoom(room) {
  clearInterval(room.timer);
  rooms.delete(room.code);
}
function roomPlayers(room) {
  return [...room.players.values()].map(p => ({
    id: p.id, name: p.name, kart: p.kart, color: p.color, host: p.id === room.hostId,
    finished: p.finished, score: p.score, time: p.time,
  }));
}
function broadcast(room, message, exceptId = null) {
  const text = JSON.stringify(message);
  for (const p of room.players.values()) if (p.id !== exceptId) p.socket.sendText(text);
}
function sendPlayers(room) {
  broadcast(room, {t: 'players', players: roomPlayers(room), host: room.hostId, settings: room.settings,
    phase: room.phase, closesIn: Math.max(0, LOBBY_SECONDS - Math.floor((Date.now() - room.opened) / 1000))});
}
function tickRoom(room) {
  if (!room.players.size) { closeRoom(room); return; }
  if (room.phase === 'lobby') {
    const left = LOBBY_SECONDS - Math.floor((Date.now() - room.opened) / 1000);
    if (left <= 0) startRace(room);
    else if (left % 5 === 0 || left <= 5) broadcast(room, {t: 'tick', closesIn: left});
  } else if (room.phase === 'racing') {
    // Nobody waits forever for a player who wandered off.
    const racing = [...room.players.values()].filter(p => !p.finished);
    if (!racing.length || Date.now() - room.raceStarted > 8 * 60 * 1000) finishRace(room);
  }
}
function startRace(room) {
  if (room.phase !== 'lobby') return;
  room.phase = 'racing';
  room.seed = Math.floor(Math.random() * 1e9);
  room.startAt = Date.now() + 4200;   // long enough for the 3-2-1 lights
  room.raceStarted = Date.now();
  room.results = [];
  for (const p of room.players.values()) { p.finished = false; p.time = 0; p.score = 0; }
  broadcast(room, {t: 'start', seed: room.seed, startAt: room.startAt, settings: room.settings,
    players: roomPlayers(room), serverNow: Date.now()});
}
function finishRace(room) {
  if (room.phase !== 'racing') return;
  room.phase = 'lobby';
  room.opened = Date.now();
  const rows = [...room.results].sort((a, b) => (a.time || 1e9) - (b.time || 1e9));
  rows.forEach((row, i) => { row.rank = i + 1; row.career = recordResult(row.name, {...row, rank: i + 1, track: room.settings.track, laps: room.settings.laps}); });
  broadcast(room, {t: 'results', rows});
  sendPlayers(room);
}

let nextId = 1;
function handleMessage(socket, raw) {
  let message; try { message = JSON.parse(raw); } catch { return; }
  const player = socket.player;
  if (message.t === 'ping') { socket.sendJSON({t: 'pong', c: message.c, now: Date.now()}); return; }
  if (message.t === 'join') {
    if (player) leaveRoom(socket);
    const code = String(message.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    let room = code ? rooms.get(code) : null;
    if (code && !room) { socket.sendJSON({t: 'error', reason: 'その合言葉の部屋は見つかりませんでした'}); return; }
    if (!room) room = makeRoom(newCode());
    if (room.players.size >= MAX_PLAYERS) { socket.sendJSON({t: 'error', reason: '部屋がいっぱいです（最大8人）'}); return; }
    if (room.phase === 'racing') { socket.sendJSON({t: 'error', reason: 'このルームはレース中です。終わるまで待ってください'}); return; }
    // Two karts in the same colour are confusing in a lobby, so nudge to a free one.
    const taken = new Set([...room.players.values()].map(p => p.color));
    let color = Math.max(0, Math.min(5, message.color | 0));
    for (let i = 0; i < 6 && taken.has(color); i++) color = (color + 1) % 6;
    const entry = {
      id: nextId++, socket, name: String(message.name || 'PLAYER').slice(0, 10) || 'PLAYER',
      kart: Math.max(0, Math.min(3, message.kart | 0)), color,
      finished: false, score: 0, time: 0, last: Date.now(),
    };
    room.players.set(entry.id, entry);
    if (!room.hostId) room.hostId = entry.id;
    socket.player = entry; socket.room = room;
    socket.sendJSON({t: 'joined', id: entry.id, code: room.code, host: room.hostId === entry.id,
      settings: room.settings, players: roomPlayers(room), serverNow: Date.now(),
      closesIn: Math.max(0, LOBBY_SECONDS - Math.floor((Date.now() - room.opened) / 1000))});
    sendPlayers(room);
    return;
  }
  if (!player || !socket.room) return;
  const room = socket.room;
  player.last = Date.now();
  switch (message.t) {
    case 'settings':
      if (player.id !== room.hostId) return;
      Object.assign(room.settings, message.settings || {});
      sendPlayers(room);
      break;
    case 'start':
      if (player.id === room.hostId) startRace(room);
      break;
    case 'profile':
      if (message.name) player.name = String(message.name).slice(0, 10);
      if (message.kart !== undefined) player.kart = Math.max(0, Math.min(3, message.kart | 0));
      if (message.color !== undefined) {
        const used = new Set([...room.players.values()].filter(p => p !== player).map(p => p.color));
        let next = Math.max(0, Math.min(5, message.color | 0));
        for (let i = 0; i < 6 && used.has(next); i++) next = (next + 1) % 6;
        player.color = next;
      }
      sendPlayers(room);
      break;
    case 's':                       // position stream, relayed untouched
      message.id = player.id;
      broadcast(room, message, player.id);
      break;
    case 'ev':                      // item fired, hit taken, lap done…
      message.id = player.id;
      if (message.k === 'quiz') player.score = message.score | 0;
      broadcast(room, message, player.id);
      break;
    case 'fin':
      if (player.finished) return;
      player.finished = true; player.time = Number(message.time) || 0; player.score = message.correct | 0;
      room.results.push({id: player.id, name: player.name, time: player.time,
        correct: message.correct | 0, asked: message.asked | 0});
      broadcast(room, {t: 'finished', id: player.id, name: player.name, time: player.time, correct: player.score});
      if ([...room.players.values()].every(p => p.finished)) finishRace(room);
      break;
    case 'leave':
      leaveRoom(socket);
      break;
  }
}
function leaveRoom(socket) {
  const room = socket.room, player = socket.player;
  socket.room = null; socket.player = null;
  if (!room || !player) return;
  room.players.delete(player.id);
  if (!room.players.size) { closeRoom(room); return; }
  if (room.hostId === player.id) room.hostId = [...room.players.keys()][0];
  broadcast(room, {t: 'left', id: player.id, name: player.name});
  sendPlayers(room);
  if (room.phase === 'racing' && [...room.players.values()].every(p => p.finished)) finishRace(room);
}

// ---- WebSocket (RFC 6455, the parts a game needs) ----------------------------
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
function frame(payload) {
  const body = Buffer.from(payload, 'utf8'), length = body.length;
  let header;
  if (length < 126) { header = Buffer.alloc(2); header[1] = length; }
  else if (length < 65536) { header = Buffer.alloc(4); header[1] = 126; header.writeUInt16BE(length, 2); }
  else { header = Buffer.alloc(10); header[1] = 127; header.writeBigUInt64BE(BigInt(length), 2); }
  header[0] = 0x81;
  return Buffer.concat([header, body]);
}
function attachSocket(socket) {
  socket.setNoDelay(true);
  socket.sendText = text => { if (!socket.destroyed) socket.write(frame(text)); };
  socket.sendJSON = object => socket.sendText(JSON.stringify(object));
  let buffer = Buffer.alloc(0);
  socket.on('data', chunk => {
    buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk;
    for (;;) {
      if (buffer.length < 2) return;
      const first = buffer[0], second = buffer[1];
      const opcode = first & 0x0f, masked = (second & 0x80) !== 0;
      let length = second & 0x7f, offset = 2;
      if (length === 126) { if (buffer.length < 4) return; length = buffer.readUInt16BE(2); offset = 4; }
      else if (length === 127) { if (buffer.length < 10) return; length = Number(buffer.readBigUInt64BE(2)); offset = 10; }
      if (length > 1 << 20) { socket.destroy(); return; }          // no game message is a megabyte
      const maskStart = offset;
      if (masked) offset += 4;
      if (buffer.length < offset + length) return;
      const payload = Buffer.allocUnsafe(length);
      buffer.copy(payload, 0, offset, offset + length);
      if (masked) for (let i = 0; i < length; i++) payload[i] ^= buffer[maskStart + (i & 3)];
      buffer = buffer.subarray(offset + length);
      if (opcode === 0x8) { socket.end(); return; }                 // close
      else if (opcode === 0x9) socket.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload]));
      else if (opcode === 0x1) handleMessage(socket, payload.toString('utf8'));
    }
  });
  const bye = () => leaveRoom(socket);
  socket.on('close', bye); socket.on('error', bye); socket.on('end', bye);
}

// ---- static files ------------------------------------------------------------
async function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/health') {
    res.writeHead(200, {'content-type': 'application/json'});
    res.end(JSON.stringify({ok: true, rooms: rooms.size, players: [...rooms.values()].reduce((n, r) => n + r.players.size, 0)}));
    return;
  }
  if (url.pathname === '/records') {
    res.writeHead(200, {'content-type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify(records));
    return;
  }
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';
  const target = join(root, normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!target.startsWith(root) || !existsSync(target)) {
    res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'});
    res.end('404');
    return;
  }
  try {
    const body = await readFile(target);
    res.writeHead(200, {'content-type': MIME[extname(target)] || 'application/octet-stream', 'cache-control': 'no-cache'});
    res.end(body);
  } catch {
    res.writeHead(500); res.end('500');
  }
}

await loadRecords();
const server = createServer(serveStatic);
server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || req.headers.upgrade?.toLowerCase() !== 'websocket') { socket.destroy(); return; }
  const accept = createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
  attachSocket(socket);
});
server.listen(PORT, '0.0.0.0', () => {
  const addresses = Object.values(networkInterfaces()).flat()
    .filter(net => net && net.family === 'IPv4' && !net.internal).map(net => net.address);
  console.log(`AURORA KART server → http://localhost:${PORT}`);
  for (const address of addresses) console.log(`  同じWi-Fiの友だち → http://${address}:${PORT}`);
});
