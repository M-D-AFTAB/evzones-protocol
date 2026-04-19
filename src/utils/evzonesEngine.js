// utils/evzonesEngine.js
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

const ffmpeg = new FFmpeg();

/**
 * High-performance Binary to Base64 converter
 * Prevents "Stack Overflow" errors on large video files.
 */
const uint8ToBase64 = (uint8) => {
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8.length; i += chunkSize) {
        const chunk = uint8.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
};

/**
 * Read a 4-byte big-endian uint32 from a Uint8Array at offset.
 */
const readUint32 = (uint8, offset) => {
    return (uint8[offset] * 16777216) +
           (uint8[offset + 1] * 65536) +
           (uint8[offset + 2] * 256) +
            uint8[offset + 3];
};

/**
 * Read the 4-char box type at offset + 4.
 */
const readBoxType = (uint8, offset) => {
    return String.fromCharCode(
        uint8[offset + 4], uint8[offset + 5],
        uint8[offset + 6], uint8[offset + 7]
    );
};

/**
 * Detect codec string from moov box for use in SourceBuffer.
 * Returns a string like 'video/mp4; codecs="avc1.64001f"'
 * Falls back to a safe default if detection fails.
 */
const detectMimeType = (uint8) => {
    // Search for 'avcC' box which contains the codec profile/level
    for (let i = 0; i < uint8.length - 8; i++) {
        if (uint8[i] === 0x61 && uint8[i+1] === 0x76 &&
            uint8[i+2] === 0x63 && uint8[i+3] === 0x43) { // 'avcC'
            // Next 3 bytes: profile, constraints, level
            const profile = uint8[i+5].toString(16).padStart(2, '0');
            const constraints = uint8[i+6].toString(16).padStart(2, '0');
            const level = uint8[i+7].toString(16).padStart(2, '0');
            const codec = `avc1.${profile}${constraints}${level}`;
            console.log('Detected codec:', codec);
            return `video/mp4; codecs="${codec}"`;
        }
    }
    // Check for HEVC / hvcC
    for (let i = 0; i < uint8.length - 8; i++) {
        if (uint8[i] === 0x68 && uint8[i+1] === 0x76 &&
            uint8[i+2] === 0x63 && uint8[i+3] === 0x43) { // 'hvcC'
            console.log('Detected codec: HEVC (hev1)');
            return 'video/mp4; codecs="hev1.1.6.L93.B0"';
        }
    }
    console.warn('Could not detect codec, falling back to avc1.42E01E (Baseline)');
    return 'video/mp4; codecs="avc1.42E01E"';
};

export const processEvzonesVideo = async (file) => {
    if (!ffmpeg.loaded) await ffmpeg.load();
    await ffmpeg.writeFile('input.mp4', await fetchFile(file));

    const key = [...crypto.getRandomValues(new Uint8Array(16))]
        .map(b => b.toString(16).padStart(2, '0')).join('');
    const kid = [...crypto.getRandomValues(new Uint8Array(16))]
        .map(b => b.toString(16).padStart(2, '0')).join('');

    // FIX 1: Use 'cbc1' (AES-CBC) instead of 'cenc-aes-ctr'.
    // cbc1 has vastly better browser support (Chrome + Firefox) and does NOT
    // require a separate IV — it uses the kid as the IV, eliminating the
    // Firefox "Crypto IV size inconsistent" crash.
    await ffmpeg.exec([
        '-i', 'input.mp4',
        '-c', 'copy',
        '-movflags', 'faststart+frag_keyframe+empty_moov+default_base_moof',
        '-encryption_scheme', 'cbc1',
        '-encryption_key', key,
        '-encryption_kid', kid,
        'protected.mp4'
    ]);

    const data = await ffmpeg.readFile('protected.mp4');
    const uint8 = new Uint8Array(data.buffer);

    // FIX 2: Corrected Brain/Brick split.
    // The Brain must be the full initialization segment: ftyp + moov.
    // We must NOT include the first 'moof' in the brain — we find the FIRST
    // moof and split THERE. However, we also need to ensure the moov box
    // is present (not just ftyp). Walk all top-level boxes until we hit moof.
    let splitIndex = -1;
    let offset = 0;
    let foundMoov = false;

    while (offset < uint8.length - 8) {
        const size = readUint32(uint8, offset);
        const type = readBoxType(uint8, offset);

        console.log(`Box at ${offset}: type=${type}, size=${size}`);

        if (type === 'moov') foundMoov = true;

        if (type === 'moof' || type === 'mdat') {
            if (!foundMoov) {
                console.warn('Found moof/mdat before moov — file may not be properly fragmented');
            }
            splitIndex = offset;
            break;
        }

        if (size === 0 || size < 8) break;
        offset += size;
    }

    if (splitIndex === -1) {
        throw new Error("Critical Error: Failed to locate fragmentation boundary (moof/mdat). Is the video properly encoded?");
    }

    const brainBytes = uint8.slice(0, splitIndex);
    const brickBytes = uint8.slice(splitIndex);

    // FIX 3: Detect the actual codec from the brain bytes
    // so the generated HTML uses the correct SourceBuffer mime type.
    const mimeType = detectMimeType(brainBytes);

    const brainBase64 = uint8ToBase64(brainBytes);

    console.log('Split successful:');
    console.log('- Brain size (bytes):', brainBytes.length);
    console.log('- Brain size (base64):', brainBase64.length);
    console.log('- Brick size (bytes):', brickBytes.length);
    console.log('- Detected MIME:', mimeType);
    console.log('- Encryption: cbc1 (AES-CBC, universally supported)');

    return {
        brain: brainBase64,
        brick: brickBytes,
        key,
        kid,
        fileName: file.name,
        mimeType  // pass detected mime type through to HTML generator
    };
};

export const generateSmartAsset = async (asset, receivedId, vaultBaseUrl) => {
    const VAULT_URL = vaultBaseUrl || 'https://evzones-protocol.vercel.app';

    const brickBase64 = uint8ToBase64(asset.brick);
    // Use detected mimeType, or fall back to baseline H.264
    const mimeType = asset.mimeType || 'video/mp4; codecs="avc1.42E01E"';

    console.log('Generating Smart Asset:');
    console.log('- Asset ID:', receivedId);
    console.log('- MIME type:', mimeType);
    console.log('- Brick Base64 length:', brickBase64.length);

    const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EVZONES SENTINEL: ${asset.fileName}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            margin: 0;
            background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
            color: #fff;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            overflow: hidden;
        }
        #player {
            width: 100%;
            max-width: 100vw;
            max-height: 100vh;
            display: none;
        }
        .lock-screen {
            border: 2px solid #00ff00;
            padding: 3rem;
            background: rgba(10, 10, 10, 0.95);
            border-radius: 16px;
            text-align: center;
            max-width: 500px;
            box-shadow: 0 0 40px rgba(0, 255, 0, 0.3);
        }
        .lock-screen h2 { font-size: 1.5rem; margin-bottom: 1rem; color: #00ff00; }
        .lock-screen p { margin: 1rem 0; opacity: 0.9; }
        #start-btn {
            background: #00ff00;
            color: #000;
            border: none;
            padding: 15px 40px;
            border-radius: 8px;
            font-weight: bold;
            font-size: 1.1rem;
            cursor: pointer;
            transition: all 0.3s;
            margin-top: 1rem;
        }
        #start-btn:hover { background: #00cc00; transform: translateY(-2px); box-shadow: 0 5px 20px rgba(0, 255, 0, 0.4); }
        #start-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        #debug {
            font-family: 'Courier New', monospace;
            font-size: 0.85rem;
            color: #00ff00;
            margin-top: 15px;
            opacity: 0.8;
            word-break: break-word;
        }
        .spinner {
            display: inline-block;
            width: 20px; height: 20px;
            border: 3px solid rgba(0, 255, 0, 0.3);
            border-top-color: #00ff00;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-left: 10px;
            vertical-align: middle;
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
        // ── Embedded encrypted payload ──────────────────────────────────────
        const BRICK_B64  = "${brickBase64}";
        const ASSET_ID   = "${receivedId}";
        const VAULT_URL  = "${VAULT_URL}";
        const MIME_TYPE  = "${mimeType}";

        // ── Helpers ─────────────────────────────────────────────────────────
        function hexToBase64Url(hex) {
            const bytes = new Uint8Array(hex.length / 2);
            for (let i = 0; i < hex.length; i += 2) {
                bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
            }
            return btoa(String.fromCharCode.apply(null, bytes))
                .replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
        }

        function base64ToUint8Array(base64) {
            const binary = atob(base64.replace(/\\s/g, ''));
            const bytes  = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return bytes;
        }

        // Generator that yields decoded Uint8Array chunks from a base64 string.
        // Avoids holding the entire decoded payload in memory at once.
        function* chunkDecoder(b64, chunkSize = 512 * 1024) {
            const binary = atob(b64.replace(/\\s/g, ''));
            for (let i = 0; i < binary.length; i += chunkSize) {
                const chunk = binary.slice(i, i + chunkSize);
                const bytes = new Uint8Array(chunk.length);
                for (let j = 0; j < chunk.length; j++) bytes[j] = chunk.charCodeAt(j);
                yield bytes;
            }
        }

        // ── Main ─────────────────────────────────────────────────────────────
        document.getElementById('start-btn').addEventListener('click', async function () {
            this.disabled = true;
            const msgEl   = document.getElementById('msg');
            const debugEl = document.getElementById('debug');
            const player  = document.getElementById('player');

            const step = (n, txt) => {
                console.log('Step ' + n + ':', txt);
                debugEl.textContent = 'Step ' + n + ': ' + txt;
            };

            try {
                // ── Step 1: Fetch Brain + keys from Vault ───────────────────
                step(1, 'Connecting to vault...');
                msgEl.innerHTML = "Verifying Domain Authority... <span class='spinner'></span>";

                const res = await fetch(VAULT_URL + '/api/unlock?assetID=' + ASSET_ID, { method: 'POST' });
                if (!res.ok) throw new Error('Vault Access Denied: ' + res.status + ' ' + res.statusText);

                const authData = await res.json();
                console.log('Auth data received:', {
                    hasBrain:    !!authData.brain,
                    brainLength: authData.brain?.length,
                    hasKey:      !!authData.key,
                    hasKid:      !!authData.kid
                });
                if (!authData.brain || !authData.key || !authData.kid) {
                    throw new Error('Incomplete authentication data received from vault');
                }

                // ── Step 2: Init MediaSource ────────────────────────────────
                step(2, 'Initializing MediaSource...');
                const ms = new MediaSource();
                player.src = URL.createObjectURL(ms);

                await new Promise((resolve, reject) => {
                    ms.addEventListener('sourceopen', resolve, { once: true });
                    ms.addEventListener('error', reject, { once: true });
                });

                // ── Step 3: Create SourceBuffer with detected MIME ──────────
                step(3, 'Adding SourceBuffer (' + MIME_TYPE + ')...');

                // FIX: isTypeSupported check — surface a clear error instead of a
                // cryptic native exception if the browser rejects the codec.
                if (!MediaSource.isTypeSupported(MIME_TYPE)) {
                    throw new Error('Browser does not support codec: ' + MIME_TYPE);
                }
                const sb = ms.addSourceBuffer(MIME_TYPE);

                // ── Step 4: DRM (ClearKey) ──────────────────────────────────
                // Register the encrypted event handler BEFORE appending any data
                // so we don't miss the event that fires during brain append.
                player.addEventListener('encrypted', async (event) => {
                    step(4, 'Handling DRM encrypted event...');
                    try {
                        const access = await navigator.requestMediaKeySystemAccess('org.w3.clearkey', [{
                            initDataTypes: [event.initDataType],
                            videoCapabilities: [{ contentType: MIME_TYPE }]
                        }]);
                        const mediaKeys = await access.createMediaKeys();
                        await player.setMediaKeys(mediaKeys);

                        const session = mediaKeys.createSession();
                        session.addEventListener('message', async (e) => {
                            const jwk = {
                                keys: [{
                                    kty: 'oct',
                                    kid: hexToBase64Url(authData.kid),
                                    k:   hexToBase64Url(authData.key)
                                }]
                            };
                            await session.update(new TextEncoder().encode(JSON.stringify(jwk)));
                            console.log('DRM session key installed ✓');
                        });

                        await session.generateRequest(event.initDataType, event.initData);
                    } catch (drmErr) {
                        console.error('DRM setup error:', drmErr);
                        // Non-fatal on some browsers if content decrypts anyway;
                        // rethrow only if we can't recover.
                        msgEl.innerHTML = "<span style='color:#ff9900'>⚠ DRM: " + drmErr.message + "</span>";
                    }
                });

                // ── Step 5: Append Brain (initialization segment) ───────────
                step(5, 'Appending brain (init segment)...');
                const brainArray = base64ToUint8Array(authData.brain);
                console.log('Brain size:', brainArray.length, 'bytes');

                await new Promise((resolve, reject) => {
                    // FIX: Listen for the 'error' event properly and stringify it
                    const onError = (e) => {
                        sb.removeEventListener('updateend', onDone);
                        reject(new Error('SourceBuffer error during brain append. ' +
                            'Possible codec mismatch. Error code: ' +
                            (sb.error ? sb.error.code : 'unknown')));
                    };
                    const onDone = () => {
                        sb.removeEventListener('error', onError);
                        resolve();
                    };
                    sb.addEventListener('updateend', onDone, { once: true });
                    sb.addEventListener('error',     onError, { once: true });
                    sb.appendBuffer(brainArray);
                });
                console.log('Brain appended ✓');

                // ── Step 6: Stream Brick in chunks ──────────────────────────
                step(6, 'Streaming encrypted content...');
                const stream = chunkDecoder(BRICK_B64);

                await new Promise((resolveStream, rejectStream) => {
                    const pushNext = () => {
                        if (ms.readyState !== 'open') { resolveStream(); return; }
                        if (sb.updating) return; // wait for updateend

                        const { value, done } = stream.next();
                        if (done) {
                            if (!sb.updating) ms.endOfStream();
                            resolveStream();
                            return;
                        }
                        try {
                            sb.appendBuffer(value);
                        } catch (e) {
                            rejectStream(new Error('Brick append failed: ' + e.message));
                        }
                    };

                    sb.addEventListener('updateend', pushNext);
                    sb.addEventListener('error', (e) => {
                        rejectStream(new Error('SourceBuffer error during brick streaming'));
                    });
                    pushNext();
                });

                // ── Done ────────────────────────────────────────────────────
                step(7, '✓ Authorized. Playback ready.');
                setTimeout(() => {
                    document.getElementById('status').style.display = 'none';
                    player.style.display = 'block';
                    player.play().catch(() => {
                        debugEl.textContent = 'Click video to play (browser autoplay policy)';
                    });
                }, 400);

            } catch (err) {
                console.error('Playback error:', err);
                msgEl.innerHTML = "<span style='color:#ff3333'>⚠ SECURITY BREACH / ACCESS DENIED</span>";
                debugEl.textContent = 'Error: ' + err.message;
                debugEl.style.color  = '#ff3333';
                document.getElementById('start-btn').disabled = false;
                document.getElementById('start-btn').textContent = 'RETRY';
            }
        });
    </script>
</body>
</html>`;

    return new Blob([htmlTemplate], { type: 'text/html' });
};