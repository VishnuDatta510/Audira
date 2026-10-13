/** Speech is louder than the room's own floor and keeps going; a cough or a key click does not. */
export const VOICE = {
  floorRatio: 3,
  minRms: 0.008,
  hangoverMs: 250,
  floorRise: 0.002,
} as const;

export class VoiceGate {
  private floor: number | null = null;
  private since: number | null = null;
  private lastVoiced = 0;

  /** Feed one loudness reading; returns how long speech has been going on, in seconds. */
  push(rms: number, now: number): number {
    // The floor drops at once to a quieter room and climbs back slowly, so a long sentence cannot raise it.
    this.floor = this.floor === null || rms < this.floor ? rms : this.floor + (rms - this.floor) * VOICE.floorRise;
    if (rms > Math.max(this.floor * VOICE.floorRatio, VOICE.minRms)) {
      this.lastVoiced = now;
      this.since ??= now;
    } else if (this.since !== null && now - this.lastVoiced > VOICE.hangoverMs) {
      this.since = null;
    }
    return this.since === null ? 0 : (now - this.since) / 1000;
  }
}

export type VoiceMeter = { read: (now: number) => number; close: () => void };

/** Loudness of the speech band on the camera's own microphone track. */
export function listenForVoice(stream: MediaStream, context: AudioContext): VoiceMeter | null {
  if (!stream.getAudioTracks().length) return null;
  const source = context.createMediaStreamSource(stream);
  const band = context.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 1000;
  band.Q.value = 0.5;
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(band).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  const gate = new VoiceGate();
  return {
    read: (now) => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      return gate.push(Math.sqrt(sum / samples.length), now);
    },
    close: () => source.disconnect(),
  };
}
