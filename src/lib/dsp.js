// ---------------------------------------------------------------------------
// dsp.js — every signal-processing routine used by the EEG Preprocessing Lab.
// Written from scratch (no libraries) so students can read exactly what
// happens at each step.
// ---------------------------------------------------------------------------

/* ----------------------------- random numbers ---------------------------- */
// Small seeded PRNG so the synthetic recordings are identical on every load.
export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Standard normal sample (Box–Muller)
export function gauss(rng) {
  let u = 0
  while (u === 0) u = rng()
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// 1/f ("pink") noise — the background spectrum of real EEG falls off ~1/f.
// Paul Kellet's refined filter applied to white noise, scaled to `targetStd`.
export function pinkNoise(n, rng, targetStd = 1) {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  const out = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const w = gauss(rng)
    b0 = 0.99886 * b0 + w * 0.0555179
    b1 = 0.99332 * b1 + w * 0.0750759
    b2 = 0.969 * b2 + w * 0.153852
    b3 = 0.8665 * b3 + w * 0.3104856
    b4 = 0.55 * b4 + w * 0.5329522
    b5 = -0.7616 * b5 - w * 0.016898
    out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362
    b6 = w * 0.115926
  }
  const s = std(out)
  const m = mean(out)
  for (let i = 0; i < n; i++) out[i] = ((out[i] - m) / s) * targetStd
  return out
}

/* ------------------------------ basic stats ------------------------------ */
export function mean(x) {
  let s = 0
  for (let i = 0; i < x.length; i++) s += x[i]
  return s / x.length
}
export function std(x, m = mean(x)) {
  let s = 0
  for (let i = 0; i < x.length; i++) s += (x[i] - m) ** 2
  return Math.sqrt(s / x.length)
}
export function rms(x) {
  let s = 0
  for (let i = 0; i < x.length; i++) s += x[i] * x[i]
  return Math.sqrt(s / x.length)
}
export function ptp(x) {
  let lo = Infinity, hi = -Infinity
  for (let i = 0; i < x.length; i++) {
    if (x[i] < lo) lo = x[i]
    if (x[i] > hi) hi = x[i]
  }
  return hi - lo
}

/* ------------------------- step 2: DC / detrend -------------------------- */
// Remove the mean only (DC offset)
export function removeMean(x) {
  const m = mean(x)
  const out = new Float64Array(x.length)
  for (let i = 0; i < x.length; i++) out[i] = x[i] - m
  return { out, intercept: m, slope: 0 }
}

// Least-squares straight line  x̂[n] = a + b·n  subtracted from the signal
export function detrendLinear(x) {
  const n = x.length
  const tMean = (n - 1) / 2
  const xMean = mean(x)
  let num = 0, den = 0
  for (let i = 0; i < n; i++) {
    const dt = i - tMean
    num += dt * (x[i] - xMean)
    den += dt * dt
  }
  const slope = den === 0 ? 0 : num / den
  const out = new Float64Array(n)
  for (let i = 0; i < n; i++) out[i] = x[i] - (xMean + slope * (i - tMean))
  return { out, intercept: xMean - slope * tMean, slope }
}

/* --------------------------- IIR biquad filters -------------------------- */
// Coefficients follow the Audio-EQ-Cookbook (R. Bristow-Johnson).
// Each section: H(z) = (b0 + b1 z⁻¹ + b2 z⁻²) / (1 + a1 z⁻¹ + a2 z⁻²)
function norm(b0, b1, b2, a0, a1, a2) {
  return { b: [b0 / a0, b1 / a0, b2 / a0], a: [1, a1 / a0, a2 / a0] }
}
export function lowpassBiquad(fc, fs, Q) {
  const w0 = (2 * Math.PI * fc) / fs, c = Math.cos(w0), al = Math.sin(w0) / (2 * Q)
  return norm((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + al, -2 * c, 1 - al)
}
export function highpassBiquad(fc, fs, Q) {
  const w0 = (2 * Math.PI * fc) / fs, c = Math.cos(w0), al = Math.sin(w0) / (2 * Q)
  return norm((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al)
}
export function notchBiquad(f0, fs, Q) {
  const w0 = (2 * Math.PI * f0) / fs, c = Math.cos(w0), al = Math.sin(w0) / (2 * Q)
  return norm(1, -2 * c, 1, 1 + al, -2 * c, 1 - al)
}

// Q values of the 2nd-order sections that make up an n-th order Butterworth
// filter: Q_k = 1 / (2·sin((2k−1)π / 2n)),  k = 1 … n/2
export function butterworthQs(order) {
  const qs = []
  for (let k = 1; k <= order / 2; k++) qs.push(1 / (2 * Math.sin(((2 * k - 1) * Math.PI) / (2 * order))))
  return qs
}
export function butterSections(type, fc, fs, order) {
  return butterworthQs(order).map((q) => (type === 'low' ? lowpassBiquad(fc, fs, q) : highpassBiquad(fc, fs, q)))
}

// Run one biquad (Direct Form II transposed). State starts at the steady
// state for a constant input equal to x[0] to minimise start-up transients.
function runBiquad(x, { b, a }) {
  const [b0, b1, b2] = b
  const [, a1, a2] = a
  const n = x.length
  const out = new Float64Array(n)
  if (n === 0) return out
  const u = x[0]
  const denom = 1 + a1 + a2
  const yss = Math.abs(denom) < 1e-12 ? 0 : (u * (b0 + b1 + b2)) / denom
  let z1 = yss - b0 * u
  let z2 = b2 * u - a2 * yss
  for (let i = 0; i < n; i++) {
    const xi = x[i]
    const y = b0 * xi + z1
    z1 = b1 * xi - a1 * y + z2
    z2 = b2 * xi - a2 * y
    out[i] = y
  }
  return out
}
function cascade(x, sections) {
  let y = x
  for (const s of sections) y = runBiquad(y, s)
  return y
}
function reverse(x) {
  const n = x.length
  const o = new Float64Array(n)
  for (let i = 0; i < n; i++) o[i] = x[n - 1 - i]
  return o
}

// Zero-phase forward–backward filtering (like scipy.signal.filtfilt).
// The signal is padded with an odd reflection at both ends to reduce edge
// effects, filtered forward, reversed, filtered again, reversed back.
export function filtfilt(x, sections, padLen) {
  const n = x.length
  if (n < 4) return Float64Array.from(x)
  const p = Math.max(0, Math.min(padLen, n - 2))
  const padded = new Float64Array(n + 2 * p)
  for (let i = 0; i < p; i++) padded[i] = 2 * x[0] - x[p - i]
  padded.set(x, p)
  for (let i = 0; i < p; i++) padded[n + p + i] = 2 * x[n - 1] - x[n - 2 - i]
  let y = cascade(padded, sections)
  y = reverse(y)
  y = cascade(y, sections)
  y = reverse(y)
  return y.slice(p, p + n)
}

export function notchSections(fs, f0, Q, harmonics) {
  const secs = []
  if (f0 > 0 && f0 < fs / 2) secs.push(notchBiquad(f0, fs, Q))
  if (harmonics && 2 * f0 < fs / 2) secs.push(notchBiquad(2 * f0, fs, Q))
  return secs
}
export function bandpassSections(fs, low, high, order) {
  const secs = []
  if (low > 0) secs.push(...butterSections('high', low, fs, order))
  if (high > 0 && high < fs / 2) secs.push(...butterSections('low', high, fs, order))
  return secs
}

// Magnitude response of a cascade in dB. Because filtfilt runs the filter
// twice, the effective response is |H|² (i.e. 2× the dB value).
export function freqResponse(sections, fs, nPoints = 512, zeroPhase = true) {
  const f = new Float64Array(nPoints)
  const db = new Float64Array(nPoints)
  for (let k = 0; k < nPoints; k++) {
    const freq = (k / (nPoints - 1)) * (fs / 2)
    const w = (2 * Math.PI * freq) / fs
    let mag = 1
    for (const { b, a } of sections) {
      // evaluate polynomial at z = e^{jw}
      const nr = b[0] + b[1] * Math.cos(w) + b[2] * Math.cos(2 * w)
      const ni = -(b[1] * Math.sin(w) + b[2] * Math.sin(2 * w))
      const dr = a[0] + a[1] * Math.cos(w) + a[2] * Math.cos(2 * w)
      const di = -(a[1] * Math.sin(w) + a[2] * Math.sin(2 * w))
      mag *= Math.sqrt(nr * nr + ni * ni) / Math.sqrt(dr * dr + di * di)
    }
    f[k] = freq
    db[k] = (zeroPhase ? 2 : 1) * 20 * Math.log10(Math.max(mag, 1e-12))
  }
  return { f, db }
}

/* ------------------------------ spectrum -------------------------------- */
function fftInPlace(re, im) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang), wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k], ai = im[i + k]
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr
        re[i + k] = ar + br
        im[i + k] = ai + bi
        re[i + k + len / 2] = ar - br
        im[i + k + len / 2] = ai - bi
        const ncr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = ncr
      }
    }
  }
}

// Welch power spectral density (Hann window, 50 % overlap) in µV²/Hz.
// Only used to *show* what the filters do — the assignment's features are
// all time-domain.
export function welch(x, fs) {
  const n = x.length
  let nper = 1
  while (nper * 2 <= Math.min(n, Math.round(fs * 2)) * 1.0001) nper *= 2
  nper = Math.max(16, Math.min(nper, 1 << Math.floor(Math.log2(n))))
  const step = nper / 2
  const win = new Float64Array(nper)
  let U = 0
  for (let i = 0; i < nper; i++) {
    win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (nper - 1))
    U += win[i] * win[i]
  }
  const half = nper / 2 + 1
  const acc = new Float64Array(half)
  let K = 0
  const re = new Float64Array(nper), im = new Float64Array(nper)
  for (let s = 0; s + nper <= n; s += step) {
    let m = 0
    for (let i = 0; i < nper; i++) m += x[s + i]
    m /= nper
    for (let i = 0; i < nper; i++) {
      re[i] = (x[s + i] - m) * win[i]
      im[i] = 0
    }
    fftInPlace(re, im)
    for (let k = 0; k < half; k++) acc[k] += re[k] * re[k] + im[k] * im[k]
    K++
  }
  const psd = new Float64Array(half)
  const freqs = new Float64Array(half)
  for (let k = 0; k < half; k++) {
    let v = acc[k] / (Math.max(K, 1) * fs * U)
    if (k !== 0 && k !== half - 1) v *= 2
    psd[k] = v
    freqs[k] = (k * fs) / nper
  }
  return { freqs, psd }
}
export function bandPower({ freqs, psd }, f1, f2) {
  const df = freqs[1] - freqs[0]
  let s = 0
  for (let k = 0; k < freqs.length; k++) if (freqs[k] >= f1 && freqs[k] <= f2) s += psd[k] * df
  return s
}

/* ------------------------ step 5: artifact handling ---------------------- */
// Mark every sample whose absolute amplitude exceeds `thresh` µV, then widen
// each marked region by `padSec` on both sides (an artifact starts and ends
// before it crosses the threshold).
export function detectArtifacts(x, fs, thresh, padSec) {
  const n = x.length
  const pad = Math.round(padSec * fs)
  const hit = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    if (Math.abs(x[i]) > thresh) {
      const a = Math.max(0, i - pad), b = Math.min(n - 1, i + pad)
      for (let j = a; j <= b; j++) hit[j] = 1
    }
  }
  const segments = []
  let start = -1, count = 0
  for (let i = 0; i <= n; i++) {
    const on = i < n && hit[i]
    if (on) count++
    if (on && start < 0) start = i
    if (!on && start >= 0) {
      segments.push({ start, end: i - 1 })
      start = -1
    }
  }
  return { segments, fraction: count / n }
}

// Replace each marked segment with a straight line joining its clean edges.
export function interpolateSegments(x, segments) {
  const out = Float64Array.from(x)
  const n = x.length
  for (const { start, end } of segments) {
    const a = start - 1, b = end + 1
    const va = a >= 0 ? x[a] : b < n ? x[b] : 0
    const vb = b < n ? x[b] : va
    const len = end - start + 2
    for (let i = start; i <= end; i++) out[i] = va + ((vb - va) * (i - a)) / len
  }
  return out
}

/* --------------------------- step 6: re-reference ------------------------ */
export function rereference(chs, mode) {
  if (mode === 'none' || chs.length < 2) return chs
  const n = chs[0].length
  if (mode === 'car') {
    const avg = new Float64Array(n)
    for (const x of chs) for (let i = 0; i < n; i++) avg[i] += x[i]
    for (let i = 0; i < n; i++) avg[i] /= chs.length
    return chs.map((x) => {
      const o = new Float64Array(n)
      for (let i = 0; i < n; i++) o[i] = x[i] - avg[i]
      return o
    })
  }
  // reference to a single channel (index)
  const ref = chs[mode]
  return chs.map((x) => {
    const o = new Float64Array(n)
    for (let i = 0; i < n; i++) o[i] = x[i] - ref[i]
    return o
  })
}

/* ----------------------------- step 7: epochs ---------------------------- */
export function makeEpochs(chs, fs, lenSec, overlap, rejectOn, rejectPtp) {
  const n = chs[0].length
  const L = Math.max(4, Math.round(lenSec * fs))
  const step = Math.max(1, Math.round(L * (1 - overlap)))
  const epochs = []
  for (let s = 0; s + L <= n; s += step) {
    let worst = 0, worstCh = -1
    chs.forEach((x, ci) => {
      const v = ptp(x.subarray(s, s + L))
      if (v > worst) {
        worst = v
        worstCh = ci
      }
    })
    epochs.push({ start: s, end: s + L, ptp: worst, worstCh, rejected: rejectOn && worst > rejectPtp })
  }
  return epochs
}

/* -------------------------- step 8: normalisation ------------------------ */
export function normalize(x, method) {
  const n = x.length
  const o = new Float64Array(n)
  if (method === 'zscore') {
    const m = mean(x), s = std(x, m) || 1
    for (let i = 0; i < n; i++) o[i] = (x[i] - m) / s
  } else if (method === 'minmax') {
    let lo = Infinity, hi = -Infinity
    for (let i = 0; i < n; i++) {
      if (x[i] < lo) lo = x[i]
      if (x[i] > hi) hi = x[i]
    }
    const r = hi - lo || 1
    for (let i = 0; i < n; i++) o[i] = (2 * (x[i] - lo)) / r - 1
  } else return x
  return o
}

/* ----------------------- time-domain feature set ------------------------ */
export function timeFeatures(x, fs) {
  const n = x.length
  const T = n / fs
  let sum = 0, mn = Infinity, mx = -Infinity, absSum = 0, sq = 0
  for (let i = 0; i < n; i++) {
    const v = x[i]
    sum += v
    absSum += Math.abs(v)
    sq += v * v
    if (v < mn) mn = v
    if (v > mx) mx = v
  }
  const mu = sum / n
  let m2 = 0, m3 = 0, m4 = 0, zc = 0, ll = 0
  const dx = new Float64Array(n - 1)
  for (let i = 0; i < n; i++) {
    const d = x[i] - mu
    m2 += d * d
    m3 += d * d * d
    m4 += d * d * d * d
    if (i > 0) {
      const prev = x[i - 1] - mu
      if ((prev < 0 && d >= 0) || (prev >= 0 && d < 0)) zc++
      dx[i - 1] = x[i] - x[i - 1]
      ll += Math.abs(dx[i - 1])
    }
  }
  m2 /= n
  m3 /= n
  m4 /= n
  const sigma = Math.sqrt(m2)
  const ddx = new Float64Array(Math.max(0, n - 2))
  for (let i = 0; i < n - 2; i++) ddx[i] = dx[i + 1] - dx[i]
  const vx = m2
  const vdx = std(dx) ** 2
  const vddx = ddx.length ? std(ddx) ** 2 : 0
  const mobility = vx > 0 ? Math.sqrt(vdx / vx) : 0
  const mobD = vdx > 0 ? Math.sqrt(vddx / vdx) : 0
  const sorted = Float64Array.from(x).sort()
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2
  return {
    mean: mu,
    median,
    std: sigma,
    variance: m2,
    rms: Math.sqrt(sq / n),
    mav: absSum / n,
    min: mn,
    max: mx,
    ptp: mx - mn,
    skewness: sigma > 0 ? m3 / sigma ** 3 : 0,
    kurtosis: sigma > 0 ? m4 / sigma ** 4 - 3 : 0,
    zcr: zc / T,
    lineLength: ll / T,
    energy: sq,
    power: sq / n,
    mobility,
    complexity: mobility > 0 ? mobD / mobility : 0,
  }
}
