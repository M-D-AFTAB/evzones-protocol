// utils/evzonesEngine.js
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

const ffmpeg = new FFmpeg();

// ─── Helpers ────────────────────────────────────────────────────────────────

const uint8ToBase64 = (uint8) => {
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, uint8.subarray(i, i + chunkSize));
    }
    return btoa(binary);
};

const readUint32 = (u8, o) =>
    (u8[o] * 16777216) + (u8[o+1] * 65536) + (u8[o+2] * 256) + u8[o+3];

const readBoxType = (u8, o) =>
    String.fromCharCode(u8[o+4], u8[o+5], u8[o+6], u8[o+7]);

/**
 * Detect the correct SourceBuffer MIME + codec string by reading the avcC box.
 */
const detectMimeType = (uint8) => {
    for (let i = 0; i < uint8.length - 10; i++) {
        if (uint8[i]===0x61 && uint8[i+1]===0x76 && uint8[i+2]===0x63 && uint8[i+3]===0x43) {
            const profile     = uint8[i+5].toString(16).padStart(2,'0');
            const constraints = uint8[i+6].toString(16).padStart(2,'0');
            const level       = uint8[i+7].toString(16).padStart(2,'0');
            const codec = `avc1.${profile}${constraints}${level}`;
            console.log('[Engine] Detected codec:', codec);
            return `video/mp4; codecs="${codec}"`;
        }
        if (uint8[i]===0x68 && uint8[i+1]===0x76 && uint8[i+2]===0x63 && uint8[i+3]===0x43) {
            console.log('[Engine] Detected codec: HEVC');
            return 'video/mp4; codecs="hev1.1.6.L93.B0"';
        }
    }
    console.warn('[Engine] Could not detect codec, using safe fallback');
    return 'video/mp4; codecs="avc1.42E01E"';
};

/**
 * Split a fragmented MP4 into:
 *   brainBytes = ftyp + moov  (initialization segment)
 *   brickBytes = moof + mdat … (all media fragments)
 */
const splitFragmentedMp4 = (uint8) => {
    let offset = 0;
    let splitIndex = -1;
    let foundMoov = false;
    const log = [];

    while (offset < uint8.length - 8) {
        const size = readUint32(uint8, offset);
        const type = readBoxType(uint8, offset);
        log.push(`  offset=${offset} type=${type} size=${size}`);

        if (type === 'moov') foundMoov = true;

        if (type === 'moof' || type === 'mdat') {
            splitIndex = offset;
            break;
        }
        if (size < 8) break;
        offset += size;
    }

    console.log('[Engine] Box walk:\n' + log.join('\n'));

    if (splitIndex === -1) {
        throw new Error(
            'Failed to locate moof/mdat boundary. ' +
            (foundMoov
                ? 'moov found but no moof — video may not be fragmented correctly.'
                : 'moov not found — FFmpeg output may be corrupt or unsupported format.')
        );
    }

    return {
        brainBytes: uint8.slice(0, splitIndex),
        brickBytes: uint8.slice(splitIndex),
    };
};

// ─── WebCrypto AES-CTR Encryption ───────────────────────────────────────────
// FFmpeg.wasm 0.12.x is NOT compiled with encryption support — its
// -encryption_scheme flag silently produces un-encrypted output that is
// structurally broken (no valid PSSH/tenc boxes), causing the moof/mdat
// boundary walk to fail.
//
// Solution: Use FFmpeg only for fragmentation, then encrypt the brick
// ourselves with WebCrypto AES-CTR. The player decrypts with the same
// key+kid fetched from the vault — no EME/DRM stack required.

const encryptBytes = async (plain, keyBytes, ivBytes) => {
    const cryptoKey = await crypto.subtle.importKey(
        'raw', keyBytes, { name: 'AES-CTR' }, false, ['encrypt']
    );
    const result = await crypto.subtle.encrypt(
        { name: 'AES-CTR', counter: ivBytes, length: 64 },
        cryptoKey, plain
    );
    return new Uint8Array(result);
};

// ─── Public API ─────────────────────────────────────────────────────────────

export const processEvzonesVideo = async (file) => {
    if (!ffmpeg.loaded) await ffmpeg.load();

    console.log('[Engine] Writing input file...');
    await ffmpeg.writeFile('input.mp4', await fetchFile(file));

    // Step 1: Fragment with FFmpeg (no encryption flags — not supported in wasm build)
    console.log('[Engine] Fragmenting video...');
    await ffmpeg.exec([
        '-i', 'input.mp4',
        '-c', 'copy',
        '-movflags', 'faststart+frag_keyframe+empty_moov+default_base_moof',
        'fragmented.mp4'
    ]);

    const data  = await ffmpeg.readFile('fragmented.mp4');
    const uint8 = new Uint8Array(data.buffer);
    console.log('[Engine] FFmpeg output size:', uint8.length, 'bytes');

    // Step 2: Split Brain / Brick
    const { brainBytes, brickBytes } = splitFragmentedMp4(uint8);
    const mimeType = detectMimeType(brainBytes);

    // Step 3: Generate random key + kid, encrypt brick
    const keyBytes = crypto.getRandomValues(new Uint8Array(16));
    const kidBytes = crypto.getRandomValues(new Uint8Array(16));
    const key = [...keyBytes].map(b => b.toString(16).padStart(2,'0')).join('');
    const kid = [...kidBytes].map(b => b.toString(16).padStart(2,'0')).join('');

    console.log('[Engine] Encrypting brick with WebCrypto AES-CTR...');
    const encryptedBrick = await encryptBytes(brickBytes, keyBytes, kidBytes);

    const brainBase64 = uint8ToBase64(brainBytes);

    console.log('[Engine] Brain (bytes):', brainBytes.length, '| Brain (base64):', brainBase64.length);
    console.log('[Engine] Brick (plain):', brickBytes.length, '| Brick (encrypted):', encryptedBrick.length);
    console.log('[Engine] MIME:', mimeType);

    return {
        brain:    brainBase64,       // base64 string → sent to vault
        brick:    encryptedBrick,    // Uint8Array   → embedded in HTML
        key,
        kid,
        fileName: file.name,
        mimeType
    };
};

export const generateSmartAsset = async (asset, receivedId, vaultBaseUrl) => {
    const VAULT_URL = vaultBaseUrl || 'https://evzones-protocol.vercel.app';
    const mimeType  = asset.mimeType || 'video/mp4; codecs="avc1.42E01E"';

    const brickBase64 = uint8ToBase64(asset.brick);

    console.log('[Engine] Generating Smart Asset:', receivedId);
    console.log('[Engine] MIME:', mimeType, '| Brick B64:', brickBase64.length);

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
    <div id="status" class="lock-screen">
        <h2>🛡️ EVZONES PROTOCOL ACTIVE</h2>
        <p id="msg">Handshake Ready. Secure Connection Established.</p>
        <button id="start-btn">INITIALIZE DECRYPTION</button>
        <p id="debug"></p>
    </div>
    <video id="player" controls controlsList="nodownload" playsinline></video>

    <script>
        const BRICK_B64 = "${brickBase64}";
        const ASSET_ID  = "${receivedId}";
        const VAULT_URL = "${VAULT_URL}";
        const MIME_TYPE = "${mimeType}";

        function hexToBytes(hex) {
            const b = new Uint8Array(hex.length / 2);
            for (let i = 0; i < hex.length; i += 2)
                b[i/2] = parseInt(hex.substring(i, i+2), 16);
            return b;
        }

        function base64ToBytes(b64) {
            const bin = atob(b64.replace(/\\s/g,''));
            const out = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
            return out;
        }

        async function decryptAesCtr(encBytes, keyBytes, ivBytes) {
            const ck = await crypto.subtle.importKey(
                'raw', keyBytes, { name: 'AES-CTR' }, false, ['decrypt']
            );
            return new Uint8Array(await crypto.subtle.decrypt(
                { name: 'AES-CTR', counter: ivBytes, length: 64 },
                ck, encBytes
            ));
        }

        function appendBuffer(sb, chunk) {
            return new Promise((resolve, reject) => {
                const onDone = () => { sb.removeEventListener('error', onErr); resolve(); };
                const onErr  = () => {
                    sb.removeEventListener('updateend', onDone);
                    reject(new Error('SourceBuffer error, code: ' + (sb.error ? sb.error.code : '?')));
                };
                sb.addEventListener('updateend', onDone, { once: true });
                sb.addEventListener('error',     onErr,  { once: true });
                sb.appendBuffer(chunk);
            });
        }

        document.getElementById('start-btn').addEventListener('click', async function () {
            this.disabled = true;
            const msgEl   = document.getElementById('msg');
            const debugEl = document.getElementById('debug');
            const player  = document.getElementById('player');
            const step = (n, t) => { debugEl.textContent = 'Step ' + n + ': ' + t; console.log(n, t); };

            try {
                step(1, 'Connecting to vault...');
                msgEl.innerHTML = "Verifying Domain Authority... <span class='spinner'></span>";

                const res = await fetch(VAULT_URL + '/api/unlock?assetID=' + ASSET_ID, { method: 'POST' });
                if (!res.ok) throw new Error('Vault denied: ' + res.status);
                const auth = await res.json();
                if (!auth.brain || !auth.key || !auth.kid)
                    throw new Error('Incomplete auth data from vault');

                step(2, 'Decrypting content with WebCrypto...');
                const keyBytes = hexToBytes(auth.key);
                const kidBytes = hexToBytes(auth.kid);
                const brainBytes     = base64ToBytes(auth.brain);
                const encryptedBrick = base64ToBytes(BRICK_B64);
                const brickBytes     = await decryptAesCtr(encryptedBrick, keyBytes, kidBytes);
                console.log('Brain:', brainBytes.length, 'bytes | Brick:', brickBytes.length, 'bytes');

                step(3, 'Setting up MediaSource...');
                if (!MediaSource.isTypeSupported(MIME_TYPE))
                    throw new Error('Codec not supported: ' + MIME_TYPE);

                const ms = new MediaSource();
                player.src = URL.createObjectURL(ms);
                await new Promise((res, rej) => {
                    ms.addEventListener('sourceopen', res, { once: true });
                    ms.addEventListener('error',      rej, { once: true });
                });

                const sb = ms.addSourceBuffer(MIME_TYPE);

                step(4, 'Appending initialization segment...');
                await appendBuffer(sb, brainBytes);

                step(5, 'Streaming media fragments...');
                const CHUNK = 512 * 1024;
                for (let i = 0; i < brickBytes.length; i += CHUNK) {
                    if (ms.readyState !== 'open') break;
                    await appendBuffer(sb, brickBytes.slice(i, i + CHUNK));
                }
                if (ms.readyState === 'open') ms.endOfStream();

                step(6, '✓ Authorized. Starting playback...');
                setTimeout(() => {
                    document.getElementById('status').style.display = 'none';
                    player.style.display = 'block';
                    player.play().catch(() => {
                        debugEl.textContent = 'Click video to play (autoplay policy)';
                    });
                }, 300);

            } catch (err) {
                console.error('Playback error:', err);
                msgEl.innerHTML = "<span style='color:#ff3333'>⚠ ACCESS DENIED</span>";
                debugEl.textContent = 'Error: ' + err.message;
                debugEl.style.color = '#ff3333';
                document.getElementById('start-btn').disabled = false;
                document.getElementById('start-btn').textContent = 'RETRY';
            }
        });
    </script>
</body>
</html>`;

    return new Blob([htmlTemplate], { type: 'text/html' });
};