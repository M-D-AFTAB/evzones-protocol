// utils/evzonesEngine.js
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

const ffmpeg = new FFmpeg();

// ─── Helpers ────────────────────────────────────────────────────────────────

const uint8ToBase64 = (uint8) => {
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8.length; i += chunkSize)
        binary += String.fromCharCode.apply(null, uint8.subarray(i, i + chunkSize));
    return btoa(binary);
};

const readUint32 = (u8, o) =>
    (u8[o] * 16777216) + (u8[o + 1] * 65536) + (u8[o + 2] * 256) + u8[o + 3];

const readBoxType = (u8, o) =>
    String.fromCharCode(u8[o + 4], u8[o + 5], u8[o + 6], u8[o + 7]);

// Patch ftyp major brand to 'isom' — Chrome MSE rejects 'iso5'
const patchFtypBrand = (uint8) => {
    if (uint8[4] === 0x66 && uint8[5] === 0x74 && uint8[6] === 0x79 && uint8[7] === 0x70) {
        const patched = new Uint8Array(uint8);
        patched[8]  = 0x69; // i
        patched[9]  = 0x73; // s
        patched[10] = 0x6f; // o
        patched[11] = 0x6d; // m
        console.log('[Engine] ftyp brand patched: iso5 → isom');
        return patched;
    }
    return uint8;
};

// Surgically remove udta box — Chrome aborts on malformed meta inside udta
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
                    const newTotal = uint8.length - iSize;
                    const out = new Uint8Array(newTotal);
                    out.set(uint8.slice(0, inner), 0);
                    out.set(uint8.slice(inner + iSize), inner);
                    const newMoovSize = size - iSize;
                    out[offset]   = (newMoovSize >>> 24) & 0xff;
                    out[offset+1] = (newMoovSize >>> 16) & 0xff;
                    out[offset+2] = (newMoovSize >>> 8)  & 0xff;
                    out[offset+3] =  newMoovSize         & 0xff;
                    console.log('[Engine] udta removed (' + iSize + ' bytes stripped)');
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

// Detect video codec from avcC box → e.g. "avc1.4D401E"
const detectCodec = (uint8) => {
    for (let i = 0; i < uint8.length - 10; i++) {
        if (uint8[i]===0x61 && uint8[i+1]===0x76 && uint8[i+2]===0x63 && uint8[i+3]===0x43) {
            const p = uint8[i+5].toString(16).padStart(2,'0').toUpperCase();
            const c = uint8[i+6].toString(16).padStart(2,'0').toUpperCase();
            const l = uint8[i+7].toString(16).padStart(2,'0').toUpperCase();
            const codec = 'avc1.' + p + c + l;
            console.log('[Engine] Video codec:', codec);
            return codec;
        }
        if (uint8[i]===0x68 && uint8[i+1]===0x76 && uint8[i+2]===0x63 && uint8[i+3]===0x43) {
            console.log('[Engine] Video codec: HEVC');
            return 'hev1.1.6.L93.B0';
        }
    }
    console.warn('[Engine] Video codec not detected, using fallback');
    return 'avc1.42E01E';
};

// Detect audio codec from esds box → e.g. "mp4a.40.2"
// Chrome requires audio codec in MIME type — omitting it causes:
// "audio object type 0x40 does not match what is specified in the mimetype"
const detectAudioCodec = (uint8) => {
    for (let i = 0; i < uint8.length - 14; i++) {
        if (uint8[i]===0x65 && uint8[i+1]===0x73 && uint8[i+2]===0x64 && uint8[i+3]===0x73) {
            const objType = (uint8[i+13] >> 3) & 0x1f;
            const codec = 'mp4a.40.' + objType;
            console.log('[Engine] Audio codec:', codec);
            return codec;
        }
    }
    console.warn('[Engine] Audio codec not detected, using mp4a.40.2 fallback');
    return 'mp4a.40.2';
};

// Split fragmented MP4: brain = ftyp+moov, brick = moof+mdat...
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

// AES-CTR encrypt (length:128 = full counter, symmetric across all browsers)
const aesEncrypt = async (plain, keyBytes, ivBytes) => {
    const ck = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CTR' }, false, ['encrypt']);
    return new Uint8Array(await crypto.subtle.encrypt(
        { name: 'AES-CTR', counter: ivBytes, length: 128 }, ck, plain
    ));
};

// ─── Public API ─────────────────────────────────────────────────────────────

export const processEvzonesVideo = async (file) => {
    if (!ffmpeg.loaded) await ffmpeg.load();

    console.log('[Engine] Writing input...');
    await ffmpeg.writeFile('input.mp4', await fetchFile(file));

    // Pass 1: defragment + strip extra tracks (tmcd etc) and corrupt metadata
    console.log('[Engine] Pass 1: defragmenting...');
    await ffmpeg.exec([
        '-i', 'input.mp4',
        '-map', '0:v:0',
        '-map', '0:a:0',
        '-c', 'copy',
        '-map_metadata', '-1',
        '-ignore_unknown',
        '-movflags', '+faststart',
        '-fflags', '+genpts',
        'defrag.mp4'
    ]);

    // Pass 2: fragment cleanly for MSE — 2 tracks, 2 trex, no udta
    console.log('[Engine] Pass 2: fragmenting...');
    await ffmpeg.exec([
        '-i', 'defrag.mp4',
        '-map', '0:v:0',
        '-map', '0:a:0',
        '-c:v', 'copy',
        '-c:a', 'copy',
        '-map_metadata', '-1',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof+omit_tfhd_offset',
        '-frag_duration', '2000000',
        '-brand', 'isom',
        '-use_editlist', '0',
        'fragmented.mp4'
    ]);

    const data  = await ffmpeg.readFile('fragmented.mp4');
    const uint8 = new Uint8Array(data.buffer);
    console.log('[Engine] FFmpeg output:', uint8.length, 'bytes');

    const { brainBytes: rawBrain, brickBytes } = splitFragmentedMp4(uint8);
    const brainBytes  = removeUdtaFromBrain(patchFtypBrand(rawBrain));
    const codec       = detectCodec(brainBytes);
    const audioCodec  = detectAudioCodec(brainBytes);

    const keyBytes = crypto.getRandomValues(new Uint8Array(16));
    const kidBytes = crypto.getRandomValues(new Uint8Array(16));
    const key = [...keyBytes].map(b => b.toString(16).padStart(2,'0')).join('');
    const kid = [...kidBytes].map(b => b.toString(16).padStart(2,'0')).join('');

    console.log('[Engine] Encrypting brick...');
    const encryptedBrick = await aesEncrypt(brickBytes, keyBytes, kidBytes);
    const brainBase64    = uint8ToBase64(brainBytes);

    console.log('[Engine] Brain:', brainBytes.length, 'bytes | Brick:', encryptedBrick.length, 'bytes | Codec:', codec, '| Audio:', audioCodec);

    return { brain: brainBase64, brick: encryptedBrick, key, kid, fileName: file.name, codec, audioCodec };
};

export const generateSmartAsset = async (asset, receivedId, vaultBaseUrl) => {
    const VAULT_URL   = vaultBaseUrl || 'https://evzones-protocol.vercel.app';
    const codec       = asset.codec      || 'avc1.42E01E';
    const audioCodec  = asset.audioCodec || 'mp4a.40.2';
    const brickBase64 = uint8ToBase64(asset.brick);

    console.log('[Engine] Smart Asset:', receivedId, '| Codec:', codec, '| Audio:', audioCodec, '| Brick B64:', brickBase64.length);

    const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EVZONES SENTINEL: ${asset.fileName}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
            color: #fff;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            display: flex; align-items: center; justify-content: center;
            min-height: 100vh;
        }
        #player { width: 100%; max-width: 100vw; max-height: 100vh; display: none; }
        .lock-screen {
            border: 2px solid #00ff00; padding: 3rem;
            background: rgba(10,10,10,0.95); border-radius: 16px;
            text-align: center; max-width: 500px;
            box-shadow: 0 0 40px rgba(0,255,0,0.3);
        }
        .lock-screen h2 { font-size: 1.5rem; margin-bottom: 1rem; color: #00ff00; }
        .lock-screen p  { margin: 1rem 0; opacity: 0.9; }
        #start-btn {
            background: #00ff00; color: #000; border: none;
            padding: 15px 40px; border-radius: 8px;
            font-weight: bold; font-size: 1.1rem;
            cursor: pointer; transition: all 0.3s; margin-top: 1rem;
        }
        #start-btn:hover    { background: #00cc00; transform: translateY(-2px); }
        #start-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        #debug {
            font-family: monospace; font-size: 0.8rem;
            color: #00ff00; margin-top: 15px; word-break: break-word;
        }
        .spinner {
            display: inline-block; width: 18px; height: 18px;
            border: 3px solid rgba(0,255,0,0.3); border-top-color: #00ff00;
            border-radius: 50%; animation: spin 1s linear infinite;
            margin-left: 8px; vertical-align: middle;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div id='status' class='lock-screen'>
        <h2>&#x1F6E1;&#xFE0F; EVZONES PROTOCOL ACTIVE</h2>
        <p id='msg'>Handshake Ready. Secure Connection Established.</p>
        <button id='start-btn'>INITIALIZE DECRYPTION</button>
        <p id='debug'></p>
    </div>
    <video id='player' controls controlsList='nodownload' playsinline></video>

    <script>
        var BRICK_B64 = '${brickBase64}';
        var ASSET_ID  = '${receivedId}';
        var VAULT_URL = '${VAULT_URL}';
        var CODEC     = '${codec}';
        var AUDIO     = '${audioCodec}';
        var MIME_TYPE = 'video/mp4; codecs="' + CODEC + ', ' + AUDIO + '"';

        function hexToBytes(hex) {
            var b = new Uint8Array(hex.length / 2);
            for (var i = 0; i < hex.length; i += 2) b[i/2] = parseInt(hex.substr(i, 2), 16);
            return b;
        }

        function base64ToBytes(b64) {
            var bin = atob(b64.replace(/\\s/g, ''));
            var out = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
            return out;
        }

        function bytesToBase64(bytes) {
            var bin = '';
            for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
            return btoa(bin);
        }

        async function decryptAesCtr(encBytes, keyBytes, ivBytes) {
            var ck = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CTR' }, false, ['decrypt']);
            return new Uint8Array(await crypto.subtle.decrypt(
                { name: 'AES-CTR', counter: ivBytes, length: 128 }, ck, encBytes
            ));
        }

        async function hybridDecrypt(privateKey, payload) {
            var wrappedKey = base64ToBytes(payload.wrappedKey);
            var sessionKey = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, wrappedKey);
            var aesKey = await crypto.subtle.importKey('raw', sessionKey, { name: 'AES-GCM' }, false, ['decrypt']);
            var iv         = base64ToBytes(payload.iv);
            var ciphertext = base64ToBytes(payload.ciphertext);
            var tag        = base64ToBytes(payload.tag);
            var combined   = new Uint8Array(ciphertext.length + tag.length);
            combined.set(ciphertext, 0);
            combined.set(tag, ciphertext.length);
            var plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv, tagLength: 128 }, aesKey, combined);
            return new TextDecoder().decode(plain);
        }

        function appendBuffer(sb, chunk) {
            return new Promise(function(resolve, reject) {
                function onDone() { sb.removeEventListener('error', onErr); resolve(); }
                function onErr() {
                    sb.removeEventListener('updateend', onDone);
                    var code = sb.error ? sb.error.code : 'null';
                    var msg  = sb.error ? sb.error.message : 'no message';
                    reject(new Error('SourceBuffer error code=' + code + ' msg=' + msg));
                }
                sb.addEventListener('updateend', onDone, { once: true });
                sb.addEventListener('error',     onErr,  { once: true });
                try {
                    sb.appendBuffer(chunk);
                } catch(syncErr) {
                    sb.removeEventListener('updateend', onDone);
                    sb.removeEventListener('error', onErr);
                    reject(new Error('appendBuffer sync throw: ' + syncErr.name + ': ' + syncErr.message));
                }
            });
        }

        document.getElementById('start-btn').addEventListener('click', async function() {
            this.disabled = true;
            var msgEl   = document.getElementById('msg');
            var debugEl = document.getElementById('debug');
            var player  = document.getElementById('player');

            function step(n, t) { console.log(n, t); debugEl.textContent = 'Step ' + n + ': ' + t; }

            try {
                step(1, 'Generating session keypair...');
                var rsaKeyPair = await crypto.subtle.generateKey(
                    { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' },
                    false, ['decrypt']
                );
                var pubKeyDer = await crypto.subtle.exportKey('spki', rsaKeyPair.publicKey);
                var pubKeyB64 = bytesToBase64(new Uint8Array(pubKeyDer));

                step(2, 'Secure handshake with vault...');
                msgEl.innerHTML = "Verifying Domain Authority... <span class='spinner'></span>";
                var res = await fetch(VAULT_URL + '/api/unlock?assetID=' + ASSET_ID, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ publicKey: pubKeyB64 })
                });
                if (!res.ok) throw new Error('Vault denied: ' + res.status + ' ' + res.statusText);
                var payload = await res.json();
                if (!payload.wrappedKey || !payload.ciphertext) throw new Error('Vault did not return encrypted payload');

                step(3, 'Decrypting vault payload (RSA+AES-GCM)...');
                var authJson = await hybridDecrypt(rsaKeyPair.privateKey, payload);
                var auth     = JSON.parse(authJson);
                if (!auth.brain || !auth.key || !auth.kid) throw new Error('Incomplete auth data after decryption');
                console.log('Auth decrypted — brain:', auth.brain.length, 'chars');

                step(4, 'Decrypting media with AES-CTR...');
                var keyBytes   = hexToBytes(auth.key);
                var kidBytes   = hexToBytes(auth.kid);
                var brainBytes = base64ToBytes(auth.brain);
                var encBrick   = base64ToBytes(BRICK_B64);
                var brickBytes = await decryptAesCtr(encBrick, keyBytes, kidBytes);
                console.log('Brain:', brainBytes.length, 'bytes | Brick:', brickBytes.length, 'bytes');

                step(5, 'Validating codec: ' + MIME_TYPE);
                if (!MediaSource.isTypeSupported(MIME_TYPE)) throw new Error('Codec not supported: ' + MIME_TYPE);
                console.log('Codec accepted:', MIME_TYPE);

                step(6, 'Initializing MediaSource...');
                var ms = new MediaSource();
                player.src = URL.createObjectURL(ms);
                await new Promise(function(res, rej) {
                    ms.addEventListener('sourceopen', res, { once: true });
                    ms.addEventListener('error',      rej, { once: true });
                });
                var sb = ms.addSourceBuffer(MIME_TYPE);
                console.log('SourceBuffer created, mode:', sb.mode);

                step(7, 'Appending init segment + first fragment...');
                await new Promise(function(r) { setTimeout(r, 0); });
                var CHUNK = 512 * 1024;
                var firstChunk    = brickBytes.slice(0, Math.min(CHUNK, brickBytes.length));
                var initPlusFirst = new Uint8Array(brainBytes.length + firstChunk.length);
                initPlusFirst.set(brainBytes, 0);
                initPlusFirst.set(firstChunk, brainBytes.length);
                await appendBuffer(sb, initPlusFirst);
                console.log('Brain + first fragment appended OK');

                step(8, 'Streaming remaining media...');
                for (var i = CHUNK; i < brickBytes.length; i += CHUNK) {
                    if (ms.readyState !== 'open') break;
                    await appendBuffer(sb, brickBytes.slice(i, i + CHUNK));
                }
                if (ms.readyState === 'open') ms.endOfStream();
                console.log('All data appended');

                step(9, 'Authorized. Starting playback...');
                setTimeout(function() {
                    document.getElementById('status').style.display = 'none';
                    player.style.display = 'block';
                    player.play().catch(function() {
                        debugEl.textContent = 'Click the video to play (autoplay policy)';
                    });
                }, 300);

            } catch(err) {
                console.error('Playback error:', err);
                msgEl.innerHTML = "<span style='color:#ff3333'>&#x26A0; ACCESS DENIED</span>";
                debugEl.textContent = 'Error: ' + err.message;
                debugEl.style.color = '#ff3333';
                document.getElementById('start-btn').disabled  = false;
                document.getElementById('start-btn').textContent = 'RETRY';
            }
        });
    </script>
</body>
</html>`;

    return new Blob([htmlTemplate], { type: 'text/html' });
};