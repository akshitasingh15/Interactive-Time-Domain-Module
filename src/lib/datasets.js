// Preloaded recordings. They are *synthetic* — generated in the browser from
// known components — so students know the ground truth of what each
// preprocessing step should remove or keep.
import { mulberry32, gauss, pinkNoise } from './dsp'

const TAU = 2 * Math.PI
const bump = (t, tc, w) => Math.exp(-0.5 * ((t - tc) / w) ** 2)

export const DATASETS = [
  {
    id: 'rest',
    name: 'Resting state: eyes open → eyes closed',
    short: 'Resting EO → EC',
    fs: 256,
    duration: 30,
    labels: ['Fp1', 'Fp2', 'C3', 'C4', 'O1', 'O2'],
    lineFreq: 50,
    blurb: 'A classic Berger-effect recording. Alpha (≈10 Hz) is strongest over the occipital lobe and jumps up when the eyes close.',
    contains: ['DC offsets of up to ±200 µV', 'Slow drift', '50 Hz power-line hum', 'Eye blinks in Fp1/Fp2 (0–15 s)', 'Alpha rhythm, larger with eyes closed'],
    events: [{ start: 15, end: 30, label: 'Eyes closed' }],
  },
  {
    id: 'noisy',
    name: 'Noisy recording: muscle, electrode pop, 60 Hz',
    short: 'Noisy recording',
    fs: 250,
    duration: 20,
    labels: ['F3', 'F4', 'P3', 'P4'],
    lineFreq: 60,
    blurb: 'A deliberately messy recording, with strong 60 Hz interference (as in the Americas), jaw-clench muscle bursts and an electrode pop.',
    contains: ['Strong 60 Hz hum (+120 Hz harmonic)', 'Large baseline wander', 'Muscle (EMG) bursts on F3/F4', 'Electrode pop on P4 at 9 s', 'Theta and alpha activity'],
    events: [
      { start: 4, end: 5.5, label: 'Jaw clench' },
      { start: 12, end: 13, label: 'Jaw clench' },
    ],
  },
  {
    id: 'mi',
    name: 'Motor imagery: right-hand mu suppression',
    short: 'Motor imagery',
    fs: 160,
    duration: 24,
    labels: ['C3', 'Cz', 'C4', 'CP3', 'CP4'],
    lineFreq: 50,
    blurb: 'Over the sensorimotor cortex. When the subject imagines moving the right hand, the mu (≈11 Hz) and beta rhythms over the left hemisphere (C3/CP3) shrink. This is called event-related desynchronisation (ERD).',
    contains: ['Mu rhythm (11 Hz) and beta (22 Hz)', 'ERD on C3/CP3 during imagery', 'Mild 50 Hz hum', 'Small offsets and drift'],
    events: [3, 9, 15, 21].map((s) => ({ start: s, end: s + 3, label: 'Imagine right hand' })),
  },
  {
    id: 'sleep',
    name: 'Single-channel sleep (N2): delta and spindles',
    short: 'Sleep, single channel',
    fs: 128,
    duration: 30,
    labels: ['Cz'],
    lineFreq: 50,
    blurb: 'A single channel from light sleep. Slow, high-amplitude delta waves carry short sleep spindles (≈13 Hz bursts). Because there is only one channel, re-referencing is not possible.',
    contains: ['Large delta waves (1–2 Hz)', 'Sleep spindles at 5, 13 and 22 s', '50 Hz hum', 'Drift and DC offset'],
    events: [5, 13, 22].map((s) => ({ start: s, end: s + 0.9, label: 'Spindle' })),
  },
]

export function generateDataset(id) {
  const meta = DATASETS.find((d) => d.id === id)
  const { fs, duration, labels } = meta
  const n = Math.round(fs * duration)
  const rng = mulberry32(id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7))
  const ph = () => rng() * TAU
  const channels = []

  if (id === 'rest') {
    const blinks = []
    for (let t = 1.1; t < 14.4; t += 2 + rng() * 2.4) blinks.push(t)
    const w = {
      Fp1: [0.22, 1], Fp2: [0.22, 0.93], C3: [0.45, 0.25], C4: [0.45, 0.22], O1: [1, 0.05], O2: [0.92, 0.05],
    }
    const envPh = ph()
    for (const lab of labels) {
      const [aW, bW] = w[lab]
      const off = (rng() - 0.5) * 400, slope = (rng() - 0.5) * 6
      const sway = 10 + rng() * 15, swPh = ph(), lineA = 8 + rng() * 10, lPh = ph()
      const aPh = ph(), bPh = ph()
      const pn = pinkNoise(n, rng, 6)
      const x = new Float64Array(n)
      for (let i = 0; i < n; i++) {
        const t = i / fs
        const eyes = 0.25 + 0.75 / (1 + Math.exp(-(t - 15) * 6))
        const env = 0.65 + 0.35 * Math.sin(TAU * 0.17 * t + envPh)
        let bl = 0
        for (const tb of blinks) if (Math.abs(t - tb) < 0.6) bl += 165 * bump(t, tb, 0.085) - 25 * bump(t, tb + 0.22, 0.12)
        x[i] =
          off + slope * t + sway * Math.sin(TAU * 0.07 * t + swPh) + pn[i] +
          24 * aW * eyes * env * Math.sin(TAU * 10.2 * t + aPh) +
          2.5 * Math.sin(TAU * 19 * t + bPh) + bW * bl + lineA * Math.sin(TAU * 50 * t + lPh)
      }
      channels.push({ label: lab, data: x })
    }
  }

  if (id === 'noisy') {
    for (const lab of labels) {
      const frontal = lab.startsWith('F')
      const off = (rng() - 0.5) * 300, sway = 40 + rng() * 30, swPh = ph()
      const lineA = 35 + rng() * 25, lPh = ph(), aPh = ph(), thPh = ph()
      const pn = pinkNoise(n, rng, 8)
      const x = new Float64Array(n)
      for (let i = 0; i < n; i++) {
        const t = i / fs
        let v = off + sway * Math.sin(TAU * 0.05 * t + swPh) + 12 * Math.sin(TAU * 0.23 * t + swPh * 2) + pn[i]
        v += (frontal ? 10 : 5) * Math.sin(TAU * 6 * t + thPh) + (frontal ? 5 : 13) * Math.sin(TAU * 9.5 * t + aPh)
        v += lineA * Math.sin(TAU * 60 * t + lPh) + 0.25 * lineA * Math.sin(TAU * 120 * t + lPh)
        if (frontal && ((t > 4 && t < 5.5) || (t > 12 && t < 13))) v += 45 * gauss(rng)
        if (lab === 'P4' && t >= 9) v += 260 * Math.exp(-(t - 9) / 0.35)
        x[i] = v
      }
      channels.push({ label: lab, data: x })
    }
  }

  if (id === 'mi') {
    const muPh = ph(), btPh = ph()
    for (const lab of labels) {
      const left = lab === 'C3' || lab === 'CP3'
      const off = (rng() - 0.5) * 120, slope = (rng() - 0.5) * 3, lPh = ph()
      const pn = pinkNoise(n, rng, 5)
      const amp = lab === 'Cz' ? 0.7 : 1
      const x = new Float64Array(n)
      for (let i = 0; i < n; i++) {
        const t = i / fs
        const inTrial = (t % 6) >= 3
        const erd = left && inTrial ? 0.3 : 1
        const erdB = left && inTrial ? 0.5 : 1
        const env = 0.75 + 0.25 * Math.sin(TAU * 0.3 * t + muPh)
        x[i] =
          off + slope * t + pn[i] + amp * erd * env * 18 * Math.sin(TAU * 11 * t + muPh + (left ? 0 : 0.8)) +
          amp * erdB * 6 * Math.sin(TAU * 22 * t + btPh) + 6 * Math.sin(TAU * 50 * t + lPh)
      }
      channels.push({ label: lab, data: x })
    }
  }

  if (id === 'sleep') {
    const off = 140, p1 = ph(), p2 = ph(), p3 = ph(), lPh = ph()
    const pn = pinkNoise(n, rng, 9)
    const x = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      const t = i / fs
      let v = off + 1.8 * t + 25 * Math.sin(TAU * 0.04 * t) + pn[i]
      v += 32 * Math.sin(TAU * 1.1 * t + p1) * (0.7 + 0.3 * Math.sin(TAU * 0.1 * t)) + 18 * Math.sin(TAU * 1.7 * t + p2) + 8 * Math.sin(TAU * 0.6 * t + p3)
      for (const s of [5, 13, 22]) if (t >= s && t <= s + 0.9) v += 28 * Math.sin((Math.PI * (t - s)) / 0.9) ** 2 * Math.sin(TAU * 13 * t)
      v += 10 * Math.sin(TAU * 50 * t + lPh)
      x[i] = v
    }
    channels.push({ label: 'Cz', data: x })
  }

  return {
    name: meta.name,
    source: 'preloaded',
    id,
    fs,
    unit: 'µV',
    channels,
    events: meta.events,
    lineFreq: meta.lineFreq,
    notes: [],
  }
}
