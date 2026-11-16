// File loaders for user-supplied EEG: CSV / TXT / TSV (one column per
// channel) and European Data Format (.edf).

const MAX_SECONDS = 180
const MAX_CHANNELS = 32

export async function parseEEGFile(file, fsFallback) {
  const ext = file.name.split('.').pop().toLowerCase()
  if (ext === 'edf') return parseEDF(await file.arrayBuffer(), file.name)
  if (ext === 'bdf') throw new Error('BDF (24-bit BioSemi) files are not supported. Please convert the file to EDF or CSV.')
  return parseDelimited(await file.text(), file.name, fsFallback)
}

/* -------------------------------- CSV / TXT ------------------------------ */
export function parseDelimited(text, name, fsFallback = 256) {
  const notes = []
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !/^\s*[#%]/.test(l))
  if (lines.length < 2) throw new Error('The file has fewer than two data rows.')
  const probe = lines[Math.min(1, lines.length - 1)]
  const delim = [',', '\t', ';'].map((d) => [d, probe.split(d).length]).sort((a, b) => b[1] - a[1])[0]
  const split = delim[1] > 1 ? (l) => l.split(delim[0]) : (l) => l.trim().split(/\s+/)

  let header = null
  const first = split(lines[0]).map((s) => s.trim().replace(/^"|"$/g, ''))
  if (first.some((s) => s !== '' && isNaN(Number(s)))) {
    header = first
    lines.shift()
  }
  let rows = lines.map((l) => split(l).map((s) => Number(s.trim().replace(/^"|"$/g, ''))))
  const width = Math.max(...rows.slice(0, 20).map((r) => r.length))
  const before = rows.length
  rows = rows.filter((r) => r.length >= width && r.slice(0, width).every((v) => Number.isFinite(v)))
  if (rows.length < before) notes.push(`${before - rows.length} malformed row(s) were skipped.`)
  if (rows.length < 16) throw new Error('Could not find enough numeric rows. Check the file format.')

  let cols = Array.from({ length: width }, (_, c) => Float64Array.from(rows, (r) => r[c]))
  let labels = header ? header.slice(0, width) : cols.map((_, i) => `Ch${i + 1}`)

  // Wide files (channels as rows) → transpose
  if (!header && width > 1000 && rows.length <= 64) {
    cols = rows.map((r) => Float64Array.from(r))
    labels = cols.map((_, i) => `Ch${i + 1}`)
    notes.push('The file had channels as rows, so it was transposed.')
  }

  // Time column detection
  let fs = fsFallback
  const tName = labels[0] ? labels[0].toLowerCase() : ''
  const looksTime = /^(time|t|timestamp|sec|secs|seconds|time_s|time \(s\)|ms|time_ms|time \(ms\))$/.test(tName)
  const c0 = cols[0]
  let monotonic = cols.length > 1
  const diffs = []
  for (let i = 1; i < Math.min(c0.length, 2000) && monotonic; i++) {
    const d = c0[i] - c0[i - 1]
    if (d <= 0) monotonic = false
    diffs.push(d)
  }
  if (monotonic && diffs.length) {
    const sorted = [...diffs].sort((a, b) => a - b)
    const med = sorted[Math.floor(sorted.length / 2)]
    const regular = sorted[Math.floor(sorted.length * 0.95)] / med < 1.05
    if (looksTime || (regular && !header)) {
      const inMs = /ms/.test(tName) || (!looksTime && med >= 1)
      const dt = inMs ? med / 1000 : med
      if (dt > 0) {
        fs = Math.round((1 / dt) * 100) / 100
        notes.push(`Column "${labels[0]}" was used as time. Sampling rate detected: ${fs} Hz.`)
        cols = cols.slice(1)
        labels = labels.slice(1)
      }
    }
  }
  if (!cols.length) throw new Error('No signal columns were found.')
  return finalize({ name, fs, cols, labels, notes })
}

/* ---------------------------------- EDF ---------------------------------- */
export function parseEDF(buf, name) {
  const notes = []
  const bytes = new Uint8Array(buf)
  const txt = (o, l) => String.fromCharCode(...bytes.subarray(o, o + l)).trim()
  if (bytes.length < 256) throw new Error('File too small to be EDF.')
  const headerBytes = parseInt(txt(184, 8))
  let nRec = parseInt(txt(236, 8))
  const recDur = parseFloat(txt(244, 8)) || 1
  const ns = parseInt(txt(252, 4))
  if (!ns || !headerBytes) throw new Error('Invalid EDF header.')
  let o = 256
  const field = (len) => {
    const arr = []
    for (let i = 0; i < ns; i++) arr.push(txt(o + i * len, len))
    o += ns * len
    return arr
  }
  const labels = field(16)
  field(80) // transducer type (unused)
  const dims = field(8)
  const physMin = field(8).map(Number), physMax = field(8).map(Number)
  const digMin = field(8).map(Number), digMax = field(8).map(Number)
  field(80)
  const spr = field(8).map(Number)
  const recSamples = spr.reduce((a, b) => a + b, 0)
  const available = Math.floor((bytes.length - headerBytes) / (recSamples * 2))
  if (nRec < 0 || nRec > available) nRec = available

  const isSignal = labels.map((l) => !/annotation/i.test(l))
  const counts = {}
  spr.forEach((s, i) => isSignal[i] && (counts[s] = (counts[s] || 0) + 1))
  const mainSpr = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0])
  const chosen = spr.map((s, i) => i).filter((i) => isSignal[i] && spr[i] === mainSpr)
  if (chosen.length < labels.filter((_, i) => isSignal[i]).length)
    notes.push('Channels with a different sampling rate were left out.')
  const fs = mainSpr / recDur
  const useRec = Math.min(nRec, Math.max(1, Math.floor(MAX_SECONDS / recDur)))
  if (useRec < nRec) notes.push(`Only the first ${MAX_SECONDS} s were loaded, to keep the page responsive.`)

  const offsets = []
  let acc = 0
  for (let i = 0; i < ns; i++) {
    offsets.push(acc)
    acc += spr[i]
  }
  const view = new DataView(buf)
  const cols = chosen.map(() => new Float64Array(useRec * mainSpr))
  for (let r = 0; r < useRec; r++) {
    const base = headerBytes + r * recSamples * 2
    chosen.forEach((ci, k) => {
      const g = (physMax[ci] - physMin[ci]) / (digMax[ci] - digMin[ci] || 1)
      let scale = 1
      const d = (dims[ci] || '').toLowerCase()
      if (d === 'mv') scale = 1000
      else if (d === 'v') scale = 1e6
      else if (d === 'nv') scale = 1e-3
      for (let s = 0; s < mainSpr; s++) {
        const dig = view.getInt16(base + (offsets[ci] + s) * 2, true)
        cols[k][r * mainSpr + s] = ((dig - digMin[ci]) * g + physMin[ci]) * scale
      }
    })
  }
  notes.push(`EDF: ${chosen.length} channel(s) at ${fs} Hz, physical units converted to µV.`)
  return finalize({ name, fs, cols, labels: chosen.map((i) => labels[i]), notes })
}

/* ------------------------------- shared ---------------------------------- */
function finalize({ name, fs, cols, labels, notes }) {
  if (cols.length > MAX_CHANNELS) {
    notes.push(`Only the first ${MAX_CHANNELS} of ${cols.length} channels were loaded.`)
    cols = cols.slice(0, MAX_CHANNELS)
    labels = labels.slice(0, MAX_CHANNELS)
  }
  const maxN = Math.round(MAX_SECONDS * fs)
  if (cols[0].length > maxN) {
    notes.push(`The recording was cropped to the first ${MAX_SECONDS} s.`)
    cols = cols.map((c) => c.slice(0, maxN))
  }
  // unit sanity check: values that small are almost certainly volts
  let peak = 0
  for (const c of cols) for (let i = 0; i < c.length; i += 7) peak = Math.max(peak, Math.abs(c[i]))
  if (peak > 0 && peak < 0.01) {
    cols = cols.map((c) => c.map((v) => v * 1e6))
    notes.push('The values looked like volts, so they were converted to µV (×10⁶).')
  }
  return {
    name,
    source: 'upload',
    fs,
    unit: 'µV',
    channels: cols.map((data, i) => ({ label: labels[i] || `Ch${i + 1}`, data })),
    events: [],
    lineFreq: 50,
    notes,
  }
}
