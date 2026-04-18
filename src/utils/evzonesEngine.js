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
    const key = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2,'0')).join('');
    const kid = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2,'0')).join('');

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
        if (uint8[i] === 109 && uint8[i+1] === 100 && uint8[i+2] === 97 && uint8[i+3] === 116) {
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

/**
 * Utility to generate the "Smart HTML" file for the owner.
 */
export const generateSmartAsset = async (asset) => {
    // Efficiently convert Brick to Base64 for the "Fat HTML"
    const brickBase64 = btoa(
        new Uint8Array(asset.brick).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

const htmlTemplate = `
<script>
    const ASSET_ID = "${assetID}";
    async function sentinelHandshake() {
        const res = await fetch("https://vercel.app" + ASSET_ID, {
            method: 'POST'
        });
        if (res.status === 403) {
            document.body.innerHTML = "<h1>❌ UNAUTHORIZED DOMAIN</h1>";
            return;
        }
        const { brain, key, kid } = await res.json();
        // ... stitching and decryption logic ...
    }
    sentinelHandshake();
</script>`;
}
