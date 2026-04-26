// public/sw.js — V3 OPFS + AES-CTR seek + Safari 206 range requests
// (full file — see evzonesEngine.js for architecture notes)

const assets = new Map();

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('message', async (event) => {
    const msg  = event.data || {};
    const port = event.ports[0];
    if (msg.type === 'REGISTER_ASSET') {
        try { await registerAsset(msg); port?.postMessage({ ok: true }); }
        catch (err) { console.error('[SW] Register failed:', err); port?.postMessage({ error: err.message }); }
    }
    if (msg.type === 'UNREGISTER_ASSET') { assets.delete(msg.id); port?.postMessage({ ok: true }); }
});

async function registerAsset(msg) {
    const brainU8   = b64ToU8(msg.brainB64);
    const baseIV    = hexToU8(msg.baseIVHex);
    const cryptoKeys = await Promise.all(
        msg.tempKeys.map(hex =>
            crypto.subtle.importKey('raw', hexToU8(hex), { name: 'AES-CTR' }, false, ['decrypt'])
        )
    );
    assets.set(msg.id, {
        opfsName: msg.opfsName, brainU8, brainLen: brainU8.byteLength,
        cryptoKeys, baseIV, segmentSize: msg.segmentSize,
        segmentCount: msg.segmentCount, brickBytes: msg.brickBytes,
        totalBytes: brainU8.byteLength + msg.brickBytes, mimeType: msg.mimeType
    });
    console.log('[SW] Registered:', msg.id, '| total:', brainU8.byteLength + msg.brickBytes, 'B');
}

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    if (!url.pathname.startsWith('/sw-video/')) return;
    event.respondWith(handleVideoRequest(event.request, url));
});

async function handleVideoRequest(request, url) {
    const assetID = url.pathname.slice('/sw-video/'.length).replace(/\.mp4$/, '');
    const asset   = assets.get(assetID);

    if (!asset) {
        return new Response('Asset not registered', {
            status: 404,
            headers: { 'Accept-Ranges': 'bytes', 'Content-Type': 'text/plain' }
        });
    }

    const { totalBytes, mimeType } = asset;

    if (request.method === 'HEAD') {
        return new Response(null, { status: 200, headers: makeHeaders(mimeType, totalBytes, null) });
    }

    const rangeHeader = request.headers.get('range');
    let start = 0, end = totalBytes - 1, isRange = false;

    if (rangeHeader) {
        isRange = true;
        const m = rangeHeader.match(/^bytes=(\d+)-(\d*)$/);
        if (!m) {
            return new Response('Range Not Satisfiable', {
                status: 416, headers: { 'Content-Range': `bytes */${totalBytes}`, 'Accept-Ranges': 'bytes' }
            });
        }
        start = parseInt(m[1], 10);
        end   = m[2] !== '' ? parseInt(m[2], 10) : totalBytes - 1;
        if (start >= totalBytes) {
            return new Response('Range Not Satisfiable', {
                status: 416, headers: { 'Content-Range': `bytes */${totalBytes}`, 'Accept-Ranges': 'bytes' }
            });
        }
        end = Math.min(end, totalBytes - 1);
    }

    const length = end - start + 1;
    const stream = buildStream(asset, start, end);

    return new Response(stream, {
        status:     isRange ? 206 : 200,
        statusText: isRange ? 'Partial Content' : 'OK',
        headers:    makeHeaders(mimeType, length, isRange ? `bytes ${start}-${end}/${totalBytes}` : null)
    });
}

function makeHeaders(mimeType, len, contentRange) {
    const h = new Headers({
        'Content-Type':   mimeType,
        'Content-Length': String(len),
        'Accept-Ranges':  'bytes',
        'Cache-Control':  'no-store'
    });
    if (contentRange) h.set('Content-Range', contentRange);
    return h;
}

function buildStream(asset, vStart, vEnd) {
    const { brainU8, brainLen } = asset;
    return new ReadableStream({
        async start(controller) {
            try {
                let pos = vStart;

                // Brain region (in RAM, serve directly)
                if (pos <= vEnd && pos < brainLen) {
                    const sliceEnd = Math.min(vEnd + 1, brainLen);
                    controller.enqueue(brainU8.slice(pos, sliceEnd));
                    pos = sliceEnd;
                }

                // Brick region (OPFS, decrypt on-the-fly)
                if (pos <= vEnd && pos >= brainLen) {
                    await streamBrickRange(asset, controller, pos, vEnd);
                }

                controller.close();
            } catch (err) {
                console.error('[SW] Stream error:', err);
                controller.error(err);
            }
        }
    });
}

async function streamBrickRange(asset, controller, vStart, vEnd) {
    const { opfsName, cryptoKeys, baseIV, segmentSize, brickBytes, brainLen } = asset;

    const bStart = vStart - brainLen; // brick-relative start
    const bEnd   = vEnd   - brainLen; // brick-relative end (inclusive)

    const opfsRoot   = await navigator.storage.getDirectory();
    const fileHandle = await opfsRoot.getFileHandle(opfsName);
    const file       = await fileHandle.getFile();

    const firstSeg = Math.floor(bStart / segmentSize);
    const lastSeg  = Math.floor(bEnd   / segmentSize);

    for (let si = firstSeg; si <= lastSeg; si++) {
        const segEncStart  = si * segmentSize;
        const segEncEnd    = Math.min(segEncStart + segmentSize, brickBytes) - 1;

        const rangeInSegStart = Math.max(bStart, segEncStart);
        const rangeInSegEnd   = Math.min(bEnd,   segEncEnd);
        const offsetInSeg     = rangeInSegStart - segEncStart;

        // AES-CTR seek: jump to the right 16-byte block
        const blockIndex   = Math.floor(offsetInSeg / 16);
        const skippedBytes = offsetInSeg % 16;
        const counter      = addToIV(makeSegmentIV(baseIV, si), blockIndex);

        // Read ONLY the needed encrypted bytes from disk
        const fileReadStart = segEncStart + blockIndex * 16;
        const fileReadEnd   = segEncEnd + 1; // Blob.slice end is exclusive

        const encBuf = await file.slice(fileReadStart, fileReadEnd).arrayBuffer();

        // Decrypt the block-aligned chunk
        const decBuf = await crypto.subtle.decrypt(
            { name: 'AES-CTR', counter, length: 128 },
            cryptoKeys[si],
            encBuf
        );

        // Slice out exactly the bytes the caller wants
        const wantedBytes = rangeInSegEnd - rangeInSegStart + 1;
        controller.enqueue(new Uint8Array(decBuf, skippedBytes, wantedBytes));
    }
}

function makeSegmentIV(baseIV, segIdx) {
    const iv = new Uint8Array(16);
    iv.set(baseIV.slice(0, 8), 0);
    let n = segIdx;
    for (let b = 15; b >= 8 && n > 0; b--) {
        iv[b] = n & 0xff;
        n = Math.floor(n / 256);
    }
    return iv;
}

function addToIV(iv, delta) {
    const out = new Uint8Array(iv);
    let carry = delta;
    for (let b = 15; b >= 0 && carry > 0; b--) {
        const sum = out[b] + (carry & 0xff);
        out[b]    = sum & 0xff;
        carry     = Math.floor(carry / 256) + (sum >> 8);
    }
    return out;
}

function b64ToU8(b64) {
    const bin = atob(b64.replace(/\s/g, ''));
    const u8  = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
}

function hexToU8(hex) {
    const u8 = new Uint8Array(hex.length >> 1);
    for (let i = 0; i < hex.length; i += 2) u8[i >> 1] = parseInt(hex.substr(i, 2), 16);
    return u8;
}