// utils/evzonesEngine.js
// ─────────────────────────────────────────────────────────────────────────────
// V2 ARCHITECTURE OVERVIEW
// ─────────────────────────
// The key insight that fixes the upgrade attempt:
//
//   OLD (broken): Client encrypts with tempKeys → Server tries to HMAC-derive
//                 those same keys → impossible, they're random, never stored.
//
//   NEW (correct): 
//     1. Client encrypts each 2MB segment with a random tempKey[i]
//     2. Client wraps ALL tempKeys[] with a temporary "wrapping key" (wrapKey)
//        using AES-256-GCM → produces ENC_KEYS_B64 blob
//     3. wrapKey is sent to the server during save (it derives & stores nothing —
//        save.js only stores brain + asset_secret)
//     4. ENC_KEYS_B64 is embedded in the output HTML asset
//     5. The SERVER can deterministically derive the wrapKey from asset_secret
//        using HMAC — because the wrapKey IS the HMAC transport key
//     6. On playback: client fetches transport key from vault (RSA-encrypted),
//        uses it to decrypt ENC_KEYS_B64, recovers tempKeys[], decrypts brick
//
// WAIT — but then we need the server to know wrapKey at save time to verify it?
// NO. The correct flow is even simpler:
//
//     1. Client generates tempKeys[] randomly
//     2. Server generates asset_secret randomly at save time
//     3. Server derives transportKey = HMAC(HMAC(masterKey, assetSecret), 'transport')
//     4. BUT we can't do step 3 at save time on the client because masterKey is secret!
//
// CORRECT FINAL FLOW (what is actually implemented here):
//     INGEST:
//       a. Client encrypts segments with random tempKeys[]
//       b. Client calls /api/save → server stores brain + asset_secret → returns assetID
//       c. Client calls /api/unlock with its RSA pubkey → server returns transportKey
//          (encrypted with RSA) — yes, this happens right after save, just once
//       d. Client uses transportKey to AES-GCM encrypt the tempKeys[] → ENC_KEYS_B64
//       e. ENC_KEYS_B64 is embedded in the HTML asset (safe — useless without transportKey)
//
//     PLAYBACK:
//       f. Viewer's client calls /api/unlock with its RSA pubkey + assetID
//       g. Server re-derives the SAME transportKey from stored asset_secret
//       h. Returns it RSA-encrypted
//       i. Client decrypts → gets transportKey → decrypts ENC_KEYS_B64 → gets tempKeys[]
//       j. Decrypts each brick segment → plays video
//
// This means:
//   ✓ tempKeys never touch the network in plaintext
//   ✓ ENC_KEYS_B64 in HTML is useless without the vault
//   ✓ Server is fully stateless for playback (just HMAC math)
//   ✓ Kill switch works: killed=true → vault returns 403 → no transportKey
// ─────────────────────────────────────────────────────────────────────────────

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

const ffmpeg = new FFmpeg();

// ─── Constants ────────────────────────────────────────────────────────────────
const SEGMENT_SIZE = 2 * 1024 * 1024; // 2MB per segment — good balance for MSE

// ─── Helpers ──────────────────────────────────────────────────────────────────

const uint8ToBase64 = (uint8) => {
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8.length; i += chunkSize)
        binary += String.fromCharCode.apply(null, uint8.subarray(i, i + chunkSize));
    return btoa(binary);
};

const base64ToBytes = (b64) => {
    const bin = atob(b64.replace(/\s/g, ''));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
};

const readUint32 = (u8, o) =>
    (u8[o] * 16777216) + (u8[o+1] * 65536) + (u8[o+2] * 256) + u8[o+3];

const readBoxType = (u8, o) =>
    String.fromCharCode(u8[o+4], u8[o+5], u8[o+6], u8[o+7]);

const patchFtypBrand = (uint8) => {
    if (uint8[4]===0x66 && uint8[5]===0x74 && uint8[6]===0x79 && uint8[7]===0x70) {
        const p = new Uint8Array(uint8);
        p[8]=0x69; p[9]=0x73; p[10]=0x6f; p[11]=0x6d;
        console.log('[Engine] ftyp brand patched → isom');
        return p;
    }
    return uint8;
};

const removeUdtaFromBrain = (uint8) => {
    let offset = 0;
    while (offset < uint8.length - 8) {
        const size = readUint32(uint8, offset);
        const type = readBoxType(uint8, offset);
        if (type === 'moov') {
            let inner = offset + 8;
            while (inner < offset + size - 8) {
                const iSize = readUint32(uint8, inner);
                const iType = readBoxType(uint8, inner);
                if (iType === 'udta') {
                    const out = new Uint8Array(uint8.length - iSize);
                    out.set(uint8.slice(0, inner), 0);
                    out.set(uint8.slice(inner + iSize), inner);
                    const nm = size - iSize;
                    out[offset]   = (nm>>>24)&0xff; out[offset+1] = (nm>>>16)&0xff;
                    out[offset+2] = (nm>>>8) &0xff; out[offset+3] =  nm      &0xff;
                    console.log('[Engine] udta removed (' + iSize + ' bytes)');
                    return out;
                }
                if (iSize < 8) break;
                inner += iSize;
            }
            break;
        }
        if (size < 8) break;
        offset += size;
    }
    return uint8;
};

const detectCodec = (uint8) => {
    for (let i = 0; i < uint8.length - 10; i++) {
        if (uint8[i]===0x61&&uint8[i+1]===0x76&&uint8[i+2]===0x63&&uint8[i+3]===0x43) {
            const p = uint8[i+5].toString(16).padStart(2,'0').toUpperCase();
            const c = uint8[i+6].toString(16).padStart(2,'0').toUpperCase();
            const l = uint8[i+7].toString(16).padStart(2,'0').toUpperCase();
            console.log('[Engine] Video codec: avc1.' + p + c + l);
            return 'avc1.' + p + c + l;
        }
        if (uint8[i]===0x68&&uint8[i+1]===0x76&&uint8[i+2]===0x63&&uint8[i+3]===0x43)
            return 'hev1.1.6.L93.B0';
    }
    return 'avc1.42E01E';
};

const detectAudioCodec = (uint8) => {
    for (let i = 0; i < uint8.length - 20; i++) {
        if (uint8[i]===0x65&&uint8[i+1]===0x73&&uint8[i+2]===0x64&&uint8[i+3]===0x73) {
            let o = i + 12;
            if (uint8[o] !== 0x03) continue;
            o++; while (uint8[o] & 0x80) o++; o++; o += 3;
            if (uint8[o] !== 0x04) continue;
            o++; while (uint8[o] & 0x80) o++; o++; o += 13;
            if (uint8[o] !== 0x05) continue;
            o++; while (uint8[o] & 0x80) o++; o++;
            const t = (uint8[o] >> 3) & 0x1f;
            console.log('[Engine] Audio codec: mp4a.40.' + (t||2));
            return 'mp4a.40.' + (t === 0 ? 2 : t);
        }
    }
    return 'mp4a.40.2';
};

const splitFragmentedMp4 = (uint8) => {
    let offset = 0, splitIndex = -1, foundMoov = false;
    const log = [];
    while (offset < uint8.length - 8) {
        const size = readUint32(uint8, offset);
        const type = readBoxType(uint8, offset);
        log.push('  offset=' + offset + ' type=' + type + ' size=' + size);
        if (type === 'moov') foundMoov = true;
        if (type === 'moof' || type === 'mdat') { splitIndex = offset; break; }
        if (size < 8) break;
        offset += size;
    }
    console.log('[Engine] Box walk:\n' + log.join('\n'));
    if (splitIndex === -1) throw new Error(
        'Failed to locate moof/mdat. ' +
        (foundMoov ? 'moov found but no moof.' : 'moov not found — FFmpeg output corrupt?')
    );
    return { brainBytes: uint8.slice(0, splitIndex), brickBytes: uint8.slice(splitIndex) };
};

// AES-CTR encrypt a single segment.
// Zero IV is safe here because each segment has its own unique random key.
const aesEncryptSegment = async (plain, keyBytes) => {
    const iv = new Uint8Array(16); // zero IV — safe with unique-per-segment key
    const ck = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CTR' }, false, ['encrypt']);
    return new Uint8Array(await crypto.subtle.encrypt(
        { name: 'AES-CTR', counter: iv, length: 128 }, ck, plain
    ));
};

// Encrypt the tempKeys array with AES-256-GCM using the transport key from vault.
// The IV is random and prepended to the ciphertext.
const encryptTempKeys = async (tempKeys, transportKeyHex) => {
    const keyBytes = new Uint8Array(transportKeyHex.match(/.{2}/g).map(h => parseInt(h, 16)));
    const iv       = crypto.getRandomValues(new Uint8Array(12));
    const ck       = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
    const plain    = new TextEncoder().encode(JSON.stringify(tempKeys));
    const cipher   = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, ck, plain);
    // Prepend IV (12 bytes) to ciphertext+tag
    const result   = new Uint8Array(12 + cipher.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(cipher), 12);
    return uint8ToBase64(result);
};

// Perform the vault handshake to get the transport key.
// Called once at ingest time (right after save) and on every playback.
const fetchTransportKey = async (assetID, vaultBaseUrl) => {
    const keyPair = await crypto.subtle.generateKey(
        { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' },
        false, ['decrypt']
    );
    const pubKeyDer = await crypto.subtle.exportKey('spki', keyPair.publicKey);
    const pubKeyB64 = uint8ToBase64(new Uint8Array(pubKeyDer));

    const res = await fetch(`${vaultBaseUrl}/api/unlock?assetID=${assetID}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ publicKey: pubKeyB64 })
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error('Vault denied: ' + (err.error || res.status));
    }

    const payload = await res.json();

    // RSA-decrypt the session key, then AES-GCM-decrypt the payload
    const wrappedKey = base64ToBytes(payload.wrappedKey);
    const sessionKey = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, keyPair.privateKey, wrappedKey);
    const aesKey     = await crypto.subtle.importKey('raw', sessionKey, { name: 'AES-GCM' }, false, ['decrypt']);
    const iv         = base64ToBytes(payload.iv);
    const ct         = base64ToBytes(payload.ciphertext);
    const tag        = base64ToBytes(payload.tag);
    const combined   = new Uint8Array(ct.length + tag.length);
    combined.set(ct, 0); combined.set(tag, ct.length);
    const plain      = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, aesKey, combined);
    return JSON.parse(new TextDecoder().decode(plain)); // { brain, transportKey, segmentCount }
};

// ─── Public API ───────────────────────────────────────────────────────────────

export const processEvzonesVideo = async (file) => {
    if (!ffmpeg.loaded) await ffmpeg.load();

    ffmpeg.on('log',      ({ message })  => console.log('[FFmpeg]', message));
    ffmpeg.on('progress', ({ progress }) => console.log('[FFmpeg]', Math.round(progress * 100) + '%'));

    console.log('[Engine] Input:', file.name, (file.size / 1024 / 1024).toFixed(1), 'MB');
    await ffmpeg.writeFile('input.mp4', await fetchFile(file));

    console.log('[Engine] Pass 1: defragmenting...');
    await ffmpeg.exec([
        '-i', 'input.mp4', '-map', '0:v:0', '-map', '0:a:0',
        '-c', 'copy', '-map_metadata', '-1', '-ignore_unknown',
        '-movflags', '+faststart', '-fflags', '+genpts', 'defrag.mp4'
    ]);

    console.log('[Engine] Pass 2: fragmenting...');
    await ffmpeg.exec([
        '-i', 'defrag.mp4', '-map', '0:v:0', '-map', '0:a:0',
        '-c:v', 'copy', '-c:a', 'copy', '-map_metadata', '-1',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof+omit_tfhd_offset',
        '-frag_duration', '2000000', '-brand', 'isom', '-use_editlist', '0',
        'fragmented.mp4'
    ]);

    const data  = await ffmpeg.readFile('fragmented.mp4');
    const uint8 = new Uint8Array(data.buffer);
    console.log('[Engine] FFmpeg output:', uint8.length, 'bytes');

    const { brainBytes: rawBrain, brickBytes } = splitFragmentedMp4(uint8);
    const brainBytes = removeUdtaFromBrain(patchFtypBrand(rawBrain));
    const codec      = detectCodec(brainBytes);
    const audioCodec = detectAudioCodec(brainBytes);

    // Encrypt each segment with a unique random AES key
    console.log('[Engine] Encrypting segments...');
    const tempKeys = [];   // Array of hex strings, one per segment
    const encSegments = [];

    const totalSegments = Math.ceil(brickBytes.length / SEGMENT_SIZE);
    for (let i = 0; i < totalSegments; i++) {
        const start = i * SEGMENT_SIZE;
        const end   = Math.min(start + SEGMENT_SIZE, brickBytes.length);
        const plain = brickBytes.slice(start, end);
        const key   = crypto.getRandomValues(new Uint8Array(32));
        const enc   = await aesEncryptSegment(plain, key);
        encSegments.push(enc);
        tempKeys.push([...key].map(b => b.toString(16).padStart(2, '0')).join(''));
    }

    // Stitch segments into one encrypted brick Uint8Array
    const totalEncSize = encSegments.reduce((a, s) => a + s.length, 0);
    const encBrick     = new Uint8Array(totalEncSize);
    let off = 0;
    for (const seg of encSegments) { encBrick.set(seg, off); off += seg.length; }

    console.log('[Engine] Brain:', brainBytes.length, 'B | Segments:', totalSegments,
                '| Codec:', codec, '| Audio:', audioCodec);

    return {
        brain:        uint8ToBase64(brainBytes),
        brick:        encBrick,
        tempKeys,
        segmentCount: totalSegments,
        fileName:     file.name,
        codec,
        audioCodec
    };
};

export const generateSmartAsset = async (data, assetID, vaultBaseUrl) => {
    const VAULT_URL  = (vaultBaseUrl || 'https://evzones-protocol.vercel.app').replace(/\/$/, '');
    const codec      = data.codec      || 'avc1.42E01E';
    const audioCodec = data.audioCodec || 'mp4a.40.2';

    console.log('[Engine] Fetching transport key for key encryption...');
    // Fetch the transport key from the vault to encrypt the tempKeys blob.
    // This is the INGEST unlock — happens once, server returns transportKey.
    const authData = await fetchTransportKey(assetID, VAULT_URL);

    if (!authData.transportKey) {
        throw new Error('Vault did not return a transport key');
    }

    // Encrypt the tempKeys array with the transport key.
    // ENC_KEYS_B64 is safe to embed in the HTML — useless without the vault.
    console.log('[Engine] Encrypting temp keys with transport key...');
    const encKeysB64 = await encryptTempKeys(data.tempKeys, authData.transportKey);

    const brickB64 = uint8ToBase64(data.brick);

    console.log('[Engine] Generating HTML asset:', assetID,
                '| Segments:', data.segmentCount,
                '| Brick:', brickB64.length, 'chars');

    const html = generateHtmlTemplate({
        fileName:    data.fileName,
        assetID,
        vaultUrl:    VAULT_URL,
        codec,
        audioCodec,
        brickB64,
        encKeysB64,
        segmentCount: data.segmentCount,
        segmentSize:  SEGMENT_SIZE
    });

    return new Blob([html], { type: 'text/html' });
};

// ─── HTML Template ────────────────────────────────────────────────────────────

function generateHtmlTemplate({ fileName, assetID, vaultUrl, codec, audioCodec,
                                  brickB64, encKeysB64, segmentCount, segmentSize }) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EVZONES SENTINEL: ${fileName}</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{background:linear-gradient(135deg,#0a0a0a,#1a1a1a);color:#fff;
             font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
             display:flex;align-items:center;justify-content:center;min-height:100vh}
        #player{width:100%;max-width:100vw;max-height:100vh;display:none}
        .lock{border:2px solid #00ff00;padding:3rem;background:rgba(10,10,10,0.95);
              border-radius:16px;text-align:center;max-width:500px;
              box-shadow:0 0 40px rgba(0,255,0,0.3)}
        .lock h2{font-size:1.5rem;margin-bottom:1rem;color:#00ff00}
        .lock p{margin:1rem 0;opacity:.9}
        #btn{background:#00ff00;color:#000;border:none;padding:15px 40px;
             border-radius:8px;font-weight:bold;font-size:1.1rem;cursor:pointer;
             transition:all .3s;margin-top:1rem}
        #btn:hover{background:#00cc00;transform:translateY(-2px)}
        #btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
        #dbg{font-family:monospace;font-size:.8rem;color:#00ff00;
             margin-top:15px;word-break:break-all}
        .sp{display:inline-block;width:18px;height:18px;
            border:3px solid rgba(0,255,0,.3);border-top-color:#00ff00;
            border-radius:50%;animation:spin 1s linear infinite;
            margin-left:8px;vertical-align:middle}
        #wm-s{position:fixed;top:0;left:0;width:100%;height:100%;
              pointer-events:none;z-index:10;display:none;align-items:center;
              justify-content:center;opacity:.012;color:#fff;font-size:1.8vw;
              font-weight:bold;font-family:monospace;text-align:center;
              word-break:break-all;user-select:none;white-space:pre-wrap}
        #wm-d{position:fixed;pointer-events:none;z-index:11;display:none;
              opacity:.018;color:#fff;font-size:1.1vw;font-weight:bold;
              font-family:monospace;user-select:none;transition:top 2s ease,left 2s ease}
        @keyframes spin{to{transform:rotate(360deg)}}
    </style>
</head>
<body>
    <div id="lock" class="lock">
        <h2>&#x1F6E1;&#xFE0F; EVZONES PROTOCOL ACTIVE</h2>
        <p id="msg">Secure Connection Established. Domain Verification Pending.</p>
        <button id="btn">INITIALIZE DECRYPTION</button>
        <p id="dbg"></p>
    </div>
    <video id="player" controls controlsList="nodownload" playsinline></video>
    <div id="wm-s"></div>
    <div id="wm-d"></div>

<script>
// ── Asset constants (non-sensitive — brick is encrypted, keys blob is encrypted) ──
var BRICK_B64    = '${brickB64}';
var ENC_KEYS_B64 = '${encKeysB64}';
var ASSET_ID     = '${assetID}';
var VAULT_URL    = '${vaultUrl}';
var CODEC        = '${codec}';
var AUDIO        = '${audioCodec}';
var MIME_TYPE    = 'video/mp4; codecs="' + CODEC + ', ' + AUDIO + '"';
var TOTAL_SEGS   = ${segmentCount};
var SEG_SIZE     = ${segmentSize};

// ── Utilities ────────────────────────────────────────────────────────────────
function b64ToBytes(b64) {
    var s = atob(b64.replace(/\\s/g, ''));
    var o = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) o[i] = s.charCodeAt(i);
    return o;
}
function bytesToB64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
}
function hexToBytes(hex) {
    var b = new Uint8Array(hex.length / 2);
    for (var i = 0; i < hex.length; i += 2) b[i/2] = parseInt(hex.substr(i,2), 16);
    return b;
}
function step(n, t) { console.log(n, t); document.getElementById('dbg').textContent = 'Step ' + n + ': ' + t; }

// ── Crypto ───────────────────────────────────────────────────────────────────

// Decrypt the RSA+AES-GCM hybrid payload from the vault
async function hybridDecrypt(privateKey, payload) {
    var wk  = b64ToBytes(payload.wrappedKey);
    var sk  = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, wk);
    var ak  = await crypto.subtle.importKey('raw', sk, { name: 'AES-GCM' }, false, ['decrypt']);
    var iv  = b64ToBytes(payload.iv);
    var ct  = b64ToBytes(payload.ciphertext);
    var tag = b64ToBytes(payload.tag);
    var cb  = new Uint8Array(ct.length + tag.length);
    cb.set(ct, 0); cb.set(tag, ct.length);
    return new TextDecoder().decode(
        await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv, tagLength: 128 }, ak, cb)
    );
}

// Decrypt the ENC_KEYS_B64 blob with the transport key from vault
async function decryptKeyBlob(encKeysB64, transportKeyHex) {
    var raw    = b64ToBytes(encKeysB64);
    var iv     = raw.slice(0, 12);
    var ct     = raw.slice(12);
    var keyB   = hexToBytes(transportKeyHex);
    var ck     = await crypto.subtle.importKey('raw', keyB, { name: 'AES-GCM' }, false, ['decrypt']);
    var plain  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv, tagLength: 128 }, ck, ct);
    return JSON.parse(new TextDecoder().decode(plain)); // string[]
}

// Decrypt one brick segment (AES-CTR, zero IV, unique key per segment)
async function decryptSegment(encBytes, keyHex) {
    var k  = hexToBytes(keyHex);
    var iv = new Uint8Array(16); // zero IV — safe because key is unique per segment
    var ck = await crypto.subtle.importKey('raw', k, { name: 'AES-CTR' }, false, ['decrypt']);
    return new Uint8Array(
        await crypto.subtle.decrypt({ name: 'AES-CTR', counter: iv, length: 128 }, ck, encBytes)
    );
}

// ── Vault handshake ───────────────────────────────────────────────────────────
async function vaultHandshake() {
    var kp = await crypto.subtle.generateKey(
        { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' },
        false, ['decrypt']
    );
    var pubDer = await crypto.subtle.exportKey('spki', kp.publicKey);
    var pubB64 = bytesToB64(new Uint8Array(pubDer));

    var res = await fetch(VAULT_URL + '/api/unlock?assetID=' + ASSET_ID, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ publicKey: pubB64 })
    });
    if (!res.ok) {
        var err = {};
        try { err = await res.json(); } catch(e) {}
        throw new Error(err.error || 'Vault denied: ' + res.status);
    }
    var payload = await res.json();
    return JSON.parse(await hybridDecrypt(kp.privateKey, payload));
    // Returns: { brain: string, transportKey: string, segmentCount: number }
}

// ── MSE helpers ───────────────────────────────────────────────────────────────
function appendBuffer(sb, chunk) {
    return new Promise(function(res, rej) {
        function ok() { sb.removeEventListener('error', er); res(); }
        function er() {
            sb.removeEventListener('updateend', ok);
            var e = sb.error;
            rej(new Error('SourceBuffer error: ' + (e ? e.code + ' ' + e.message : 'unknown')));
        }
        sb.addEventListener('updateend', ok, { once: true });
        sb.addEventListener('error',     er, { once: true });
        try { sb.appendBuffer(chunk); }
        catch(e) {
            sb.removeEventListener('updateend', ok);
            sb.removeEventListener('error',     er);
            rej(new Error('appendBuffer sync throw: ' + e.message));
        }
    });
}

// ── Watermark ─────────────────────────────────────────────────────────────────
async function initWatermarks() {
    var ip = 'unknown';
    try { ip = (await (await fetch('https://api.ipify.org?format=json')).json()).ip; } catch(e) {}
    var info = ip + ' | ' + window.location.href + ' | ' + new Date().toISOString().slice(0,19);
    var wms = document.getElementById('wm-s');
    wms.textContent = info + '\\n' + info + '\\n' + info;
    wms.style.display = 'flex';
    var wmd = document.getElementById('wm-d');
    wmd.textContent = ip + '\\n' + window.location.hostname;
    wmd.style.display = 'block';
    function mv() { wmd.style.left = (5+Math.random()*75)+'vw'; wmd.style.top = (5+Math.random()*85)+'vh'; }
    mv(); setInterval(mv, 30000);
}

// ── Session tracking ──────────────────────────────────────────────────────────
var SESSION_ID = null;
async function startSession() {
    try {
        var r = await fetch(VAULT_URL + '/api/checkpoint', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assetID: ASSET_ID, viewerURL: window.location.href })
        });
        SESSION_ID = (await r.json()).sessionID;
    } catch(e) {}
}
async function pingSession(cp) {
    if (!SESSION_ID) return;
    try {
        await fetch(VAULT_URL + '/api/checkpoint', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assetID: ASSET_ID, sessionID: SESSION_ID, checkpoint: cp })
        });
    } catch(e) {}
}

// ── Kill switch poll ──────────────────────────────────────────────────────────
// Re-use the vault handshake every 30s to check killed status.
// If the asset is killed, the vault returns 403, and we stop playback.
var killPubB64 = null;
async function startKillPoll(player) {
    setInterval(async function() {
        try {
            // Lightweight poll: generate a new RSA pair each time (cheap)
            var kp = await crypto.subtle.generateKey(
                { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' },
                false, ['decrypt']
            );
            var pubDer = await crypto.subtle.exportKey('spki', kp.publicKey);
            var pubB64 = bytesToB64(new Uint8Array(pubDer));
            var r = await fetch(VAULT_URL + '/api/unlock?assetID=' + ASSET_ID, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ publicKey: pubB64 })
            });
            if (r.status === 403) {
                player.pause(); player.src = '';
                document.getElementById('lock').style.display = 'flex';
                document.getElementById('msg').innerHTML =
                    '<span style="color:#ff3333">&#x26A0; This video has been deactivated.</span>';
                document.getElementById('wm-s').style.display = 'none';
                document.getElementById('wm-d').style.display = 'none';
                document.getElementById('btn').style.display = 'none';
            }
        } catch(e) {}
    }, 30000);
}

// ── Main playback entrypoint ───────────────────────────────────────────────────
document.getElementById('btn').addEventListener('click', async function() {
    this.disabled = true;
    var msgEl  = document.getElementById('msg');
    var player = document.getElementById('player');

    try {
        step(1, 'Vault handshake...');
        msgEl.innerHTML = "Verifying Domain Authority... <span class='sp'></span>";

        var auth = await vaultHandshake();
        // auth = { brain: string (base64), transportKey: string (hex), segmentCount: number }

        step(2, 'Decrypting key manifest...');
        var tempKeys   = await decryptKeyBlob(ENC_KEYS_B64, auth.transportKey);
        var brainBytes = b64ToBytes(auth.brain);
        var encBrick   = b64ToBytes(BRICK_B64);
        console.log('Brain:', brainBytes.length, 'B | Enc brick:', encBrick.length, 'B | Keys:', tempKeys.length);

        // ── iOS / Safari without MediaSource ────────────────────────────────
        if (typeof MediaSource === 'undefined' || !MediaSource.isTypeSupported(MIME_TYPE)) {
            step(3, 'iOS detected — decrypting full video...');
            // Decrypt all segments into a single buffer, then create a blob URL.
            // Safari on iOS doesn't support MSE but handles blob URLs fine.
            var totalDecSize = 0;
            var decSegs = [];
            for (var si = 0; si < tempKeys.length; si++) {
                var ss  = si * SEG_SIZE;
                var se  = Math.min(ss + SEG_SIZE, encBrick.length);
                var dec = await decryptSegment(encBrick.slice(ss, se), tempKeys[si]);
                decSegs.push(dec);
                totalDecSize += dec.length;
            }
            var full = new Uint8Array(brainBytes.length + totalDecSize);
            full.set(brainBytes, 0);
            var pos = brainBytes.length;
            for (var i = 0; i < decSegs.length; i++) { full.set(decSegs[i], pos); pos += decSegs[i].length; }

            var blobUrl = URL.createObjectURL(new Blob([full], { type: 'video/mp4' }));
            document.getElementById('lock').style.display = 'none';
            player.style.display = 'block';
            player.src = blobUrl;
            player.play().catch(function() { document.getElementById('dbg').textContent = 'Tap video to play'; });
            await startSession();
            setInterval(function() { if (!player.paused) pingSession(Math.floor(player.currentTime)); }, 15000);
            initWatermarks();
            return;
        }

        // ── MSE path (Chrome, Firefox, Desktop Safari) ───────────────────────
        step(3, 'Validating codec: ' + MIME_TYPE);
        if (!MediaSource.isTypeSupported(MIME_TYPE)) throw new Error('Codec not supported: ' + MIME_TYPE);

        step(4, 'Initializing MediaSource...');
        var ms = new MediaSource();
        player.src = URL.createObjectURL(ms);
        await new Promise(function(res, rej) {
            ms.addEventListener('sourceopen', res, { once: true });
            ms.addEventListener('error',      rej, { once: true });
        });
        var sb = ms.addSourceBuffer(MIME_TYPE);
        console.log('SourceBuffer mode:', sb.mode);

        step(5, 'Appending init segment + segment 0...');
        await new Promise(function(r) { setTimeout(r, 0); }); // yield to browser

        // Decrypt and append the first segment together with brain
        var seg0enc = encBrick.slice(0, Math.min(SEG_SIZE, encBrick.length));
        var seg0dec = await decryptSegment(seg0enc, tempKeys[0]);
        var initBuf = new Uint8Array(brainBytes.length + seg0dec.length);
        initBuf.set(brainBytes, 0);
        initBuf.set(seg0dec, brainBytes.length);
        await appendBuffer(sb, initBuf);
        console.log('Brain + segment 0 appended OK');

        // Show player immediately — don't wait for full decode
        document.getElementById('lock').style.display = 'none';
        player.style.display = 'block';
        player.play().catch(function() { document.getElementById('dbg').textContent = 'Click video to play'; });
        await startSession();
        setInterval(function() { if (!player.paused) pingSession(Math.floor(player.currentTime)); }, 15000);
        startKillPoll(player);
        initWatermarks();

        step(6, 'Streaming remaining segments...');
        var TARGET_BUFFER = 30; // seconds of buffer ahead
        var totalSegs = Math.ceil(encBrick.length / SEG_SIZE);

        for (var si = 1; si < totalSegs; si++) {
            if (ms.readyState !== 'open') break;

            // Throttle — don't get more than TARGET_BUFFER seconds ahead
            if (player.buffered.length > 0) {
                var ahead = player.buffered.end(player.buffered.length - 1) - player.currentTime;
                if (ahead > TARGET_BUFFER) {
                    await new Promise(function(r) {
                        player.addEventListener('timeupdate', function chk() {
                            var a = player.buffered.length > 0
                                ? player.buffered.end(player.buffered.length - 1) - player.currentTime : 0;
                            if (a < TARGET_BUFFER / 2) {
                                player.removeEventListener('timeupdate', chk);
                                r();
                            }
                        });
                    });
                }
            }

            // Evict old buffered data to free RAM (keep 10s behind current position)
            if (sb.buffered.length > 0) {
                var bStart = sb.buffered.start(0);
                var keep   = Math.max(0, player.currentTime - 10);
                if (keep > bStart + 1) {
                    try {
                        await new Promise(function(r) {
                            sb.addEventListener('updateend', r, { once: true });
                            sb.remove(bStart, keep);
                        });
                    } catch(e) { /* non-fatal */ }
                }
            }

            var ss  = si * SEG_SIZE;
            var se  = Math.min(ss + SEG_SIZE, encBrick.length);
            var dec = await decryptSegment(encBrick.slice(ss, se), tempKeys[si]);
            await appendBuffer(sb, dec);
        }

        if (ms.readyState === 'open') ms.endOfStream();
        console.log('[Engine] All segments streamed successfully');

    } catch(err) {
        console.error('Playback error:', err);
        document.getElementById('msg').innerHTML = "<span style='color:#ff3333'>&#x26A0; ACCESS DENIED</span>";
        document.getElementById('dbg').textContent = 'Error: ' + err.message;
        document.getElementById('dbg').style.color = '#ff3333';
        document.getElementById('btn').disabled = false;
        document.getElementById('btn').textContent = 'RETRY';
    }
});
</script>
</body>
</html>`;
}