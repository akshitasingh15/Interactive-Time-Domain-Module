// Descriptions of every time-domain parameter shown on the results page.
export const FEATURES = [
  { key: 'mean', label: 'Mean', sym: 'μ', unit: 'µV', group: 'Amplitude statistics',
    formula: 'μ = (1/N) · Σ x[n]',
    desc: 'The average value. After DC removal and filtering it should be close to 0. A large mean points to leftover offset or drift.' },
  { key: 'median', label: 'Median', sym: 'x̃', unit: 'µV', group: 'Amplitude statistics',
    formula: 'middle value of sorted x',
    desc: 'A robust "centre" of the signal. A few big artifact spikes hardly move it.' },
  { key: 'std', label: 'Standard deviation', sym: 'σ', unit: 'µV', group: 'Amplitude statistics',
    formula: 'σ = √[ (1/N) · Σ (x[n] − μ)² ]',
    desc: 'The typical size of fluctuations around the mean. It is the most common single measure of EEG amplitude.' },
  { key: 'variance', label: 'Variance (Hjorth activity)', sym: 'σ²', unit: 'µV²', group: 'Amplitude statistics',
    formula: 'σ² = (1/N) · Σ (x[n] − μ)²',
    desc: 'The signal power around the mean. It equals Hjorth Activity and the total area under the power spectrum.' },
  { key: 'rms', label: 'Root mean square', sym: 'RMS', unit: 'µV', group: 'Amplitude statistics',
    formula: 'RMS = √[ (1/N) · Σ x[n]² ]',
    desc: 'The effective amplitude. For a zero-mean signal RMS = σ. For example, it rises in O1/O2 when alpha appears with the eyes closed.' },
  { key: 'mav', label: 'Mean absolute value', sym: 'MAV', unit: 'µV', group: 'Amplitude statistics',
    formula: 'MAV = (1/N) · Σ |x[n]|',
    desc: 'A simpler amplitude measure that is popular in EMG and BCI work. It reacts less to outliers than RMS does.' },
  { key: 'min', label: 'Minimum', sym: 'min', unit: 'µV', group: 'Extremes',
    formula: 'min = minₙ x[n]',
    desc: 'The most negative value in the epoch.' },
  { key: 'max', label: 'Maximum', sym: 'max', unit: 'µV', group: 'Extremes',
    formula: 'max = maxₙ x[n]',
    desc: 'The most positive value in the epoch.' },
  { key: 'ptp', label: 'Peak-to-peak amplitude', sym: 'PTP', unit: 'µV', group: 'Extremes',
    formula: 'PTP = max − min',
    desc: 'The total amplitude range. It is the quantity used for epoch rejection (e.g. PTP > 150 µV ⇒ reject).' },
  { key: 'skewness', label: 'Skewness', sym: 'γ₁', unit: '', group: 'Shape of the distribution',
    formula: 'γ₁ = E[(x − μ)³] / σ³',
    desc: 'The asymmetry of the amplitude distribution. It is 0 for a symmetric signal. Monophasic artifacts such as blinks make it strongly positive or negative.' },
  { key: 'kurtosis', label: 'Kurtosis (excess)', sym: 'γ₂', unit: '', group: 'Shape of the distribution',
    formula: 'γ₂ = E[(x − μ)⁴] / σ⁴ − 3',
    desc: '"Tailedness". It is 0 for Gaussian noise and about −1.5 for a pure sine. High values mean rare large spikes, which is a classic artifact indicator.' },
  { key: 'zcr', label: 'Zero-crossing rate', sym: 'ZCR', unit: '/s', group: 'Temporal / complexity',
    formula: 'ZCR = #{ sign changes of x[n] − μ } / T',
    desc: 'How often the signal crosses its mean each second. A pure sine at f Hz gives about 2f, so ZCR is a rough frequency proxy.' },
  { key: 'lineLength', label: 'Line length', sym: 'LL', unit: 'µV/s', group: 'Temporal / complexity',
    formula: 'LL = (1/T) · Σ |x[n] − x[n−1]|',
    desc: 'The total "distance travelled" by the waveform each second. It grows with both amplitude and frequency and is widely used in seizure detection.' },
  { key: 'energy', label: 'Energy', sym: 'E', unit: 'µV²', group: 'Energy',
    formula: 'E = Σ x[n]²',
    desc: 'The sum of squared samples. It depends on epoch length, so only compare it between epochs of the same size.' },
  { key: 'power', label: 'Average power', sym: 'P', unit: 'µV²', group: 'Energy',
    formula: 'P = (1/N) · Σ x[n]² = RMS²',
    desc: 'Energy per sample. Unlike energy, it does not depend on epoch length.' },
  { key: 'mobility', label: 'Hjorth mobility', sym: 'M', unit: '', group: 'Hjorth parameters',
    formula: 'M = √[ var(x′) / var(x) ]',
    desc: 'The ratio of the derivative\'s spread to the signal\'s spread. It is proportional to mean frequency: f̄ ≈ M · fs / 2π.' },
  { key: 'complexity', label: 'Hjorth complexity', sym: 'C', unit: '', group: 'Hjorth parameters',
    formula: 'C = M(x′) / M(x)',
    desc: 'How much the shape differs from a pure sine wave, for which C = 1. Noisier, more irregular signals give larger values.' },
]

export const FEATURE_MAP = Object.fromEntries(FEATURES.map((f) => [f.key, f]))

export function fmt(v, digits = 3) {
  if (v === undefined || v === null || Number.isNaN(v)) return '–'
  const a = Math.abs(v)
  if (a < 1e-9) return '0'
  if (a >= 1e5 || a < 1e-3) return v.toExponential(2)
  if (a >= 1000) return v.toFixed(0)
  if (a >= 100) return v.toFixed(1)
  if (a >= 10) return v.toFixed(2)
  return v.toPrecision(digits)
}
