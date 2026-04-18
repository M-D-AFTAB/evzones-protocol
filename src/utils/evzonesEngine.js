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

export const generateSmartAsset = async (asset, receivedId) => {
    if (!receivedId) throw new Error("Missing ID for Smart Asset");
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
    </style>
</head>
<body>
    <div id="status" class="lock-screen">
        <h2>🛡️ EVZONES PROTOCOL ACTIVE</h2>
        <p id="msg">Verifying Domain Authority...</p>
    </div>
    <video id="player" controls controlsList="nodownload"></video>
    <script>
        (async function unlock() {
            const ASSET_ID = "${receivedId}"; 
            const BRICK_B64 = "${base64Brick}";
            const player = document.getElementById('player');
            const status = document.getElementById('status');

            try {
                // FIXED URL STRUCTURE
                const VAULT_URL = "https://vercel.app" + ASSET_ID;
                const res = await fetch(VAULT_URL, { method: 'POST' });

                if (res.status === 403) {
                    status.innerHTML = "<h2 style='color:#ff4444'>❌ UNAUTHORIZED DOMAIN</h2><p>Access Denied.</p>";
                    return;
                }

                const data = await res.json();
                const brainArray = new Uint8Array(data.brain.data || data.brain);
                
                const binaryString = atob(BRICK_B64);
                const brickArray = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) { brickArray[i] = binaryString.charCodeAt(i); }

                const finalVideo = new Uint8Array(brainArray.length + brickArray.length);
                finalVideo.set(brainArray, 0);
                finalVideo.set(brickArray, brainArray.length);

                player.src = URL.createObjectURL(new Blob([finalVideo], { type: 'video/mp4' }));
                status.style.display = 'none';
                player.style.display = 'block';
                player.play();

            } catch (e) {
                console.error("Evzones Error:", e);
                document.getElementById('msg').innerHTML = "<span style='color:#ff4444'>Handshake Failed.</span>";
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
