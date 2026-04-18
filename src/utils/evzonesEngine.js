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
        // "mdat" in ASCII: 109, 100, 97, 116
        if (uint8[i] === 109 && uint8[i + 1] === 100 && uint8[i + 2] === 97 && uint8[i + 3] === 116) {
            mdatIndex = i - 4; // Include the atom size field
            break;
        }
    }

    const brain = uint8.slice(0, mdatIndex); // The intelligence
    const brick = uint8.slice(mdatIndex);    // The payload

    return {
        brain,
        brick,
        key,
        kid,
        fileName: file.name
    };
};


export const generateSmartAsset = async (asset, receivedId) => {
    if (!receivedId) throw new Error("Missing ID for Smart Asset");

    const blob = new Blob([asset.brick], { type: 'application/octet-stream' });

    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            // Get just the raw Base64 data without the "data:video/mp4;base64," prefix
            const base64Brick = e.target.result.split(',')[1]; 

            const htmlTemplate = `
<!DOCTYPE html>
<html>
<head>
    <title>EVZONES PROTECTED: ${asset.fileName}</title>
    <style>
        body { margin: 0; background: #000; color: #fff; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; text-align: center; }
        .lock-screen { border: 1px solid #00ff00; padding: 2rem; background: #0a0a0a; border-radius: 8px; }
        video { width: 100%; max-height: 100vh; display: none; }
    </style>
</head>
<body>
    <div id="status" class="lock-screen">
        <h2 style="color:#00ff00">🛡️ EVZONES PROTOCOL ACTIVE</h2>
        <p>Verifying Authority for ID: ${receivedId}</p>
    </div>
    <video id="player" controls></video>

    <script>
        const ASSET_ID = "${receivedId}"; 
        const BRICK_B64 = "${base64Brick}";

        async function unlock() {
            const status = document.getElementById('status');
            const player = document.getElementById('player');

            try {
                // 1. CALL THE VAULT (Update this to your actual Vercel domain!)
                const res = await fetch("https://vercel.app" + ASSET_ID, {
                    method: 'POST'
                });

                if (res.status === 403) {
                    status.innerHTML = "<h2>❌ UNAUTHORIZED DOMAIN</h2><p>Piracy Alert Sent to Owner.</p>";
                    return;
                }

                const data = await res.json();
                
                // 2. DECODE THE BRICK
                const binaryString = atob(BRICK_B64);
                const brickArray = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    brickArray[i] = binaryString.charCodeAt(i);
                }

                // 3. RE-STITCH (Correctly handling Supabase binary format)
                const brainArray = new Uint8Array(data.brain.data || data.brain); 
                const finalVideo = new Uint8Array(brainArray.length + brickArray.length);
                finalVideo.set(brainArray, 0);
                finalVideo.set(brickArray, brainArray.length);

                // 4. PLAY
                const videoBlob = new Blob([finalVideo], { type: 'video/mp4' });
                player.src = URL.createObjectURL(videoBlob);
                
                status.style.display = 'none';
                player.style.display = 'block';
                player.play();

            } catch (e) {
                console.error("Evzones Protocol Error:", e);
                status.innerHTML = "<h2>🛡️ PROTOCOL ERROR</h2><p>System handshake failed.</p>";
            }
        }
        unlock();
    <\/script>
</body>
</html>`;
            resolve(new Blob([htmlTemplate], { type: 'text/html' }));
        };
        reader.readAsDataURL(blob);
    });
};