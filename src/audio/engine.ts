let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let compressor: DynamicsCompressorNode | null = null;

export function getAudioContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 10;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.15;

    masterGain = ctx.createGain();
    masterGain.gain.value = 0.7;
    masterGain.connect(compressor);
    compressor.connect(ctx.destination);
  }
  return ctx;
}

export function getMasterOutput(): GainNode {
  getAudioContext();
  return masterGain!;
}

export async function ensureResumed(): Promise<void> {
  const ac = getAudioContext();
  if (ac.state === 'suspended') {
    await ac.resume();
  }
}
