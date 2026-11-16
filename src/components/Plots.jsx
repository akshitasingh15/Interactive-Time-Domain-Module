import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'

export const PALETTE = ['#2B5BA8', '#C0573E', '#3E8E7E', '#B0892F', '#7A5BA8', '#5E8FD1', '#8C4A3B', '#5E6B7F']

function useWidth() {
  const ref = useRef(null)
  const [w, setW] = useState(720)
  useLayoutEffect(() => {
    if (!ref.current) return
    setW(ref.current.clientWidth || 720)
    const ro = new ResizeObserver((e) => setW(Math.max(220, e[0].contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

export function niceTicks(lo, hi, count = 5) {
  const span = hi - lo
  if (!(span > 0)) return [lo]
  const raw = span / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const e = raw / mag
  const step = (e >= 7.5 ? 10 : e >= 3.5 ? 5 : e >= 1.5 ? 2 : 1) * mag
  const out = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(10))
  return out
}
const tickLabel = (v) => {
  const a = Math.abs(v)
  if (a >= 1000) return (v / 1000).toFixed(a >= 10000 ? 0 : 1) + 'k'
  if (a > 0 && a < 0.01) return v.toExponential(0)
  return String(+v.toFixed(3))
}
export const num = (v) => {
  if (!Number.isFinite(v)) return '–'
  const a = Math.abs(v)
  if (a >= 1000) return v.toFixed(0)
  if (a >= 100) return v.toFixed(1)
  if (a >= 1) return v.toFixed(2)
  if (a < 1e-9) return '0'
  return v.toPrecision(3)
}

// min/max decimation so tens of thousands of samples draw crisply
function buildPath(data, i0, i1, toX, toY, buckets) {
  const n = i1 - i0
  if (n <= 0) return ''
  let d = ''
  if (n <= buckets * 2) {
    for (let i = i0; i < i1; i++) d += (i === i0 ? 'M' : 'L') + toX(i).toFixed(1) + ',' + toY(data[i]).toFixed(1)
    return d
  }
  const per = n / buckets
  for (let b = 0; b < buckets; b++) {
    const s = i0 + Math.floor(b * per), e = Math.min(i1, i0 + Math.floor((b + 1) * per))
    let mn = Infinity, mx = -Infinity, imn = s, imx = s
    for (let i = s; i < e; i++) {
      if (data[i] < mn) { mn = data[i]; imn = i }
      if (data[i] > mx) { mx = data[i]; imx = i }
    }
    const [a, c] = imn < imx ? [imn, imx] : [imx, imn]
    d += (b === 0 ? 'M' : 'L') + toX(a).toFixed(1) + ',' + toY(data[a]).toFixed(1)
    d += 'L' + toX(c).toFixed(1) + ',' + toY(data[c]).toFixed(1)
  }
  return d
}

function Legend({ series, hidden, toggle, padL }) {
  if (!series.some((s) => s.label)) return null
  return (
    <div className="legend" style={{ paddingLeft: padL }}>
      {series.map((s, k) =>
        s.label ? (
          <button type="button" key={k} className={hidden[k] ? 'off' : ''} onClick={() => toggle(k)} title="Click to show / hide">
            <i style={{ background: s.color || PALETTE[k], borderTop: s.dash ? `2px dashed ${s.color}` : undefined, height: s.dash ? 0 : 3 }} />
            {s.label}
          </button>
        ) : null,
      )}
    </div>
  )
}

function Tooltip({ x, width, children }) {
  const flip = x > width - 190
  return (
    <div className="tip" style={flip ? { right: width - x + 12 } : { left: x + 12 }}>
      {children}
    </div>
  )
}

function usePointer(svgRef) {
  return (e) => {
    const r = svgRef.current.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
}

/**
 * Interactive time-series plot.
 *  hover  → crosshair + values,  drag → zoom (onZoom),  double-click → onReset
 *  series: [{data, color, label, width, opacity, dash}]
 *  shades: [{start, end, color, opacity, label}] (seconds)
 */
export function SignalPlot({ series, fs, t0, t1, height = 230, unit = 'µV', shades = [], yRange, label, compact, legend = true, xLabel = true, onZoom, onReset }) {
  const [ref, w] = useWidth()
  const svgRef = useRef(null)
  const pt = usePointer(svgRef)
  const clipId = 'c' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const [hidden, setHidden] = useState({})
  const [hover, setHover] = useState(null)
  const [drag, setDrag] = useState(null)
  const pad = { l: compact ? 50 : 60, r: 14, t: compact ? 8 : 12, b: compact ? (xLabel ? 20 : 6) : 34 }
  const pw = Math.max(10, w - pad.l - pad.r)
  const ph = height - pad.t - pad.b
  const n = series[0]?.data.length || 0
  const i0 = Math.max(0, Math.floor(t0 * fs))
  const i1 = Math.min(n, Math.ceil(t1 * fs) + 1)
  const vis = series.map((s, k) => !hidden[k])

  const [lo, hi] = useMemo(() => {
    if (yRange) return yRange
    let a = Infinity, b = -Infinity
    series.forEach((s, k) => {
      if (!vis[k]) return
      for (let i = i0; i < i1; i++) {
        const v = s.data[i]
        if (v < a) a = v
        if (v > b) b = v
      }
    })
    if (!Number.isFinite(a)) return [-1, 1]
    const m = (b - a) * 0.08 || 1
    return [a - m, b + m]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, i0, i1, yRange, JSON.stringify(hidden)])

  const toX = (i) => pad.l + ((i / fs - t0) / (t1 - t0)) * pw
  const toY = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * ph
  const xToT = (px) => t0 + ((px - pad.l) / pw) * (t1 - t0)

  const paths = useMemo(
    () => series.map((s) => buildPath(s.data, i0, i1, toX, toY, Math.max(50, Math.floor(pw)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, i0, i1, pw, lo, hi, height, t0, t1],
  )
  const xt = niceTicks(t0, t1, Math.max(3, Math.floor(pw / 90)))
  const yt = niceTicks(lo, hi, compact ? 3 : 5)

  const inside = (x) => x >= pad.l && x <= pad.l + pw
  const onMove = (e) => {
    const { x } = pt(e)
    setHover(inside(x) ? x : null)
    if (drag) setDrag({ ...drag, x1: Math.min(Math.max(x, pad.l), pad.l + pw) })
  }
  const onDown = (e) => {
    if (!onZoom) return
    const { x } = pt(e)
    if (!inside(x)) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDrag({ x0: x, x1: x })
  }
  const onUp = () => {
    if (drag && Math.abs(drag.x1 - drag.x0) > 6) {
      const a = xToT(Math.min(drag.x0, drag.x1)), b = xToT(Math.max(drag.x0, drag.x1))
      if (b - a > 2 / fs * 10) onZoom(a, b)
    }
    setDrag(null)
  }

  let tip = null
  if (hover !== null && !drag) {
    const t = xToT(hover)
    const idx = Math.min(n - 1, Math.max(0, Math.round(t * fs)))
    tip = { t, idx }
  }

  return (
    <div ref={ref} className={'plot' + (onZoom ? ' zoomable' : '')}>
      <svg
        ref={svgRef} width={w} height={height} role="img" aria-label={label || 'signal plot'}
        onPointerMove={onMove} onPointerLeave={() => { setHover(null); setDrag(null) }} onPointerDown={onDown} onPointerUp={onUp}
        onDoubleClick={() => onReset && onReset()}
      >
        <rect x={pad.l} y={pad.t} width={pw} height={ph} className="plot-bg" />
        {shades.map((s, k) => {
          const a = Math.max(s.start, t0), b = Math.min(s.end, t1)
          if (b <= a) return null
          const x = pad.l + ((a - t0) / (t1 - t0)) * pw
          return (
            <g key={k}>
              <rect x={x} y={pad.t} width={((b - a) / (t1 - t0)) * pw} height={ph} fill={s.color || '#C0573E'} opacity={s.opacity ?? 0.14} />
              {s.label && !compact && <text x={x + 4} y={pad.t + 12} className="shade-label" fill={s.textColor || '#8C4A3B'}>{s.label}</text>}
            </g>
          )
        })}
        {yt.map((v) => (
          <g key={'y' + v}>
            <line x1={pad.l} x2={pad.l + pw} y1={toY(v)} y2={toY(v)} className={v === 0 ? 'grid zero' : 'grid'} />
            <text x={pad.l - 6} y={toY(v) + 4} className="tick" textAnchor="end">{tickLabel(v)}</text>
          </g>
        ))}
        {xt.map((v) => (
          <g key={'x' + v}>
            <line x1={pad.l + ((v - t0) / (t1 - t0)) * pw} x2={pad.l + ((v - t0) / (t1 - t0)) * pw} y1={pad.t} y2={pad.t + ph} className="grid" />
            {xLabel && <text x={pad.l + ((v - t0) / (t1 - t0)) * pw} y={pad.t + ph + 14} className="tick" textAnchor="middle">{v}</text>}
          </g>
        ))}
        <clipPath id={clipId}><rect x={pad.l} y={pad.t} width={pw} height={ph} /></clipPath>
        <g clipPath={`url(#${clipId})`}>
          {series.map((s, k) =>
            vis[k] ? (
              <path key={k} d={paths[k]} fill="none" stroke={s.color || PALETTE[k]} strokeWidth={s.width || 1.2} opacity={s.opacity ?? 1} strokeDasharray={s.dash} strokeLinejoin="round" />
            ) : null,
          )}
        </g>
        {drag && <rect x={Math.min(drag.x0, drag.x1)} y={pad.t} width={Math.abs(drag.x1 - drag.x0)} height={ph} className="drag-rect" />}
        {tip && (
          <g pointerEvents="none">
            <line x1={hover} x2={hover} y1={pad.t} y2={pad.t + ph} className="crosshair" />
            {series.map((s, k) => vis[k] && <circle key={k} cx={hover} cy={toY(s.data[tip.idx])} r="3.5" fill="#fff" stroke={s.color || PALETTE[k]} strokeWidth="2" />)}
          </g>
        )}
        {label && <text x={pad.l + 8} y={pad.t + 14} className="ch-label">{label}</text>}
        {!compact && (
          <>
            <text x={pad.l + pw / 2} y={height - 4} className="axis-label" textAnchor="middle">Time (s)</text>
            <text transform={`translate(13,${pad.t + ph / 2}) rotate(-90)`} className="axis-label" textAnchor="middle">Amplitude ({unit})</text>
          </>
        )}
      </svg>
      {tip && (
        <Tooltip x={hover} width={w}>
          <div className="tip-head">t = {tip.t.toFixed(3)} s</div>
          {series.map((s, k) =>
            vis[k] ? (
              <div key={k} className="tip-row">
                <i style={{ background: s.color || PALETTE[k] }} />
                <span>{s.label || label || 'value'}</span>
                <b>{num(s.data[tip.idx])} {unit}</b>
              </div>
            ) : null,
          )}
        </Tooltip>
      )}
      {legend && <Legend series={series} hidden={hidden} padL={pad.l} toggle={(k) => setHidden((h) => ({ ...h, [k]: !h[k] }))} />}
    </div>
  )
}

function nearestIndex(xs, v) {
  let lo = 0, hi = xs.length - 1
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    if (xs[m] < v) lo = m
    else hi = m
  }
  return Math.abs(xs[lo] - v) <= Math.abs(xs[hi] - v) ? lo : hi
}

/**
 * Interactive x/y plot (spectra, filter responses, per-epoch features).
 * Hover shows values; drag zooms the x-axis; double-click resets.
 */
export function XYPlot({ series, xLabel, yLabel, xDomain, yDomain, height = 230, vlines = [], bands = [], legend = true, xUnit = '', yUnit = '', zoom = true }) {
  const [ref, w] = useWidth()
  const svgRef = useRef(null)
  const pt = usePointer(svgRef)
  const [hidden, setHidden] = useState({})
  const [hover, setHover] = useState(null)
  const [drag, setDrag] = useState(null)
  const [zx, setZx] = useState(null)
  const pad = { l: 60, r: 14, t: 12, b: 36 }
  const pw = Math.max(10, w - pad.l - pad.r)
  const ph = height - pad.t - pad.b
  const base = xDomain || [Math.min(...series.map((s) => s.x[0])), Math.max(...series.map((s) => s.x[s.x.length - 1]))]
  const [x0, x1] = zx || base
  const vis = series.map((s, k) => !hidden[k])
  let [y0, y1] = yDomain || [Infinity, -Infinity]
  if (!yDomain) {
    series.forEach((s, k) => {
      if (!vis[k]) return
      s.y.forEach((v, i) => {
        if (s.x[i] < x0 || s.x[i] > x1 || !Number.isFinite(v)) return
        if (v < y0) y0 = v
        if (v > y1) y1 = v
      })
    })
    if (!Number.isFinite(y0)) { y0 = 0; y1 = 1 }
    const m = (y1 - y0) * 0.08 || 1
    y0 -= m
    y1 += m
  }
  const toX = (v) => pad.l + ((v - x0) / (x1 - x0)) * pw
  const toY = (v) => pad.t + (1 - (Math.min(Math.max(v, y0), y1) - y0) / (y1 - y0)) * ph
  const pxToX = (px) => x0 + ((px - pad.l) / pw) * (x1 - x0)
  const xt = niceTicks(x0, x1, Math.max(3, Math.floor(pw / 80)))
  const yt = niceTicks(y0, y1, 5)
  const inside = (x) => x >= pad.l && x <= pad.l + pw

  const firstVis = series.findIndex((_, k) => vis[k])
  let tipIdx = null
  if (hover !== null && !drag && firstVis >= 0) tipIdx = nearestIndex(series[firstVis].x, pxToX(hover))
  const hx = tipIdx !== null ? series[firstVis].x[tipIdx] : null

  return (
    <div ref={ref} className={'plot' + (zoom ? ' zoomable' : '')}>
      <svg
        ref={svgRef} width={w} height={height}
        onPointerMove={(e) => {
          const { x } = pt(e)
          setHover(inside(x) ? x : null)
          if (drag) setDrag({ ...drag, x1: Math.min(Math.max(x, pad.l), pad.l + pw) })
        }}
        onPointerLeave={() => { setHover(null); setDrag(null) }}
        onPointerDown={(e) => {
          if (!zoom) return
          const { x } = pt(e)
          if (!inside(x)) return
          e.currentTarget.setPointerCapture?.(e.pointerId)
          setDrag({ x0: x, x1: x })
        }}
        onPointerUp={() => {
          if (drag && Math.abs(drag.x1 - drag.x0) > 6) setZx([pxToX(Math.min(drag.x0, drag.x1)), pxToX(Math.max(drag.x0, drag.x1))])
          setDrag(null)
        }}
        onDoubleClick={() => setZx(null)}
      >
        <rect x={pad.l} y={pad.t} width={pw} height={ph} className="plot-bg" />
        <clipPath id={'xy' + height + w}><rect x={pad.l} y={pad.t} width={pw} height={ph} /></clipPath>
        <g clipPath={`url(#xy${height}${w})`}>
          {bands.map((b, k) => (
            <g key={k}>
              <rect x={toX(b.x0)} y={pad.t} width={Math.max(0, toX(b.x1) - toX(b.x0))} height={ph} fill={b.color || '#2B5BA8'} opacity={b.opacity ?? 0.1} />
              {b.label && <text x={Math.max(toX(b.x0), pad.l) + 4} y={pad.t + 12} className="shade-label" fill={b.textColor || '#2B5BA8'}>{b.label}</text>}
            </g>
          ))}
        </g>
        {yt.map((v) => (
          <g key={'y' + v}>
            <line x1={pad.l} x2={pad.l + pw} y1={toY(v)} y2={toY(v)} className="grid" />
            <text x={pad.l - 6} y={toY(v) + 4} className="tick" textAnchor="end">{tickLabel(v)}</text>
          </g>
        ))}
        {xt.map((v) => (
          <g key={'x' + v}>
            <line x1={toX(v)} x2={toX(v)} y1={pad.t} y2={pad.t + ph} className="grid" />
            <text x={toX(v)} y={pad.t + ph + 14} className="tick" textAnchor="middle">{tickLabel(v)}</text>
          </g>
        ))}
        {vlines.filter((v) => v.x >= x0 && v.x <= x1).map((v, k) => (
          <g key={k}>
            <line x1={toX(v.x)} x2={toX(v.x)} y1={pad.t} y2={pad.t + ph} stroke={v.color || '#C0573E'} strokeDasharray="4 3" strokeWidth="1.2" />
            {v.label && <text x={toX(v.x) + 4} y={pad.t + ph - 6} className="shade-label" fill={v.color || '#C0573E'}>{v.label}</text>}
          </g>
        ))}
        <g clipPath={`url(#xy${height}${w})`}>
          {series.map((s, k) => {
            if (!vis[k]) return null
            let d = ''
            s.x.forEach((xv, i) => {
              if (!Number.isFinite(s.y[i])) return
              d += (d ? 'L' : 'M') + toX(xv).toFixed(1) + ',' + toY(s.y[i]).toFixed(1)
            })
            return (
              <g key={k}>
                <path d={d} fill="none" stroke={s.color || PALETTE[k]} strokeWidth={s.width || 1.7} strokeDasharray={s.dash} opacity={s.opacity ?? 1} />
                {s.dots && s.x.map((xv, i) => (xv >= x0 && xv <= x1 ? <circle key={i} cx={toX(xv)} cy={toY(s.y[i])} r={s.dotR || 2.8} fill={(s.dotColors && s.dotColors[i]) || s.color || PALETTE[k]} /> : null))}
              </g>
            )
          })}
        </g>
        {drag && <rect x={Math.min(drag.x0, drag.x1)} y={pad.t} width={Math.abs(drag.x1 - drag.x0)} height={ph} className="drag-rect" />}
        {hx !== null && (
          <g pointerEvents="none">
            <line x1={toX(hx)} x2={toX(hx)} y1={pad.t} y2={pad.t + ph} className="crosshair" />
            {series.map((s, k) => {
              if (!vis[k]) return null
              const i = nearestIndex(s.x, hx)
              return <circle key={k} cx={toX(s.x[i])} cy={toY(s.y[i])} r="3.5" fill="#fff" stroke={s.color || PALETTE[k]} strokeWidth="2" />
            })}
          </g>
        )}
        <text x={pad.l + pw / 2} y={height - 4} className="axis-label" textAnchor="middle">{xLabel}</text>
        <text transform={`translate(13,${pad.t + ph / 2}) rotate(-90)`} className="axis-label" textAnchor="middle">{yLabel}</text>
      </svg>
      {hx !== null && (
        <Tooltip x={toX(hx)} width={w}>
          <div className="tip-head">{num(hx)} {xUnit}</div>
          {series.map((s, k) => {
            if (!vis[k]) return null
            const i = nearestIndex(s.x, hx)
            return (
              <div key={k} className="tip-row">
                <i style={{ background: s.color || PALETTE[k] }} />
                <span>{s.label || yLabel}</span>
                <b>{num(s.y[i])} {yUnit}</b>
              </div>
            )
          })}
        </Tooltip>
      )}
      {zx && <button type="button" className="reset-zoom" onClick={() => setZx(null)}>Reset zoom</button>}
      {legend && <Legend series={series} hidden={hidden} padL={pad.l} toggle={(k) => setHidden((h) => ({ ...h, [k]: !h[k] }))} />}
    </div>
  )
}

/** Horizontal bar chart with ± whiskers and hover highlight. */
export function BarChart({ items, unit, onSelect }) {
  const [ref, w] = useWidth()
  const [hov, setHov] = useState(null)
  const rowH = 32
  const h = items.length * rowH + 30
  const pad = { l: 70, r: 92, t: 6, b: 24 }
  const pw = Math.max(10, w - pad.l - pad.r)
  const vals = items.flatMap((d) => [d.value - (d.err || 0), d.value + (d.err || 0), 0])
  let lo = Math.min(...vals), hi = Math.max(...vals)
  if (lo === hi) hi = lo + 1
  const m = (hi - lo) * 0.05
  lo = lo < 0 ? lo - m : 0
  hi += m
  const toX = (v) => pad.l + ((v - lo) / (hi - lo)) * pw
  const xt = niceTicks(lo, hi, Math.max(3, Math.floor(pw / 90)))
  return (
    <div ref={ref} className="plot">
      <svg width={w} height={h} onPointerLeave={() => setHov(null)}>
        {xt.map((v) => (
          <g key={v}>
            <line x1={toX(v)} x2={toX(v)} y1={pad.t} y2={h - pad.b} className="grid" />
            <text x={toX(v)} y={h - 8} className="tick" textAnchor="middle">{tickLabel(v)}</text>
          </g>
        ))}
        <line x1={toX(0)} x2={toX(0)} y1={pad.t} y2={h - pad.b} className="grid zero" />
        {items.map((d, i) => {
          const y = pad.t + i * rowH + 5
          const xa = toX(Math.min(0, d.value)), xb = toX(Math.max(0, d.value))
          const dim = hov !== null && hov !== i
          return (
            <g key={d.label} onPointerEnter={() => setHov(i)} onClick={() => onSelect && onSelect(i)} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
              <rect x={0} y={y - 4} width={w} height={rowH} fill={hov === i ? '#f3ecdc' : 'transparent'} />
              <text x={pad.l - 8} y={y + 15} className="tick strong" textAnchor="end">{d.label}</text>
              <rect x={xa} y={y} width={Math.max(1, xb - xa)} height={rowH - 12} rx="3" fill={d.color || PALETTE[0]} opacity={dim ? 0.35 : 0.88} />
              {d.err > 0 && (
                <g stroke="#1F2A44" strokeWidth="1.2" opacity={dim ? 0.3 : 1}>
                  <line x1={toX(d.value - d.err)} x2={toX(d.value + d.err)} y1={y + (rowH - 12) / 2} y2={y + (rowH - 12) / 2} />
                  <line x1={toX(d.value - d.err)} x2={toX(d.value - d.err)} y1={y + 3} y2={y + rowH - 15} />
                  <line x1={toX(d.value + d.err)} x2={toX(d.value + d.err)} y1={y + 3} y2={y + rowH - 15} />
                </g>
              )}
              <text x={toX(Math.max(0, d.value + (d.err || 0))) + 6} y={y + 15} className="tick">
                {d.text}{unit ? ' ' + unit : ''}{hov === i && d.err > 0 ? ` (±${num(d.err)})` : ''}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
