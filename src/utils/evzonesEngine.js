// utils/evzonesEngine.js
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

const ffmpeg = new FFmpeg();

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
    
    // EME explicitly requires Fragmented MP4s. We force fragments with empty_moov.
    await ffmpeg.exec([
        '-i', 'input.mp4', 
        '-c', 'copy', 
        '-movflags', 'frag_keyframe+empty_moov', 
        '-encryption_scheme', 'cenc-aes-ctr',
        '-encryption_key', key, 
        '-encryption_kid', kid, 
        'protected.mp4'
    ]);
    
    const data = await ffmpeg.readFile('protected.mp4');
    const uint8 = new Uint8Array(data.buffer);
    
    // Strict MP4 Box Walker: Slicing at the first 'moof' box
    // The Brain gets the ftyp & moov (DRM initialization and track maps).
    // The Brick gets the moof & mdat chunks (The encrypted media).
    let splitIndex = -1;
    let offset = 0;
    
    while (offset < uint8.length) {
        const size = (uint8[offset] * 16777216) + (uint8[offset+1] * 65536) + (uint8[offset+2] * 256) + uint8[offset+3];
        const type = String.fromCharCode(uint8[offset+4], uint8[offset+5], uint8[offset+6], uint8[offset+7]);
        
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
    if (!receivedId) throw new Error("Missing ID for Smart Asset");
    
    const VAULT_URL = vaultBaseUrl || import.meta.env.VITE_VAULT_URL || 'https://evzones-protocol.vercel.app';
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
    <title>EVZONES PROTECTED: ${asset.fileName}</title>
    <style>
        body { margin: 0; background: #000; color: #fff; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; text-align: center; }
        .lock-screen { border: 1px solid #00ff00; padding: 2.5rem; background: #0a0a0a; border-radius: 12px; box-shadow: 0 0 20px rgba(0,255,0,0.2); }
        h2 { color: #00ff00; margin-top: 0; }
        #player { width: 100%; max-height: 100vh; display: none; }
        .error-details { font-size: 0.8rem; color: #ff6b6b; margin-top: 10px; font-family: monospace; }
    </style>
</head>
<body>
    <div id="status" class="lock-screen">
        <h2>🛡️ EVZONES PROTOCOL ACTIVE</h2>
        <p id="msg">Verifying Domain Authority...</p>
        <p id="debug" class="error-details"></p>
    </div>
    <video id="player" controls controlsList="nodownload" muted playsinline preload="auto"></video>
    <script>
        // EME JWK Key Formatter
        function hexToBase64Url(hex) {
            const bytes = new Uint8Array(hex.length / 2);
            for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
            return btoa(String.fromCharCode.apply(null, bytes)).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
        }

        // Bulletproof Base64 Decoder: Bypasses data URI limits and avoids InvalidCharacter errors
        function decodeB64(b64) {
            let clean = b64.replace(/-/g, '+').replace(/_/g, '/').replace(/[\\r\\n\\s]+/g, '');
            while (clean.length % 4) clean += '='; // Guarantee perfect padding
            const bin = window.atob(clean);
            const buf = new Uint8Array(bin.length);
            for(let i=0; i<bin.length; i++) buf[i] = bin.charCodeAt(i);
            return buf;
        }

        (async function unlock() {
            const ASSET_ID = "${receivedId}"; 
            const BRICK_B64 = "${base64Brick}";
            const player = document.getElementById('player');
            const status = document.getElementById('status');
            const debugMsg = document.getElementById('debug');

            try {
                const FETCH_URL = "${VAULT_URL}/api/unlock?assetID=" + ASSET_ID;
                debugMsg.textContent = "Connecting to Vault...";
                
                const res = await fetch(FETCH_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }});

                if (res.status === 403) {
                    status.innerHTML = "<h2 style='color:#ff4444'>❌ UNAUTHORIZED DOMAIN</h2><p>Access Denied.</p>";
                    return;
                }
                if (!res.ok) throw new Error("Server returned " + res.status);

                const data = await res.json();
                
                // ClearKey EME Listener
                player.addEventListener('encrypted', async (event) => {
                    console.log('🔒 CENC Encryption detected. Initializing ClearKey...');
                    try {
                        const access = await navigator.requestMediaKeySystemAccess('org.w3.clearkey', [{
                            initDataTypes: [event.initDataType],
                            videoCapabilities: [{ contentType: 'video/mp4' }]
                        }]);
                        
                        const keys = await access.createMediaKeys();
                        await player.setMediaKeys(keys);
                        const session = keys.createSession();
                        
                        session.addEventListener('message', async (e) => {
                            const jwkSet = { keys: [{ kty: 'oct', kid: hexToBase64Url(data.kid), k: hexToBase64Url(data.key) }] };
                            await session.update(new TextEncoder().encode(JSON.stringify(jwkSet)));
                            console.log('🔓 Keys injected. Decryption active.');
                        });
                        
                        await session.generateRequest(event.initDataType, event.initData);
                    } catch (err) {
                        console.error('EME Decryption Failed:', err);
                    }
                });

                debugMsg.textContent = "Decoding Matrix...";
                
                // Decode cleanly using the custom robust function
                const brickArray = decodeB64(BRICK_B64);
                
                let brainStr = typeof data.brain === 'string' ? data.brain : (data.brain.data || '');
                if (!brainStr) throw new Error("Invalid brain format from vault");
                const brainArray = decodeB64(brainStr);

                debugMsg.textContent = "Stitching Fragmented Stream...";

                const finalVideo = new Uint8Array(brainArray.length + brickArray.length);
                finalVideo.set(brainArray, 0);
                finalVideo.set(brickArray, brainArray.length);

                debugMsg.textContent = "Decrypting via ClearKey...";

                // Feed the perfectly formed fMP4 to the browser
                const videoBlob = new Blob([finalVideo], { type: 'video/mp4' });
                player.src = URL.createObjectURL(videoBlob);
                status.style.display = 'none';
                player.style.display = 'block';
                
                player.play().catch(err => {
                    console.log("Autoplay blocked, user must click play manually");
                });

            } catch (e) {
                console.error("Evzones Error:", e);
                status.innerHTML = "<h2 style='color:#ff4444'>Handshake Failed</h2>";
                debugMsg.textContent = "Error: " + e.message;
            }
        })();
    <\/script>
</body>
</html>`;
            resolve(new Blob([htmlTemplate], { type: 'text/html' }));
        };
        reader.readAsDataURL(brickBlob);
    });
};