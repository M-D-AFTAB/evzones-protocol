// utils/evzonesEngine.js
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

const ffmpeg = new FFmpeg();

export const processEvzonesVideo = async (file) => {
    if (!ffmpeg.loaded) await ffmpeg.load();
    await ffmpeg.writeFile('input.mp4', await fetchFile(file));
    const key = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
    const kid = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
    await ffmpeg.exec(['-i', 'input.mp4', '-c', 'copy', '-movflags', 'faststart+frag_keyframe+empty_moov', '-encryption_key', key, '-encryption_kid', kid, 'protected.mp4']);
    const data = await ffmpeg.readFile('protected.mp4');
    const uint8 = new Uint8Array(data.buffer);
    let mdatIndex = 0;
    for (let i = 0; i < uint8.length - 4; i++) {
        if (uint8[i] === 109 && uint8[i + 1] === 100 && uint8[i + 2] === 97 && uint8[i + 3] === 116) {
            mdatIndex = i - 4; 
            break;
        }
    }
    return { brain: uint8.slice(0, mdatIndex), brick: uint8.slice(mdatIndex), key, kid, fileName: file.name };
};

export const generateSmartAsset = async (asset, receivedId, vaultBaseUrl) => {
    if (!receivedId) throw new Error("Missing ID for Smart Asset");
    
    // Use environment variable or fallback to production URL
    const VAULT_URL = vaultBaseUrl || import.meta.env.VITE_VAULT_URL || 'https://your-project.vercel.app';
    
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
    <video id="player" controls controlsList="nodownload"></video>
    <script>
        (async function unlock() {
            const ASSET_ID = "${receivedId}"; 
            const BRICK_B64 = "${base64Brick}";
            const player = document.getElementById('player');
            const status = document.getElementById('status');
            const debugMsg = document.getElementById('debug');

            try {
                // CORRECT URL STRUCTURE: /api/unlock?assetID=xxx
                const VAULT_URL = "${VAULT_URL}/api/unlock?assetID=" + ASSET_ID;
                
                debugMsg.textContent = "Connecting to: " + VAULT_URL;
                
                const res = await fetch(VAULT_URL, { 
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                debugMsg.textContent = "Status: " + res.status;

                if (res.status === 403) {
                    status.innerHTML = "<h2 style='color:#ff4444'>❌ UNAUTHORIZED DOMAIN</h2><p>Access Denied. This asset can only be viewed on authorized domains.</p>";
                    return;
                }

                if (!res.ok) {
                    throw new Error(\`Server returned \${res.status}: \${res.statusText}\`);
                }

                const data = await res.json();
                
                // Handle different brain data formats
                let brainArray;
                if (data.brain) {
                    if (Array.isArray(data.brain)) {
                        brainArray = new Uint8Array(data.brain);
                    } else if (data.brain.data) {
                        brainArray = new Uint8Array(data.brain.data);
                    } else if (data.brain.type === 'Buffer') {
                        brainArray = new Uint8Array(data.brain.data);
                    } else {
                        brainArray = new Uint8Array(Object.values(data.brain));
                    }
                } else {
                    throw new Error("No brain data received from server");
                }
                
                debugMsg.textContent = "Brain received: " + brainArray.length + " bytes";
                
                // Convert base64 brick to binary
                const binaryString = atob(BRICK_B64);
                const brickArray = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) { 
                    brickArray[i] = binaryString.charCodeAt(i); 
                }

                // Stitch brain + brick together
                const finalVideo = new Uint8Array(brainArray.length + brickArray.length);
                finalVideo.set(brainArray, 0);
                finalVideo.set(brickArray, brainArray.length);

                debugMsg.textContent = "Video reconstructed: " + finalVideo.length + " bytes";

                // Play video
                const videoBlob = new Blob([finalVideo], { type: 'video/mp4' });
                player.src = URL.createObjectURL(videoBlob);
                status.style.display = 'none';
                player.style.display = 'block';
                
                // Auto-play with error handling
                player.play().catch(err => {
                    console.log("Autoplay blocked, user must click play:", err);
                });

            } catch (e) {
                console.error("Evzones Error:", e);
                document.getElementById('msg').innerHTML = "<span style='color:#ff4444'>Handshake Failed</span>";
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