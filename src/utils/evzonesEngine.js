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

// utils/evzonesEngine.js

// ... (keep your processEvzonesVideo function as is)

export const generateSmartAsset = async (asset) => {
    // Check if assetID exists to prevent the ReferenceError
    if (!asset.assetID) {
        throw new Error("AssetID is missing. Cannot generate Smart Asset.");
    }

    const blob = new Blob([asset.brick], { type: 'application/octet-stream' });

    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64Brick = e.target.result.split(',')[1]; // Get just the data part

            const htmlTemplate = `
<!DOCTYPE html>
<html>
<head>
    <title>EVZONES PROTECTED: ${asset.fileName}</title>
    <style>
        body { margin: 0; background: #000; color: #fff; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; }
        .lock-screen { text-align: center; border: 1px solid #00ff00; padding: 2rem; background: #0a0a0a; }
        video { width: 100%; max-height: 100vh; display: none; }
    </style>
</head>
<body>
    <div id="status" class="lock-screen">
        <h2 style="color:#00ff00">🛡️ EVZONES PROTOCOL ACTIVE</h2>
        <p>Verifying Domain Authority for ID: ${asset.assetID}</p>
    </div>
    <video id="player" controls></video>

    <script>
        const ASSET_ID = "${asset.assetID}"; // Passed from your Vercel Vault
        const BRICK_B64 = "${base64Brick}";

        async function unlock() {
            // Your unlock logic (fetch from Vercel) will go here
            console.log("Attempting to unlock Asset:", ASSET_ID);
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

