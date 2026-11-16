import { useMemo } from 'react'
import { SignalPlot, XYPlot, PALETTE } from './Plots'
import { StepPage, Note, Formula, More, Controls, Num, Select, Toggle, Obs, PlotCard, PyCode, Grid2 } from './ui'
import { welch, bandPower, freqResponse, mean, std, rms, ptp } from '../lib/dsp'
import { fmt } from '../lib/features'

const BLUE = '#2B5BA8'
const GREY = '#A4ACBC'
const RED = '#C0573E'

const db = (psd) => Array.from(psd, (v) => 10 * Math.log10(Math.max(v, 1e-12)))
export const eventShades = (events) => (events || []).map((e) => ({ start: e.start, end: e.end, color: '#6F9BE0', opacity: 0.16, label: e.label, textColor: '#2B5BA8' }))

function BeforeAfter({ ctx, before, after, title = 'Before vs after', read, shades = [], stacked = false, height = 250, t1 }) {
  const { fs, focus, t0, raw, onZoom, onReset } = ctx
  const end = t1 ?? ctx.t1
  const label = raw.channels[focus].label
  const z = { onZoom, onReset }
  if (stacked)
    return (
      <PlotCard title={title} read={read}>
        <SignalPlot series={[{ data: before[focus], color: GREY, width: 1.1, label: 'Before' }]} fs={fs} t0={t0} t1={end} height={height * 0.75} label={`${label}: before`} shades={shades} compact xLabel={false} legend={false} {...z} />
        <SignalPlot series={[{ data: after[focus], color: BLUE, label: 'After' }]} fs={fs} t0={t0} t1={end} height={height * 0.75 + 14} label={`${label}: after`} shades={shades} compact legend={false} {...z} />
      </PlotCard>
    )
  return (
    <PlotCard title={title} read={read}>
      <SignalPlot
        series={[
          { data: before[focus], color: GREY, label: 'Before', width: 1.1 },
          { data: after[focus], color: BLUE, label: 'After', width: 1.4 },
        ]}
        fs={fs} t0={t0} t1={end} height={height} label={label} shades={shades} {...z}
      />
    </PlotCard>
  )
}

function SpectrumCompare({ ctx, before, after, vlines = [], bands = [], read, title = 'Frequency content (power spectrum)' }) {
  const { fs, focus } = ctx
  const pb = useMemo(() => welch(before[focus], fs), [before, focus, fs])
  const pa = useMemo(() => welch(after[focus], fs), [after, focus, fs])
  return (
    <PlotCard title={title} read={read || 'x-axis = frequency, y-axis = how much of that frequency is in the signal. Grey = before, blue = after.'}>
      <XYPlot
        series={[
          { x: pb.freqs, y: db(pb.psd), color: GREY, label: 'Before' },
          { x: pa.freqs, y: db(pa.psd), color: BLUE, label: 'After' },
        ]}
        xDomain={[0, Math.min(fs / 2, 130)]} xLabel="Frequency (Hz)" yLabel="Power (dB)" xUnit="Hz" yUnit="dB" vlines={vlines} bands={bands} height={250}
      />
    </PlotCard>
  )
}

function FilterResponse({ secs, fs, vlines, read }) {
  const r = useMemo(() => freqResponse(secs, fs, 600), [secs, fs])
  return (
    <PlotCard title="What the filter lets through" read={read || '0 dB = frequency kept unchanged; lower = frequency removed.'}>
      <XYPlot series={[{ x: r.f, y: r.db, color: BLUE, label: 'Gain' }]} xDomain={[0, fs / 2]} yDomain={[-80, 5]} xLabel="Frequency (Hz)" yLabel="Gain (dB)" xUnit="Hz" yUnit="dB" vlines={vlines} height={220} legend={false} />
    </PlotCard>
  )
}

/* ============================== STEP 1 ================================== */
export function StepRaw({ ctx }) {
  const { raw, fs, t0, t1, focus, goto, onZoom, onReset } = ctx
  const n = raw.channels[0].data.length
  const shown = raw.channels.slice(0, 16)
  const psd = useMemo(() => welch(raw.channels[focus].data, fs), [raw, focus, fs])
  const stats = useMemo(() => raw.channels.map((c) => ({ label: c.label, mean: mean(c.data), std: std(c.data), ptp: ptp(c.data) })), [raw])
  const lf = raw.lineFreq || 50
  return (
    <StepPage n="1" title="Inspect the raw signal" lead="Before changing anything, look at what the amplifier recorded."
      problem="Raw EEG mixes real brain activity with offsets, drift, mains hum and blinks."
      fix="Nothing yet. We plot every channel and spot the problems."
      result="A checklist of problems for the next steps to fix.">
      <div className="meta-grid">
        <div><span>Sampling rate</span><b>{fs} Hz</b><small>samples per second</small></div>
        <div><span>Nyquist limit</span><b>{fs / 2} Hz</b><small>highest frequency we can see</small></div>
        <div><span>Duration</span><b>{(n / fs).toFixed(1)} s</b><small>{n.toLocaleString()} samples / channel</small></div>
        <div><span>Channels</span><b>{raw.channels.length}</b><small>{raw.channels.slice(0, 6).map((c) => c.label).join(', ')}{raw.channels.length > 6 ? '…' : ''}</small></div>
      </div>

      <PlotCard title="All channels, raw" read="each row is one electrode. Look for traces not centred on 0, slow wandering and sudden big bumps.">
        <div className="stack">
          {shown.map((c, i) => (
            <SignalPlot key={c.label + i} series={[{ data: c.data, color: PALETTE[i % PALETTE.length], width: 1 }]} fs={fs} t0={t0} t1={t1} height={i === shown.length - 1 ? 86 : 68} compact label={c.label} shades={eventShades(raw.events)} xLabel={i === shown.length - 1} legend={false} onZoom={onZoom} onReset={onReset} />
          ))}
        </div>
      </PlotCard>

      <div className="checklist">
        <div className="checklist-title">Problems to fix</div>
        {[
          ['Offset', 'Traces sit far from 0 µV (see the "Mean" column below).', 2],
          ['Drift', 'The baseline slowly wanders up and down.', 2],
          ['Mains hum', `A sharp spike at ${lf} Hz in the spectrum below.`, 3],
          ['Slow waves & fast noise', 'Very slow sway and fast fuzz that are not brain rhythms.', 4],
          ['Blinks & spikes', 'Large bumps, strongest on frontal channels (Fp1, Fp2).', 5],
        ].map(([t, d, s]) => (
          <button type="button" key={t} className="check" onClick={() => goto(s)}>
            <b>{t}</b><span>{d}</span><em>Step {s} →</em>
          </button>
        ))}
      </div>

      <Grid2>
        <PlotCard title={`Frequency content: ${raw.channels[focus].label}`} read={`brain rhythms form a smooth slope; the narrow spike at ${lf} Hz is mains interference.`}>
          <XYPlot series={[{ x: psd.freqs, y: db(psd.psd), color: RED, label: 'Raw' }]} xDomain={[0, Math.min(fs / 2, 130)]} xLabel="Frequency (Hz)" yLabel="Power (dB)" xUnit="Hz" yUnit="dB" height={250} legend={false}
            vlines={[lf].filter((f) => f < fs / 2).map((f) => ({ x: f, label: `${f} Hz mains`, color: '#B0892F' }))} />
        </PlotCard>
        <div className="table-card">
          <div className="table-title">Raw channel statistics</div>
          <table className="mini">
            <thead><tr><th>Channel</th><th>Mean</th><th>Std dev</th><th>Peak-to-peak</th></tr></thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.label}><td>{s.label}</td><td className={Math.abs(s.mean) > 20 ? 'hot' : ''}>{fmt(s.mean)} µV</td><td>{fmt(s.std)} µV</td><td>{fmt(s.ptp)} µV</td></tr>
              ))}
            </tbody>
          </table>
          <small className="muted">Means far from 0 (in orange) are DC offsets, not brain activity.</small>
        </div>
      </Grid2>

      <More title="Key terms">
        <dl className="terms">
          <dt>EEG</dt><dd>Electrical activity of the brain recorded from the scalp. It is tiny, about 10–100 microvolts (µV).</dd>
          <dt>Channel / electrode</dt><dd>One recording site, named by the 10–20 system: Fp = front, C = centre, P = parietal, O = back of the head. Odd numbers are on the left, even numbers on the right.</dd>
          <dt>Sampling rate (fs)</dt><dd>How many measurements are taken per second, e.g. 256 Hz.</dd>
          <dt>Nyquist frequency</dt><dd>fs / 2. Frequencies above this cannot be represented.</dd>
          <dt>Spectrum</dt><dd>Shows how strong each frequency is. It is useful for spotting interference.</dd>
        </dl>
      </More>
      <PyCode code={`import mne
raw = mne.io.read_raw_edf("recording.edf", preload=True)
print(raw.info)                     # sampling rate, channel names
raw.plot(duration=10)               # look at the data
data = raw.get_data() * 1e6         # (channels, samples) in µV
fs = raw.info["sfreq"]`} />
    </StepPage>
  )
}

/* ============================== STEP 2 ================================== */
export function StepDetrend({ ctx }) {
  const { P, params, set, focus, fs, raw } = ctx
  const info = P.dc.info[focus]
  return (
    <StepPage n="2" title="Remove offset and drift" lead="Centre every channel on zero."
      problem="Each electrode sits at its own constant voltage (offset) and slowly slopes (drift). Neither comes from the brain."
      fix="Fit a straight line through each channel and subtract it."
      result="Every channel is now centred on 0 µV."
      skipped={params.detrend === 'none'}>
      <Controls>
        <Select label="Method" value={params.detrend} onChange={(v) => set('detrend', null, v)}
          options={[{ value: 'linear', label: 'Remove offset + slope (linear)' }, { value: 'mean', label: 'Remove offset only (mean)' }, { value: 'none', label: 'Skip this step' }]} />
      </Controls>
      <Obs items={[
        { label: `Offset removed from ${raw.channels[focus].label}`, value: `${fmt(info.intercept + (info.slope * (P.s0[focus].length - 1)) / 2)} µV` },
        { label: 'Slope removed', value: `${fmt(info.slope * fs)} µV/s` },
        { label: 'Mean now', value: `${fmt(mean(P.dc.data[focus]))} µV`, tone: 'good' },
      ]} />
      <BeforeAfter ctx={ctx} before={P.s0} after={P.dc.data} stacked title="Before and after" read="compare the y-axis numbers. The 'after' trace is centred on 0." />
      <Note kind="warn">A straight line can't remove <i>curved</i> drift, so some slow wobble remains. The band-pass filter in Step 4 removes it.</Note>
      <More>
        <Formula caption="best-fit straight line">x̂[n] = a + b·n</Formula>
        <Formula caption="least-squares slope">b = Σ (n − n̄)(x[n] − x̄) / Σ (n − n̄)²</Formula>
        <Formula caption="corrected signal">y[n] = x[n] − x̂[n]</Formula>
        <p>The offset comes from the electrode–skin contact acting like a small battery. Drift comes from sweat, temperature and drying gel.</p>
      </More>
      <PyCode code={`from scipy.signal import detrend
x_dc = detrend(data, axis=1, type="linear")    # or type="constant" for mean only`} />
    </StepPage>
  )
}

/* ============================== STEP 3 ================================== */
export function StepNotch({ ctx }) {
  const { P, params, set, focus, fs } = ctx
  const p = params.notch
  const nyq = fs / 2
  const valid = p.f0 < nyq
  const stats = useMemo(() => {
    const a = welch(P.dc.data[focus], fs), b = welch(P.notch.data[focus], fs)
    const pa = bandPower(a, p.f0 - 1, p.f0 + 1), pb = bandPower(b, p.f0 - 1, p.f0 + 1)
    return { pa, pb, red: 10 * Math.log10(pa / Math.max(pb, 1e-12)) }
  }, [P.dc, P.notch, focus, fs, p.f0])
  return (
    <StepPage n="3" title="Notch filter: remove mains hum" lead={`Delete the ${p.f0} Hz hum from electrical wiring.`}
      problem={`Mains electricity (${p.f0} Hz) leaks into the electrode wires as a steady hum.`}
      fix={`A notch filter removes a very narrow band around ${p.f0} Hz and leaves everything else alone.`}
      result="The spike disappears from the spectrum and the trace looks smoother."
      skipped={!p.enabled || !valid}>
      <Controls>
        <Toggle label="Apply notch" checked={p.enabled} onChange={(v) => set('notch', 'enabled', v)} />
        <Select label="Mains frequency" value={p.f0} onChange={(v) => set('notch', 'f0', Number(v))} options={[{ value: 50, label: '50 Hz (India, Europe, Asia)' }, { value: 60, label: '60 Hz (Americas)' }]} />
        <Num label="Sharpness (Q)" value={p.Q} min={2} max={100} step={1} onChange={(v) => set('notch', 'Q', v)} hint={`higher Q = narrower notch (${fmt(p.f0 / p.Q)} Hz wide)`} />
        <Toggle label={`Also remove ${2 * p.f0} Hz`} checked={p.harmonics} onChange={(v) => set('notch', 'harmonics', v)} hint={2 * p.f0 >= nyq ? `above ${nyq} Hz, so not needed` : 'hum often has a double-frequency echo'} />
      </Controls>
      {!valid && <Note kind="warn">{p.f0} Hz is above this recording's Nyquist limit ({nyq} Hz), so the hum can't be present. Step skipped.</Note>}
      <Obs items={[
        { label: `Hum power before`, value: `${fmt(stats.pa)} µV²` },
        { label: 'Hum power after', value: `${fmt(stats.pb)} µV²` },
        { label: 'Reduction', value: `${fmt(stats.red)} dB`, sub: stats.red > 10 ? `≈ ${fmt(10 ** (stats.red / 10), 2)}× weaker` : '', tone: stats.red > 10 ? 'good' : '' },
      ]} />
      <SpectrumCompare ctx={ctx} before={P.dc.data} after={P.notch.data} vlines={[{ x: p.f0, label: `${p.f0} Hz` }]} read={`find the grey spike at ${p.f0} Hz. The blue (after) line has a dip there instead. Drag across it to zoom in.`} />
      <BeforeAfter ctx={ctx} t1={Math.min(ctx.t1, ctx.t0 + 1)} before={P.dc.data} after={P.notch.data} title="Close-up: 1 second" read="the fast, regular ripple on the grey trace is the hum. The blue trace has lost it." />
      <More>
        <p>A second-order IIR notch places zeros on the unit circle at ±ω₀, which gives zero gain at f₀. Poles just inside the circle restore the gain on either side.</p>
        <Formula caption="ω₀ = 2π·f₀ / fs">H(z) = (1 − 2cos ω₀·z⁻¹ + z⁻²) / (1 − 2r·cos ω₀·z⁻¹ + r²·z⁻²)</Formula>
        <Formula caption="Q controls the width">bandwidth = f₀ / Q</Formula>
        <p>The filter runs forwards and then backwards (<b>filtfilt</b>), so it causes no time shift.</p>
        {P.notch.secs.length > 0 && <FilterResponse secs={P.notch.secs} fs={fs} vlines={[{ x: p.f0 }]} />}
      </More>
      <PyCode code={`from scipy.signal import iirnotch, filtfilt
b, a = iirnotch(w0=${p.f0}, Q=${p.Q}, fs=fs)
x_notch = filtfilt(b, a, x_dc, axis=1)
# MNE:  raw.notch_filter(freqs=[${p.f0}${p.harmonics ? ', ' + 2 * p.f0 : ''}])`} />
    </StepPage>
  )
}

/* ============================== STEP 4 ================================== */
export function StepBandpass({ ctx }) {
  const { P, params, set, focus, fs } = ctx
  const p = params.bandpass
  const nyq = fs / 2
  const stats = useMemo(() => {
    const a = welch(P.notch.data[focus], fs), b = welch(P.bandpass.data[focus], fs)
    return {
      lowB: bandPower(a, 0, p.low), lowA: bandPower(b, 0, p.low),
      hiB: bandPower(a, p.high, nyq), hiA: bandPower(b, p.high, nyq),
    }
  }, [P.notch, P.bandpass, focus, fs, p.low, p.high, nyq])
  return (
    <StepPage n="4" title="Band-pass filter" lead={`Keep only ${p.low}–${p.high} Hz, where brain rhythms live.`}
      problem="Very slow waves (sweat, movement) and fast noise (muscle) sit outside the brain-rhythm range."
      fix={`A Butterworth band-pass filter keeps ${p.low}–${p.high} Hz and removes the rest.`}
      result="A flat baseline and less fuzz, with the brain rhythms kept."
      skipped={!p.enabled}>
      <div className="bands">
        {[['δ Delta', '0.5–4 Hz', 'deep sleep'], ['θ Theta', '4–8 Hz', 'drowsy'], ['α Alpha', '8–13 Hz', 'relaxed, eyes closed'], ['β Beta', '13–30 Hz', 'active, movement'], ['γ Gamma', '30+ Hz', 'small on the scalp']].map(([a, b, c]) => (
          <div key={a}><b>{a}</b><span>{b}</span><small>{c}</small></div>
        ))}
      </div>
      <Controls>
        <Toggle label="Apply band-pass" checked={p.enabled} onChange={(v) => set('bandpass', 'enabled', v)} />
        <Num label="Low cut-off" value={p.low} min={0.05} max={Math.max(0.1, p.high - 0.5)} step={0.1} suffix="Hz" onChange={(v) => set('bandpass', 'low', v)} hint="removes slower waves (try 0.1–1)" />
        <Num label="High cut-off" value={p.high} min={p.low + 0.5} max={nyq - 0.5} step={1} suffix="Hz" onChange={(v) => set('bandpass', 'high', v)} hint={`removes faster noise (max ${nyq - 0.5})`} />
        <Select label="Filter order" value={p.order} onChange={(v) => set('bandpass', 'order', Number(v))} options={[2, 4, 6, 8].map((o) => ({ value: o, label: `${o}${o === 4 ? ' (typical)' : ''}` }))} hint="higher = sharper edges" />
      </Controls>
      <Obs items={[
        { label: `Slow content (< ${p.low} Hz)`, value: `${fmt(stats.lowB)} → ${fmt(stats.lowA)}`, sub: 'µV², before → after' },
        { label: `Fast content (> ${p.high} Hz)`, value: `${fmt(stats.hiB)} → ${fmt(stats.hiA)}`, sub: 'µV², before → after', tone: 'good' },
        { label: `RMS amplitude`, value: `${fmt(rms(P.notch.data[focus]))} → ${fmt(rms(P.bandpass.data[focus]))}`, sub: 'µV, before → after' },
      ]} />
      <BeforeAfter ctx={ctx} before={P.notch.data} after={P.bandpass.data} title="Before vs after" shades={eventShades(ctx.raw.events)} read="the blue trace stays near 0 instead of wandering. Zoom in to see the fast fuzz removed." />
      <SpectrumCompare ctx={ctx} before={P.notch.data} after={P.bandpass.data} bands={[{ x0: p.low, x1: p.high, label: 'kept', color: '#6F9BE0', opacity: 0.14 }]} read="inside the shaded band the two lines overlap (kept). Outside it, the blue line drops (removed)." />
      <More>
        <p>A <b>Butterworth</b> filter is "maximally flat" inside the band, so amplitudes are not distorted:</p>
        <Formula caption="n = order, fc = cut-off">|H(f)|² = 1 / (1 + (f / fc)^(2n))</Formula>
        <p>The filter runs forwards and then backwards (zero-phase), so peaks are not shifted in time. This matters for timing and waveform shape.</p>
        {P.bandpass.secs.length > 0 && <FilterResponse secs={P.bandpass.secs} fs={fs} vlines={[{ x: p.low, color: '#B0892F' }, { x: p.high, color: '#B0892F' }]} />}
      </More>
      <PyCode code={`from scipy.signal import butter, sosfiltfilt
sos = butter(N=${p.order}, Wn=[${p.low}, ${p.high}], btype="bandpass", fs=fs, output="sos")
x_bp = sosfiltfilt(sos, x_notch, axis=1)
# MNE:  raw.filter(l_freq=${p.low}, h_freq=${p.high})`} />
    </StepPage>
  )
}

/* ============================== STEP 5 ================================== */
export function StepArtifact({ ctx }) {
  const { P, params, set, focus, fs, raw } = ctx
  const p = params.artifact
  const det = P.artifact.det
  const shades = det[focus].segments.map((s) => ({ start: s.start / fs, end: (s.end + 1) / fs, color: RED, opacity: 0.18 }))
  const total = det.reduce((a, d) => a + d.segments.length, 0)
  return (
    <StepPage n="5" title="Remove artifacts (blinks, spikes)" lead="Find big non-brain events and repair them."
      problem="Blinks and muscle bursts are huge (100+ µV) and share frequencies with EEG, so filters can't remove them."
      fix={`Mark samples beyond ±${p.thresh} µV (plus a small margin) and bridge each gap with a straight line.`}
      result="The spikes are gone. Red boxes show what was repaired."
      skipped={!p.enabled}>
      <Controls>
        <Toggle label="Detect artifacts" checked={p.enabled} onChange={(v) => set('artifact', 'enabled', v)} />
        <Num label="Threshold" value={p.thresh} min={10} max={1000} step={5} suffix="µV" onChange={(v) => set('artifact', 'thresh', v)} hint="lower = stricter (typical 75–150)" />
        <Num label="Margin" value={p.pad} min={0} max={1} step={0.05} suffix="s" onChange={(v) => set('artifact', 'pad', v)} hint="extra time marked on each side" />
        <Select label="Repair" value={p.method} onChange={(v) => set('artifact', 'method', v)} options={[{ value: 'interpolate', label: 'Straight-line bridge' }, { value: 'mark', label: 'Mark only (no change)' }]} />
      </Controls>
      <Obs items={[
        { label: 'Artifacts found (all channels)', value: total, tone: total ? 'warn' : 'good' },
        { label: `Time affected in ${raw.channels[focus].label}`, value: `${(det[focus].fraction * 100).toFixed(1)} %` },
        { label: 'Average across channels', value: `${((det.reduce((a, d) => a + d.fraction, 0) / det.length) * 100).toFixed(1)} %` },
      ]} />
      <BeforeAfter ctx={ctx} before={P.bandpass.data} after={P.artifact.data} shades={shades} title="Detected artifacts (red) and repaired signal" read="grey = signal with blinks, blue = repaired. Choose Fp1 or Fp2 to see blinks." />
      <div className="chips">
        {det.map((d, i) => (
          <button type="button" key={i} className={'chip' + (d.segments.length ? ' warn' : '') + (i === focus ? ' current' : '')} onClick={() => ctx.setFocus(i)}>
            {raw.channels[i].label}: {d.segments.length}
          </button>
        ))}
        <small className="muted">artifacts per channel (click to view)</small>
      </div>
      <More>
        <ol>
          <li>Mark every sample where <code>|x[n]| &gt; T</code>.</li>
          <li>Widen each mark by the margin, because an artifact starts before it crosses T.</li>
          <li>Replace the marked part with a straight line between its clean edges.</li>
        </ol>
        <p><b>In research:</b> ICA (Independent Component Analysis), EOG regression or ASR remove artifacts more precisely. Thresholding is used here because it is the easiest method to follow.</p>
      </More>
      <PyCode code={`import numpy as np
bad = np.abs(x) > ${p.thresh}                       # one channel
bad = np.convolve(bad, np.ones(2*int(${p.pad}*fs)+1), "same") > 0   # add margin
idx = np.arange(len(x))
x_clean = x.copy()
x_clean[bad] = np.interp(idx[bad], idx[~bad], x[~bad])`} />
    </StepPage>
  )
}

/* ============================== STEP 6 ================================== */
export function StepReref({ ctx }) {
  const { P, params, set, focus, raw } = ctx
  const single = raw.channels.length < 2
  const mode = params.reref.mode
  const common = useMemo(() => {
    if (single) return null
    const n = P.artifact.data[0].length
    const avg = new Float64Array(n)
    for (const x of P.artifact.data) for (let i = 0; i < n; i++) avg[i] += x[i] / P.artifact.data.length
    return avg
  }, [P.artifact, single])
  return (
    <StepPage n="6" title="Re-reference" lead="Choose what each channel is measured against."
      problem="Every channel is measured relative to one reference electrode, so noise at that reference shows up in all channels."
      fix="Common Average Reference (CAR): subtract the average of all channels at each moment."
      result="Noise shared by all channels cancels out, and local activity stands out."
      skipped={single || mode === 'none'}>
      {single ? (
        <Note kind="warn">This recording has only one channel, so there is nothing to average. The signal passes through unchanged.</Note>
      ) : (
        <>
          <Controls>
            <Select label="Reference" value={mode} onChange={(v) => set('reref', 'mode', v)}
              options={[{ value: 'car', label: 'Common average (CAR)' }, { value: 'none', label: 'Keep original' }, ...raw.channels.map((c, i) => ({ value: String(i), label: `Single channel: ${c.label}` }))]} />
          </Controls>
          {mode !== 'car' && mode !== 'none' && <Note>The chosen reference channel becomes a flat line, because it is subtracted from itself.</Note>}
          <Obs items={[
            { label: 'Size of the shared signal', value: `${fmt(rms(common))} µV`, sub: 'RMS of the channel average' },
            { label: `${raw.channels[focus].label} RMS before`, value: `${fmt(rms(P.artifact.data[focus]))} µV` },
            { label: 'after', value: `${fmt(rms(P.reref.data[focus]))} µV`, tone: 'good' },
          ]} />
          <PlotCard title="The average of all channels (what gets subtracted)" read="this is the part every channel has in common.">
            <SignalPlot series={[{ data: common, color: '#B0892F', label: 'Channel average' }]} fs={ctx.fs} t0={ctx.t0} t1={ctx.t1} height={170} legend={false} onZoom={ctx.onZoom} onReset={ctx.onReset} />
          </PlotCard>
          <BeforeAfter ctx={ctx} before={P.artifact.data} after={P.reref.data} title="Before vs after" shades={eventShades(raw.events)} read="blue = channel minus the average above." />
        </>
      )}
      <More>
        <Formula caption="N = number of channels">x′ᵢ[n] = xᵢ[n] − (1/N) · Σⱼ xⱼ[n]</Formula>
        <p>CAR works best with many electrodes covering the whole head. With only a few, the average is still biased by individual channels. Always report which reference you used.</p>
      </More>
      <PyCode code={`x_car = x_clean - x_clean.mean(axis=0, keepdims=True)
# MNE:  raw.set_eeg_reference("average")`} />
    </StepPage>
  )
}

/* ============================== STEP 7 ================================== */
export function StepEpoch({ ctx }) {
  const { P, params, set, focus, fs, raw, t0, t1 } = ctx
  const p = params.epoch
  const ep = P.epochs
  const rejected = ep.filter((e) => e.rejected).length
  const shades = ep.map((e, i) => ({ start: e.start / fs, end: e.end / fs, color: e.rejected ? RED : i % 2 ? '#6F9BE0' : '#FFFFFF', opacity: e.rejected ? 0.22 : 0.16, label: e.rejected ? 'rejected' : undefined }))
  const dur = raw.channels[0].data.length / fs
  return (
    <StepPage n="7" title="Cut into epochs" lead={`Split the recording into ${p.len}-second windows and drop the bad ones.`}
      problem="EEG changes over time (e.g. when the eyes close), so one number for the whole recording hides this."
      fix={`Cut the signal into ${p.len} s windows (epochs). Reject any epoch whose peak-to-peak is above ${p.thresh} µV.`}
      result="A set of clean epochs. Each one gets its own feature values in the results.">
      <Controls>
        <Num label="Epoch length" value={p.len} min={0.25} max={10} step={0.25} suffix="s" onChange={(v) => set('epoch', 'len', v)} />
        <Select label="Overlap" value={p.overlap} onChange={(v) => set('epoch', 'overlap', Number(v))} options={[0, 0.25, 0.5, 0.75].map((o) => ({ value: o, label: `${o * 100}%` }))} />
        <Toggle label="Reject bad epochs" checked={p.reject} onChange={(v) => set('epoch', 'reject', v)} />
        <Num label="Rejection limit" value={p.thresh} min={10} max={2000} step={10} suffix="µV" onChange={(v) => set('epoch', 'thresh', v)} hint="peak-to-peak, any channel" />
      </Controls>
      <Obs items={[
        { label: 'Epochs created', value: ep.length },
        { label: 'Rejected', value: rejected, tone: rejected ? 'warn' : 'good' },
        { label: 'Kept', value: ep.length - rejected, tone: 'good' },
        { label: 'Samples per epoch', value: Math.round(p.len * fs) },
      ]} />
      <PlotCard title={`Epochs on ${raw.channels[focus].label}`} read="alternating stripes are epochs. Red stripes are rejected.">
        <SignalPlot series={[{ data: P.reref.data[focus], color: BLUE }]} fs={fs} t0={t0} t1={t1} height={220} shades={shades} legend={false} label={raw.channels[focus].label} onZoom={ctx.onZoom} onReset={ctx.onReset} />
      </PlotCard>
      <PlotCard title="Peak-to-peak of every epoch" read="each dot is one epoch (its worst channel). Dots above the dashed line are rejected. Lower the limit to see it happen.">
        <XYPlot
          series={[
            { x: ep.map((e) => (e.start + e.end) / 2 / fs), y: ep.map((e) => e.ptp), color: BLUE, dots: true, dotColors: ep.map((e) => (e.rejected ? RED : BLUE)), width: 1, label: 'Epoch peak-to-peak' },
            { x: [0, dur], y: [p.thresh, p.thresh], color: RED, dash: '5 4', width: 1.4, label: `Limit (${p.thresh} µV)` },
          ]}
          xLabel="Epoch centre (s)" yLabel="Peak-to-peak (µV)" xUnit="s" yUnit="µV" height={220}
          xDomain={[0, dur]} yDomain={[0, Math.max(p.thresh * 1.15, ...ep.map((e) => e.ptp * 1.08))]} />
      </PlotCard>
      <More>
        <Formula caption="L = samples per epoch, S = step">epoch k = x[k·S … k·S + L − 1],  L = len·fs,  S = L·(1 − overlap)</Formula>
        <Formula caption="rejection rule">reject if max(x) − min(x) &gt; limit  (on any channel)</Formula>
        <p>In BCI and ERP experiments, epochs are usually cut around events such as a stimulus or a cue instead of at fixed intervals.</p>
      </More>
      <PyCode code={`epochs = mne.make_fixed_length_epochs(raw, duration=${p.len}, overlap=${p.len * p.overlap})
epochs.drop_bad(reject=dict(eeg=${p.thresh}e-6))     # MNE uses volts
X = epochs.get_data() * 1e6                         # (epochs, channels, samples)`} />
    </StepPage>
  )
}

/* ============================== STEP 8 ================================== */
export function StepNormalize({ ctx }) {
  const { P, params, set, focus, fs, t0, t1, raw, onZoom, onReset } = ctx
  const m = params.norm.method
  return (
    <StepPage n="8" title="Normalise" lead="Put every channel on the same scale."
      problem="Signal size differs between people and channels (skull thickness, electrode contact), which makes comparisons hard."
      fix="Rescale each channel. The z-score subtracts the mean and divides by the standard deviation."
      result="All channels are comparable, which is ideal as input to a classifier."
      skipped={m === 'none'}>
      <Controls>
        <Select label="Method" value={m} onChange={(v) => set('norm', 'method', v)} options={[{ value: 'zscore', label: 'Z-score' }, { value: 'minmax', label: 'Min–max to [−1, 1]' }, { value: 'none', label: 'None' }]} />
      </Controls>
      <Grid2>
        <PlotCard title="Before (µV)" read="the real voltage.">
          <SignalPlot series={[{ data: P.reref.data[focus], color: GREY }]} fs={fs} t0={t0} t1={t1} height={210} legend={false} label={raw.channels[focus].label} onZoom={onZoom} onReset={onReset} />
        </PlotCard>
        <PlotCard title="After (no units)" read="same shape, new scale.">
          <SignalPlot series={[{ data: P.norm.data[focus], color: BLUE }]} fs={fs} t0={t0} t1={t1} height={210} unit="a.u." legend={false} label={raw.channels[focus].label} onZoom={onZoom} onReset={onReset} />
        </PlotCard>
      </Grid2>
      <Note kind="warn">After z-scoring, <b>every</b> channel has mean 0 and variance 1, so amplitude information is gone. That's why the results page uses the µV signal from Step 7 by default.</Note>
      <More>
        <Formula caption="z-score">z[n] = (x[n] − μ) / σ</Formula>
        <Formula caption="min–max">y[n] = 2·(x[n] − min) / (max − min) − 1</Formula>
      </More>
      <PyCode code={`z = (x - x.mean(axis=1, keepdims=True)) / x.std(axis=1, keepdims=True)
# or sklearn.preprocessing.StandardScaler on the feature table`} />
    </StepPage>
  )
}
