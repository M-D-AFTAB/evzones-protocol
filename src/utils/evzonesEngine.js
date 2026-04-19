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

    // Return clean Base64 string for Brain and raw Bytes for Brick
    const brainBytes = uint8.slice(0, splitIndex);
    const brainBase64 = uint8ToBase64(brainBytes);

    console.log('Split successful:');
    console.log('- Brain size (bytes):', brainBytes.length);
    console.log('- Brain size (base64):', brainBase64.length);
    console.log('- Brick size:', uint8.slice(splitIndex).length);

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
    
    console.log('Generating Smart Asset:');
    console.log('- Asset ID:', receivedId);
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
        .lock-screen h2 { 
            font-size: 1.5rem; 
            margin-bottom: 1rem; 
            color: #00ff00; 
        }
        .lock-screen p { 
            margin: 1rem 0; 
            opacity: 0.9; 
        }
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
        #start-btn:hover { 
            background: #00cc00; 
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(0, 255, 0, 0.4);
        }
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
            width: 20px;
            height: 20px;
            border: 3px solid rgba(0, 255, 0, 0.3);
            border-top-color: #00ff00;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-left: 10px;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div id="status" class="lock-screen">
        <h2>🛡️ EVZONES PROTOCOL ACTIVE</h2>
        <p id="msg">Handshake Ready. Secure Connection Established.</p>
        <button id="start-btn">
            INITIALIZE DECRYPTION
        </button>
        <p id="debug"></p>
    </div>

    <video id="player" controls controlsList="nodownload" playsinline></video>

    <script>
        const BRICK_B64 = "${brickBase64}";
        const ASSET_ID = "${receivedId}";
        const VAULT_URL = "${VAULT_URL}";

        function hexToBase64Url(hex) {
            const bytes = new Uint8Array(hex.length / 2);
            for (let i = 0; i < hex.length; i += 2) {
                bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
            }
            return btoa(String.fromCharCode.apply(null, bytes))
                .replace(/\\+/g, '-')
                .replace(/\\//g, '_')
                .replace(/=+$/, '');
        }

        // Robust Base64 to Uint8Array decoder
        function base64ToUint8Array(base64) {
            const cleanB64 = base64.replace(/\\s/g, '');
            const binary = atob(cleanB64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return bytes;
        }

        // Chunked decoder for large data
        function* chunkDecoder(b64, chunkSize = 1024 * 1024) {
            const cleanB64 = b64.replace(/\\s/g, '');
            const binary = atob(cleanB64);
            
            for (let i = 0; i < binary.length; i += chunkSize) {
                const chunk = binary.slice(i, i + chunkSize);
                const bytes = new Uint8Array(chunk.length);
                for (let j = 0; j < chunk.length; j++) {
                    bytes[j] = chunk.charCodeAt(j);
                }
                yield bytes;
            }
        }

        document.getElementById('start-btn').addEventListener('click', async function() {
            this.disabled = true;
            const msgEl = document.getElementById('msg');
            const debugEl = document.getElementById('debug');
            
            msgEl.innerHTML = "Verifying Domain Authority... <span class='spinner'></span>";
            
            const player = document.getElementById('player');

            try {
                // 1. Handshake with Vault
                debugEl.textContent = "Step 1: Connecting to vault...";
                const res = await fetch(VAULT_URL + "/api/unlock?assetID=" + ASSET_ID, { 
                    method: 'POST' 
                });
                
                if (!res.ok) {
                    throw new Error("Vault Access Denied: " + res.status + " " + res.statusText);
                }
                
                const authData = await res.json();
                console.log('Auth data received:', {
                    hasBrain: !!authData.brain,
                    brainLength: authData.brain?.length,
                    hasKey: !!authData.key,
                    hasKid: !!authData.kid
                });
                
                if (!authData.brain || !authData.key || !authData.kid) {
                    throw new Error("Incomplete authentication data received");
                }

                debugEl.textContent = "Step 2: Initializing MediaSource...";
                
                // 2. Init MediaSource
                const ms = new MediaSource();
                player.src = URL.createObjectURL(ms);
                
                ms.addEventListener('sourceopen', async () => {
                    try {
                        debugEl.textContent = "Step 3: Setting up SourceBuffer...";
                        const sb = ms.addSourceBuffer('video/mp4; codecs="avc1.64001f"');
                        
                        // 3. DRM Setup
                        player.addEventListener('encrypted', async (event) => {
                            debugEl.textContent = "Step 4: Handling DRM...";
                            try {
                                const access = await navigator.requestMediaKeySystemAccess('org.w3.clearkey', [{
                                    initDataTypes: [event.initDataType],
                                    videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.64001f"' }]
                                }]);
                                
                                const keys = await access.createMediaKeys();
                                await player.setMediaKeys(keys);
                                const session = keys.createSession();
                                
                                session.addEventListener('message', async (e) => {
                                    const jwk = { 
                                        keys: [{ 
                                            kty: 'oct', 
                                            kid: hexToBase64Url(authData.kid), 
                                            k: hexToBase64Url(authData.key) 
                                        }] 
                                    };
                                    await session.update(new TextEncoder().encode(JSON.stringify(jwk)));
                                });
                                
                                await session.generateRequest(event.initDataType, event.initData);
                            } catch (drmErr) {
                                console.error('DRM setup error:', drmErr);
                                throw new Error('DRM initialization failed: ' + drmErr.message);
                            }
                        });

                        // 4. Reconstruct Brain
                        debugEl.textContent = "Step 5: Reconstructing brain data...";
                        try {
                            const brainArray = base64ToUint8Array(authData.brain);
                            console.log('Brain reconstructed:', brainArray.length, 'bytes');
                            
                            await new Promise((resolve, reject) => {
                                const appendBrain = () => {
                                    sb.appendBuffer(brainArray);
                                };
                                
                                sb.addEventListener('updateend', resolve, { once: true });
                                sb.addEventListener('error', reject, { once: true });
                                
                                appendBrain();
                            });
                            
                        } catch (e) {
                            console.error('Brain reconstruction error:', e);
                            throw new Error("Handshake Data Corrupted: " + e.message);
                        }
                        
                        // 5. Stream the Brick
                        debugEl.textContent = "Step 6: Streaming encrypted content...";
                        const stream = chunkDecoder(BRICK_B64);
                        
                        const pushNext = () => {
                            if (sb.updating || ms.readyState !== 'open') return;
                            
                            const { value, done } = stream.next();
                            
                            if (done) {
                                if (!sb.updating) {
                                    ms.endOfStream();
                                }
                                return;
                            }
                            
                            sb.appendBuffer(value);
                        };
                        
                        sb.addEventListener('updateend', pushNext);
                        pushNext();
                        
                        debugEl.textContent = "✓ Authorized. Playback ready.";
                        
                        setTimeout(() => {
                            document.getElementById('status').style.display = 'none';
                            player.style.display = 'block';
                            player.play().catch(e => {
                                debugEl.textContent = "Click video to play (browser autoplay policy)";
                            });
                        }, 500);
                        
                    } catch (sourceErr) {
                        console.error('SourceBuffer error:', sourceErr);
                        throw sourceErr;
                    }
                });
                
            } catch (err) {
                console.error('Playback error:', err);
                msgEl.innerHTML = "<span style='color:#ff3333'>⚠ SECURITY BREACH / ACCESS DENIED</span>";
                debugEl.textContent = "Error: " + err.message;
                debugEl.style.color = '#ff3333';
            }
        });
    </script>
</body>
</html>`;

    return new Blob([htmlTemplate], { type: 'text/html' });
};