// utils/evzonesEngine.js
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

const ffmpeg = new FFmpeg();

// ─── Helpers ────────────────────────────────────────────────────────────────

const uint8ToBase64 = (uint8) => {
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8.length; i += chunkSize)
        binary += String.fromCharCode.apply(null, uint8.subarray(i, i + chunkSize));
    return btoa(binary);
};

const readUint32 = (u8, o) =>
    (u8[o] * 16777216) + (u8[o+1] * 65536) + (u8[o+2] * 256) + u8[o+3];

const readBoxType = (u8, o) =>
    String.fromCharCode(u8[o+4], u8[o+5], u8[o+6], u8[o+7]);

const patchFtypBrand = (uint8) => {
    if (uint8[4]===0x66 && uint8[5]===0x74 && uint8[6]===0x79 && uint8[7]===0x70) {
        const p = new Uint8Array(uint8);
        p[8]=0x69; p[9]=0x73; p[10]=0x6f; p[11]=0x6d;
        console.log('[Engine] ftyp patched → isom');
        return p;
    }
    return uint8;
};

const removeUdtaFromBrain = (uint8) => {
    let offset = 0;
    while (offset < uint8.length - 8) {
        const size = readUint32(uint8, offset);
        const type = readBoxType(uint8, offset);
        if (type === 'moov') {
            let inner = offset + 8;
            while (inner < offset + size - 8) {
                const iSize = readUint32(uint8, inner);
                const iType = readBoxType(uint8, inner);
                if (iType === 'udta') {
                    const out = new Uint8Array(uint8.length - iSize);
                    out.set(uint8.slice(0, inner), 0);
                    out.set(uint8.slice(inner + iSize), inner);
                    const nm = size - iSize;
                    out[offset]=(nm>>>24)&0xff; out[offset+1]=(nm>>>16)&0xff;
                    out[offset+2]=(nm>>>8)&0xff; out[offset+3]=nm&0xff;
                    console.log('[Engine] udta removed (' + iSize + ' bytes)');
                    return out;
                }
                if (iSize < 8) break;
                inner += iSize;
            }
            break;
        }
        if (size < 8) break;
        offset += size;
    }
    return uint8;
};

const detectCodec = (uint8) => {
    for (let i = 0; i < uint8.length - 10; i++) {
        if (uint8[i]===0x61&&uint8[i+1]===0x76&&uint8[i+2]===0x63&&uint8[i+3]===0x43) {
            const p=uint8[i+5].toString(16).padStart(2,'0').toUpperCase();
            const c=uint8[i+6].toString(16).padStart(2,'0').toUpperCase();
            const l=uint8[i+7].toString(16).padStart(2,'0').toUpperCase();
            console.log('[Engine] Video codec: avc1.'+p+c+l);
            return 'avc1.'+p+c+l;
        }
        if (uint8[i]===0x68&&uint8[i+1]===0x76&&uint8[i+2]===0x63&&uint8[i+3]===0x43)
            return 'hev1.1.6.L93.B0';
    }
    return 'avc1.42E01E';
};

const detectAudioCodec = (uint8) => {
    for (let i = 0; i < uint8.length - 20; i++) {
        if (uint8[i]===0x65&&uint8[i+1]===0x73&&uint8[i+2]===0x64&&uint8[i+3]===0x73) {
            let o = i + 12;
            if (uint8[o] !== 0x03) continue;
            o++; while (uint8[o] & 0x80) o++; o++; o += 3;
            if (uint8[o] !== 0x04) continue;
            o++; while (uint8[o] & 0x80) o++; o++; o += 13;
            if (uint8[o] !== 0x05) continue;
            o++; while (uint8[o] & 0x80) o++; o++;
            const t = (uint8[o] >> 3) & 0x1f;
            console.log('[Engine] Audio codec: mp4a.40.' + (t||2));
            return 'mp4a.40.' + (t === 0 ? 2 : t);
        }
    }
    return 'mp4a.40.2';
};

const splitFragmentedMp4 = (uint8) => {
    let offset = 0, splitIndex = -1, foundMoov = false;
    const log = [];
    while (offset < uint8.length - 8) {
        const size = readUint32(uint8, offset);
        const type = readBoxType(uint8, offset);
        log.push('  offset='+offset+' type='+type+' size='+size);
        if (type === 'moov') foundMoov = true;
        if (type === 'moof' || type === 'mdat') { splitIndex = offset; break; }
        if (size < 8) break;
        offset += size;
    }
    console.log('[Engine] Box walk:\n' + log.join('\n'));
    if (splitIndex === -1) throw new Error(
        'Failed to locate moof/mdat. ' +
        (foundMoov ? 'moov found but no moof.' : 'moov not found.')
    );
    return { brainBytes: uint8.slice(0, splitIndex), brickBytes: uint8.slice(splitIndex) };
};

// AES-CTR encrypt — zero IV is safe because each segment has its own unique key
const aesEncryptSegment = async (plain, keyBytes) => {
    const iv = new Uint8Array(16);
    const ck = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CTR' }, false, ['encrypt']);
    return new Uint8Array(await crypto.subtle.encrypt(
        { name: 'AES-CTR', counter: iv, length: 128 }, ck, plain
    ));
};

// ─── Constants ───────────────────────────────────────────────────────────────
const SEGMENT_SIZE = 2 * 1024 * 1024; // 2MB per segment

// ─── Public API ──────────────────────────────────────────────────────────────

export const processEvzonesVideo = async (file) => {
    if (!ffmpeg.loaded) await ffmpeg.load();

    ffmpeg.on('log',      ({ message })  => console.log('[FFmpeg]', message));
    ffmpeg.on('progress', ({ progress }) => console.log('[FFmpeg]', Math.round(progress * 100) + '%'));

    console.log('[Engine] Input:', file.name, (file.size/1024/1024).toFixed(1), 'MB');
    await ffmpeg.writeFile('input.mp4', await fetchFile(file));

    console.log('[Engine] Pass 1: defragmenting...');
    await ffmpeg.exec([
        '-i','input.mp4','-map','0:v:0','-map','0:a:0',
        '-c','copy','-map_metadata','-1','-ignore_unknown',
        '-movflags','+faststart','-fflags','+genpts','defrag.mp4'
    ]);

    console.log('[Engine] Pass 2: fragmenting...');
    await ffmpeg.exec([
        '-i','defrag.mp4','-map','0:v:0','-map','0:a:0',
        '-c:v','copy','-c:a','copy','-map_metadata','-1',
        '-movflags','frag_keyframe+empty_moov+default_base_moof+omit_tfhd_offset',
        '-frag_duration','2000000','-brand','isom','-use_editlist','0',
        'fragmented.mp4'
    ]);

    const data  = await ffmpeg.readFile('fragmented.mp4');
    const uint8 = new Uint8Array(data.buffer);
    console.log('[Engine] FFmpeg output:', uint8.length, 'bytes');

    const { brainBytes: rawBrain, brickBytes } = splitFragmentedMp4(uint8);
    const brainBytes = removeUdtaFromBrain(patchFtypBrand(rawBrain));
    const codec      = detectCodec(brainBytes);
    const audioCodec = detectAudioCodec(brainBytes);

    // Encrypt each segment with a unique random key
    console.log('[Engine] Encrypting segments...');
    const segments  = [];
    const tempKeys  = [];

    for (let i = 0; i < brickBytes.length; i += SEGMENT_SIZE) {
        const plain  = brickBytes.slice(i, Math.min(i + SEGMENT_SIZE, brickBytes.length));
        const key    = crypto.getRandomValues(new Uint8Array(32));
        const enc    = await aesEncryptSegment(plain, key);
        segments.push(enc);
        tempKeys.push(Array.from(key).map(b => b.toString(16).padStart(2,'0')).join(''));
    }

    const totalSize = segments.reduce((a, s) => a + s.length, 0);
    const encBrick  = new Uint8Array(totalSize);
    let off = 0;
    for (const s of segments) { encBrick.set(s, off); off += s.length; }

    console.log('[Engine] Brain:', brainBytes.length, 'B | Segments:', segments.length, '| Codec:', codec, '| Audio:', audioCodec);

    return {
        brain:        uint8ToBase64(brainBytes),
        brick:        encBrick,
        tempKeys,
        segmentCount: segments.length,
        fileName:     file.name,
        codec,
        audioCodec
    };
};

export const generateSmartAsset = async (asset, receivedId, vaultBaseUrl) => {
    const VAULT_URL  = vaultBaseUrl || 'https://evzones-protocol.vercel.app';
    const codec      = asset.codec      || 'avc1.42E01E';
    const audioCodec = asset.audioCodec || 'mp4a.40.2';
    const brickB64   = uint8ToBase64(asset.brick);
    const SEG_SIZE   = SEGMENT_SIZE;

    console.log('[Engine] Generating smart asset:', receivedId, '| Segments:', asset.segmentCount);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EVZONES SENTINEL: ${asset.fileName}</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{background:linear-gradient(135deg,#0a0a0a,#1a1a1a);color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}
        #player{width:100%;max-width:100vw;max-height:100vh;display:none}
        .lock-screen{border:2px solid #00ff00;padding:3rem;background:rgba(10,10,10,0.95);border-radius:16px;text-align:center;max-width:500px;box-shadow:0 0 40px rgba(0,255,0,0.3)}
        .lock-screen h2{font-size:1.5rem;margin-bottom:1rem;color:#00ff00}
        .lock-screen p{margin:1rem 0;opacity:.9}
        #start-btn{background:#00ff00;color:#000;border:none;padding:15px 40px;border-radius:8px;font-weight:bold;font-size:1.1rem;cursor:pointer;transition:all .3s;margin-top:1rem}
        #start-btn:hover{background:#00cc00;transform:translateY(-2px)}
        #start-btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
        #debug{font-family:monospace;font-size:.8rem;color:#00ff00;margin-top:15px;word-break:break-all}
        .spinner{display:inline-block;width:18px;height:18px;border:3px solid rgba(0,255,0,.3);border-top-color:#00ff00;border-radius:50%;animation:spin 1s linear infinite;margin-left:8px;vertical-align:middle}
        @keyframes spin{to{transform:rotate(360deg)}}
        #wm-static{position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10;display:none;align-items:center;justify-content:center;opacity:.012;color:#fff;font-size:1.8vw;font-weight:bold;font-family:monospace;text-align:center;word-break:break-all;user-select:none;white-space:pre-wrap}
        #wm-dynamic{position:fixed;pointer-events:none;z-index:11;display:none;opacity:.018;color:#fff;font-size:1.1vw;font-weight:bold;font-family:monospace;user-select:none;transition:top 2s ease,left 2s ease}
    </style>
</head>
<body>
    <div id='status' class='lock-screen'>
        <h2>&#x1F6E1;&#xFE0F; EVZONES PROTOCOL ACTIVE</h2>
        <p id='msg'>Handshake Ready. Secure Connection Established.</p>
        <button id='start-btn'>INITIALIZE DECRYPTION</button>
        <p id='debug'></p>
    </div>
    <video id='player' controls controlsList='nodownload' playsinline></video>
    <div id='wm-static'></div>
    <div id='wm-dynamic'></div>
    <script>
        var BRICK_B64    = '${brickB64}';
        var ASSET_ID     = '${receivedId}';
        var VAULT_URL    = '${VAULT_URL}';
        var MIME_TYPE    = 'video/mp4; codecs="${codec}, ${audioCodec}"';
        var SEGMENT_SIZE = ${SEG_SIZE};
        var BATCH_SIZE   = 20;

        function hexToBytes(h){var b=new Uint8Array(h.length/2);for(var i=0;i<h.length;i+=2)b[i/2]=parseInt(h.substr(i,2),16);return b}
        function base64ToBytes(b){var s=atob(b.replace(/\s/g,''));var o=new Uint8Array(s.length);for(var i=0;i<s.length;i++)o[i]=s.charCodeAt(i);return o}
        function bytesToBase64(b){var s='';for(var i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);return btoa(s)}

        async function decryptSeg(enc, keyHex) {
            var k=hexToBytes(keyHex), iv=new Uint8Array(16);
            var ck=await crypto.subtle.importKey('raw',k,{name:'AES-CTR'},false,['decrypt']);
            return new Uint8Array(await crypto.subtle.decrypt({name:'AES-CTR',counter:iv,length:128},ck,enc));
        }

        async function hybridDecrypt(priv, payload) {
            var wk=base64ToBytes(payload.wrappedKey);
            var sk=await crypto.subtle.decrypt({name:'RSA-OAEP'},priv,wk);
            var ak=await crypto.subtle.importKey('raw',sk,{name:'AES-GCM'},false,['decrypt']);
            var iv=base64ToBytes(payload.iv), ct=base64ToBytes(payload.ciphertext), tg=base64ToBytes(payload.tag);
            var cb=new Uint8Array(ct.length+tg.length); cb.set(ct,0); cb.set(tg,ct.length);
            return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:iv,tagLength:128},ak,cb));
        }

        function appendBuffer(sb, chunk) {
            return new Promise(function(res,rej){
                function ok(){sb.removeEventListener('error',er);res()}
                function er(){sb.removeEventListener('updateend',ok);rej(new Error('SourceBuffer error'))}
                sb.addEventListener('updateend',ok,{once:true});
                sb.addEventListener('error',er,{once:true});
                try{sb.appendBuffer(chunk)}
                catch(e){sb.removeEventListener('updateend',ok);sb.removeEventListener('error',er);rej(new Error('appendBuffer: '+e.message))}
            });
        }

        var keyCache={}, rsaPriv=null, pubB64=null;

        async function fetchKeys(start) {
            var r=await fetch(VAULT_URL+'/api/unlock?assetID='+ASSET_ID,{
                method:'POST',headers:{'Content-Type':'application/json'},
                body:JSON.stringify({publicKey:pubB64,segmentStart:start,segmentCount:BATCH_SIZE})
            });
            if(!r.ok){var j=await r.json().catch(function(){return{}});throw new Error(j.error||'Vault denied: '+r.status)}
            var d=JSON.parse(await hybridDecrypt(rsaPriv,await r.json()));
            d.segmentKeys.forEach(function(k){keyCache[k.index]=k.key});
            return d;
        }

        async function initWatermarks(){
            var ip='unknown';
            try{ip=(await (await fetch('https://api.ipify.org?format=json')).json()).ip}catch(e){}
            var info=ip+' | '+window.location.href+' | '+new Date().toISOString().slice(0,19);
            var wms=document.getElementById('wm-static');
            wms.textContent=info+'\\n'+info+'\\n'+info;
            wms.style.display='flex';
            var wmd=document.getElementById('wm-dynamic');
            wmd.textContent=ip+'\\n'+window.location.hostname;
            wmd.style.display='block';
            function mv(){wmd.style.left=(5+Math.random()*75)+'vw';wmd.style.top=(5+Math.random()*85)+'vh'}
            mv(); setInterval(mv,30000);
        }

        var SESSION_ID=null;
        async function startSession(){
            try{SESSION_ID=(await (await fetch(VAULT_URL+'/api/checkpoint',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({assetID:ASSET_ID,viewerURL:window.location.href})})).json()).sessionID}catch(e){}
        }
        async function ping(cp){
            if(!SESSION_ID)return;
            try{await fetch(VAULT_URL+'/api/checkpoint',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({assetID:ASSET_ID,sessionID:SESSION_ID,checkpoint:cp})})}catch(e){}
        }

        function startKillPoll(player){
            setInterval(async function(){
                try{
                    var r=await fetch(VAULT_URL+'/api/unlock?assetID='+ASSET_ID,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({publicKey:pubB64,segmentStart:-1,segmentCount:0})});
                    if(r.status===403){
                        player.pause(); player.src='';
                        document.getElementById('status').style.display='flex';
                        document.getElementById('msg').innerHTML='<span style="color:#ff3333">&#x26A0; This video has been deactivated.</span>';
                        document.getElementById('wm-static').style.display='none';
                        document.getElementById('wm-dynamic').style.display='none';
                    }
                }catch(e){}
            },30000);
        }

        document.getElementById('start-btn').addEventListener('click',async function(){
            this.disabled=true;
            var msgEl=document.getElementById('msg'),debugEl=document.getElementById('debug'),player=document.getElementById('player');
            function step(n,t){console.log(n,t);debugEl.textContent='Step '+n+': '+t}

            try{
                // iOS fallback
                if(typeof MediaSource==='undefined'||!MediaSource.isTypeSupported){
                    step(1,'iOS — preparing stream...');
                    msgEl.innerHTML="Verifying... <span class='spinner'></span>";
                    var kp=await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},false,['decrypt']);
                    rsaPriv=kp.privateKey;
                    pubB64=bytesToBase64(new Uint8Array(await crypto.subtle.exportKey('spki',kp.publicKey)));
                    var init=await fetchKeys(0);
                    var brainBytes=base64ToBytes(init.brain);
                    var encBrick=base64ToBytes(BRICK_B64);
                    var dec=new Uint8Array(encBrick.length);
                    var ns=Math.ceil(encBrick.length/SEGMENT_SIZE);
                    for(var si=0;si<ns;si++){
                        if(!keyCache[si])await fetchKeys(si);
                        var ss=si*SEGMENT_SIZE,se=Math.min(ss+SEGMENT_SIZE,encBrick.length);
                        dec.set(await decryptSeg(encBrick.slice(ss,se),keyCache[si]),ss);
                        delete keyCache[si];
                    }
                    var brain=brainBytes,brick=dec,tot=brain.length+brick.length,pos=0;
                    var stream=new ReadableStream({start:function(ctrl){
                        function push(){
                            if(pos>=tot){ctrl.close();return}
                            var e=Math.min(pos+262144,tot),o=new Uint8Array(e-pos);
                            for(var i=0;i<o.length;i++){var a=pos+i;o[i]=a<brain.length?brain[a]:brick[a-brain.length]}
                            ctrl.enqueue(o);pos=e;setTimeout(push,0);
                        }push();
                    }});
                    var blobUrl=URL.createObjectURL(await new Response(stream,{headers:{'Content-Type':'video/mp4'}}).blob());
                    document.getElementById('status').style.display='none';
                    player.style.display='block';
                    player.src=blobUrl;
                    player.play().catch(function(){debugEl.textContent='Tap to play'});
                    await startSession();
                    setInterval(function(){if(!player.paused)ping(Math.floor(player.currentTime))},15000);
                    initWatermarks();
                    return;
                }

                // MSE path
                step(1,'Generating keypair...');
                var kp=await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},false,['decrypt']);
                rsaPriv=kp.privateKey;
                pubB64=bytesToBase64(new Uint8Array(await crypto.subtle.exportKey('spki',kp.publicKey)));

                step(2,'Vault handshake...');
                msgEl.innerHTML="Verifying Domain Authority... <span class='spinner'></span>";
                var init=await fetchKeys(0);
                var brainBytes=base64ToBytes(init.brain);
                console.log('Brain:',brainBytes.length,'bytes | Total segments:',init.segmentCount);

                step(3,'Validating codec...');
                if(!MediaSource.isTypeSupported(MIME_TYPE))throw new Error('Codec not supported: '+MIME_TYPE);

                step(4,'Initializing MediaSource...');
                var ms=new MediaSource();
                player.src=URL.createObjectURL(ms);
                await new Promise(function(res,rej){ms.addEventListener('sourceopen',res,{once:true});ms.addEventListener('error',rej,{once:true})});
                var sb=ms.addSourceBuffer(MIME_TYPE);
                console.log('SourceBuffer mode:',sb.mode);

                step(5,'Appending init + first segment...');
                await new Promise(function(r){setTimeout(r,0)});

                var encBrick=base64ToBytes(BRICK_B64);
                var firstEnc=encBrick.slice(0,Math.min(SEGMENT_SIZE,encBrick.length));
                var firstDec=await decryptSeg(firstEnc,keyCache[0]);
                delete keyCache[0];
                var initBuf=new Uint8Array(brainBytes.length+firstDec.length);
                initBuf.set(brainBytes,0); initBuf.set(firstDec,brainBytes.length);
                await appendBuffer(sb,initBuf);
                console.log('Brain + segment 0 OK');

                document.getElementById('status').style.display='none';
                player.style.display='block';
                player.play().catch(function(){debugEl.textContent='Click to play'});
                await startSession();
                setInterval(function(){if(!player.paused)ping(Math.floor(player.currentTime))},15000);
                startKillPoll(player);
                initWatermarks();

                step(6,'Streaming...');
                var TARGET=30, totalSegs=Math.ceil(encBrick.length/SEGMENT_SIZE);

                for(var si=1;si<totalSegs;si++){
                    if(ms.readyState!=='open')break;

                    // Throttle
                    if(player.buffered.length>0){
                        var ahead=player.buffered.end(player.buffered.length-1)-player.currentTime;
                        if(ahead>TARGET){
                            await new Promise(function(r){
                                player.addEventListener('timeupdate',function chk(){
                                    var a=player.buffered.length>0?player.buffered.end(player.buffered.length-1)-player.currentTime:0;
                                    if(a<TARGET/2){player.removeEventListener('timeupdate',chk);r()}
                                });
                            });
                        }
                    }

                    // Prefetch next batch
                    if(!keyCache[si])await fetchKeys(si);

                    var ss=si*SEGMENT_SIZE, se=Math.min(ss+SEGMENT_SIZE,encBrick.length);
                    var dec=await decryptSeg(encBrick.slice(ss,se),keyCache[si]);
                    delete keyCache[si];

                    // Evict old buffered data (keep 10s behind current position)
                    if(sb.buffered.length>0){
                        var bstart=sb.buffered.start(0), keep=Math.max(0,player.currentTime-10);
                        if(keep>bstart+1){
                            try{await new Promise(function(r){sb.addEventListener('updateend',r,{once:true});sb.remove(bstart,keep)})}catch(e){}
                        }
                    }

                    await appendBuffer(sb,dec);
                }

                if(ms.readyState==='open')ms.endOfStream();
                console.log('All segments streamed');

            }catch(err){
                console.error('Playback error:',err);
                msgEl.innerHTML="<span style='color:#ff3333'>&#x26A0; ACCESS DENIED</span>";
                debugEl.textContent='Error: '+err.message;
                debugEl.style.color='#ff3333';
                document.getElementById('start-btn').disabled=false;
                document.getElementById('start-btn').textContent='RETRY';
            }
        });
    </script>
</body>
</html>`;

    return new Blob([html], { type: 'text/html' });
};