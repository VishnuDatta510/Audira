const WORKLET = `
class PcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage(channel);
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
`;

function downsampleTo16k(samples: Float32Array, fromRate: number): Int16Array {
  const ratio = fromRate / 16000;
  const length = Math.max(1, Math.floor(samples.length / ratio));
  const pcm = new Int16Array(length);
  for (let index = 0; index < length; index += 1) {
    const source = samples[Math.min(samples.length - 1, Math.floor(index * ratio))] ?? 0;
    const clamped = Math.max(-1, Math.min(1, source));
    pcm[index] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return pcm;
}

export interface MicCapture {
  stop: () => void;
}

export async function startMicCapture(onPcm: (pcm: ArrayBuffer) => void): Promise<MicCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const context = new AudioContext();
  const blob = new Blob([WORKLET], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  await context.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);

  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, "pcm-capture");
  const silent = context.createGain();
  silent.gain.value = 0;
  node.port.onmessage = (event: MessageEvent<Float32Array>) => {
    const pcm = downsampleTo16k(event.data, context.sampleRate);
    const bytes = new Uint8Array(pcm.byteLength);
    bytes.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
    onPcm(bytes.buffer);
  };
  source.connect(node);
  node.connect(silent);
  silent.connect(context.destination);
  if (context.state === "suspended") await context.resume();

  return {
    stop: () => {
      node.disconnect();
      source.disconnect();
      for (const track of stream.getTracks()) track.stop();
      void context.close();
    },
  };
}
