// sw.js — V3 EVZONES Service Worker
// Serves decrypted video range-requests from OPFS, never holds full file in RAM.
//
// Message protocol (from evzonesEngine.js):
//   { type: 'REGISTER_ASSET', id, opfsName, brainB64, tempKeys[], baseIVHex,
//     segmentSize, segmentCount, brickBytes, mimeType }
//
// Fetch intercept:
//   GET ./sw-video/<assetID>.mp4  (with optional Range header)
//   → streams brain + decrypted brick bytes from OPFS

const assets = new Map(); // assetID → { meta, cryptoKeys[] }

// ── Message handler ───────────────────────────────────────────────────────────
self.addEventListener('message', async (e) => {
    const { type, id } = e.data || {};
    const port = e.ports[0];

    if (type !== 'REGISTER_ASSET') return;

    try {
        const { opfsName, brainB64, tempKeys, baseIVHex, segmentSize, segmentCount, brickBytes, mimeType } = e.data;

        // Import all segment CryptoKeys up front so fetch handler is fast
        const cryptoKeys = await Promise.all(tempKeys.map(hex => {
            const raw = hexToBytes(hex);
            return crypto.subtle.importKey('raw', raw, { name: 'AES-CTR' }, false, ['decrypt']);
        }));

        const brainBytes = b64ToBytes(brainB64);

        assets.set(id, {
            opfsName, brainBytes, cryptoKeys,
            baseIV: hexToBytes(baseIVHex),
            segmentSize, segmentCount,
            brickBytes, mimeType,
            total: brainBytes.byteLength + brickBytes
        });

        console.log('[SW] Registered asset', id, '| segments:', segmentCount, '| brick:', brickBytes, 'B');
        port?.postMessage({ ok: true });

    } catch (err) {
        console.error('[SW] Registration error:', err);
        port?.postMessage({ error: err.message });
    }
});

// ── Fetch handler ─────────────────────────────────────────────────────────────
self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Only intercept ./sw-video/<id>.mp4
    const match = url.pathname.match(/\/sw-video\/(.+)\.mp4$/);
    if (!match) return;

    const id    = match[1];
    const asset = assets.get(id);
    if (!asset) {
        e.respondWith(new Response('Asset not registered', { status: 404 }));
        return;
    }

    e.respondWith(handleVideoRequest(e.request, asset));
});

async function handleVideoRequest(request, asset) {
    const { brainBytes, total } = asset;
    const rangeHeader = request.headers.get('range');

    let start = 0, end = total - 1;
    if (rangeHeader) {
        const m = rangeHeader.match(/bytes=(\d+)-(\d*)/);
        if (m) {
            start = parseInt(m[1]);
            end   = m[2] ? parseInt(m[2]) : total - 1;
        }
    }
    end = Math.min(end, total - 1);
    const length = end - start + 1;

    const stream = new ReadableStream({
        async start(controller) {
            try {
                await serveRange(asset, start, end, controller);
                controller.close();
            } catch (err) {
                console.error('[SW] Stream error:', err);
                controller.error(err);
            }
        }
    });

    return new Response(stream, {
        status:  rangeHeader ? 206 : 200,
        headers: {
            'Content-Type':   asset.mimeType || 'video/mp4',
            'Content-Length': String(length),
            'Content-Range':  rangeHeader ? `bytes ${start}-${end}/${total}` : undefined,
            'Accept-Ranges':  'bytes',
        }
    });
}

// Serve bytes [start, end] — may span brain + multiple brick segments
async function serveRange(asset, start, end, controller) {
    const { brainBytes, segmentSize, brickBytes: brickLen, cryptoKeys, baseIV } = asset;
    const brainLen = brainBytes.byteLength;

    // Open OPFS brick file once
    const opfsRoot = await navigator.storage.getDirectory();
    const fh       = await opfsRoot.getFileHandle(asset.opfsName);
    const brickFile = await fh.getFile();

    let pos = start;

    // ── Serve brain portion ───────────────────────────────────────────────────
    if (pos < brainLen && pos <= end) {
        const sliceEnd = Math.min(end + 1, brainLen);
        controller.enqueue(brainBytes.slice(pos, sliceEnd));
        pos = sliceEnd;
    }

    // ── Serve brick portion (from OPFS, decrypt per-segment) ─────────────────
    while (pos <= end) {
        // pos is an absolute offset in the full virtual stream (brain + brick)
        const brickAbsPos = pos - brainLen; // offset within encrypted brick file
        const segIdx      = Math.floor(brickAbsPos / segmentSize);

        if (segIdx >= cryptoKeys.length) break;

        const segStart  = segIdx * segmentSize;          // brick-relative
        const segEnd    = Math.min(segStart + segmentSize, brickLen); // brick-relative
        const segSize   = segEnd - segStart;

        // Read entire segment from OPFS (only one segment at a time in RAM)
        const encChunk  = await readFileSlice(brickFile, segStart, segEnd);

        // Decrypt with the correct IV for this segment
        const segIV  = makeSegIV(baseIV, segIdx);
        const plain  = await crypto.subtle.decrypt(
            { name: 'AES-CTR', counter: segIV, length: 128 },
            cryptoKeys[segIdx],
            encChunk
        );
        const plainU8 = new Uint8Array(plain);

        // Slice out only the portion the requester wants
        const wantStart = brickAbsPos - segStart; // within this decrypted segment
        const wantEnd   = Math.min(end - brainLen - segStart + 1, segSize); // exclusive

        controller.enqueue(plainU8.slice(wantStart, wantEnd));
        pos = brainLen + segEnd;
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function readFileSlice(file, start, end) {
    const blob   = file.slice(start, end);
    const buf    = await blob.arrayBuffer();
    return new Uint8Array(buf);
}

// Segment IV: first 8 bytes of baseIV as nonce, segIdx as BE uint64 in bytes 8-15
function makeSegIV(baseIV, segIdx) {
    const iv = new Uint8Array(16);
    iv.set(baseIV.slice(0, 8), 0);
    let n = segIdx;
    for (let b = 15; b >= 8 && n > 0; b--) { iv[b] = n & 0xff; n = Math.floor(n / 256); }
    return iv;
}

function hexToBytes(hex) {
    const u = new Uint8Array(hex.length >> 1);
    for (let i = 0; i < hex.length; i += 2) u[i >> 1] = parseInt(hex.substr(i, 2), 16);
    return u;
}

function b64ToBytes(b64) {
    const bin = atob(b64.replace(/[^A-Za-z0-9+/=]/g, ''));
    const u   = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
}