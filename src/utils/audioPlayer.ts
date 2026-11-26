const ttsCache = new Map<string, string>();
let activeAudioElement: HTMLAudioElement | null = null;
let activeBufferSource: AudioBufferSourceNode | null = null;
let activeAudioCtx: AudioContext | null = null;
let activeLevelRaf: number | null = null;

function stopLevelLoop() {
  if (activeLevelRaf !== null) {
    cancelAnimationFrame(activeLevelRaf);
    activeLevelRaf = null;
  }
}

export function stopActiveAudio() {
  stopLevelLoop();
  if (activeAudioElement) {
    activeAudioElement.pause();
    activeAudioElement = null;
  }
  if (activeBufferSource) {
    try {
      activeBufferSource.stop();
    } catch {
      // ignore
    }
    activeBufferSource = null;
  }
  if (activeAudioCtx) {
    try {
      activeAudioCtx.close();
    } catch {
      // ignore
    }
    activeAudioCtx = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export interface SpeakOptions {
  voiceName?: string;
  slow?: boolean;
  playbackRate?: number;
  personaStyle?: string;
  onStart?: () => void;
  onLevel?: (level: number) => void;
  onEnd?: () => void;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function speakStandardEnglish(
  text: string,
  options?: SpeakOptions
): Promise<void> {
  stopActiveAudio();
  const clean = text.trim();
  if (!clean) {
    options?.onEnd?.();
    return;
  }

  const voiceName = options?.voiceName ?? 'Zephyr';
  const playbackRate =
    typeof options?.playbackRate === 'number'
      ? Math.max(0.7, Math.min(1.4, options.playbackRate))
      : options?.slow
      ? 0.86
      : 1.0;
  const styleDesc =
    options?.personaStyle ||
    (playbackRate < 0.95
      ? 'Clear, slightly slower, well-enunciated standard English pronunciation coach'
      : 'Clear, natural, warm standard English conversation partner');
  const cacheKey = `${voiceName}:${styleDesc}:${clean}`;

  try {
    let base64 = ttsCache.get(cacheKey);
    if (!base64) {
      const response = await fetch('/api/speech/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: clean,
          voiceName,
          style: styleDesc,
        }),
      });
      if (!response.ok) {
        throw new Error('TTS service unavailable');
      }
      const data = (await response.json()) as { audioBase64?: string };
      if (!data.audioBase64) {
        throw new Error('Empty audio payload');
      }
      base64 = data.audioBase64;
      ttsCache.set(cacheKey, base64);
    }

    // Try Web Audio decodeAudioData for real-time lip-sync analyser energy
    if (typeof window !== 'undefined' && (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)) {
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        activeAudioCtx = ctx;
        const arrayBuf = base64ToArrayBuffer(base64);
        const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
        const source = ctx.createBufferSource();
        source.buffer = decoded;
        source.playbackRate.value = playbackRate;

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyser.connect(ctx.destination);
        activeBufferSource = source;

        const freqData = new Uint8Array(analyser.frequencyBinCount);
        options?.onStart?.();

        await new Promise<void>((resolve) => {
          let finished = false;
          const finish = () => {
            if (finished) return;
            finished = true;
            stopLevelLoop();
            options?.onLevel?.(0.2);
            options?.onEnd?.();
            resolve();
          };

          const pump = () => {
            if (finished) return;
            analyser.getByteFrequencyData(freqData);
            let sum = 0;
            for (let i = 0; i < freqData.length; i++) sum += freqData[i];
            const level = Math.min(1, Math.max(0.2, (sum / freqData.length / 255) * 3.1));
            options?.onLevel?.(level);
            activeLevelRaf = requestAnimationFrame(pump);
          };

          source.onended = finish;
          source.start(0);
          activeLevelRaf = requestAnimationFrame(pump);
        });
        return;
      } catch {
        // Fall through to HTMLAudioElement playback
        stopActiveAudio();
      }
    }

    const audio = new Audio(`data:audio/wav;base64,${base64}`);
    audio.playbackRate = playbackRate;
    activeAudioElement = audio;
    options?.onStart?.();

    await new Promise<void>((resolve) => {
      let phase = 0;
      const tickFallback = () => {
        if (audio.paused || audio.ended) return;
        phase += 0.35;
        options?.onLevel?.(0.45 + 0.35 * Math.abs(Math.sin(phase)));
        activeLevelRaf = requestAnimationFrame(tickFallback);
      };
      audio.onended = () => {
        stopLevelLoop();
        options?.onLevel?.(0.2);
        options?.onEnd?.();
        resolve();
      };
      audio.onerror = () => {
        stopLevelLoop();
        options?.onEnd?.();
        resolve();
      };
      audio.play().then(() => {
        activeLevelRaf = requestAnimationFrame(tickFallback);
      }).catch(() => {
        stopLevelLoop();
        options?.onEnd?.();
        resolve();
      });
    });
  } catch {
    // Offline or fallback to native browser speech synthesis
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      await new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(clean);
        utterance.lang = 'en-US';
        utterance.rate = playbackRate;
        let phase = 0;
        const pumpSpeech = () => {
          phase += 0.32;
          options?.onLevel?.(0.42 + 0.38 * Math.abs(Math.sin(phase)));
          activeLevelRaf = requestAnimationFrame(pumpSpeech);
        };
        utterance.onstart = () => {
          options?.onStart?.();
          activeLevelRaf = requestAnimationFrame(pumpSpeech);
        };
        utterance.onend = () => {
          stopLevelLoop();
          options?.onLevel?.(0.2);
          options?.onEnd?.();
          resolve();
        };
        utterance.onerror = () => {
          stopLevelLoop();
          options?.onEnd?.();
          resolve();
        };
        window.speechSynthesis.speak(utterance);
      });
    } else {
      options?.onEnd?.();
    }
  }
}

export function float32ToPcm16Base64(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function decodePcm24kToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const float32 = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    float32[i] = view.getInt16(i * 2, true) / 32768;
  }
  return float32;
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = String(reader.result ?? '');
      const commaIdx = res.indexOf(',');
      resolve(commaIdx >= 0 ? res.slice(commaIdx + 1) : res);
    };
    reader.onerror = () => reject(new Error('Failed to read recorded audio'));
    reader.readAsDataURL(blob);
  });
}
