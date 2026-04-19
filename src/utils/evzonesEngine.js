// utils/evzonesEngine.js
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

const ffmpeg = new FFmpeg();

const uint8ToBase64 = (uint8) => {
    let binary = '';
    const chunkSize = 8192; // Process in chunks to prevent stack overflow
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

    const brainBytes = uint8.slice(0, splitIndex);
    const brainBase64 = uint8ToBase64(brainBytes);

    return { brain: brainBase64, brick: uint8.slice(splitIndex), key, kid, fileName: file.name };
};

export const generateSmartAsset = async (asset, receivedId, vaultBaseUrl) => {
    const VAULT_URL = vaultBaseUrl || 'https://evzones-protocol.vercel.app';
    const brickBlob = new Blob([asset.brick], { type: 'application/octet-stream' });

    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64Brick = e.target.result.split(',')[1];

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
    </style>
</head>
<body>
    <div id="status" class="lock-screen">
    <h2>🛡️ EVZONES PROTOCOL ACTIVE</h2>
    <p id="msg">Handshake Ready. Secure Connection Established.</p>
    <button id="start-btn" style="background:#00ff00; color:#000; border:none; padding:15px 30px; border-radius:5px; font-weight:bold; cursor:pointer;">
        INITIALIZE DECRYPTION
    </button>
    <p id="debug" class="error-details"></p>
    </div>

    <video id="player" controls controlsList="nodownload" playsinline></video>

    <script>
        const BRICK_B64 = "${base64Brick}";
        const ASSET_ID = "${receivedId}";
        const VAULT_URL = "${VAULT_URL}";

        // Helper: Convert Hex to Base64Url for ClearKey
        function hexToBase64Url(hex) {
            const bytes = new Uint8Array(hex.length / 2);
            for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
            return btoa(String.fromCharCode.apply(null, bytes)).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
        }

            // Replace the chunkDecoder in your template with this:
        function* chunkDecoder(b64, chunkSize = 1024 * 1024) {
            // 1. Strip everything before the first comma (Data-URI prefix)
            let cleanB64 = b64.includes(',') ? b64.split(',')[1] : b64;
            
            // 2. Remove ANY whitespace, newlines, or carriage returns
            cleanB64 = cleanB64.replace(/\s/g, '');

            // 3. Ensure the string length is a multiple of 4 (Base64 requirement)
            while (cleanB64.length % 4 !== 0) {
                cleanB64 += '=';
            }

            try {
                const binary = atob(cleanB64);
                for (let i = 0; i < binary.length; i += chunkSize) {
                    const chunk = binary.slice(i, i + chunkSize);
                    const bytes = new Uint8Array(chunk.length);
                    for (let j = 0; j < chunk.length; j++) {
                        bytes[j] = chunk.charCodeAt(j);
                    }
                    yield bytes;
                }
            } catch (e) {
                console.error("Base64 Decoding Failed:", e);
                throw new Error("The 'Brick' data is corrupted or incorrectly encoded.");
            }
        }

        document.getElementById('start-btn').addEventListener('click', async function() {
        this.style.display = 'none'; // Hide button after click
        document.getElementById('msg').textContent = "Verifying Domain Authority...";
        
        async function initSentinel() {
            const player = document.getElementById('player');
            const debug = document.getElementById('debug');

            try {
                // 1. Handshake with Vault
                const res = await fetch(VAULT_URL + "/api/unlock?assetID=" + ASSET_ID, { method: 'POST' });
                if (!res.ok) throw new Error("Vault Access Denied: " + res.status);
                const authData = await res.json();
                
                // 2. Initialize MediaSource (The "Streaming" Engine)
                const ms = new MediaSource();
                player.src = URL.createObjectURL(ms);
                
                ms.addEventListener('sourceopen', async () => {
                    // Use the specific codec produced by your Ingestion Engine
                    const sb = ms.addSourceBuffer('video/mp4; codecs="avc1.4d401f"');
                    
                    // 3. EME ClearKey Security (Retained from your original logic)
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

                    // 4. Feed the Brain (The Header)
                    try {
                        // Ensure we handle potential stringified objects from Supabase
                        let rawBrain = authData.brain;
                        if (typeof rawBrain !== 'string') {
                            rawBrain = rawBrain.data || JSON.stringify(rawBrain);
                        }

                        // Clean the brain string
                        const cleanBrain = rawBrain.replace(/[^A-Za-z0-9+/=]/g, "");
                        const brainBinary = atob(cleanBrain);
                        
                        const brainArray = new Uint8Array(brainBinary.length);
                        for(let i = 0; i < brainBinary.length; i++) {
                            brainArray[i] = brainBinary.charCodeAt(i);
                        }

                        console.log("Feeding Brain, size:", brainArray.byteLength);
                        sb.appendBuffer(brainArray);
                    } catch (e) {
                        console.error("Brain Error:", e);
                        throw new Error("The 'Brain' (metadata) is invalid.");
                    }
                    
                    // 5. Stream the Brick in Chunks
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
                            pushNext(); // Start streaming first 1MB
                            
                    debug.textContent = "Handshake Success. Playing...";
                    document.getElementById('status').style.display = 'none';
                    player.style.display = 'block';
                    player.play();
                    });
                    
                    } catch (err) {
                        document.getElementById('msg').innerHTML = "<span style='color:red'>SECURITY BREACH / ACCESS DENIED</span>";
                        debug.textContent = err.message;
                        }
                        }
                        
                        initSentinel();
            });
    <\/script>
</body>
</html>`;
            resolve(new Blob([htmlTemplate], { type: 'text/html' }));
        };
        reader.readAsDataURL(brickBlob);
    });
};