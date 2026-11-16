import { useMemo } from 'react'
import {
  detrendLinear, removeMean, notchSections, bandpassSections, filtfilt,
  detectArtifacts, interpolateSegments, rereference, makeEpochs, normalize, timeFeatures,
} from './dsp'
import { FEATURES } from './features'

export const DEFAULT_PARAMS = {
  detrend: 'linear',
  notch: { enabled: true, f0: 50, Q: 30, harmonics: true },
  bandpass: { enabled: true, low: 0.5, high: 40, order: 4 },
  artifact: { enabled: true, thresh: 100, pad: 0.2, method: 'interpolate' },
  reref: { mode: 'car' },
  epoch: { len: 2, overlap: 0, reject: true, thresh: 150 },
  norm: { method: 'zscore' },
  featureSource: 'clean',
}

// Each stage is memoised separately: changing a later parameter never
// re-runs the earlier (more expensive) stages.
export function usePipeline(raw, p) {
  const fs = raw.fs
  const s0 = useMemo(() => raw.channels.map((c) => c.data), [raw])

  const dc = useMemo(() => {
    const res = s0.map((x) => (p.detrend === 'linear' ? detrendLinear(x) : p.detrend === 'mean' ? removeMean(x) : { out: x, intercept: 0, slope: 0 }))
    return { data: res.map((r) => r.out), info: res }
  }, [s0, p.detrend])

  const notch = useMemo(() => {
    const secs = p.notch.enabled ? notchSections(fs, p.notch.f0, p.notch.Q, p.notch.harmonics) : []
    const data = secs.length ? dc.data.map((x) => filtfilt(x, secs, Math.round(fs * 2))) : dc.data
    return { data, secs }
  }, [dc, fs, p.notch.enabled, p.notch.f0, p.notch.Q, p.notch.harmonics])

  const bandpass = useMemo(() => {
    const { enabled, low, high, order } = p.bandpass
    const secs = enabled ? bandpassSections(fs, low, Math.min(high, fs / 2 - 0.5), order) : []
    const data = secs.length ? notch.data.map((x) => filtfilt(x, secs, Math.round(fs * 3))) : notch.data
    return { data, secs }
  }, [notch, fs, p.bandpass])

  const artifact = useMemo(() => {
    const { enabled, thresh, pad, method } = p.artifact
    if (!enabled) return { data: bandpass.data, det: bandpass.data.map(() => ({ segments: [], fraction: 0 })) }
    const det = bandpass.data.map((x) => detectArtifacts(x, fs, thresh, pad))
    const data = method === 'interpolate' ? bandpass.data.map((x, i) => interpolateSegments(x, det[i].segments)) : bandpass.data
    return { data, det }
  }, [bandpass, fs, p.artifact])

  const reref = useMemo(() => {
    const m = p.reref.mode
    const mode = m === 'car' || m === 'none' ? m : Number(m)
    return { data: rereference(artifact.data, artifact.data.length < 2 ? 'none' : mode) }
  }, [artifact, p.reref.mode])

  const epochs = useMemo(
    () => makeEpochs(reref.data, fs, p.epoch.len, p.epoch.overlap, p.epoch.reject, p.epoch.thresh),
    [reref, fs, p.epoch],
  )

  const norm = useMemo(() => ({ data: reref.data.map((x) => normalize(x, p.norm.method)) }), [reref, p.norm.method])

  const features = useMemo(() => {
    const src = p.featureSource === 'normalized' ? norm.data : reref.data
    const kept = epochs.filter((e) => !e.rejected)
    const use = kept.length ? kept : [{ start: 0, end: src[0].length }]
    const perChannel = src.map((x, ci) => {
      const perEpoch = use.map((e) => timeFeatures(x.subarray(e.start, e.end), fs))
      const mean = {}, sd = {}
      for (const f of FEATURES) {
        const v = perEpoch.map((r) => r[f.key])
        const m = v.reduce((a, b) => a + b, 0) / v.length
        mean[f.key] = m
        sd[f.key] = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, v.length - 1))
      }
      return { label: raw.channels[ci].label, perEpoch, mean, sd }
    })
    return { perChannel, used: use, fallback: !kept.length }
  }, [norm, reref, epochs, fs, p.featureSource, raw])

  return { s0, dc, notch, bandpass, artifact, reref, epochs, norm, features }
}
