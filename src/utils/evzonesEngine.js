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
    for (let i = 0; i < uint8.length - 20; i++) {
        // Find 'esds' box
        if (uint8[i]===0x65 && uint8[i+1]===0x73 && uint8[i+2]===0x64 && uint8[i+3]===0x73) {
            // esds: [size4][type4][version1][flags3][ES_Descriptor...]
            // ES_Descriptor tag=0x03, then skip variable-length size + 3 bytes ES_ID+flags
            // DecoderConfigDescriptor tag=0x04, skip size + 13 bytes
            // DecoderSpecificInfo tag=0x05, skip size
            // AudioSpecificConfig: first 5 bits = audioObjectType
            let o = i + 8; // skip version+flags (4 bytes) — wait, esds box: offset 0=size,4=type,8=ver+flags
            o = i + 12;    // start of ES_Descriptor (after box header + version/flags)
            // Skip ES_Descriptor tag+size
            if (uint8[o] !== 0x03) continue;
            o++; // skip tag 0x03
            // Skip variable-length size (1-4 bytes, high bit set = more bytes)
            while (uint8[o] & 0x80) o++;
            o++; // last size byte
            o += 3; // skip ES_ID (2) + stream priority (1)
            // Now at DecoderConfigDescriptor
            if (uint8[o] !== 0x04) continue;
            o++; // skip tag 0x04
            while (uint8[o] & 0x80) o++;
            o++; // last size byte
            o += 13; // skip DecoderConfigDescriptor fields
            // Now at DecoderSpecificInfo
            if (uint8[o] !== 0x05) continue;
            o++; // skip tag 0x05
            while (uint8[o] & 0x80) o++;
            o++; // last size byte
            // AudioSpecificConfig: top 5 bits = audioObjectType
            const objType = (uint8[o] >> 3) & 0x1f;
            const codec = 'mp4a.40.' + (objType === 0 ? 2 : objType);
            console.log('[Engine] Audio codec:', codec, '(objType=' + objType + ')');
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

    // Pass 2: fragment cleanly for MSE — FIXED FLAGS FOR CHROME COMPATIBILITY
    console.log('[Engine] Pass 2: fragmenting...');
    await ffmpeg.exec([
        '-i', 'defrag.mp4',
        '-map', '0:v:0',
        '-map', '0:a:0',
        '-c:v', 'copy',
        '-c:a', 'copy',
        '-map_metadata', '-1',
        // CRITICAL: separate_moof for Chrome MSE compatibility
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof+separate_moof',
        '-frag_duration', '1000000',  // 1 second fragments (was 2s)
        '-brand', 'isom',
        '-use_editlist', '0',
        '-min_frag_duration', '500000',  // Minimum 0.5s fragments
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
        <p>Protected media asset requires authorization</p>
        <button id='start-btn'>UNLOCK CONTENT</button>
        <p id='msg'></p>
        <div id='debug'></div>
    </div>
    <video id='player' controls></video>

    <script>
        const ASSET_ID  = '${receivedId}';
        const VAULT_URL = '${VAULT_URL}';
        const BRICK_B64 = '${brickBase64}';
        const MIME_TYPE = 'video/mp4; codecs="${codec}, ${audioCodec}"';

        const player  = document.getElementById('player');
        const msgEl   = document.getElementById('msg');
        const debugEl = document.getElementById('debug');

        function step(n, msg) { console.log(n, msg); msgEl.innerHTML = msg + " <span class='spinner'></span>"; }

        // Helpers
        const base64ToBytes = (b64) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const bytesToBase64 = (bytes) => btoa(String.fromCharCode.apply(null, bytes));
        const hexToBytes = (hex) => new Uint8Array(hex.match(/.{2}/g).map(h => parseInt(h, 16)));

        async function hybridDecrypt(rsaPrivateKey, payload) {
            const wrappedKeyBytes = base64ToBytes(payload.wrappedKey);
            const aesKey = await crypto.subtle.unwrapKey('raw', wrappedKeyBytes, rsaPrivateKey,
                { name: 'RSA-OAEP' }, { name: 'AES-GCM' }, false, ['decrypt']);
            const ivBytes = base64ToBytes(payload.iv);
            const ciphertextBytes = base64ToBytes(payload.ciphertext);
            const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, aesKey, ciphertextBytes);
            return new TextDecoder().decode(decrypted);
        }

        async function decryptAesCtr(encrypted, keyBytes, ivBytes) {
            const ck = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CTR' }, false, ['decrypt']);
            return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CTR', counter: ivBytes, length: 128 }, ck, encrypted));
        }

        async function appendBuffer(sourceBuffer, chunk) {
            return new Promise(function(res, rej) {
                sourceBuffer.addEventListener('updateend', res, { once: true });
                sourceBuffer.addEventListener('error', function onErr() {
                    rej(new Error('SourceBuffer error code=' + (sourceBuffer.error?.code || 'null') + ' msg=' + (sourceBuffer.error?.message || 'no message')));
                }, { once: true });
                try {
                    sourceBuffer.appendBuffer(chunk);
                } catch(e) {
                    rej(e);
                }
            });
        }

        document.getElementById('start-btn').addEventListener('click', async function() {
            document.getElementById('start-btn').disabled = true;
            debugEl.textContent = 'Initializing...';
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

                step(4, 'Preparing media stream...');
                var keyBytes   = hexToBytes(auth.key);
                var kidBytes   = hexToBytes(auth.kid);
                var brainBytes = base64ToBytes(auth.brain);
                var encBrick   = base64ToBytes(BRICK_B64);
                console.log('Brain:', brainBytes.length, 'bytes | Enc brick:', encBrick.length, 'bytes');

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

                var CHUNK = /Mobi|Android/i.test(navigator.userAgent) ? 512 * 1024 : 2 * 1024 * 1024;

                // Decrypt and append first chunk together with brain
                var firstEncChunk = encBrick.slice(0, Math.min(CHUNK, encBrick.length));
                var firstChunk    = await decryptAesCtr(firstEncChunk, keyBytes, kidBytes);
                var initPlusFirst = new Uint8Array(brainBytes.length + firstChunk.length);
                initPlusFirst.set(brainBytes, 0);
                initPlusFirst.set(firstChunk, brainBytes.length);
                await appendBuffer(sb, initPlusFirst);
                console.log('Brain + first fragment appended OK');

                step(8, 'Streaming remaining media...');
                // Target buffer: keep 3 chunks ahead, pause if too much buffered
                var TARGET_BUFFER = 30; // seconds ahead to buffer
                for (var i = CHUNK; i < encBrick.length; i += CHUNK) {
                    if (ms.readyState !== 'open') break;

                    // Throttle: if we have enough buffered, wait for it to drain
                    if (player.buffered.length > 0) {
                        var bufferedAhead = player.buffered.end(player.buffered.length - 1) - player.currentTime;
                        if (bufferedAhead > TARGET_BUFFER) {
                            await new Promise(function(r) {
                                player.addEventListener('timeupdate', function check() {
                                    var ahead = player.buffered.length > 0
                                        ? player.buffered.end(player.buffered.length - 1) - player.currentTime
                                        : 0;
                                    if (ahead < TARGET_BUFFER / 2) {
                                        player.removeEventListener('timeupdate', check);
                                        r();
                                    }
                                });
                            });
                        }
                    }

                    // Decrypt only this chunk — previous chunk is already GC-able
                    var encChunk = encBrick.slice(i, Math.min(i + CHUNK, encBrick.length));
                    var chunk    = await decryptAesCtr(encChunk, keyBytes, kidBytes);
                    await appendBuffer(sb, chunk);
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