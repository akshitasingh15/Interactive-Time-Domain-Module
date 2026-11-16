import { useRef, useState } from 'react'
import { DATASETS } from '../lib/datasets'
import { parseEEGFile } from '../lib/parsers'

export default function DataSource({ current, onPreloaded, onUpload, onStart }) {
  const [fsFallback, setFsFallback] = useState(256)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [drag, setDrag] = useState(false)
  const input = useRef(null)

  const handle = async (file) => {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      onUpload(await parseEEGFile(file, fsFallback))
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="page">
      <div className="intro">
        <div>
          <div className="eyebrow">Brain–computer interface lab</div>
          <h1>EEG Preprocessing Lab</h1>
          <p>Follow one EEG recording from raw data to clean signal, one step per page. At the end you get a set of time-domain parameters.</p>
        </div>
        <ol className="howto">
          <li><b>Pick a recording</b> below or upload your own.</li>
          <li><b>Press Next</b> to go through the 8 steps.</li>
          <li><b>Change settings</b> on each page and watch the plots react.</li>
          <li><b>Read the results</b> on the last page.</li>
        </ol>
      </div>

      <div className="plot-tips">
        <span><b>Hover</b> a graph to read values</span>
        <span><b>Drag</b> across it to zoom</span>
        <span><b>Double-click</b> to zoom out</span>
        <span><b>Click a legend</b> item to hide it</span>
      </div>

      <h2 className="section-title">1 · Choose a recording</h2>
      <div className="source-grid">
        <div className="presets">
          {DATASETS.map((d) => (
            <button type="button" key={d.id} className={'preset' + (current.source === 'preloaded' && current.id === d.id ? ' active' : '')} onClick={() => onPreloaded(d.id)}>
              <div className="preset-top">
                <b>{d.short}</b>
                <span>{d.labels.length} ch · {d.fs} Hz · {d.duration} s</span>
              </div>
              <p>{d.blurb}</p>
              <div className="tags">{d.contains.map((c) => <i key={c}>{c}</i>)}</div>
            </button>
          ))}
          <p className="fine">These recordings are <b>synthetic</b>: they are built from known parts, so you know exactly what each step should remove.</p>
        </div>
        <div
          className={'upload' + (drag ? ' drag' : '') + (current.source === 'upload' ? ' active' : '')}
          onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]) }}
        >
          <div className="upload-icon" aria-hidden>
            <svg width="40" height="40" viewBox="0 0 40 40"><path d="M4 22 L10 22 L13 12 L17 30 L21 8 L25 26 L28 18 L36 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <b>Or upload your own EEG</b>
          <p>.edf, .csv, .txt or .tsv. Drag it here or</p>
          <button type="button" className="btn" onClick={() => input.current?.click()} disabled={busy}>{busy ? 'Reading…' : 'Browse files'}</button>
          <input ref={input} type="file" accept=".csv,.txt,.tsv,.edf,.dat" hidden onChange={(e) => { handle(e.target.files[0]); e.target.value = '' }} />
          <label className="field inline">
            <span className="field-label">Sampling rate (if the file has no time column)</span>
            <span className="num-wrap"><input type="number" min="1" value={fsFallback} onChange={(e) => setFsFallback(Number(e.target.value) || 256)} /><em>Hz</em></span>
          </label>
          {error && <div className="note warn">{error}</div>}
          {current.source === 'upload' && <div className="loaded">Loaded <b>{current.name}</b></div>}
          <details className="format">
            <summary>File format help</summary>
            <ul>
              <li><b>EDF</b>: channel names, sampling rate and units are read automatically.</li>
              <li><b>CSV/TXT</b>: one column per channel in µV, with an optional header row. An optional first column <code>time</code> (seconds) sets the sampling rate.</li>
            </ul>
            <pre>time,Fp1,Fp2,O1,O2{'\n'}0.000,12.1,-3.4,8.8,5.0{'\n'}0.004,10.7,-2.9,9.6,4.1</pre>
            <p>Only the first 180 s and 32 channels are loaded.</p>
          </details>
          {current.notes?.length > 0 && <div className="note">{current.notes.map((n) => <div key={n}>{n}</div>)}</div>}
        </div>
      </div>
      <div className="start-row">
        <span>Selected: <b>{current.name}</b></span>
        <button type="button" className="btn big" onClick={onStart}>Start: Step 1 →</button>
      </div>
    </section>
  )
}
