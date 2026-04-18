// utils/evzonesEngine.js
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

const ffmpeg = new FFmpeg();

/**
 * EVZONES PROTOCOL ENGINE: Performs a client-side lobotomy on media.
 */
export const processEvzonesVideo = async (file) => {
    if (!ffmpeg.loaded) await ffmpeg.load();

    // 1. Write the original file to FFmpeg's virtual FS
    await ffmpeg.writeFile('input.mp4', await fetchFile(file));

    // 2. Generate random 16-byte Keys (AES-128 standard)
    const key = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
    const kid = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');

    // 3. EXECUTE: Encrypt + Fragment + Faststart (moves metadata to front)
    await ffmpeg.exec([
        '-i', 'input.mp4',
        '-c', 'copy',
        '-movflags', 'faststart+frag_keyframe+empty_moov',
        '-encryption_key', key,
        '-encryption_kid', kid,
        'protected.mp4'
    ]);

    // 4. THE LOBOTOMY: Slicing Brain from Brick
    const data = await ffmpeg.readFile('protected.mp4');
    const uint8 = new Uint8Array(data.buffer);

    // Scan for "mdat" atom (Media Data) to find the exact metadata boundary
    let mdatIndex = 0;
    for (let i = 0; i < uint8.length - 4; i++) {
        if (uint8[i] === 109 && uint8[i + 1] === 100 && uint8[i + 2] === 97 && uint8[i + 3] === 116) {
            mdatIndex = i - 4; 
            break;
        }
    }

    const brain = uint8.slice(0, mdatIndex);
    const brick = uint8.slice(mdatIndex);

    return { brain, brick, key, kid, fileName: file.name };
};

/**
 * GENERATE SMART ASSET: Creates a self-protecting HTML file.
 */
export const generateSmartAsset = async (asset, receivedId) => {
    if (!receivedId) throw new Error("Missing ID for Smart Asset");

    // Convert binary brick to a Blob to read as Base64
    const brickBlob = new Blob([asset.brick], { type: 'application/octet-stream' });

    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            // Correctly strip the data: URL prefix to get raw Base64
            const base64Brick = e.target.result.split(',')[1];

            const htmlTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EVZONES PROTECTED: ${asset.fileName}</title>
    <style>
        body { margin: 0; background: #000; color: #fff; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; text-align: center; }
        .lock-screen { border: 1px solid #00ff00; padding: 2.5rem; background: #0a0a0a; border-radius: 12px; box-shadow: 0 0 20px rgba(0,255,0,0.2); }
        h2 { color: #00ff00; margin-top: 0; }
        #player { width: 100%; max-height: 100vh; display: none; outline: none; }
        .spinner { border: 4px solid rgba(0, 255, 0, 0.1); border-left-color: #00ff00; border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite; margin: 15px auto; }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div id="status" class="lock-screen">
        <h2>🛡️ EVZONES PROTOCOL ACTIVE</h2>
        <p id="msg">Verifying Domain Authority...</p>
        <div id="loader" class="spinner"></div>
    </div>
    <video id="player" controls controlsList="nodownload"></video>

    <script>
        const ASSET_ID = "${receivedId}"; 
        const BRICK_B64 = "${base64Brick}";
        const VAULT_URL = "https://evzones-protocol.vercel.app/" + ASSET_ID;

        async function unlock() {
            const status = document.getElementById('status');
            const player = document.getElementById('player');
            const msg = document.getElementById('msg');
            const loader = document.getElementById('loader');

            try {
                // 1. VAULT HANDSHAKE
                const res = await fetch(VAULT_URL, { method: 'POST' });

                if (res.status === 403) {
                    loader.style.display = 'none';
                    status.innerHTML = "<h2 style='color:#ff4444'>❌ UNAUTHORIZED DOMAIN</h2><p>Access Denied. Piracy alert sent to owner.</p>";
                    return;
                }

                if (!res.ok) throw new Error("Vault error: " + res.status);

                const data = await res.json();

                // 2. DECODE BRICK
                const binaryString = atob(BRICK_B64);
                const brickArray = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    brickArray[i] = binaryString.charCodeAt(i);
                }

                // 3. RE-STITCH BRAIN
                // Handle Supabase BYTEA format which often returns a .data array
                const brainRaw = data.brain.data || data.brain;
                const brainArray = new Uint8Array(brainRaw);
                
                const finalVideo = new Uint8Array(brainArray.length + brickArray.length);
                finalVideo.set(brainArray, 0);
                finalVideo.set(brickArray, brainArray.length);

                // 4. INITIALIZE PLAYBACK
                const videoBlob = new Blob([finalVideo], { type: 'video/mp4' });
                player.src = URL.createObjectURL(videoBlob);
                
                status.style.display = 'none';
                player.style.display = 'block';
                player.play().catch(e => console.log("Autoplay blocked, user interaction required."));

            } catch (e) {
                console.error("Evzones Error:", e);
                loader.style.display = 'none';
                msg.innerHTML = "<span style='color:#ff4444'>Handshake Failed. Network or Security Error.</span>";
            }
        }
        unlock();
    <\/script>
</body>
</html>`;
            resolve(new Blob([htmlTemplate], { type: 'text/html' }));
        };
        reader.readAsDataURL(brickBlob);
    });
};
