import { useCallback, useEffect, useMemo, useState } from 'react'
import DataSource from './components/DataSource'
import { StepRaw, StepDetrend, StepNotch, StepBandpass, StepArtifact, StepReref, StepEpoch, StepNormalize } from './components/Steps'
import Features from './components/Features'
import { generateDataset } from './lib/datasets'
import { usePipeline, DEFAULT_PARAMS } from './lib/usePipeline'

const PAGES = [
  { id: 'data', n: '0', label: 'Choose data', short: 'Data' },
  { id: 'raw', n: '1', label: 'Inspect raw signal', short: 'Raw signal' },
  { id: 'offset', n: '2', label: 'Offset & drift', short: 'Offset' },
  { id: 'notch', n: '3', label: 'Notch filter', short: 'Notch' },
  { id: 'bandpass', n: '4', label: 'Band-pass filter', short: 'Band-pass' },
  { id: 'artifacts', n: '5', label: 'Artifacts', short: 'Artifacts' },
  { id: 'reference', n: '6', label: 'Re-reference', short: 'Reference' },
  { id: 'epochs', n: '7', label: 'Epochs', short: 'Epochs' },
  { id: 'normalise', n: '8', label: 'Normalise', short: 'Normalise' },
  { id: 'results', n: '✓', label: 'Time-domain parameters', short: 'Results' },
]

function paramsFor(raw) {
  const p = structuredClone(DEFAULT_PARAMS)
  p.notch.f0 = raw.lineFreq || 50
  p.bandpass.high = Math.min(40, Math.floor(raw.fs / 2 - 1))
  if (raw.channels.length < 2) p.reref.mode = 'none'
  return p
}
const pageFromHash = () => {
  const i = PAGES.findIndex((p) => '#' + p.id === window.location.hash)
  return i < 0 ? 0 : i
}

export default function App() {
  const [raw, setRaw] = useState(() => generateDataset('rest'))
  const [params, setParams] = useState(() => paramsFor(raw))
  const [focus, setFocus] = useState(0)
  const [view, setView] = useState({ start: 0, len: 10 })
  const [page, setPage] = useState(pageFromHash)

  const duration = raw.channels[0].data.length / raw.fs
  const defaultLen = Math.min(10, duration)

  const go = useCallback((i) => {
    const k = Math.max(0, Math.min(PAGES.length - 1, i))
    setPage(k)
    try { window.history.replaceState(null, '', '#' + PAGES[k].id) } catch { /* sandboxed */ }
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  useEffect(() => {
    const onHash = () => setPage(pageFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return
      if (e.key === 'ArrowRight') go(page + 1)
      if (e.key === 'ArrowLeft') go(page - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [page, go])

  const load = useCallback((r) => {
    setRaw(r)
    setParams(paramsFor(r))
    setFocus(0)
    setView({ start: 0, len: Math.min(10, r.channels[0].data.length / r.fs) })
  }, [])

  const set = useCallback((group, key, value) => {
    setParams((p) => (key === null ? { ...p, [group]: value } : { ...p, [group]: { ...p[group], [key]: value } }))
  }, [])

  const P = usePipeline(raw, params)
  const len = Math.min(view.len, duration)
  const t0 = Math.min(view.start, Math.max(0, duration - len))
  const onZoom = useCallback((a, b) => setView({ start: a, len: b - a }), [])
  const onReset = useCallback(() => setView({ start: 0, len: defaultLen }), [defaultLen])
  const ctx = useMemo(
    () => ({ raw, fs: raw.fs, P, params, set, focus, setFocus, t0, t1: t0 + len, onZoom, onReset, goto: go }),
    [raw, P, params, set, focus, t0, len, onZoom, onReset, go],
  )

  const lens = [1, 2, 5, 10, 20, 30, 60].filter((l) => l < duration)
  const isPreset = lens.includes(+len.toFixed(3)) || Math.abs(len - duration) < 1e-6
  const cur = PAGES[page]
  const steps = [StepRaw, StepDetrend, StepNotch, StepBandpass, StepArtifact, StepReref, StepEpoch, StepNormalize]
  const Step = page >= 1 && page <= 8 ? steps[page - 1] : null

  return (
    <div className="app">
      <header className="topbar">
        <button type="button" className="brand" onClick={() => go(0)}>
          <svg width="26" height="26" viewBox="0 0 40 40" aria-hidden><path d="M3 22 L10 22 L13 12 L17 30 L21 8 L25 26 L28 18 L37 18" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
          EEG Preprocessing Lab
        </button>
        <div className="progress" aria-label="progress">
          <div style={{ width: `${(page / (PAGES.length - 1)) * 100}%` }} />
        </div>
        <span className="progress-label">{page === 0 ? 'Start' : page === PAGES.length - 1 ? 'Results' : `Step ${page} of 8`}</span>
      </header>

      <div className="layout">
        <nav className="sidenav" aria-label="Pages">
          {PAGES.map((s, i) => (
            <button type="button" key={s.id} className={(page === i ? 'active ' : '') + (i < page ? 'done' : '')} onClick={() => go(i)}>
              <span className="dot">{i < page && i > 0 ? '✓' : s.n}</span>
              {s.label}
            </button>
          ))}
          <div className="sidenav-foot">
            <span>Recording</span>
            <b title={raw.name}>{raw.name}</b>
            <span>Clean epochs</span>
            <b>{P.epochs.filter((e) => !e.rejected).length} of {P.epochs.length}</b>
          </div>
        </nav>

        <main>
          <div className="mobile-steps">
            <select value={page} onChange={(e) => go(Number(e.target.value))}>
              {PAGES.map((s, i) => <option key={s.id} value={i}>{s.n} · {s.label}</option>)}
            </select>
          </div>

          {page > 0 && page < PAGES.length - 1 && (
            <div className="viewbar">
              <label>
                <span>Channel</span>
                <select value={focus} onChange={(e) => setFocus(Number(e.target.value))}>
                  {raw.channels.map((c, i) => <option key={i} value={i}>{c.label}</option>)}
                </select>
              </label>
              <label>
                <span>Time shown</span>
                <select value={isPreset ? (Math.abs(len - duration) < 1e-6 ? duration : +len.toFixed(3)) : 'custom'} onChange={(e) => setView((v) => ({ ...v, len: Number(e.target.value) }))}>
                  {!isPreset && <option value="custom">Zoomed: {len.toFixed(2)} s</option>}
                  {lens.map((l) => <option key={l} value={l}>{l} s</option>)}
                  <option value={duration}>All ({duration.toFixed(0)} s)</option>
                </select>
              </label>
              <label className="grow">
                <span>Position: {t0.toFixed(1)}–{(t0 + len).toFixed(1)} s</span>
                <input type="range" min="0" max={Math.max(0, duration - len)} step={0.05} value={t0} disabled={len >= duration} onChange={(e) => setView((v) => ({ ...v, start: Number(e.target.value) }))} />
              </label>
              <button type="button" className="btn ghost small" onClick={onReset}>Reset view</button>
              <button type="button" className="btn ghost small" onClick={() => setParams(paramsFor(raw))} title="Restore default settings for every step">Reset settings</button>
            </div>
          )}

          {page === 0 && <DataSource current={raw} onPreloaded={(id) => load(generateDataset(id))} onUpload={load} onStart={() => go(1)} />}
          {Step && <Step ctx={ctx} />}
          {page === PAGES.length - 1 && <Features ctx={ctx} />}

          <div className="pager">
            <button type="button" className="btn ghost" onClick={() => go(page - 1)} disabled={page === 0}>
              ← {page > 0 ? PAGES[page - 1].short : 'Previous'}
            </button>
            <span className="pager-dots">
              {PAGES.map((s, i) => <i key={s.id} className={i === page ? 'on' : i < page ? 'done' : ''} onClick={() => go(i)} title={s.label} />)}
            </span>
            <button type="button" className="btn" onClick={() => go(page + 1)} disabled={page === PAGES.length - 1}>
              {page < PAGES.length - 1 ? PAGES[page + 1].short : 'Next'} →
            </button>
          </div>
          <p className="kbd-hint">Tip: use the ← → arrow keys to move between pages. Currently on: <b>{cur.label}</b></p>
        </main>
      </div>
    </div>
  )
}
