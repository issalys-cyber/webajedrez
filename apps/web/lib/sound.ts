"use client";

/**
 * Sonidos generados con la Web Audio API.
 *
 * No se usan ficheros de audio: cero assets, cero licencias de terceros y cero
 * peso de red. Cada sonido es un oscilador (o una ráfaga de ruido) con una
 * envolvente corta.
 *
 * El AudioContext se crea de forma perezosa en el primer gesto del usuario,
 * porque los navegadores bloquean el audio antes de una interacción.
 */

export type SoundName =
  | "move"
  | "capture"
  | "castle"
  | "check"
  | "promote"
  | "end";

const MUTE_KEY = "webajedrez:muted";

let audioContext: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;

  if (!audioContext) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!Ctor) return null;
    audioContext = new Ctor();
  }

  if (audioContext.state === "suspended") {
    void audioContext.resume();
  }

  return audioContext;
}

type ToneOptions = {
  /** Frecuencia inicial en Hz. */
  freq: number;
  /** Retardo en segundos desde ahora. */
  at?: number;
  /** Duración en segundos. */
  dur: number;
  type?: OscillatorType;
  gain?: number;
  /** Si se indica, la frecuencia barre hasta este valor. */
  sweepTo?: number;
};

function tone({
  freq,
  at = 0,
  dur,
  type = "sine",
  gain = 0.12,
  sweepTo,
}: ToneOptions) {
  const ac = context();
  if (!ac) return;

  const start = ac.currentTime + at;
  const osc = ac.createOscillator();
  const amp = ac.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (sweepTo) {
    osc.frequency.exponentialRampToValueAtTime(sweepTo, start + dur);
  }

  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);

  osc.connect(amp).connect(ac.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

function noise({
  at = 0,
  dur,
  gain = 0.16,
  cutoff = 1600,
}: {
  at?: number;
  dur: number;
  gain?: number;
  cutoff?: number;
}) {
  const ac = context();
  if (!ac) return;

  const start = ac.currentTime + at;
  const length = Math.max(1, Math.floor(ac.sampleRate * dur));
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i += 1) {
    const decay = (1 - i / length) ** 2;
    data[i] = (Math.random() * 2 - 1) * decay;
  }

  const source = ac.createBufferSource();
  source.buffer = buffer;

  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = cutoff;

  const amp = ac.createGain();
  amp.gain.value = gain;

  source.connect(filter).connect(amp).connect(ac.destination);
  source.start(start);
}

export function playSound(name: SoundName) {
  if (isMuted()) return;

  switch (name) {
    case "move":
      // Golpe seco y corto: la pieza tocando el tablero.
      noise({ dur: 0.045, gain: 0.14, cutoff: 1200 });
      tone({ freq: 190, sweepTo: 130, dur: 0.06, gain: 0.07 });
      break;

    case "capture":
      // Más cuerpo y más ruido: se retira una pieza.
      noise({ dur: 0.08, gain: 0.22, cutoff: 900 });
      tone({ freq: 130, sweepTo: 85, dur: 0.1, gain: 0.1, type: "triangle" });
      break;

    case "castle":
      // Dos toques seguidos: rey y torre.
      noise({ dur: 0.04, gain: 0.12, cutoff: 1100 });
      noise({ at: 0.09, dur: 0.05, gain: 0.14, cutoff: 1000 });
      break;

    case "check":
      tone({ freq: 880, dur: 0.09, gain: 0.09, type: "triangle" });
      tone({ freq: 1320, at: 0.08, dur: 0.12, gain: 0.07, type: "triangle" });
      break;

    case "promote":
      tone({ freq: 520, sweepTo: 1040, dur: 0.18, gain: 0.1, type: "triangle" });
      break;

    case "end":
      tone({ freq: 392, dur: 0.16, gain: 0.09, type: "triangle" });
      tone({ freq: 523, at: 0.12, dur: 0.16, gain: 0.09, type: "triangle" });
      tone({ freq: 659, at: 0.24, dur: 0.28, gain: 0.08, type: "triangle" });
      break;
  }
}

export function isMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // localStorage puede estar bloqueado (modo privado): se ignora.
  }
}
