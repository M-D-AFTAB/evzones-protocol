// sw.js — streams stitched video to Safari without loading into RAM
const cache = new Map();

self.addEventListener('message', e => {
    if (e.data.type === 'REGISTER_VIDEO') {
        cache.set(e.data.id, {
            brain: new Uint8Array(e.data.brain),
            brick: new Uint8Array(e.data.brick),
            total: e.data.brain.byteLength + e.data.brick.byteLength
        });
    }
});

self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);
    if (!url.pathname.startsWith('/sw-video/')) return;

    const id  = url.pathname.split('/sw-video/')[1];
    const vid = cache.get(id);
    if (!vid) return e.respondWith(new Response('Not found', { status: 404 }));

    const total  = vid.total;
    const range  = e.request.headers.get('range');
    let start = 0, end = total - 1;

    if (range) {
        const m = range.match(/bytes=(\d+)-(\d*)/);
        start = parseInt(m[1]);
        end   = m[2] ? parseInt(m[2]) : total - 1;
    }

    const length = end - start + 1;

    // Build a ReadableStream that serves brain then brick bytes
    const brainLen = vid.brain.byteLength;
    const stream = new ReadableStream({
        start(controller) {
            const CHUNK = 256 * 1024;
            let pos = start;
            function push() {
                if (pos > end) { controller.close(); return; }
                const chunkEnd = Math.min(pos + CHUNK - 1, end);
                const size = chunkEnd - pos + 1;
                const out  = new Uint8Array(size);
                for (let i = 0; i < size; i++) {
                    const abs = pos + i;
                    out[i] = abs < brainLen
                        ? vid.brain[abs]
                        : vid.brick[abs - brainLen];
                }
                controller.enqueue(out);
                pos = chunkEnd + 1;
                setTimeout(push, 0);
            }
            push();
        }
    });

    e.respondWith(new Response(stream, {
        status: range ? 206 : 200,
        headers: {
            'Content-Type':  'video/mp4',
            'Content-Length': length,
            'Content-Range':  range ? `bytes ${start}-${end}/${total}` : undefined,
            'Accept-Ranges':  'bytes',
        }
    }));
});