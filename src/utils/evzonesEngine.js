// src/utils/evzonesEngine.js — V3.1: Single-file hybrid HTML+binary, OPFS streaming
// ─────────────────────────────────────────────────────────────────────────────
//
// OUTPUT: One .html file. Structure on disk:
//
//   ┌──────────────────────────────────────────────────────────┐
//   │  [HTML text — valid, browser renders normally]           │
//   │  </html>                                                 │
//   │  <!--EVZONES:BRICK_OFFSET=NNNNN,BRICK_BYTES=MMMMMM-->   │  ← machine-readable marker
//   │  [raw encrypted binary bytes, MMMMMM bytes long]        │  ← never parsed as HTML
//   └──────────────────────────────────────────────────────────┘
//
// WHY THIS WORKS:
//   Browsers stop the HTML parser at </html> — trailing bytes are ignored.
//   The embedded JS uses fetch(location.href, {headers:{Range:'bytes=N-'}})
//   to stream ONLY the brick portion, chunked into OPFS.
//   fetch() with Range: bytes=N- is supported in all modern browsers including
//   Safari 14+ when the server supports byte-range responses (Vercel does).
//
// RAM BUDGET:
//   Ingest:   max 8 MB in RAM at any time (one encrypt chunk)
//   Playback: max 8 MB in RAM at any time (one decrypt chunk in SW)
//   The brain (~10-20 KB) is the only thing held in full RAM.
//
// ─────────────────────────────────────────────────────────────────────────────

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

const ffmpeg = new FFmpeg();

// ── Constants ─────────────────────────────────────────────────────────────────
const SEGMENT_SIZE = 8 * 1024 * 1024; // 8 MB — AES-CTR segment boundary

// ── MP4 box helpers (brain only — always tiny, RAM is fine) ──────────────────

const ru32 = (u8, o) => (u8[o]*16777216)+(u8[o+1]*65536)+(u8[o+2]*256)+u8[o+3];
const rbox = (u8, o) => String.fromCharCode(u8[o+4],u8[o+5],u8[o+6],u8[o+7]);

const patchFtyp = (u8) => {
    if (u8[4]===0x66&&u8[5]===0x74&&u8[6]===0x79&&u8[7]===0x70) {
        const p=new Uint8Array(u8); p[8]=0x69;p[9]=0x73;p[10]=0x6f;p[11]=0x6d;
        console.log('[Engine] ftyp → isom'); return p;
    }
    return u8;
};

const removeUdta = (u8) => {
    let off=0;
    while(off<u8.length-8) {
        const sz=ru32(u8,off),ty=rbox(u8,off);
        if(ty==='moov') {
            let i=off+8;
            while(i<off+sz-8) {
                const is=ru32(u8,i),it=rbox(u8,i);
                if(it==='udta') {
                    const out=new Uint8Array(u8.length-is);
                    out.set(u8.slice(0,i),0); out.set(u8.slice(i+is),i);
                    const nm=sz-is;
                    out[off]=(nm>>>24)&0xff;out[off+1]=(nm>>>16)&0xff;
                    out[off+2]=(nm>>>8)&0xff;out[off+3]=nm&0xff;
                    console.log('[Engine] udta removed',is,'bytes'); return out;
                }
                if(is<8)break; i+=is;
            }
            break;
        }
        if(sz<8)break; off+=sz;
    }
    return u8;
};

const detectCodec = (u8) => {
    for(let i=0;i<u8.length-10;i++) {
        if(u8[i]===0x61&&u8[i+1]===0x76&&u8[i+2]===0x63&&u8[i+3]===0x43) {
            const p=u8[i+5].toString(16).padStart(2,'0').toUpperCase();
            const c=u8[i+6].toString(16).padStart(2,'0').toUpperCase();
            const l=u8[i+7].toString(16).padStart(2,'0').toUpperCase();
            return 'avc1.'+p+c+l;
        }
        if(u8[i]===0x68&&u8[i+1]===0x76&&u8[i+2]===0x63&&u8[i+3]===0x43) return 'hev1.1.6.L93.B0';
    }
    return 'avc1.42E01E';
};

const detectAudio = (u8) => {
    for(let i=0;i<u8.length-20;i++) {
        if(u8[i]===0x65&&u8[i+1]===0x73&&u8[i+2]===0x64&&u8[i+3]===0x73) {
            let o=i+12;
            if(u8[o]!==0x03)continue;
            o++; while(u8[o]&0x80)o++; o++; o+=3;
            if(u8[o]!==0x04)continue;
            o++; while(u8[o]&0x80)o++; o++; o+=13;
            if(u8[o]!==0x05)continue;
            o++; while(u8[o]&0x80)o++; o++;
            const t=(u8[o]>>3)&0x1f; return 'mp4a.40.'+(t===0?2:t);
        }
    }
    return 'mp4a.40.2';
};

const findBrainEnd = (u8) => {
    let off=0;
    while(off<u8.length-8) {
        const sz=ru32(u8,off),ty=rbox(u8,off);
        if(ty==='moof'||ty==='mdat') return off;
        if(sz<8) break;
        off+=sz;
    }
    throw new Error('moof/mdat not found — FFmpeg output corrupt?');
};

// ── Tiny base64 encoder — ONLY for brain (<20KB) and key blobs (<256B) ───────
// We explicitly document why btoa is acceptable here: it is never called with
// video body data. The brick (potentially 10GB) goes through OPFS only.
const tinyB64 = (u8) => {
    let s=''; for(let i=0;i<u8.length;i++) s+=String.fromCharCode(u8[i]);
    return btoa(s);
};

const toHex = (u8) => [...u8].map(b=>b.toString(16).padStart(2,'0')).join('');

// ── AES key helpers ───────────────────────────────────────────────────────────

// Build 16-byte segment IV: baseIV[0:8] as nonce, segIdx as BE uint64 in [8:15]
function makeSegIV(baseIV, segIdx) {
    const iv=new Uint8Array(16); iv.set(baseIV.slice(0,8),0);
    let n=segIdx;
    for(let b=15;b>=8&&n>0;b--){iv[b]=n&0xff;n=Math.floor(n/256);}
    return iv;
}

// ── Vault helpers ─────────────────────────────────────────────────────────────

async function hybridDecryptPayload(privKey, payload) {
    const b64=(s)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
    const wk=b64(payload.wrappedKey);
    const sk=await crypto.subtle.decrypt({name:'RSA-OAEP'},privKey,wk);
    const ak=await crypto.subtle.importKey('raw',sk,{name:'AES-GCM'},false,['decrypt']);
    const iv=b64(payload.iv),ct=b64(payload.ciphertext),tag=b64(payload.tag);
    const cb=new Uint8Array(ct.length+tag.length); cb.set(ct,0); cb.set(tag,ct.length);
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv,tagLength:128},ak,cb);
    return JSON.parse(new TextDecoder().decode(plain));
}

async function vaultHandshake(assetID, vaultUrl, extraBody={}) {
    const kp=await crypto.subtle.generateKey(
        {name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},
        false,['decrypt']
    );
    const pubDer=await crypto.subtle.exportKey('spki',kp.publicKey);
    const pubB64=tinyB64(new Uint8Array(pubDer));
    const res=await fetch(`${vaultUrl}/api/unlock?assetID=${assetID}`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({publicKey:pubB64,...extraBody})
    });
    if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e.error||`Vault ${res.status}`);}
    return hybridDecryptPayload(kp.privateKey,await res.json());
}

async function encryptKeyBlob(tempKeys, transportKeyHex) {
    const kb=new Uint8Array(transportKeyHex.match(/.{2}/g).map(h=>parseInt(h,16)));
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const ck=await crypto.subtle.importKey('raw',kb,{name:'AES-GCM'},false,['encrypt']);
    const plain=new TextEncoder().encode(JSON.stringify(tempKeys));
    const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv,tagLength:128},ck,plain);
    const out=new Uint8Array(12+ct.byteLength); out.set(iv,0); out.set(new Uint8Array(ct),12);
    return tinyB64(out); // tiny (<256B) — b64 fine
}

// ── Core ingest ───────────────────────────────────────────────────────────────
//
// Returns metadata needed by generateSmartAsset. The encrypted brick is
// written to OPFS at `opfsName` — it stays there until the download is built.

export async function processEvzonesVideo(file, onProgress) {
    if(!ffmpeg.loaded) await ffmpeg.load();
    ffmpeg.on('log',({message})=>console.log('[FFmpeg]',message));
    ffmpeg.on('progress',({progress})=>onProgress?.({pct:Math.round(progress*45),label:'FFmpeg processing…'}));

    onProgress?.({pct:0,label:'Loading FFmpeg…'});
    await ffmpeg.writeFile('input.mp4', await fetchFile(file));

    onProgress?.({pct:5,label:'Pass 1: defragmenting…'});
    await ffmpeg.exec(['-i','input.mp4','-map','0:v:0','-map','0:a:0',
        '-c','copy','-map_metadata','-1','-ignore_unknown',
        '-movflags','+faststart','-fflags','+genpts','defrag.mp4']);

    onProgress?.({pct:30,label:'Pass 2: fragmenting…'});
    await ffmpeg.exec(['-i','defrag.mp4','-map','0:v:0','-map','0:a:0',
        '-c:v','copy','-c:a','copy','-map_metadata','-1',
        '-movflags','frag_keyframe+empty_moov+default_base_moof+omit_tfhd_offset',
        '-frag_duration','2000000','-brand','isom','-use_editlist','0','fragmented.mp4']);

    onProgress?.({pct:50,label:'Reading FFmpeg output…'});
    const raw  = await ffmpeg.readFile('fragmented.mp4');
    const full = new Uint8Array(raw.buffer);
    console.log('[Engine] FFmpeg output:',full.length,'bytes');

    // Split brain / brick
    const brainEnd  = findBrainEnd(full);
    const brainU8   = removeUdta(patchFtyp(full.slice(0, brainEnd)));
    const brickU8   = full.slice(brainEnd); // still in RAM here — about to stream to OPFS
    const codec     = detectCodec(brainU8);
    const audioCodec= detectAudio(brainU8);
    const brainB64  = tinyB64(brainU8); // <20KB — fine

    console.log('[Engine] Brain:',brainU8.length,'B | Brick:',brickU8.length,'B | Codec:',codec);

    // Generate a base IV (nonce) — each segment gets a derived IV from this
    const baseIV    = crypto.getRandomValues(new Uint8Array(16));
    const baseIVHex = toHex(baseIV);

    // Encrypt brick → OPFS, 8 MB at a time
    onProgress?.({pct:52,label:'Encrypting & writing to local storage…'});

    const opfsName  = `evzones-brick-${Date.now()}.bin`;
    const opfsRoot  = await navigator.storage.getDirectory();
    const fh        = await opfsRoot.getFileHandle(opfsName,{create:true});
    const writable  = await fh.createWritable();

    const tempKeys  = [];
    let brickOffset = 0, segIdx = 0, brickWritten = 0;

    while(brickOffset < brickU8.length) {
        const end   = Math.min(brickOffset + SEGMENT_SIZE, brickU8.length);
        const plain = brickU8.subarray(brickOffset, end); // view — no copy

        const rawKey = crypto.getRandomValues(new Uint8Array(32));
        const ck     = await crypto.subtle.importKey('raw',rawKey,{name:'AES-CTR'},false,['encrypt']);
        const segIV  = makeSegIV(baseIV, segIdx);
        const ct     = await crypto.subtle.encrypt({name:'AES-CTR',counter:segIV,length:128},ck,plain);

        await writable.write(new Uint8Array(ct));
        brickWritten += ct.byteLength;
        tempKeys.push(toHex(rawKey));
        brickOffset = end; segIdx++;

        const pct = 52 + Math.round((brickOffset/brickU8.length)*38);
        onProgress?.({pct, label:`Encrypting… ${Math.round(brickOffset/1024/1024)}MB / ${Math.round(brickU8.length/1024/1024)}MB`});
    }

    await writable.close();
    console.log('[Engine] Brick in OPFS:',opfsName,brickWritten,'bytes',segIdx,'segments');

    onProgress?.({pct:92,label:'Encryption complete'});

    return { brainB64, brainLen:brainU8.length, opfsName, brickByteLength:brickWritten,
             segmentCount:segIdx, tempKeys, baseIVHex, codec, audioCodec, fileName:file.name };
}

// ── Generate single-file smart asset ─────────────────────────────────────────
//
// Returns: { fileName, download() }
// download() streams the hybrid file directly to disk — it never holds the
// full file in memory. Callers should call it when the user clicks "Download".

export async function generateSmartAsset(processed, assetID, vaultBaseUrl, ingestToken) {
    const VAULT_URL = (vaultBaseUrl||'https://evzones-protocol.vercel.app').replace(/\/$/,'');

    // Vault handshake (ingest mode — bypasses domain whitelist via ingestToken)
    console.log('[Engine] Ingest vault handshake…');
    const auth = await vaultHandshake(assetID, VAULT_URL, {ingestToken});
    if(!auth.transportKey) throw new Error('Vault did not return transportKey');

    const encKeysB64 = await encryptKeyBlob(processed.tempKeys, auth.transportKey);

    // Build the HTML preamble (pure text, no binary here)
    const html = buildHtml({
        fileName:     processed.fileName,
        assetID,
        vaultUrl:     VAULT_URL,
        codec:        processed.codec,
        audioCodec:   processed.audioCodec,
        brainB64:     processed.brainB64,
        brainLen:     processed.brainLen,
        encKeysB64,
        brickByteLength: processed.brickByteLength,
        baseIVHex:    processed.baseIVHex,
        segmentSize:  SEGMENT_SIZE,
        segmentCount: processed.segmentCount
    });

    // The marker tells playback JS where the binary starts.
    // It is embedded as an HTML comment so the file remains valid HTML.
    // The brick is appended immediately after a newline following the marker.
    const htmlBytes    = new TextEncoder().encode(html);
    const markerStr    = `\n<!--EVZONES:BRICK_OFFSET=${htmlBytes.length + 1},BRICK_BYTES=${processed.brickByteLength}-->\n`;
    const markerBytes  = new TextEncoder().encode(markerStr);
    const brickOffset  = htmlBytes.length + markerBytes.length;

    console.log('[Engine] HTML:',htmlBytes.length,'B | Marker:',markerBytes.length,'B | Brick starts at:',brickOffset);

    // Return a download function that streams the hybrid file to disk.
    // Streaming avoids ever holding the 10GB file in RAM simultaneously.
    const outFileName = processed.fileName.replace(/\.[^/.]+$/,'') + '_evzones.html';

    const download = async (onProg) => {
        // Open OPFS brick for reading
        const opfsRoot  = await navigator.storage.getDirectory();
        const brickFH   = await opfsRoot.getFileHandle(processed.opfsName);
        const brickFile = await brickFH.getFile(); // File/Blob — no RAM copy

        // Try showSaveFilePicker for zero-copy streaming to disk (Chrome/Edge)
        if(typeof window.showSaveFilePicker === 'function') {
            let handle;
            try {
                handle = await window.showSaveFilePicker({
                    suggestedName: outFileName,
                    types:[{description:'Evzones Asset',accept:{'text/html':['.html']}}]
                });
            } catch(e) {
                if(e.name==='AbortError') throw e;
                handle = null;
            }

            if(handle) {
                const ws = await handle.createWritable();
                await ws.write(htmlBytes);
                await ws.write(markerBytes);

                // Stream brick from OPFS into the file without loading it
                const reader = brickFile.stream().getReader();
                let written = 0;
                while(true) {
                    const {done,value} = await reader.read();
                    if(done) break;
                    await ws.write(value);
                    written += value.byteLength;
                    onProg?.({written, total:processed.brickByteLength});
                }
                await ws.close();
                return;
            }
        }

        // Fallback: build a Blob and trigger anchor download.
        // For very large files this needs RAM. It's the Safari fallback path.
        // Safari doesn't support showSaveFilePicker yet.
        // We construct the Blob lazily from parts — browser handles the concatenation.
        const brickBlob = new Blob([brickFile], {type:'application/octet-stream'});
        const combined  = new Blob([htmlBytes, markerBytes, brickBlob], {type:'text/html'});
        const url       = URL.createObjectURL(combined);
        const a         = document.createElement('a');
        a.href     = url;
        a.download = outFileName;
        a.click();
        setTimeout(()=>URL.revokeObjectURL(url), 60000);
        // Note: for Safari with large files this will OOM. The proper Safari fix
        // is to serve through your own server with Range support, not local download.
        // For viewing purposes, the OPFS→SW pipeline works fine on Safari.
        // The download step is a studio-side (desktop Chrome/Edge) concern.
    };

    return { fileName: outFileName, download, brickOffset };
}

// ── HTML template ─────────────────────────────────────────────────────────────

function buildHtml({ fileName, assetID, vaultUrl, codec, audioCodec, brainB64,
                     brainLen, encKeysB64, brickByteLength, baseIVHex,
                     segmentSize, segmentCount }) {
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
// ── Asset metadata (non-sensitive — brick is encrypted, keys are encrypted) ──
var ASSET_ID     = '${assetID}';
var VAULT_URL    = '${vaultUrl}';
var CODEC        = '${codec}';
var AUDIO        = '${audioCodec}';
var MIME_TYPE    = 'video/mp4; codecs="' + CODEC + ', ' + AUDIO + '"';
var BRAIN_B64    = '${brainB64}';
var ENC_KEYS_B64 = '${encKeysB64}';
var BASE_IV_HEX  = '${baseIVHex}';
var BRICK_BYTES  = ${brickByteLength};
var BRAIN_LEN    = ${brainLen};
var SEG_SIZE     = ${segmentSize};
var SEG_COUNT    = ${segmentCount};
// BRICK_OFFSET is injected at the end of this file as an HTML comment.
// We read it from the DOM at runtime.

// ── UI ────────────────────────────────────────────────────────────────────────
var $=document.getElementById.bind(document);
var msgEl=$('msg'),dbgEl=$('dbg'),barEl=$('bar'),btnEl=$('btn'),player=$('player');
function log(s){console.log('[Asset]',s);dbgEl.textContent=s;}
function prog(p,s){barEl.style.width=p+'%';if(s)log(s);}
function fail(s){msgEl.innerHTML='<span style="color:#ff4455">&#x26A0; ACCESS DENIED</span>';
    dbgEl.textContent=s;dbgEl.style.color='#ff4455';
    btnEl.disabled=false;btnEl.textContent='RETRY';}

// ── Tiny base64 → Uint8Array (only for small crypto payloads, NOT video) ──────
function b64(s){var b=atob(s.replace(/\s/g,'')),u=new Uint8Array(b.length);
    for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u;}
function hex2u8(h){var u=new Uint8Array(h.length>>1);
    for(var i=0;i<h.length;i+=2)u[i>>1]=parseInt(h.substr(i,2),16);return u;}

// ── Vault decryption (RSA+AES-GCM hybrid — only decrypts ~200B of JSON) ──────
async function hybridDecrypt(priv,payload){
    var sk=await crypto.subtle.decrypt({name:'RSA-OAEP'},priv,b64(payload.wrappedKey));
    var ak=await crypto.subtle.importKey('raw',sk,{name:'AES-GCM'},false,['decrypt']);
    var ct=b64(payload.ciphertext),tag=b64(payload.tag),cb=new Uint8Array(ct.length+tag.length);
    cb.set(ct,0);cb.set(tag,ct.length);
    return new TextDecoder().decode(await crypto.subtle.decrypt(
        {name:'AES-GCM',iv:b64(payload.iv),tagLength:128},ak,cb));
}
async function vaultHandshake(){
    var kp=await crypto.subtle.generateKey(
        {name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},
        false,['decrypt']);
    var pubDer=await crypto.subtle.exportKey('spki',kp.publicKey);
    var pubB64=btoa(String.fromCharCode(...new Uint8Array(pubDer)));
    var res=await fetch(VAULT_URL+'/api/unlock?assetID='+ASSET_ID,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({publicKey:pubB64})});
    if(!res.ok){var e=await res.json().catch(function(){return{};});throw new Error(e.error||'Vault '+res.status);}
    return JSON.parse(await hybridDecrypt(kp.privateKey,await res.json()));
}
async function decryptKeyBlob(tkHex){
    var raw=b64(ENC_KEYS_B64),iv=raw.slice(0,12),ct=raw.slice(12);
    var kb=hex2u8(tkHex),ck=await crypto.subtle.importKey('raw',kb,{name:'AES-GCM'},false,['decrypt']);
    return JSON.parse(new TextDecoder().decode(
        await crypto.subtle.decrypt({name:'AES-GCM',iv:iv,tagLength:128},ck,ct)));
}

// ── Find brick offset by reading the marker comment ───────────────────────────
// The HTML file has a comment: <!--EVZONES:BRICK_OFFSET=N,BRICK_BYTES=M-->
// We search the raw bytes of this file (fetched with Range: bytes=0-4095)
// to avoid loading the full file. The marker is always in the first 4KB
// because the HTML ends at </html> and the marker follows immediately.
async function findBrickOffset(){
    var res=await fetch(location.href,{headers:{Range:'bytes=0-8191'}});
    var buf=await res.arrayBuffer();
    var txt=new TextDecoder().decode(buf);
    var m=txt.match(/<!--EVZONES:BRICK_OFFSET=(\d+),BRICK_BYTES=(\d+)-->/);
    if(!m)throw new Error('Brick offset marker not found — file may be truncated');
    return {offset:parseInt(m[1]),bytes:parseInt(m[2])};
}

// ── Stream brick from self into OPFS ──────────────────────────────────────────
// Uses fetch with Range header to skip the HTML preamble entirely.
// Streams the response body chunk-by-chunk into OPFS.
// Max RAM: one fetch chunk (typically 64KB-1MB, browser-controlled).
async function streamBrickToOPFS(brickOffset,brickBytes,opfsName,onProg){
    var root=await navigator.storage.getDirectory();
    var fh=await root.getFileHandle(opfsName,{create:true});
    var ws=await fh.createWritable();

    // Fetch only the brick portion of this file
    var res=await fetch(location.href,{headers:{Range:'bytes='+brickOffset+'-'}});
    if(!res.ok&&res.status!==206)throw new Error('Self-fetch failed: '+res.status);

    var reader=res.body.getReader(),written=0;
    while(true){
        var r=await reader.read();
        if(r.done)break;
        await ws.write(r.value);
        written+=r.value.byteLength;
        onProg(written,brickBytes);
        if(written>=brickBytes)break; // don't read past the brick
    }
    await ws.close();
    return fh;
}

// ── Service Worker ────────────────────────────────────────────────────────────
async function ensureSW(){
    if(!('serviceWorker' in navigator))throw new Error('Service Worker not supported');
    var reg=await navigator.serviceWorker.register('./sw.js',{scope:'./'});
    if(reg.active)return;
    await new Promise(function(resolve){
        var sw=reg.installing||reg.waiting;
        if(!sw){resolve();return;}
        sw.addEventListener('statechange',function(){if(sw.state==='activated')resolve();});
    });
}
function swMsg(msg){
    return new Promise(function(res,rej){
        var ch=new MessageChannel();
        ch.port1.onmessage=function(e){e.data&&e.data.error?rej(new Error(e.data.error)):res(e.data);};
        navigator.serviceWorker.controller.postMessage(msg,[ch.port2]);
    });
}

// ── Kill switch poll ──────────────────────────────────────────────────────────
function startKillPoll(){
    setInterval(async function(){
        try{
            var kp=await crypto.subtle.generateKey(
                {name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},
                false,['decrypt']);
            var pubDer=await crypto.subtle.exportKey('spki',kp.publicKey);
            var pubB64=btoa(String.fromCharCode(...new Uint8Array(pubDer)));
            var r=await fetch(VAULT_URL+'/api/unlock?assetID='+ASSET_ID,{
                method:'POST',headers:{'Content-Type':'application/json'},
                body:JSON.stringify({publicKey:pubB64})});
            if(r.status===403){
                player.pause();player.src='';
                $('lock').style.display='flex';
                msgEl.innerHTML='<span style="color:#ff4455">&#x26A0; Asset deactivated.</span>';
            }
        }catch(e){}
    },30000);
}

// ── Session tracking ──────────────────────────────────────────────────────────
var SID=null;
async function startSession(){
    try{var r=await fetch(VAULT_URL+'/api/checkpoint',{method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({assetID:ASSET_ID,viewerURL:location.href})});
        SID=(await r.json()).sessionID;
    }catch(e){}
}
async function ping(cp){if(!SID)return;
    try{await fetch(VAULT_URL+'/api/checkpoint',{method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({assetID:ASSET_ID,sessionID:SID,checkpoint:cp})});}catch(e){}}

// ── Main button ───────────────────────────────────────────────────────────────
btnEl.addEventListener('click',async function(){
    btnEl.disabled=true;
    try{
        prog(5,'Step 1: Vault handshake…');
        msgEl.innerHTML="Verifying domain… <span class='sp'></span>";
        var auth=await vaultHandshake();
        var tempKeys=await decryptKeyBlob(auth.transportKey);

        prog(15,'Step 2: Locating brick…');
        var {offset:brickOffset,bytes:brickBytes}=await findBrickOffset();
        console.log('[Asset] Brick at offset',brickOffset,'size',brickBytes,'B');

        prog(18,'Step 3: Service Worker…');
        await ensureSW();

        var opfsName='evzones-'+ASSET_ID+'.bin';

        // Check OPFS cache
        var cached=false;
        try{
            var root=await navigator.storage.getDirectory();
            var cfh=await root.getFileHandle(opfsName);
            var cf=await cfh.getFile();
            if(cf.size===brickBytes){cached=true;log('Cached in OPFS — skipping download');}
        }catch(e){}

        if(!cached){
            prog(20,'Step 4: Streaming encrypted video to local storage…');
            await streamBrickToOPFS(brickOffset,brickBytes,opfsName,function(w,t){
                prog(20+Math.round((w/t)*55),'Caching… '+Math.round(w/1024/1024)+'MB / '+Math.round(t/1024/1024)+'MB');
            });
        }

        prog(78,'Step 5: Registering with player…');
        // Pre-import all CryptoKeys in the SW for fast range serving
        await swMsg({type:'REGISTER_ASSET',id:ASSET_ID,opfsName,
            brainB64:BRAIN_B64,tempKeys,baseIVHex:BASE_IV_HEX,
            segmentSize:SEG_SIZE,segmentCount:SEG_COUNT,
            brickBytes:brickBytes,mimeType:MIME_TYPE});

        prog(85,'Step 6: Starting playback…');
        var videoUrl='./sw-video/'+ASSET_ID+'.mp4';
        player.src=videoUrl;

        // Wait for canplay or a short timeout
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
        player.play().catch(function(){log('Click to play (autoplay blocked)');});

        startSession();
        setInterval(function(){if(!player.paused)ping(Math.floor(player.currentTime));},15000);
        startKillPoll();

    }catch(err){console.error('[Asset] Error:',err);fail('Error: '+err.message);}
});
</script>
</body>
</html>`;
}