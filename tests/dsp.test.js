import { describe, it, expect } from 'vitest'
import {
  detrendLinear, removeMean, notchSections, bandpassSections, filtfilt,
  welch, bandPower, detectArtifacts, interpolateSegments, rereference,
  makeEpochs, normalize, timeFeatures, mean, std,
} from '../src/lib/dsp'
import { parseDelimited } from '../src/lib/parsers'
import { generateDataset, DATASETS } from '../src/lib/datasets'

const fs = 256
const t = (n) => Array.from({ length: n }, (_, i) => i / fs)
const sine = (f, amp, n = fs * 10) => Float64Array.from(t(n), (x) => amp * Math.sin(2 * Math.PI * f * x))

describe('Step 2: DC offset and detrending', () => {
  it('removes a constant offset and a linear slope', () => {
    const x = Float64Array.from(t(fs * 10), (s, i) => 200 + 5 * s + 10 * Math.sin(2 * Math.PI * 10 * s) + 0 * i)
    const { out, slope } = detrendLinear(x)
    expect(Math.abs(mean(out))).toBeLessThan(1e-9)
    expect(slope * fs).toBeCloseTo(5, 1) // µV per second
  })
  it('mean removal leaves zero mean', () => {
    const { out } = removeMean(Float64Array.from([1, 2, 3, 4, 100]))
    expect(Math.abs(mean(out))).toBeLessThan(1e-12)
  })
})

describe('Step 3: notch filter', () => {
  it('attenuates 50 Hz line noise by more than 20 dB but keeps 10 Hz', () => {
    const x = sine(10, 20).map((v, i) => v + sine(50, 20)[i])
    const y = filtfilt(x, notchSections(fs, 50, 30, false), fs * 2)
    const before = welch(x, fs), after = welch(y, fs)
    const att50 = 10 * Math.log10(bandPower(before, 49, 51) / bandPower(after, 49, 51))
    const keep10 = bandPower(after, 9, 11) / bandPower(before, 9, 11)
    expect(att50).toBeGreaterThan(20)
    expect(keep10).toBeGreaterThan(0.95)
  })
})

describe('Step 4: band-pass filter', () => {
  it('keeps in-band 10 Hz and removes 0.1 Hz drift and 80 Hz noise', () => {
    const a = sine(10, 10), d = sine(0.1, 50), h = sine(80, 10)
    const x = a.map((v, i) => v + d[i] + h[i])
    const y = filtfilt(x, bandpassSections(fs, 0.5, 40, 4), fs * 3)
    const mid = (arr) => arr.subarray(fs * 3, fs * 7) // avoid edges
    const err = std(mid(y).map((v, i) => v - mid(a)[i]))
    expect(err).toBeLessThan(1.5) // output ≈ the 10 Hz component alone
  })
})

describe('Step 5: artifact detection', () => {
  it('finds a blink-like spike and interpolates it away', () => {
    const x = sine(10, 10, fs * 4)
    for (let i = 500; i < 540; i++) x[i] += 300
    const { segments } = detectArtifacts(x, fs, 100, 0.1)
    expect(segments.length).toBe(1)
    const y = interpolateSegments(x, segments)
    expect(Math.max(...y.map(Math.abs))).toBeLessThan(100)
  })
})

describe('Step 6–8: re-reference, epochs, normalisation', () => {
  it('common average reference makes the channel sum zero at every sample', () => {
    const chs = [sine(10, 10, 512), sine(5, 7, 512), sine(3, 4, 512)]
    const out = rereference(chs, 'car')
    for (let i = 0; i < 512; i += 37) expect(Math.abs(out[0][i] + out[1][i] + out[2][i])).toBeLessThan(1e-9)
  })
  it('creates the right number of epochs and rejects large ones', () => {
    const x = sine(10, 10, fs * 10)
    for (let i = fs * 4; i < fs * 4 + 20; i++) x[i] = 500
    const ep = makeEpochs([x], fs, 2, 0, true, 150)
    expect(ep.length).toBe(5)
    expect(ep.filter((e) => e.rejected).length).toBe(1)
  })
  it('z-score gives mean 0 and std 1', () => {
    const z = normalize(Float64Array.from([3, 7, 1, 9, 4, 6]), 'zscore')
    expect(mean(z)).toBeCloseTo(0, 10)
    expect(std(z)).toBeCloseTo(1, 10)
  })
})

describe('Time-domain features', () => {
  it('match analytic values for a pure sine wave', () => {
    const f = timeFeatures(sine(10, 10, fs * 4), fs)
    expect(f.rms).toBeCloseTo(10 / Math.SQRT2, 1)
    expect(f.ptp).toBeCloseTo(20, 0)
    expect(f.zcr).toBeCloseTo(20, 0) // 2 crossings per cycle
    expect(f.kurtosis).toBeCloseTo(-1.5, 1)
    expect(f.mobility * fs / (2 * Math.PI)).toBeCloseTo(10, 0) // ≈ mean frequency
    expect(f.complexity).toBeCloseTo(1, 1)
  })
})

describe('Data loading', () => {
  it('parses a CSV with a time column and detects the sampling rate', () => {
    const rows = ['time,Fz,Pz']
    for (let i = 0; i < 400; i++) rows.push(`${(i / 200).toFixed(3)},${Math.sin(i)},${Math.cos(i)}`)
    const d = parseDelimited(rows.join('\n'), 'test.csv')
    expect(d.fs).toBe(200)
    expect(d.channels.map((c) => c.label)).toEqual(['Fz', 'Pz'])
    expect(d.channels[0].data.length).toBe(400)
  })
  it('generates every preloaded dataset with the advertised size', () => {
    for (const meta of DATASETS) {
      const d = generateDataset(meta.id)
      expect(d.channels.length).toBe(meta.labels.length)
      expect(d.channels[0].data.length).toBe(meta.fs * meta.duration)
    }
  })
})
