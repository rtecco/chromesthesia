export type DebugParams = {
  // Position modulation
  filterCutoffMin: number;
  filterCutoffMax: number;
  pitchShiftRange: number;    // semitones +/-
  reverbMixMin: number;
  reverbMixMax: number;

  // Voice
  baseFreqMin: number;
  baseFreqMax: number;
  detuneMax: number;          // max cents at full saturation
  noiseMax: number;           // max noise amount at full warmth*saturation
  peakGain: number;

  // Playhead
  voiceOverlap: number;       // column duration multiplier
  maxVoices: number;

  // Master
  masterGain: number;
};

export const debugParams: DebugParams = {
  filterCutoffMin: 0.08,
  filterCutoffMax: 6.0,
  pitchShiftRange: 14,
  reverbMixMin: 0.05,
  reverbMixMax: 0.9,
  baseFreqMin: 55,
  baseFreqMax: 880,
  detuneMax: 25,
  noiseMax: 0.25,
  peakGain: 0.2,
  voiceOverlap: 1.1,
  maxVoices: 16,
  masterGain: 0.7,
};

type SliderDef = {
  key: keyof DebugParams;
  label: string;
  min: number;
  max: number;
  step: number;
};

const SLIDERS: SliderDef[] = [
  { key: 'masterGain', label: 'Master Gain', min: 0, max: 1.5, step: 0.05 },
  { key: 'peakGain', label: 'Voice Gain', min: 0.01, max: 0.5, step: 0.01 },
  { key: 'maxVoices', label: 'Max Voices', min: 1, max: 32, step: 1 },
  { key: 'voiceOverlap', label: 'Voice Overlap', min: 0.5, max: 3.0, step: 0.1 },
  { key: 'filterCutoffMin', label: 'Filter Min (X=0)', min: 0.01, max: 1.0, step: 0.01 },
  { key: 'filterCutoffMax', label: 'Filter Max (X=1)', min: 1.0, max: 12.0, step: 0.5 },
  { key: 'pitchShiftRange', label: 'Pitch Shift +/-', min: 0, max: 24, step: 1 },
  { key: 'reverbMixMin', label: 'Reverb Min (Y=0)', min: 0, max: 0.5, step: 0.01 },
  { key: 'reverbMixMax', label: 'Reverb Max (Y=1)', min: 0.1, max: 1.0, step: 0.05 },
  { key: 'baseFreqMin', label: 'Base Freq Min', min: 20, max: 200, step: 5 },
  { key: 'baseFreqMax', label: 'Base Freq Max', min: 200, max: 2000, step: 20 },
  { key: 'detuneMax', label: 'Detune Max (cents)', min: 0, max: 50, step: 1 },
  { key: 'noiseMax', label: 'Noise Max', min: 0, max: 0.5, step: 0.01 },
];

export function initDebugPanel(onMasterGainChange: (v: number) => void): void {
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'debug-toggle';
  toggle.textContent = '\u2699'; // gear icon
  toggle.title = 'Audio debug parameters';

  const panel = document.createElement('div');
  panel.className = 'debug-panel hidden';

  const heading = document.createElement('div');
  heading.className = 'debug-heading';
  heading.textContent = 'Audio Parameters';
  panel.appendChild(heading);

  for (const def of SLIDERS) {
    const row = document.createElement('div');
    row.className = 'debug-row';

    const label = document.createElement('label');
    label.className = 'debug-label';
    label.textContent = def.label;

    const value = document.createElement('span');
    value.className = 'debug-value';
    value.textContent = String(debugParams[def.key]);

    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'debug-slider';
    input.min = String(def.min);
    input.max = String(def.max);
    input.step = String(def.step);
    input.value = String(debugParams[def.key]);

    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      (debugParams as Record<string, number>)[def.key] = v;
      value.textContent = def.step >= 1 ? String(v) : v.toFixed(2);
      if (def.key === 'masterGain') onMasterGainChange(v);
    });

    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(value);
    panel.appendChild(row);
  }

  // Export button — logs current values to console for easy copy
  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.className = 'debug-export';
  exportBtn.textContent = 'Log values to console';
  exportBtn.addEventListener('click', () => {
    console.log('Debug params:', JSON.stringify(debugParams, null, 2));
  });
  panel.appendChild(exportBtn);

  toggle.addEventListener('click', () => {
    panel.classList.toggle('hidden');
  });

  document.getElementById('app')!.appendChild(toggle);
  document.getElementById('app')!.appendChild(panel);
}
