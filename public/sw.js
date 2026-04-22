// public/sw.js
// ─────────────────────────────────────────────────────────────────────────────
// SERVICE WORKER — Safari Range Request bridge
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS
// ───────────────
// Safari on macOS supports MSE, but Safari on iOS does NOT. iOS Safari requires
// a plain <video src="..."> with a byte-range-capable server. Since our data
// lives in memory (not on a real server), we intercept fetch requests from the
// video element with this Service Worker and serve the stitched brain+brick
// from memory using the correct HTTP 206 Partial Content protocol.
//
// WHAT WAS BROKEN IN THE UPGRADE ATTEMPT
// ───────────────────────────────────────
// The original sw.js was actually CORRECT for the Base64 case — it received
// pre-decrypted Uint8Arrays via postMessage and served them directly.
//
// The upgrade attempt tried to do decryption INSIDE the Service Worker, which
// breaks because:
//   1. Service Workers can't easily do async crypto on postMessage data
//   2. The key architecture changed (HMAC derivation) but SW wasn't updated
//   3. The SW still expected the old single-key format
//
// THE FIX
// ───────
// Keep the SW simple: it only handles Range Requests for pre-decrypted data.
// The main thread (HTML page) handles ALL crypto and posts the decrypted
// brain+brick to the SW via postMessage AFTER decryption is complete.
// The SW just serves bytes efficiently, handling all Range Request edge cases.
//
// SAFARI-SPECIFIC REQUIREMENTS FOR RANGE REQUESTS
// ────────────────────────────────────────────────
// Safari is strict about these headers. Missing any will cause playback failure:
//   ✓ Content-Type: video/mp4
//   ✓ Content-Length: <exact byte count for this range>
//   ✓ Content-Range: bytes <start>-<end>/<total>  (for 206 responses)
//   ✓ Accept-Ranges: bytes  (must always be present)
//   ✓ Status 206 for range requests, 200 for full requests
//   ✓ Content-Length on 200 responses must be the FULL file size
// ─────────────────────────────────────────────────────────────────────────────

// In-memory store: videoId → { brain: Uint8Array, brick: Uint8Array, total: number }
// Videos are registered via postMessage from the main thread.
const videoCache = new Map();

// ── Service Worker lifecycle ──────────────────────────────────────────────────

self.addEventListener('install', () => {
    // Skip waiting so the new SW activates immediately without requiring a page reload
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    // Claim all clients immediately so the SW intercepts requests for the current page
    event.waitUntil(self.clients.claim());
});

// ── Message handler (main thread → SW) ───────────────────────────────────────

self.addEventListener('message', (event) => {
    const { type, id, brain, brick } = event.data || {};

    if (type === 'REGISTER_VIDEO') {
        if (!id || !brain || !brick) {
            console.error('[SW] REGISTER_VIDEO: missing id, brain, or brick');
            return;
        }

        // Brain and brick arrive as ArrayBuffer (transferable) or Uint8Array
        const brainArr = brain instanceof Uint8Array ? brain : new Uint8Array(brain);
        const brickArr = brick instanceof Uint8Array ? brick : new Uint8Array(brick);

        videoCache.set(id, {
            brain: brainArr,
            brick: brickArr,
            total: brainArr.byteLength + brickArr.byteLength
        });

        console.log('[SW] Registered video:', id,
                    '| Brain:', brainArr.byteLength, 'B',
                    '| Brick:', brickArr.byteLength, 'B',
                    '| Total:', brainArr.byteLength + brickArr.byteLength, 'B');

        // Acknowledge to the main thread
        if (event.source) {
            event.source.postMessage({ type: 'REGISTERED', id });
        }
    }

    if (type === 'UNREGISTER_VIDEO') {
        videoCache.delete(id);
        console.log('[SW] Unregistered video:', id);
    }
});

// ── Fetch intercept ───────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Only intercept our virtual video URLs: /sw-video/<id>
    if (!url.pathname.startsWith('/sw-video/')) return;

    event.respondWith(handleVideoRequest(event.request, url));
});

async function handleVideoRequest(request, url) {
    const id  = url.pathname.slice('/sw-video/'.length);
    const vid = videoCache.get(id);

    if (!vid) {
        console.warn('[SW] Video not found:', id);
        return new Response('Video not registered', { status: 404 });
    }

    const { brain, brick, total } = vid;
    const brainLen = brain.byteLength;

    // ── Parse Range header ───────────────────────────────────────────────────
    const rangeHeader = request.headers.get('range');
    let start = 0;
    let end   = total - 1;
    let isRangeRequest = false;

    if (rangeHeader) {
        isRangeRequest = true;
        const match = rangeHeader.match(/^bytes=(\d+)-(\d*)$/);
        if (!match) {
            // Malformed Range header — return 416 Range Not Satisfiable
            return new Response('Range Not Satisfiable', {
                status: 416,
                headers: { 'Content-Range': `bytes */${total}` }
            });
        }
        start = parseInt(match[1], 10);
        end   = match[2] ? parseInt(match[2], 10) : total - 1;

        // Clamp to valid range
        if (start >= total || end >= total || start > end) {
            return new Response('Range Not Satisfiable', {
                status: 416,
                headers: { 'Content-Range': `bytes */${total}` }
            });
        }
    }

    const length = end - start + 1;

    // ── Build ReadableStream from brain+brick byte ranges ────────────────────
    // Safari sends many small Range Requests (sometimes just 2 bytes for the
    // ftyp box probe). We must handle all of them efficiently without loading
    // the full file into a new array each time.
    const CHUNK_SIZE = 256 * 1024; // 256KB chunks — good balance for Safari

    const stream = new ReadableStream({
        start(controller) {
            let pos = start;

            function push() {
                if (pos > end) {
                    controller.close();
                    return;
                }

                const chunkEnd  = Math.min(pos + CHUNK_SIZE - 1, end);
                const chunkSize = chunkEnd - pos + 1;
                const out       = new Uint8Array(chunkSize);

                // Fill chunk from brain+brick virtual address space
                for (let i = 0; i < chunkSize; i++) {
                    const abs = pos + i;
                    out[i] = abs < brainLen
                        ? brain[abs]
                        : brick[abs - brainLen];
                }

                controller.enqueue(out);
                pos = chunkEnd + 1;

                // Yield to event loop between chunks to prevent blocking
                setTimeout(push, 0);
            }

            push();
        },
        cancel() {
            // Stream was cancelled (e.g. user skipped) — nothing to clean up
        }
    });

    // ── Build response headers ───────────────────────────────────────────────
    // Safari is strict: all of these must be present and correct.
    const headers = new Headers({
        'Content-Type':   'video/mp4',
        'Content-Length': String(length),
        'Accept-Ranges':  'bytes',
        // Cache-Control: no-store prevents Safari from caching the decrypted video
        'Cache-Control':  'no-store, no-cache'
    });

    if (isRangeRequest) {
        headers.set('Content-Range', `bytes ${start}-${end}/${total}`);
    }

    return new Response(stream, {
        status:  isRangeRequest ? 206 : 200,
        headers
    });
}