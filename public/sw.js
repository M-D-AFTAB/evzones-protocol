// public/sw.js — V4: Network‑streamed brick, zero‑RAM, works with .html + .brick pair

const assets = new Map();

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('message', async (event) => {
  const msg = event.data || {};
  const port = event.ports[0];
  if (msg.type === 'REGISTER_ASSET') {
    try {
      await registerAsset(msg);
      port?.postMessage({ ok: true });
    } catch (err) {
      console.error('[SW] Register failed:', err);
      port?.postMessage({ error: err.message });
    }
  }
});

async function registerAsset(msg) {
  const brainU8 = b64ToU8(msg.brainB64);
  const baseIV = hexToU8(msg.baseIVHex);
  const cryptoKeys = await Promise.all(
    msg.tempKeys.map(hex =>
      crypto.subtle.importKey('raw', hexToU8(hex), { name: 'AES-CTR' }, false, ['decrypt'])
    )
  );
  assets.set(msg.id, {
    brainU8,
    cryptoKeys,
    baseIV,
    segmentSize: msg.segmentSize,
    segmentCount: msg.segmentCount,
    brickUrl: msg.brickUrl,       // relative URL to the .brick file
    mimeType: msg.mimeType,
    _totalBytes: null,             // lazily determined via HEAD request
  });
  console.log('[SW] Registered asset:', msg.id);
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith('/sw-video/')) return;
  event.respondWith(handleVideoRequest(event.request, url));
});

async function handleVideoRequest(request, url) {
  const assetID = url.pathname.slice('/sw-video/'.length).replace(/\.mp4$/, '');
  const asset = assets.get(assetID);
  if (!asset) return new Response('Asset not registered', { status: 404 });

  const { brainU8, mimeType } = asset;
  const brainLen = brainU8.byteLength;

  // If total size is unknown, fetch a HEAD request to get brick size
  if (!asset._totalBytes) {
    const headResp = await fetch(asset.brickUrl, { method: 'HEAD' });
    if (!headResp.ok) throw new Error('Brick not accessible');
    const brickLen = Number(headResp.headers.get('Content-Length'));
    asset._totalBytes = brainLen + brickLen;
  }

  const totalBytes = asset._totalBytes;

  if (request.method === 'HEAD') {
    return new Response(null, {
      status: 200,
      headers: makeHeaders(mimeType, totalBytes, null),
    });
  }

  const rangeHeader = request.headers.get('range');
  let start = 0, end = totalBytes - 1, isRange = false;

  if (rangeHeader) {
    isRange = true;
    const m = rangeHeader.match(/^bytes=(\d+)-(\d*)$/);
    if (!m) return new Response('Range Not Satisfiable', { status: 416 });
    start = parseInt(m[1]);
    end = m[2] !== '' ? parseInt(m[2]) : totalBytes - 1;
    if (start >= totalBytes) return new Response('Range Not Satisfiable', { status: 416 });
    end = Math.min(end, totalBytes - 1);
  }

  const length = end - start + 1;
  const stream = buildStream(asset, start, end);

  return new Response(stream, {
    status: isRange ? 206 : 200,
    headers: makeHeaders(mimeType, length, isRange ? `bytes ${start}-${end}/${totalBytes}` : null),
  });
}

function makeHeaders(mimeType, len, contentRange) {
  const h = new Headers({
    'Content-Type': mimeType,
    'Content-Length': String(len),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  });
  if (contentRange) h.set('Content-Range', contentRange);
  return h;
}

// Builds a ReadableStream that serves the requested byte range.
// The brain (init segment) is served from memory; the brick is fetched on-demand.
function buildStream(asset, vStart, vEnd) {
  const { brainU8, cryptoKeys, baseIV, segmentSize, brickUrl } = asset;
  const brainLen = brainU8.byteLength;

  return new ReadableStream({
    async start(controller) {
      try {
        let pos = vStart;

        // 1. Brain region (in RAM)
        if (pos <= vEnd && pos < brainLen) {
          const sliceEnd = Math.min(vEnd + 1, brainLen);
          controller.enqueue(brainU8.slice(pos, sliceEnd));
          pos = sliceEnd;
        }

        // 2. Brick region (fetch from network, decrypt)
        if (pos <= vEnd && pos >= brainLen) {
          const brickStart = pos - brainLen;
          const brickEnd = vEnd - brainLen;

          const firstSeg = Math.floor(brickStart / segmentSize);
          const lastSeg = Math.floor(brickEnd / segmentSize);

          for (let si = firstSeg; si <= lastSeg; si++) {
            const segEncStart = si * segmentSize;
            // We don't know exact brick length, but fetch will cap at the actual file end.
            const segEncEnd = Math.min(segEncStart + segmentSize, Number.MAX_SAFE_INTEGER) - 1;
            const rangeInSegStart = Math.max(brickStart, segEncStart);
            const rangeInSegEnd = Math.min(brickEnd, segEncEnd);
            const offsetInSeg = rangeInSegStart - segEncStart;

            const blockIndex = Math.floor(offsetInSeg / 16);
            const skippedBytes = offsetInSeg % 16;
            const counter = addToIV(makeSegmentIV(baseIV, si), blockIndex);

            // Fetch only the encrypted bytes we need for this segment
            const fetchStart = segEncStart + blockIndex * 16;
            const fetchEnd = segEncEnd; // Server will return up to file end
            const resp = await fetch(brickUrl, {
              headers: { Range: `bytes=${fetchStart}-${fetchEnd}` }
            });
            if (!resp.ok && resp.status !== 206) throw new Error('Brick fetch failed');

            const encBuf = await resp.arrayBuffer();
            const decBuf = await crypto.subtle.decrypt(
              { name: 'AES-CTR', counter, length: 128 },
              cryptoKeys[si],
              encBuf
            );

            const wantedBytes = rangeInSegEnd - rangeInSegStart + 1;
            controller.enqueue(new Uint8Array(decBuf, skippedBytes, wantedBytes));
          }
        }

        controller.close();
      } catch (err) {
        console.error('[SW] Stream error:', err);
        controller.error(err);
      }
    },
  });
}

// ── AES‑CTR IV helpers ──
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
    out[b] = sum & 0xff;
    carry = Math.floor(carry / 256) + (sum >> 8);
  }
  return out;
}

// ── Base64 / Hex decoders ──
function b64ToU8(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

function hexToU8(hex) {
  const u8 = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < hex.length; i += 2) u8[i >> 1] = parseInt(hex.substr(i, 2), 16);
  return u8;
}