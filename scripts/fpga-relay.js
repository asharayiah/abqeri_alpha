#!/usr/bin/env node
// scripts/fpga-relay.js — WS ⇄ Serial relay for Abqeri FPGA
// Usage:
//   npm i ws serialport
//   node scripts/fpga-relay.js --ws wss://<your-domain>/api/relay/daemon?device=rahma-fpga-01 --port COM5
//
// Device protocol (lines):
//   PING            → PONG <id>
//   CHALLENGE <n>   → PROOF <n>
//   RUN <json>      → device streams: TOKEN <text-chunk>
//
// This daemon only handles RUN bridging; PING/CHALLENGE are handled by the browser directly via Web Serial.

const { SerialPort } = require('serialport');
const { WebSocket } = require('ws');

function arg(name, def) {
  const i = process.argv.findIndex(a=>a===name || a.startsWith(name+'='));
  if (i<0) return def;
  const raw = process.argv[i];
  const eq = raw.indexOf('=');
  return eq>0 ? raw.slice(eq+1) : process.argv[i+1] || def;
}

const WS_URL = arg('--ws', '');
const PORT   = arg('--port', '');
const BAUD   = parseInt(arg('--baud', '115200'), 10);

if (!WS_URL || !PORT) {
  console.error('Usage: node fpga-relay.js --ws wss://host/api/relay/daemon?device=<id> --port <COM|/dev/ttyUSB0> [--baud 115200]');
  process.exit(1);
}

// Open serial
const port = new SerialPort({ path: PORT, baudRate: BAUD });
port.on('open', () => console.log('[serial] open', PORT));
port.on('error', (e) => console.error('[serial] error', e));

let ws;
function connectWS() {
  ws = new WebSocket(WS_URL);
  ws.on('open', () => console.log('[ws] connected'));
  ws.on('close', () => { console.log('[ws] closed; retrying in 3s'); setTimeout(connectWS, 3000); });
  ws.on('error', (e) => console.error('[ws] error', e));
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(String(data));
      if (msg.type === 'run') {
        const payload = JSON.stringify({ messages: msg.messages || [] });
        port.write('RUN ' + payload + '\n');
      }
    } catch (e) {}
  });
}
connectWS();

// Accumulate serial lines
let buf = '';
port.on('data', (chunk) => {
  buf += chunk.toString('utf8');
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    // Map device "TOKEN ..." → WS {type:"token"}
    if (line.startsWith('TOKEN ')) {
      const token = line.slice(6);
      ws && ws.readyState === 1 && ws.send(JSON.stringify({ type: 'token', token }));
    }
    // optional: handle device side errors
    if (line.startsWith('ERROR ')) {
      const msg = line.slice(6);
      ws && ws.readyState === 1 && ws.send(JSON.stringify({ type: 'error', message: msg }));
    }
  }
});
