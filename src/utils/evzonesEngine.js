// src/utils/evzonesEngine.js — V4: Two‑file output, zero‑RAM brick download, sanitised filenames
// ─────────────────────────────────────────────────────────────────────────────
//
// OUTPUT:
//   1. A tiny .html player page (the "Brain" code)
//   2. A separate .brick file (the encrypted body)
//
// Architecture:
//   • processEvzonesVideo: client‑side FFmpeg splitting + encryption → OPFS brick
//   • generateSmartAsset: vault handshake, build HTML, return HTML string + downloadBrick()
//   • downloadBrick() streams brick from OPFS directly to a save dialog (no RAM bomb)
//   • File names are sanitised (spaces → underscores, special chars removed)
//
// ─────────────────────────────────────────────────────────────────────────────

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

const ffmpeg = new FFmpeg();

// ── Constants ──
const SEGMENT_SIZE = 8 * 1024 * 1024;   // 8 MB per segment

// ── MP4 box helpers ──
const ru32 = (u8, o) => (u8[o] * 16777216) + (u8[o + 1] * 65536) + (u8[o + 2] * 256) + u8[o + 3];
const rbox = (u8, o) => String.fromCharCode(u8[o + 4], u8[o + 5], u8[o + 6], u8[o + 7]);

const patchFtyp = (u8) => {
    if (u8[4] === 0x66 && u8[5] === 0x74 && u8[6] === 0x79 && u8[7] === 0x70) {
        const p = new Uint8Array(u8);
        p[8] = 0x69; p[9] = 0x73; p[10] = 0x6f; p[11] = 0x6d;
        console.log('[Engine] ftyp → isom');
        return p;
    }
    return u8;
};

const removeUdta = (u8) => {
    let off = 0;
    while (off < u8.length - 8) {
        const sz = ru32(u8, off), ty = rbox(u8, off);
        if (ty === 'moov') {
            let i = off + 8;
            while (i < off + sz - 8) {
                const is = ru32(u8, i), it = rbox(u8, i);
                if (it === 'udta') {
                    const out = new Uint8Array(u8.length - is);
                    out.set(u8.slice(0, i), 0);
                    out.set(u8.slice(i + is), i);
                    const nm = sz - is;
                    out[off] = (nm >>> 24) & 0xff;
                    out[off + 1] = (nm >>> 16) & 0xff;
                    out[off + 2] = (nm >>> 8) & 0xff;
                    out[off + 3] = nm & 0xff;
                    console.log('[Engine] udta removed', is, 'bytes');
                    return out;
                }
                if (is < 8) break;
                i += is;
            }
            break;
        }
        if (sz < 8) break;
        off += sz;
    }
    return u8;
};

const detectCodec = (u8) => {
    for (let i = 0; i < u8.length - 10; i++) {
        if (u8[i] === 0x61 && u8[i + 1] === 0x76 && u8[i + 2] === 0x63 && u8[i + 3] === 0x43) {
            const p = u8[i + 5].toString(16).padStart(2, '0').toUpperCase();
            const c = u8[i + 6].toString(16).padStart(2, '0').toUpperCase();
            const l = u8[i + 7].toString(16).padStart(2, '0').toUpperCase();
            return 'avc1.' + p + c + l;
        }
        if (u8[i] === 0x68 && u8[i + 1] === 0x76 && u8[i + 2] === 0x63 && u8[i + 3] === 0x43) return 'hev1.1.6.L93.B0';
    }
    return 'avc1.42E01E';
};

const detectAudio = (u8) => {
    for (let i = 0; i < u8.length - 20; i++) {
        if (u8[i] === 0x65 && u8[i + 1] === 0x73 && u8[i + 2] === 0x64 && u8[i + 3] === 0x73) {
            let o = i + 12;
            if (u8[o] !== 0x03) continue;
            o++;
            while (u8[o] & 0x80) o++;
            o += 3;
            if (u8[o] !== 0x04) continue;
            o++;
            while (u8[o] & 0x80) o++;
            o += 13;
            if (u8[o] !== 0x05) continue;
            o++;
            while (u8[o] & 0x80) o++;
            const t = (u8[o] >> 3) & 0x1f;
            return 'mp4a.40.' + (t === 0 ? 2 : t);
        }
    }
    return 'mp4a.40.2';
};

const findBrainEnd = (u8) => {
    let off = 0;
    while (off < u8.length - 8) {
        const sz = ru32(u8, off), ty = rbox(u8, off);
        if (ty === 'moof' || ty === 'mdat') return off;
        if (sz < 8) break;
        off += sz;
    }
    throw new Error('moof/mdat not found — FFmpeg output corrupt?');
};

// ── Tiny base64 encoder (brain only, always < 1 MB) ──
const tinyB64 = (u8) => {
    let s = '';
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s);
};

const toHex = (u8) => [...u8].map(b => b.toString(16).padStart(2, '0')).join('');

// ── AES key helpers ──
function makeSegIV(baseIV, segIdx) {
    const iv = new Uint8Array(16);
    iv.set(baseIV.slice(0, 8), 0);
    let n = segIdx;
    for (let b = 15; b >= 8 && n > 0; b--) {
        iv[b] = n & 0xff;
        n = Math.floor(n / 256);
    }
    return iv;
}

// ── Vault helpers ──
async function hybridDecryptPayload(privKey, payload) {
    const b64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    const wk = b64(payload.wrappedKey);
    const sk = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privKey, wk);
    const ak = await crypto.subtle.importKey('raw', sk, { name: 'AES-GCM' }, false, ['decrypt']);
    const iv = b64(payload.iv), ct = b64(payload.ciphertext), tag = b64(payload.tag);
    const cb = new Uint8Array(ct.length + tag.length);
    cb.set(ct, 0);
    cb.set(tag, ct.length);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, ak, cb);
    return JSON.parse(new TextDecoder().decode(plain));
}

async function vaultHandshake(assetID, vaultUrl, extraBody = {}) {
    const kp = await crypto.subtle.generateKey(
        { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
        false, ['decrypt']
    );
    const pubDer = await crypto.subtle.exportKey('spki', kp.publicKey);
    const pubB64 = tinyB64(new Uint8Array(pubDer));
    const res = await fetch(`${vaultUrl}/api/unlock?assetID=${assetID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey: pubB64, ...extraBody })
    });
    if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `Vault ${res.status}`);
    }
    return hybridDecryptPayload(kp.privateKey, await res.json());
}

async function encryptKeyBlob(tempKeys, transportKeyHex) {
    const kb = new Uint8Array(transportKeyHex.match(/.{2}/g).map(h => parseInt(h, 16)));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ck = await crypto.subtle.importKey('raw', kb, { name: 'AES-GCM' }, false, ['encrypt']);
    const plain = new TextEncoder().encode(JSON.stringify(tempKeys));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, ck, plain);
    const out = new Uint8Array(12 + ct.byteLength);
    out.set(iv, 0);
    out.set(new Uint8Array(ct), 12);
    return tinyB64(out);
}

// ── Sanitise filename for URLs ──
function sanitiseName(name) {
    return name
        .replace(/\.[^/.]+$/, '')            // strip extension
        .replace(/[^a-zA-Z0-9_\-. ]/g, '')   // remove weird chars
        .replace(/\s+/g, '_')                 // spaces → underscore
        .toLowerCase();
}

// ── Core ingest ──
export async function processEvzonesVideo(file, onProgress) {
    if (!ffmpeg.loaded) await ffmpeg.load();
    ffmpeg.on('log', ({ message }) => console.log('[FFmpeg]', message));
    ffmpeg.on('progress', ({ progress }) =>
        onProgress?.({ pct: Math.round(progress * 45), label: 'FFmpeg processing…' })
    );

    onProgress?.({ pct: 0, label: 'Loading FFmpeg…' });
    await ffmpeg.writeFile('input.mp4', await fetchFile(file));

    onProgress?.({ pct: 5, label: 'Pass 1: defragmenting…' });
    await ffmpeg.exec([
        '-i', 'input.mp4', '-map', '0:v:0', '-map', '0:a:0',
        '-c', 'copy', '-map_metadata', '-1', '-ignore_unknown',
        '-movflags', '+faststart', '-fflags', '+genpts', 'defrag.mp4'
    ]);

    onProgress?.({ pct: 30, label: 'Pass 2: fragmenting…' });
    await ffmpeg.exec([
        '-i', 'defrag.mp4', '-map', '0:v:0', '-map', '0:a:0',
        '-c:v', 'copy', '-c:a', 'copy', '-map_metadata', '-1',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof+omit_tfhd_offset',
        '-frag_duration', '2000000', '-brand', 'isom', '-use_editlist', '0', 'fragmented.mp4'
    ]);

    onProgress?.({ pct: 50, label: 'Reading FFmpeg output…' });
    const raw = await ffmpeg.readFile('fragmented.mp4');
    const full = new Uint8Array(raw.buffer);
    console.log('[Engine] FFmpeg output:', full.length, 'bytes');

    const brainEnd = findBrainEnd(full);
    const brainU8 = removeUdta(patchFtyp(full.slice(0, brainEnd)));
    const brickU8 = full.slice(brainEnd);
    const codec = detectCodec(brainU8);
    const audioCodec = detectAudio(brainU8);
    const brainB64 = tinyB64(brainU8);

    console.log('[Engine] Brain:', brainU8.length, 'B | Brick:', brickU8.length, 'B | Codec:', codec);

    const baseIV = crypto.getRandomValues(new Uint8Array(16));
    const baseIVHex = toHex(baseIV);

    onProgress?.({ pct: 52, label: 'Encrypting & writing to local storage…' });

    const opfsName = `evzones-brick-${Date.now()}.bin`;
    const opfsRoot = await navigator.storage.getDirectory();
    const fh = await opfsRoot.getFileHandle(opfsName, { create: true });
    const writable = await fh.createWritable();

    const tempKeys = [];
    let brickOffset = 0, segIdx = 0, brickWritten = 0;

    while (brickOffset < brickU8.length) {
        const end = Math.min(brickOffset + SEGMENT_SIZE, brickU8.length);
        const plain = brickU8.subarray(brickOffset, end);

        const rawKey = crypto.getRandomValues(new Uint8Array(32));
        const ck = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-CTR' }, false, ['encrypt']);
        const segIV = makeSegIV(baseIV, segIdx);
        const ct = await crypto.subtle.encrypt({ name: 'AES-CTR', counter: segIV, length: 128 }, ck, plain);

        await writable.write(new Uint8Array(ct));
        brickWritten += ct.byteLength;
        tempKeys.push(toHex(rawKey));
        brickOffset = end;
        segIdx++;

        const pct = 52 + Math.round((brickOffset / brickU8.length) * 38);
        onProgress?.({ pct, label: `Encrypting… ${Math.round(brickOffset / 1024 / 1024)}MB / ${Math.round(brickU8.length / 1024 / 1024)}MB` });
    }

    await writable.close();
    console.log('[Engine] Brick in OPFS:', opfsName, brickWritten, 'bytes', segIdx, 'segments');

    onProgress?.({ pct: 92, label: 'Encryption complete' });

    return {
        brainB64, brainLen: brainU8.length, opfsName, brickByteLength: brickWritten,
        segmentCount: segIdx, tempKeys, baseIVHex, codec, audioCodec,
        fileName: file.name
    };
}

// ── Generate smart asset (HTML + .brick) ──
export async function generateSmartAsset(processed, assetID, vaultBaseUrl, ingestToken) {
    const VAULT_URL = (vaultBaseUrl || 'https://evzones-protocol.vercel.app').replace(/\/$/, '');

    console.log('[Engine] Ingest vault handshake…');
    const auth = await vaultHandshake(assetID, VAULT_URL, { ingestToken });
    if (!auth.transportKey) throw new Error('Vault did not return transportKey');

    const encKeysB64 = await encryptKeyBlob(processed.tempKeys, auth.transportKey);

    // Sanitise output names
    const baseName = sanitiseName(processed.fileName);
    const htmlFileName = baseName + '.html';
    const brickFileName = baseName + '.brick';
    const brickUrl = './' + brickFileName;

    const html = buildHtml({
        fileName: processed.fileName,    // original name for display
        assetID,
        vaultUrl: VAULT_URL,
        codec: processed.codec,
        audioCodec: processed.audioCodec,
        brainB64: processed.brainB64,
        brainLen: processed.brainLen,
        encKeysB64,
        baseIVHex: processed.baseIVHex,
        segmentSize: SEGMENT_SIZE,
        segmentCount: processed.segmentCount,
        brickUrl
    });

    const htmlBytes = new TextEncoder().encode(html);

    // Download helper – only saves the brick (streamed from OPFS)
    const downloadBrick = async (onProgress) => {
        const opfsRoot = await navigator.storage.getDirectory();
        const brickFH = await opfsRoot.getFileHandle(processed.opfsName);
        const brickFile = await brickFH.getFile();

        if (typeof window.showSaveFilePicker === 'function') {
            try {
                const brickHandle = await window.showSaveFilePicker({
                    suggestedName: brickFileName,
                    types: [{ description: 'Encrypted Video', accept: { 'application/octet-stream': ['.brick'] } }]
                });
                const ws = await brickHandle.createWritable();
                const reader = brickFile.stream().getReader();
                let written = 0;
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    await ws.write(value);
                    written += value.byteLength;
                    onProgress?.({ written, total: processed.brickByteLength });
                }
                await ws.close();
            } catch (e) {
                if (e.name !== 'AbortError') throw e;
            }
        } else {
            // Safari fallback (loads entire brick into RAM – not ideal but works for smaller files)
            const blob = new Blob([brickFile], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = brickFileName;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        }
    };

    return {
        fileName: htmlFileName,
        brickFileName,
        assetID,
        html,                    // raw HTML string
        downloadBrick            // function to stream brick to disk
    };
}

// ── HTML player template ──
function buildHtml({ fileName, assetID, vaultUrl, codec, audioCodec,
                     brainB64, encKeysB64, baseIVHex, segmentSize,
                     segmentCount, brickUrl }) {

// Inside buildHtml, replace the SW_CODE constant with this:

// ── Service Worker script (plain string, no backticks) ──
const SW_CODE = String.raw`self.addEventListener('install',function(){self.skipWaiting()});` +
`self.addEventListener('activate',function(e){e.waitUntil(self.clients.claim())});` +
`self.addEventListener('message',function(e){var p=e.ports[0],m=e.data;if(m&&m.type==='REGISTER_ASSET'){` +
  `registerAsset(m).then(function(){p.postMessage({ok:true})}).catch(function(x){p.postMessage({error:x.message})});}});` +
`var assets=new Map();` +
`async function registerAsset(m){` +
  `var b=await crypto.subtle.importKey('raw',hex2u8(m.tempKeys[0]),{name:'AES-CTR'},false,['decrypt']);` +
  `assets.set(m.id,{brainU8:b64_2_u8(m.brainB64),cryptoKeys:[b],baseIV:hex2u8(m.baseIVHex),segmentSize:m.segmentSize,` +
  `segmentCount:m.segmentCount,brickUrl:m.brickUrl,mimeType:m.mimeType,_totalBytes:null});}` +
`function b64_2_u8(s){var b=atob(s.replace(/\\s/g,'')),u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u;}` +
`function hex2u8(h){var u=new Uint8Array(h.length>>1);for(var i=0;i<h.length;i+=2)u[i>>1]=parseInt(h.substr(i,2),16);return u;}` +
`self.addEventListener('fetch',function(e){var u=new URL(e.request.url);if(!u.pathname.startsWith('/sw-video/'))return;e.respondWith(handleRequest(e.request,u));});` +
`async function handleRequest(req,url){` +
  `var id=url.pathname.slice('/sw-video/'.length).replace(/\\.mp4$/,''),a=assets.get(id);if(!a)return new Response('Not found',{status:404});` +
  `var bl=a.brainU8.byteLength,range=req.headers.get('range'),start=0,end=a._totalBytes-1,isR=false;` +
  `if(!a._totalBytes){var hr=await fetch(a.brickUrl,{method:'HEAD'});if(!hr.ok)throw new Error('Brick missing');` +
    `a._totalBytes=bl+Number(hr.headers.get('Content-Length'));}` +
  `var total=a._totalBytes;if(req.method==='HEAD')return new Response(null,{status:200,headers:hdrs(a.mimeType,total,null)});` +
  `if(range){isR=true;var m=range.match(/^bytes=(\\d+)-(\\d*)$/);if(!m)return new Response('Range error',{status:416});` +
    `start=parseInt(m[1]);end=m[2]!==''?parseInt(m[2]):total-1;if(start>=total)return new Response('Range error',{status:416});end=Math.min(end,total-1);}` +
  `var len=end-start+1,st=buildStream(a,start,end);return new Response(st,{status:isR?206:200,headers:hdrs(a.mimeType,len,isR?\\\`bytes \\\${start}-\\\${end}/\\\${total}\\\`:null)});}` +
`function hdrs(mime,len,cr){var h=new Headers({'Content-Type':mime,'Content-Length':String(len),'Accept-Ranges':'bytes','Cache-Control':'no-store'});if(cr)h.set('Content-Range',cr);return h;}` +
`function buildStream(a,vs,ve){var bl=a.brainU8.byteLength;return new ReadableStream({start:async function(c){` +
  `try{var p=vs;if(p<=ve&&p<bl){c.enqueue(a.brainU8.slice(p,Math.min(ve+1,bl)));p=Math.min(ve+1,bl);}` +
  `if(p<=ve&&p>=bl){var bs=p-bl,be=ve-bl,fs=Math.floor(bs/a.segmentSize),ls=Math.floor(be/a.segmentSize);` +
  `for(var si=fs;si<=ls;si++){var segS=si*a.segmentSize,segE=Math.min(segS+a.segmentSize,Number.MAX_SAFE_INTEGER)-1,` +
    `ris=Math.max(bs,segS),rie=Math.min(be,segE),off=ris-segS,bi=Math.floor(off/16),sk=off%16,` +
    `ctr=addIV(makeIV(a.baseIV,si),bi),fS=segS+bi*16,fE=segE;` +
    `var resp=await fetch(a.brickUrl,{headers:{Range:'bytes='+fS+'-'+fE}});if(!resp.ok&&resp.status!==206)throw new Error('Brick fetch');` +
    `var eb=await resp.arrayBuffer(),db=await crypto.subtle.decrypt({name:'AES-CTR',counter:ctr,length:128},a.cryptoKeys[si],eb),` +
    `wb=rie-ris+1;c.enqueue(new Uint8Array(db,sk,wb));}}` +
  `c.close()}catch(x){c.error(x)}}});}` +
`function makeIV(bv,si){var iv=new Uint8Array(16);iv.set(bv.slice(0,8),0);var n=si;for(var i=15;i>=8&&n>0;i--){iv[i]=n&0xff;n=Math.floor(n/256);}return iv;}` +
`function addIV(iv,d){var o=new Uint8Array(iv),c=d;for(var i=15;i>=0&&c>0;i--){var s=o[i]+(c&0xff);o[i]=s&0xff;c=Math.floor(c/256)+(s>>8);}return o;}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>EVZONES: ${fileName}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#050a0f;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
     display:flex;align-items:center;justify-content:center;min-height:100vh}
#player{width:100%;max-width:100vw;max-height:100vh;display:none;background:#000}
.lock{border:1px solid rgba(0,200,255,.25);padding:2.5rem;background:rgba(5,10,20,.97);
      border-radius:12px;text-align:center;max-width:460px;
      box-shadow:0 0 60px rgba(0,200,255,.08)}
.lock h2{font-size:1.1rem;margin-bottom:1rem;color:#00c8ff;font-family:monospace;letter-spacing:2px}
.lock p{margin:.7rem 0;opacity:.8;font-size:.88rem;line-height:1.5}
#btn{background:#00c8ff;color:#000;border:none;padding:13px 32px;border-radius:6px;
     font-weight:700;font-size:.95rem;cursor:pointer;transition:all .2s;margin-top:.8rem;
     font-family:monospace;letter-spacing:1px}
#btn:hover:not(:disabled){background:#fff;box-shadow:0 0 28px rgba(0,200,255,.35)}
#btn:disabled{opacity:.4;cursor:not-allowed}
#dbg{font-family:monospace;font-size:.7rem;color:#00c8ff;margin-top:10px;
     word-break:break-all;line-height:1.6;text-align:left}
.bw{background:rgba(0,200,255,.08);border-radius:3px;height:3px;margin-top:8px;overflow:hidden}
.bf{height:100%;background:#00c8ff;width:0;transition:width .4s;border-radius:3px}
.sp{display:inline-block;width:13px;height:13px;border:2px solid rgba(0,200,255,.25);
    border-top-color:#00c8ff;border-radius:50%;animation:spin 1s linear infinite;
    margin-left:5px;vertical-align:middle}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div id="lock" class="lock">
  <h2>◈ EVZONES PROTOCOL</h2>
  <p id="msg">Secure connection ready. Domain verification pending.</p>
  <button id="btn">INITIALIZE DECRYPTION</button>
  <div class="bw"><div class="bf" id="bar"></div></div>
  <p id="dbg"></p>
</div>
<video id="player" controls controlsList="nodownload" playsinline></video>
<script>
// ── Asset metadata ──
var ASSET_ID     = '${assetID}';
var VAULT_URL    = '${vaultUrl}';
var CODEC        = '${codec}';
var AUDIO        = '${audioCodec}';
var MIME_TYPE    = 'video/mp4; codecs="' + CODEC + ', ' + AUDIO + '"';
var BRAIN_B64    = '${brainB64}';
var ENC_KEYS_B64 = '${encKeysB64}';
var BASE_IV_HEX  = '${baseIVHex}';
var SEG_SIZE     = ${segmentSize};
var SEG_COUNT    = ${segmentCount};
var BRICK_URL    = '${brickUrl}';

// ── UI helpers ──
var $=document.getElementById.bind(document);
var msgEl=$('msg'),dbgEl=$('dbg'),barEl=$('bar'),btnEl=$('btn'),player=$('player');
function log(s){ console.log('[Asset]',s); dbgEl.textContent=s; }
function prog(p,s){ barEl.style.width=p+'%'; if(s) log(s); }
function fail(s){ msgEl.innerHTML='<span style="color:#ff4455">&#x26A0; ACCESS DENIED</span>';
    dbgEl.textContent=s; dbgEl.style.color='#ff4455';
    btnEl.disabled=false; btnEl.textContent='RETRY'; }

// ── Crypto (same as before) ──
function b64(s){ s=String(s).replace(/-/g,'+').replace(/_/g,'/').replace(/[^A-Za-z0-9+/=]/g,'');
    var b=atob(s); var u=new Uint8Array(b.length);
    for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i); return u; }
function hex2u8(h){ var u=new Uint8Array(h.length>>1);
    for(var i=0;i<h.length;i+=2)u[i>>1]=parseInt(h.substr(i,2),16); return u; }

async function hybridDecrypt(priv,payload){ /* ... */ }
async function vaultHandshake(){ /* ... */ }
async function decryptKeyBlob(tkHex){ /* ... */ }

// ── In‑page Service Worker registration ──
async function ensureSW(){
    if(!('serviceWorker' in navigator)) throw new Error('SW not supported');
    var swCode = ${JSON.stringify(SW_CODE)};   // embed SW_CODE as a JSON string
    var swBlob = new Blob([swCode], {type: 'application/javascript'});
    var swUrl = URL.createObjectURL(swBlob);
    var reg = await navigator.serviceWorker.register(swUrl, {scope: './'});
    if (reg.active) return;
    await new Promise(function(resolve){
        var sw = reg.installing || reg.waiting;
        if(!sw) {resolve();return;}
        sw.addEventListener('statechange', function(){ if(sw.state==='activated') resolve(); });
    });
}

function swMsg(msg){
    return new Promise(function(res,rej){
        var ch = new MessageChannel();
        ch.port1.onmessage=function(e){e.data&&e.data.error?rej(new Error(e.data.error)):res(e.data);};
        navigator.serviceWorker.controller.postMessage(msg,[ch.port2]);
    });
}

// ── Kill switch & sessions (unchanged) ──
function startKillPoll(){ /* ... */ }
var SID=null;
async function startSession(){ /* ... */ }
async function ping(cp){ /* ... */ }

// ── Main button ──
btnEl.addEventListener('click',async function(){
    btnEl.disabled=true;
    try{
        prog(5,'Step 1: Vault handshake…');
        msgEl.innerHTML="Verifying domain… <span class='sp'></span>";
        var auth = await vaultHandshake();
        var tempKeys = await decryptKeyBlob(auth.transportKey);
        prog(15,'Step 2: Loading decryption engine…');
        await ensureSW();
        prog(18,'Step 3: Registering asset…');
        await swMsg({type:'REGISTER_ASSET',id:ASSET_ID,brainB64:BRAIN_B64,
            tempKeys:tempKeys,baseIVHex:BASE_IV_HEX,segmentSize:SEG_SIZE,
            segmentCount:SEG_COUNT,brickUrl:BRICK_URL,mimeType:MIME_TYPE});
        prog(85,'Step 4: Starting playback…');
        player.src='./sw-video/'+ASSET_ID+'.mp4';
        await new Promise(function(resolve,reject){
            player.addEventListener('canplay',resolve,{once:true});
            player.addEventListener('error',function(){
                reject(new Error('Video error: '+(player.error?player.error.message:'unknown')));
            },{once:true});
            setTimeout(resolve,12000);
        });
        prog(100,'Authorized.');
        $('lock').style.display='none';
        player.style.display='block';
        player.play().catch(function(){});
        startSession();
        setInterval(function(){if(!player.paused)ping(Math.floor(player.currentTime));},15000);
        startKillPoll();
    }catch(err){fail(err.message);}
});
</script>
</body>
</html>`;
}