/* Exporta el loop a MP4 (H.264 1080p 30 fps) con WebCodecs + mp4-muxer.
   El loop se codifica una sola vez y se repite para el video largo. */
(function (global) {
  'use strict';
  const { FPS } = global.SmashEngine;
  const FRAME_US = 1e6 / FPS;

  async function pickConfig(bitrate, override, width, height) {
    if (!('VideoEncoder' in global)) throw new Error('Este navegador no puede exportar video. Usa Google Chrome o Microsoft Edge actualizados.');
    const codecs = override ? [override] : ['avc1.640028', 'avc1.4d0028', 'avc1.42e028', 'avc1.42001f'];
    for (const hw of ['prefer-hardware', 'no-preference', 'prefer-software']) {
      for (const codec of codecs) {
        const cfg = { codec, width, height, bitrate, bitrateMode: 'variable', framerate: FPS, hardwareAcceleration: hw };
        if (codec.startsWith('avc1')) cfg.avc = { format: 'avc' };
        try {
          const r = await VideoEncoder.isConfigSupported(cfg);
          if (r.supported) return r.config;
        } catch (e) { /* sigue probando */ }
      }
    }
    throw new Error('Este navegador no tiene codificador H.264. Usa Google Chrome o Microsoft Edge en Windows.');
  }

  // Codifica un loop completo y devuelve los trozos codificados.
  async function encodeLoop(engine, { onProgress, isCancelled, bitrate = 4_000_000, codec }) {
    const { width, height } = engine;
    const cfg = await pickConfig(bitrate, codec, width, height);
    const frames = engine.frames;
    const c = document.createElement('canvas'); c.width = width; c.height = height;
    const ctx = c.getContext('2d', { alpha: false });
    const chunks = []; let meta = null, err = null;
    const enc = new VideoEncoder({
      output: (chunk, m) => {
        const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
        chunks.push({ data, type: chunk.type, timestamp: chunk.timestamp });
        if (!meta && m && m.decoderConfig) meta = m;
      },
      error: e => { err = e; },
    });
    enc.configure(cfg);
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) {
      if (err) throw err;
      if (isCancelled && isCancelled()) { enc.close(); throw new Error('cancelado'); }
      engine.render(ctx, i / FPS);
      const vf = new VideoFrame(c, { timestamp: Math.round(i * FRAME_US), duration: Math.round(FRAME_US) });
      enc.encode(vf, { keyFrame: i % 60 === 0 });
      vf.close();
      while (enc.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 1));
      if (i % 6 === 0) {
        onProgress && onProgress({ phase: 'render', done: i, total: frames, elapsed: (performance.now() - t0) / 1000 });
        await new Promise(r => setTimeout(r, 0));
      }
    }
    await enc.flush();
    enc.close();
    if (err) throw err;
    if (!meta) throw new Error('El codificador no entregó la configuración del video.');
    chunks.sort((a, b) => a.timestamp - b.timestamp);
    return { chunks, meta, frames, width, height, codec: cfg.codec, mux: cfg.codec.startsWith('avc1') ? 'avc' : cfg.codec.startsWith('vp09') ? 'vp9' : 'av1' };
  }

  function writeMp4(Mp4Muxer, target, fastStart, enc, reps) {
    const muxer = new Mp4Muxer.Muxer({
      target, fastStart,
      video: { codec: enc.mux, width: enc.width, height: enc.height, frameRate: FPS },
      firstTimestampBehavior: 'offset',
    });
    let first = true;
    for (let r = 0; r < reps; r++) {
      const base = r * enc.frames;
      for (let j = 0; j < enc.chunks.length; j++) {
        const ch = enc.chunks[j];
        const idx = Math.round(ch.timestamp / FRAME_US) + base;
        muxer.addVideoChunkRaw(ch.data, ch.type, Math.round(idx * FRAME_US), Math.round(FRAME_US), first ? enc.meta : undefined);
        first = false;
      }
    }
    muxer.finalize();
  }

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  }

  // minutes = 0 → solo el loop. Devuelve un resumen.
  async function exportVideo(engine, { minutes, fileName, onProgress, isCancelled, codec }) {
    const Mp4Muxer = global.Mp4Muxer;
    const loopSec = engine.duration;
    const reps = minutes > 0 ? Math.max(1, Math.round((minutes * 60) / loopSec)) : 1;
    // Para el video largo se pide primero dónde guardarlo (escribe directo al disco).
    let handle = null;
    if (reps > 1 && global.showSaveFilePicker) {
      try {
        handle = await global.showSaveFilePicker({ suggestedName: fileName, types: [{ description: 'Video MP4', accept: { 'video/mp4': ['.mp4'] } }] });
      } catch (e) {
        if (e && e.name === 'AbortError') throw new Error('cancelado');
        handle = null;
      }
    }
    const enc = await encodeLoop(engine, { onProgress, isCancelled, codec });
    onProgress && onProgress({ phase: 'mux', done: 0, total: 1 });
    await new Promise(r => setTimeout(r, 30));
    let bytes = 0;
    if (handle) {
      const stream = await handle.createWritable();
      const target = new Mp4Muxer.FileSystemWritableFileStreamTarget(stream, { chunkSize: 16 * 2 ** 20 });
      writeMp4(Mp4Muxer, target, false, enc, reps);
      await stream.close();
      const f = await handle.getFile(); bytes = f.size;
    } else {
      const target = new Mp4Muxer.ArrayBufferTarget();
      writeMp4(Mp4Muxer, target, 'in-memory', enc, reps);
      const blob = new Blob([target.buffer], { type: 'video/mp4' });
      bytes = blob.size;
      download(blob, fileName);
    }
    onProgress && onProgress({ phase: 'done', done: 1, total: 1 });
    return { bytes, seconds: reps * loopSec, reps, loopSec, codec: enc.codec, savedTo: handle ? handle.name : fileName };
  }

  global.SmashExporter = { exportVideo, encodeLoop, writeMp4 };
})(window);
