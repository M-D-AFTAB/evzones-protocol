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

// Patch ftyp major brand to 'isom' — Chrome MSE rejects 'iso5' init segments
// in empty_moov fragmented files due to strict mvex/trex validation.
const patchFtypBrand = (uint8) => {
    // ftyp box is always first: [size 4B][type "ftyp" 4B][major_brand 4B]...
    if (uint8[4] === 0x66 && uint8[5] === 0x74 && uint8[6] === 0x79 && uint8[7] === 0x70) {
        const patched = new Uint8Array(uint8);
        // Write 'isom' (69 73 6f 6d) at offset 8
        patched[8] = 0x69; // i
        patched[9] = 0x73; // s
        patched[10] = 0x6f; // o
        patched[11] = 0x6d; // m
        console.log('[Engine] ftyp brand patched: iso5 → isom');
        return patched;
    }
    return uint8;
};

// Surgically remove udta box from moov — Chrome aborts on malformed meta inside udta
const removeUdtaFromBrain = (uint8) => {
    // Find moov box
    let offset = 0;
    while (offset < uint8.length - 8) {
        const size = readUint32(uint8, offset);
        const type = readBoxType(uint8, offset);
        if (type === 'moov') {
            // Walk inside moov to find udta
            let inner = offset + 8;
            while (inner < offset + size - 8) {
                const iSize = readUint32(uint8, inner);
                const iType = readBoxType(uint8, inner);
                if (iType === 'udta') {
                    // Build new buffer without the udta box
                    const newTotal = uint8.length - iSize;
                    const out = new Uint8Array(newTotal);
                    out.set(uint8.slice(0, inner), 0);
                    out.set(uint8.slice(inner + iSize), inner);
                    // Fix moov box size (4 bytes at moov start)
                    const newMoovSize = size - iSize;
                    out[offset]   = (newMoovSize >>> 24) & 0xff;
                    out[offset+1] = (newMoovSize >>> 16) & 0xff;
                    out[offset+2] = (newMoovSize >>> 8)  & 0xff;
                    out[offset+3] =  newMoovSize         & 0xff;
                    console.log('[Engine] udta removed from brain (' + iSize + ' bytes stripped)');
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

// Detect codec from avcC box. Returns plain string like: avc1.4D401E
const detectCodec = (uint8) => {
    for (let i = 0; i < uint8.length - 10; i++) {
        if (uint8[i] === 0x61 && uint8[i + 1] === 0x76 && uint8[i + 2] === 0x63 && uint8[i + 3] === 0x43) {
            // Uppercase required — Chrome rejects lowercase codec hex
            const p = uint8[i + 5].toString(16).padStart(2, '0').toUpperCase();
            const c = uint8[i + 6].toString(16).padStart(2, '0').toUpperCase();
            const l = uint8[i + 7].toString(16).padStart(2, '0').toUpperCase();
            const codec = 'avc1.' + p + c + l;
            console.log('[Engine] Detected codec:', codec);
            return codec;
        }
        if (uint8[i] === 0x68 && uint8[i + 1] === 0x76 && uint8[i + 2] === 0x63 && uint8[i + 3] === 0x43) {
            console.log('[Engine] Detected codec: HEVC');
            return 'hev1.1.6.L93.B0';
        }
    }
    console.warn('[Engine] Codec not detected, using safe fallback');
    return 'avc1.42E01E';
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

// WebCrypto AES-CTR encrypt
const aesEncrypt = async (plain, keyBytes, ivBytes) => {
    const ck = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CTR' }, false, ['encrypt']);
    // Change length: 64 → length: 128
    return new Uint8Array(await crypto.subtle.encrypt(
        { name: 'AES-CTR', counter: ivBytes, length: 128 }, ck, plain
    ));
};

// ─── Public API ─────────────────────────────────────────────────────────────

export const processEvzonesVideo = async (file) => {
    if (!ffmpeg.loaded) await ffmpeg.load();

    console.log('[Engine] Writing input...');
    await ffmpeg.writeFile('input.mp4', await fetchFile(file));

    console.log('[Engine] Fragmenting...');
    // Flags explained:
    //   frag_keyframe      — start a new fragment at every keyframe
    //   empty_moov         — write moov with mvex box but no sample data (required for MSE)
    //   default_base_moof  — Chrome requires this for correct tfdt/moof base offsets
    //   omit_tfhd_offset   — removes absolute offsets from tfhd, required for MSE streaming
    // We do NOT use faststart here — it conflicts with empty_moov for fragmented output.
    // Pass 1: defragment (strips existing fragmentation metadata)
    // Pass 1: defragment + strip problem tracks/metadata
    await ffmpeg.exec([
        '-i', 'input.mp4',
        '-map', '0:v:0',
        '-map', '0:a:0',
        '-c', 'copy',
        '-map_metadata', '-1',      // ← add this
        '-ignore_unknown',
        '-movflags', '+faststart',
        '-fflags', '+genpts',
        'defrag.mp4'
    ]);

    // Pass 2: fragment cleanly — now only 2 tracks, 2 trex, no tmcd
    await ffmpeg.exec([
        '-i', 'defrag.mp4',
        '-map', '0:v:0',
        '-map', '0:a:0',
        '-c:v', 'copy',
        '-c:a', 'copy',
        '-map_metadata', '-1',      // ← strip ALL metadata/udta boxes
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof+omit_tfhd_offset',
        '-frag_duration', '2000000',
        '-brand', 'isom',
        '-use_editlist', '0',
        'fragmented.mp4'
    ]);

    const data = await ffmpeg.readFile('fragmented.mp4');
    const uint8 = new Uint8Array(data.buffer);
    console.log('[Engine] FFmpeg output:', uint8.length, 'bytes');

    const { brainBytes: rawBrain, brickBytes } = splitFragmentedMp4(uint8);
    const brainBytes = removeUdtaFromBrain(patchFtypBrand(rawBrain)); // ← add removeUdta
    const codec = detectCodec(brainBytes);

    const keyBytes = crypto.getRandomValues(new Uint8Array(16));
    const kidBytes = crypto.getRandomValues(new Uint8Array(16));
    const key = [...keyBytes].map(b => b.toString(16).padStart(2, '0')).join('');
    const kid = [...kidBytes].map(b => b.toString(16).padStart(2, '0')).join('');

    console.log('[Engine] Encrypting brick...');
    const encryptedBrick = await aesEncrypt(brickBytes, keyBytes, kidBytes);
    const brainBase64 = uint8ToBase64(brainBytes);

    console.log('[Engine] Brain:', brainBytes.length, 'bytes | Brick:', encryptedBrick.length, 'bytes | Codec:', codec);

    return { brain: brainBase64, brick: encryptedBrick, key, kid, fileName: file.name, codec };
};

export const generateSmartAsset = async (asset, receivedId, vaultBaseUrl) => {
    const VAULT_URL = vaultBaseUrl || 'https://evzones-protocol.vercel.app';
    const codec = asset.codec || 'avc1.42E01E';
    // Build the full mime string here in JS — do NOT embed it quoted inside the HTML template.
    // Instead we embed codec and container separately and assemble in the player.
    const brickBase64 = uint8ToBase64(asset.brick);

    console.log('[Engine] Smart Asset:', receivedId, '| Codec:', codec, '| Brick B64:', brickBase64.length);

    // ── Security upgrade: RSA key wrapping ──────────────────────────────────
    // The player generates a one-time RSA keypair in RAM.
    // It sends the PUBLIC key to the vault with the unlock request.
    // The vault encrypts (brain + key + kid) with that public key before sending.
    // Result: the network tab shows only opaque RSA ciphertext — not the raw key.
    // A devtools observer cannot extract the AES key without the RSA private key,
    // which never leaves the browser tab's memory.

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
        // Embedded payload — encrypted brick and routing constants
        var BRICK_B64  = '${brickBase64}';
        var ASSET_ID   = '${receivedId}';
        var VAULT_URL  = '${VAULT_URL}';
        var CODEC      = '${codec}';
        var MIME_TYPE  = 'video/mp4; codecs="' + CODEC + '"';

        // ── Helpers ───────────────────────────────────────────────────────
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
            // ✅ FIX: length: 128, not 64 — Chrome requires symmetric counter width
            { name: 'AES-CTR', counter: ivBytes, length: 128 }, ck, encBytes
        ));
        }

        // Hybrid decrypt: RSA unwraps AES session key, AES-GCM decrypts payload
        async function hybridDecrypt(privateKey, payload) {
            // 1. RSA-OAEP unwrap the session key
            var wrappedKey = base64ToBytes(payload.wrappedKey);
            var sessionKey = await crypto.subtle.decrypt(
                { name: 'RSA-OAEP' }, privateKey, wrappedKey
            );
            // 2. AES-256-GCM decrypt the payload
            var aesKey = await crypto.subtle.importKey(
                'raw', sessionKey, { name: 'AES-GCM' }, false, ['decrypt']
            );
            var iv         = base64ToBytes(payload.iv);
            var ciphertext = base64ToBytes(payload.ciphertext);
            var tag        = base64ToBytes(payload.tag);
            // Concatenate ciphertext + tag (WebCrypto AES-GCM expects them together)
            var combined = new Uint8Array(ciphertext.length + tag.length);
            combined.set(ciphertext, 0);
            combined.set(tag, ciphertext.length);
            var plain = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv, tagLength: 128 }, aesKey, combined
            );
            return new TextDecoder().decode(plain);
        }

        function appendBuffer(sb, chunk) {
            return new Promise(function(resolve, reject) {
                function onDone() { sb.removeEventListener('error', onErr); resolve(); }
                function onErr()  {
                    sb.removeEventListener('updateend', onDone);
                    reject(new Error('SourceBuffer error, code: ' + (sb.error ? sb.error.code : 'null — likely codec rejected by browser. Codec: ' + MIME_TYPE)));
                }
                sb.addEventListener('updateend', onDone, { once: true });
                sb.addEventListener('error',     onErr,  { once: true });
                sb.appendBuffer(chunk);
            });
        }

        // ── Main ──────────────────────────────────────────────────────────
        document.getElementById('start-btn').addEventListener('click', async function() {
            this.disabled = true;
            var msgEl   = document.getElementById('msg');
            var debugEl = document.getElementById('debug');
            var player  = document.getElementById('player');

            function step(n, t) {
                console.log(n, t);
                debugEl.textContent = 'Step ' + n + ': ' + t;
            }

            try {
                // Step 1: Generate one-time RSA keypair (never leaves this tab)
                step(1, 'Generating session keypair...');
                var rsaKeyPair = await crypto.subtle.generateKey(
                    {
                        name: 'RSA-OAEP',
                        modulusLength: 2048,
                        publicExponent: new Uint8Array([1, 0, 1]),
                        hash: 'SHA-256'
                    },
                    false,   // private key: NOT extractable
                    ['decrypt']
                );

                // Export public key as base64 to send to vault
                var pubKeyDer    = await crypto.subtle.exportKey('spki', rsaKeyPair.publicKey);
                var pubKeyB64    = bytesToBase64(new Uint8Array(pubKeyDer));

                // Step 2: Vault handshake — send public key, receive RSA-encrypted payload
                step(2, 'Secure handshake with vault...');
                msgEl.innerHTML = "Verifying Domain Authority... <span class='spinner'></span>";

                var res = await fetch(
                    VAULT_URL + '/api/unlock?assetID=' + ASSET_ID,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ publicKey: pubKeyB64 })
                    }
                );
                if (!res.ok) throw new Error('Vault denied: ' + res.status + ' ' + res.statusText);

                var payload = await res.json();
                if (!payload.wrappedKey || !payload.ciphertext)
                    throw new Error('Vault did not return encrypted payload');

                // Step 3: Hybrid-decrypt payload — RSA unwraps session key, AES-GCM decrypts body
                step(3, 'Decrypting vault payload (RSA+AES-GCM)...');
                var authJson = await hybridDecrypt(rsaKeyPair.privateKey, payload);
                var auth     = JSON.parse(authJson);

                if (!auth.brain || !auth.key || !auth.kid)
                    throw new Error('Incomplete auth data after decryption');

                console.log('Auth decrypted — brain:', auth.brain.length, 'chars');

                // Step 4: Decrypt brick with AES-CTR
                step(4, 'Decrypting media with AES-CTR...');
                var keyBytes     = hexToBytes(auth.key);
                var kidBytes     = hexToBytes(auth.kid);
                var brainBytes   = base64ToBytes(auth.brain);
                var encBrick     = base64ToBytes(BRICK_B64);
                var brickBytes   = await decryptAesCtr(encBrick, keyBytes, kidBytes);
                console.log('Brain:', brainBytes.length, 'bytes | Brick:', brickBytes.length, 'bytes');

                // Step 5: Validate codec before touching MediaSource
                step(5, 'Validating codec: ' + MIME_TYPE);
                if (!MediaSource.isTypeSupported(MIME_TYPE)) {
                    throw new Error('Codec not supported by this browser: ' + MIME_TYPE);
                }
                console.log('Codec accepted by browser:', MIME_TYPE);

                // Step 6: Init MediaSource + SourceBuffer
                step(6, 'Initializing MediaSource...');
                var ms = new MediaSource();
                player.src = URL.createObjectURL(ms);
                await new Promise(function(res, rej) {
                    ms.addEventListener('sourceopen', res, { once: true });
                    ms.addEventListener('error',      rej, { once: true });
                });

                var sb = ms.addSourceBuffer(MIME_TYPE);
                // DON'T set sb.mode here — let Chrome use its default for this mime type.
                // Setting 'segments' mode immediately after addSourceBuffer can throw in Chrome
                // before the buffer is ready, causing the first appendBuffer to fail silently.
                console.log('SourceBuffer created, mode:', sb.mode);

                // Step 7: Append brain (init segment = ftyp + moov)
                step(7, 'Appending init segment...');
                // Wait for SourceBuffer to be ready before appending
                await new Promise(function(r) { setTimeout(r, 0); });
                await appendBuffer(sb, brainBytes);
                console.log('Brain appended OK');

                // Step 7: Append brain (init segment = ftyp + moov)
                step(7, 'Appending init segment...');
                await appendBuffer(sb, brainBytes);
                console.log('Brain appended OK');

                // Step 8: Stream brick in 512 KB chunks (moof + mdat pairs)
                step(8, 'Streaming media...');
                var CHUNK = 512 * 1024;
                for (var i = 0; i < brickBytes.length; i += CHUNK) {
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