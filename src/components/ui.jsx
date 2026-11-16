import { useState } from 'react'

/** Page wrapper for one pipeline step: title, one-line lead, Problem → Fix → Result strip. */
export function StepPage({ n, title, lead, problem, fix, result, skipped, children }) {
  return (
    <section className={'page' + (skipped ? ' skipped' : '')}>
      <header className="page-head">
        <div className="step-num">{n}</div>
        <div>
          <h2>{title}</h2>
          {lead && <p className="lead">{lead}</p>}
        </div>
        {skipped && <span className="badge">Skipped</span>}
      </header>
      {(problem || fix || result) && (
        <div className="pfr">
          {problem && <div className="pfr-card problem"><span>Problem</span><p>{problem}</p></div>}
          {fix && <div className="pfr-card fix"><span>What we do</span><p>{fix}</p></div>}
          {result && <div className="pfr-card result"><span>Result</span><p>{result}</p></div>}
        </div>
      )}
      <div className="page-body">{children}</div>
    </section>
  )
}

export function Note({ kind = 'info', children }) {
  return <div className={'note ' + kind}>{children}</div>
}

export function Formula({ children, caption }) {
  return (
    <div className="formula">
      <code>{children}</code>
      {caption && <span>{caption}</span>}
    </div>
  )
}

export function More({ title = 'Details and formulas', children, open }) {
  return (
    <details className="more" open={open}>
      <summary>{title}</summary>
      <div className="more-body">{children}</div>
    </details>
  )
}

export function Controls({ children }) {
  return (
    <div className="controls">
      <div className="controls-title">Try it <span>change a setting and the plots update instantly</span></div>
      <div className="controls-grid">{children}</div>
    </div>
  )
}

export function Num({ label, value, onChange, min, max, step = 1, suffix, hint }) {
  const [draft, setDraft] = useState(null)
  const commit = (v) => {
    let x = Number(v)
    if (!Number.isFinite(x)) return setDraft(null)
    if (min !== undefined) x = Math.max(min, x)
    if (max !== undefined) x = Math.min(max, x)
    onChange(x)
    setDraft(null)
  }
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="num-wrap">
        <input
          type="number" value={draft ?? value} min={min} max={max} step={step}
          onChange={(e) => {
            setDraft(e.target.value)
            const x = Number(e.target.value)
            if (e.target.value !== '' && Number.isFinite(x) && (min === undefined || x >= min) && (max === undefined || x <= max)) onChange(x)
          }}
          onBlur={(e) => commit(e.target.value)}
        />
        {suffix && <em>{suffix}</em>}
      </span>
      {hint && <small>{hint}</small>}
    </label>
  )
}

export function Select({ label, value, onChange, options, hint }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && <small>{hint}</small>}
    </label>
  )
}

export function Toggle({ label, checked, onChange, hint }) {
  return (
    <label className="field toggle">
      <span className="field-label">{label}</span>
      <button type="button" className={'switch' + (checked ? ' on' : '')} onClick={() => onChange(!checked)} aria-pressed={checked}>
        <span />
      </button>
      {hint && <small>{hint}</small>}
    </label>
  )
}

export function Obs({ items }) {
  return (
    <div className="obs">
      {items.map((it, k) => (
        <div key={k} className={'obs-item ' + (it.tone || '')}>
          <div className="obs-label">{it.label}</div>
          <div className="obs-value">{it.value}</div>
          {it.sub && <div className="obs-sub">{it.sub}</div>}
        </div>
      ))}
    </div>
  )
}

/** Plot container with a title and a plain-language "how to read" line. */
export function PlotCard({ title, read, children }) {
  return (
    <figure className="plot-card">
      {title && (
        <figcaption>
          <strong>{title}</strong>
          {read && <span className="read"><b>How to read:</b> {read}</span>}
        </figcaption>
      )}
      {children}
    </figure>
  )
}

export function PyCode({ code, title = 'Python equivalent (SciPy / MNE)' }) {
  const [copied, setCopied] = useState(false)
  return (
    <details className="more code">
      <summary>{title}</summary>
      <div className="pycode-inner">
        <button
          type="button" className="copy"
          onClick={() => {
            navigator.clipboard?.writeText(code).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1400)
            }).catch(() => {})
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <pre><code>{code}</code></pre>
      </div>
    </details>
  )
}

export function Grid2({ children }) {
  return <div className="grid2">{children}</div>
}
