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

export const processEvzonesVideo = async (file) => {
    if (!ffmpeg.loaded) await ffmpeg.load();
    await ffmpeg.writeFile('input.mp4', await fetchFile(file));

    const key = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
    const kid = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');

    await ffmpeg.exec([
        '-i', 'input.mp4',
        '-c', 'copy',
        // default_base_moof is critical for Firefox stability
        '-movflags', 'faststart+frag_keyframe+empty_moov+default_base_moof',
        '-encryption_scheme', 'cenc-aes-ctr',
        '-encryption_key', key,
        '-encryption_kid', kid,
        'protected.mp4'
    ]);

    const data = await ffmpeg.readFile('protected.mp4');
    const uint8 = new Uint8Array(data.buffer);

    let splitIndex = -1;
    let offset = 0;

    // Mathematical Box Walker: Locates the first 'moof' or 'mdat' atom
    while (offset < uint8.length) {
        const size = (uint8[offset] * 16777216) + (uint8[offset + 1] * 65536) + (uint8[offset + 2] * 256) + uint8[offset + 3];
        const type = String.fromCharCode(uint8[offset + 4], uint8[offset + 5], uint8[offset + 6], uint8[offset + 7]);

        if (type === 'moof' || type === 'mdat') {
            splitIndex = offset;
            break;
        }
        if (size === 0 || size < 8) break;
        offset += size;
    }

    if (splitIndex === -1) throw new Error("Critical Error: Failed to locate fragmentation boundary.");

    // STEP 2 CORRECTION: Return clean Base64 string for Brain and raw Bytes for Brick
    const brainBytes = uint8.slice(0, splitIndex);
    const brainBase64 = uint8ToBase64(brainBytes);

    return { 
        brain: brainBase64, 
        brick: uint8.slice(splitIndex), 
        key, 
        kid, 
        fileName: file.name 
    };
};

export const generateSmartAsset = async (asset, receivedId, vaultBaseUrl) => {
    const VAULT_URL = vaultBaseUrl || 'https://evzones-protocol.vercel.app';
    
    // Convert the raw brick bytes to a clean Base64 string for injection
    const brickBase64 = uint8ToBase64(asset.brick);

    const htmlTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>EVZONES SENTINEL: ${asset.fileName}</title>
    <style>
        body { margin: 0; background: #000; color: #fff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; overflow: hidden; }
        #player { width: 100%; max-height: 100vh; display: none; }
        .lock-screen { border: 1px solid #00ff00; padding: 2rem; background: #0a0a0a; border-radius: 12px; text-align: center; }
        #debug { font-family: monospace; font-size: 0.8rem; color: #00ff00; margin-top: 10px; opacity: 0.7; }
        #start-btn:hover { background: #00cc00 !important; }
    </style>
</head>
<body>
    <div id="status" class="lock-screen">
        <h2>🛡️ EVZONES PROTOCOL ACTIVE</h2>
        <p id="msg">Handshake Ready. Secure Connection Established.</p>
        <button id="start-btn" style="background:#00ff00; color:#000; border:none; padding:15px 30px; border-radius:5px; font-weight:bold; cursor:pointer; transition: 0.2s;">
            INITIALIZE DECRYPTION
        </button>
        <p id="debug" class="error-details"></p>
    </div>

    <video id="player" controls controlsList="nodownload" playsinline></video>

    <script>
        const BRICK_B64 = "${brickBase64}";
        const ASSET_ID = "${receivedId}";
        const VAULT_URL = "${VAULT_URL}";

        function hexToBase64Url(hex) {
            const bytes = new Uint8Array(hex.length / 2);
            for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
            return btoa(String.fromCharCode.apply(null, bytes)).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
        }

        // STEP 4 CORRECTION: Hardened Chunk Decoder
        function* chunkDecoder(b64, chunkSize = 1024 * 1024) {
            const cleanB64 = b64.replace(/\\s/g, ''); // Remove any potential whitespace
            const binary = atob(cleanB64); 
            
            for (let i = 0; i < binary.length; i += chunkSize) {
                const chunk = binary.slice(i, i + chunkSize);
                const bytes = new Uint8Array(chunk.length);
                for (let j = 0; j < chunk.length; j++) bytes[j] = chunk.charCodeAt(j);
                yield bytes;
            }
        }

        document.getElementById('start-btn').addEventListener('click', async function() {
            this.style.display = 'none';
            document.getElementById('msg').textContent = "Verifying Domain Authority...";
            
            const player = document.getElementById('player');
            const debug = document.getElementById('debug');

            try {
                // 1. Handshake
                const res = await fetch(VAULT_URL + "/api/unlock?assetID=" + ASSET_ID, { method: 'POST' });
                if (!res.ok) throw new Error("Vault Access Denied: " + res.status);
                const authData = await res.json();
                
                // 2. Init MediaSource
                const ms = new MediaSource();
                player.src = URL.createObjectURL(ms);
                
                ms.addEventListener('sourceopen', async () => {
                    const sb = ms.addSourceBuffer('video/mp4; codecs="avc1.4d401f"');
                    
                    // 3. DRM Setup
                    player.addEventListener('encrypted', async (event) => {
                        const access = await navigator.requestMediaKeySystemAccess('org.w3.clearkey', [{
                            initDataTypes: [event.initDataType],
                            videoCapabilities: [{ contentType: 'video/mp4' }]
                        }]);
                        const keys = await access.createMediaKeys();
                        await player.setMediaKeys(keys);
                        const session = keys.createSession();
                        session.addEventListener('message', async (e) => {
                            const jwk = { keys: [{ kty: 'oct', kid: hexToBase64Url(authData.kid), k: hexToBase64Url(authData.key) }] };
                            await session.update(new TextEncoder().encode(JSON.stringify(jwk)));
                        });
                        await session.generateRequest(event.initDataType, event.initData);
                    });

                    // 4. STEP 4 CORRECTION: Reconstruct Brain Binary
                    try {
                        const brainBinary = atob(authData.brain.replace(/[^A-Za-z0-9+/=]/g, ""));
                        const brainArray = new Uint8Array(brainBinary.length);
                        for(let i = 0; i < brainBinary.length; i++) brainArray[i] = brainBinary.charCodeAt(i);
                        sb.appendBuffer(brainArray);
                    } catch (e) {
                        throw new Error("Handshake Data Corrupted.");
                    }
                    
                    // 5. Stream the Brick
                    const stream = chunkDecoder(BRICK_B64);
                    const pushNext = () => {
                        if (sb.updating || ms.readyState !== 'open') return;
                        const { value, done } = stream.next();
                        if (done) {
                            if (!sb.updating) ms.endOfStream();
                            return;
                        }
                        sb.appendBuffer(value);
                    };
                    
                    sb.addEventListener('updateend', pushNext);
                    pushNext(); 
                    
                    debug.textContent = "Authorized. Playback Starting...";
                    document.getElementById('status').style.display = 'none';
                    player.style.display = 'block';
                    player.play();
                });
                
            } catch (err) {
                document.getElementById('msg').innerHTML = "<span style='color:red'>SECURITY BREACH / ACCESS DENIED</span>";
                debug.textContent = err.message;
            }
        });
    <\/script>
</body>
</html>`;

    return new Blob([htmlTemplate], { type: 'text/html' });
};