import { useState } from 'react'
import { BarChart, XYPlot, PALETTE } from './Plots'
import { StepPage, Formula, Controls, Select, Obs, PlotCard, PyCode, Grid2, More, Note } from './ui'
import { FEATURES, FEATURE_MAP, fmt } from '../lib/features'

export default function Features({ ctx }) {
  const { P, params, set, fs, raw } = ctx
  const [sel, setSel] = useState('rms')
  const [copied, setCopied] = useState(false)
  const F = P.features
  const f = FEATURE_MAP[sel]
  const normed = params.featureSource === 'normalized'
  const unit = normed && f.unit ? (f.unit.includes('²') ? 'a.u.²' : f.unit === '/s' ? '/s' : 'a.u.') : f.unit
  const groups = [...new Set(FEATURES.map((x) => x.group))]
  const epochX = F.used.map((e) => (e.start + e.end) / 2 / fs)
  const dur = raw.channels[0].data.length / fs

  const copyCsv = () => {
    const head = ['channel', ...FEATURES.flatMap((x) => [`${x.key}_mean`, `${x.key}_sd`])].join(',')
    const rows = F.perChannel.map((c) => [c.label, ...FEATURES.flatMap((x) => [c.mean[x.key], c.sd[x.key]])].join(','))
    navigator.clipboard?.writeText([head, ...rows].join('\n')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }

  return (
    <StepPage n="✓" title="Time-domain parameters" lead="Numbers that describe each channel's waveform, computed on every clean epoch and then averaged."
      problem="A cleaned signal is still thousands of samples. A classifier or a report needs a few meaningful numbers."
      fix="Measure the waveform directly in time: how big it is, what shape its values have, and how fast and irregular it is."
      result={`${FEATURES.length} parameters × ${F.perChannel.length} channels = a ${FEATURES.length * F.perChannel.length}-number feature vector.`}>
      <Controls>
        <Select label="Compute on" value={params.featureSource} onChange={(v) => set('featureSource', null, v)}
          options={[{ value: 'clean', label: 'Clean signal in µV (Step 7)' }, { value: 'normalized', label: 'Normalised signal (Step 8)' }]} />
      </Controls>
      {F.fallback && <Note kind="warn">Every epoch was rejected, so the whole signal was used. Raise the rejection limit in Step 7.</Note>}

      <div className="picker">
        {groups.map((g) => (
          <div key={g} className="picker-group">
            <span>{g}</span>
            <div>
              {FEATURES.filter((x) => x.group === g).map((x) => (
                <button type="button" key={x.key} className={x.key === sel ? 'sel' : ''} onClick={() => setSel(x.key)}>{x.label.replace(' (Hjorth activity)', '')}</button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="feature-focus">
        <div className="feature-def">
          <div>
            <div className="eyebrow">{f.group}</div>
            <h3>{f.label} <span>{f.sym}</span></h3>
            <p>{f.desc}</p>
          </div>
          <Formula>{f.formula}</Formula>
        </div>
        <Grid2>
          <PlotCard title="Average per channel" read="bar = average over epochs, whisker = how much it varies. Hover a bar for details.">
            <BarChart unit={unit} onSelect={(i) => ctx.setFocus(i)} items={F.perChannel.map((c, i) => ({ label: c.label, value: c.mean[sel], err: F.used.length > 1 ? c.sd[sel] : 0, text: fmt(c.mean[sel]), color: PALETTE[i % PALETTE.length] }))} />
          </PlotCard>
          <PlotCard title="How it changes over time" read={`one point per epoch. ${raw.events?.length ? 'Blue shading marks events. ' : ''}Click legend names to hide channels.`}>
            <XYPlot
              series={F.perChannel.slice(0, 8).map((c, i) => ({ x: epochX, y: c.perEpoch.map((r) => r[sel]), color: PALETTE[i % PALETTE.length], label: c.label, dots: F.used.length < 60, dotR: 2.4 }))}
              xDomain={[0, dur]} xLabel="Time (s)" yLabel={`${f.sym}${unit ? ` (${unit})` : ''}`} xUnit="s" yUnit={unit} height={250}
              bands={(raw.events || []).map((e) => ({ x0: e.start, x1: e.end, color: '#6F9BE0', opacity: 0.16 }))}
            />
          </PlotCard>
        </Grid2>
      </div>

      <Obs items={[
        { label: 'Epochs used', value: F.used.length },
        { label: 'Channels', value: F.perChannel.length },
        { label: 'Parameters', value: FEATURES.length },
        { label: 'Feature vector', value: F.perChannel.length * FEATURES.length, sub: 'numbers per recording' },
      ]} />

      <div className="table-card">
        <div className="table-title">
          All results <span>mean ± standard deviation across epochs · click a column to explore it</span>
          <button type="button" className="btn small" onClick={copyCsv}>{copied ? 'Copied ✓' : 'Copy as CSV'}</button>
        </div>
        <div className="table-scroll">
          <table className="features">
            <thead>
              <tr>
                <th className="sticky">Channel</th>
                {FEATURES.map((x) => (
                  <th key={x.key} className={x.key === sel ? 'sel' : ''} onClick={() => setSel(x.key)} title={x.formula}>
                    {x.label.replace(' (Hjorth activity)', '').replace(' (excess)', '')}
                    <small>{x.key === sel ? unit || '–' : normed && x.unit ? 'a.u.' : x.unit || '–'}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {F.perChannel.map((c) => (
                <tr key={c.label}>
                  <td className="sticky">{c.label}</td>
                  {FEATURES.map((x) => (
                    <td key={x.key} className={x.key === sel ? 'sel' : ''} onClick={() => setSel(x.key)}>
                      {fmt(c.mean[x.key])}
                      {F.used.length > 1 && <small> ±{fmt(c.sd[x.key], 2)}</small>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="try">
        <div className="try-title">Things to try</div>
        <ul>
          <li><b>Resting EO → EC</b> with <b>RMS</b>: O1/O2 rise after 15 s. Closing the eyes brings in alpha waves.</li>
          <li><b>Motor imagery</b> with <b>RMS</b>: C3 dips during every "imagine right hand" block. A BCI detects exactly this drop.</li>
          <li>Switch <b>Compute on</b> to normalised: mean becomes 0 and variance becomes 1 everywhere.</li>
          <li>Turn off Step 5 and check <b>kurtosis</b> on Fp1. Blinks make it jump.</li>
        </ul>
      </div>

      <More title="Pipeline used for these results">
        <ol className="summary">
          <li>{params.detrend === 'none' ? 'No detrending' : params.detrend === 'linear' ? 'Linear detrend' : 'Mean removal'}</li>
          <li>{params.notch.enabled ? `Notch ${params.notch.f0} Hz (Q = ${params.notch.Q})` : 'No notch'}</li>
          <li>{params.bandpass.enabled ? `Butterworth band-pass ${params.bandpass.low}–${params.bandpass.high} Hz, order ${params.bandpass.order}, zero-phase` : 'No band-pass'}</li>
          <li>{params.artifact.enabled ? `Artifact threshold ±${params.artifact.thresh} µV, ${params.artifact.method === 'interpolate' ? 'interpolated' : 'marked only'}` : 'No artifact handling'}</li>
          <li>{raw.channels.length < 2 || params.reref.mode === 'none' ? 'Original reference' : params.reref.mode === 'car' ? 'Common average reference' : `Reference: ${raw.channels[Number(params.reref.mode)]?.label}`}</li>
          <li>{params.epoch.len} s epochs{params.epoch.reject ? `, rejected if peak-to-peak > ${params.epoch.thresh} µV` : ''}</li>
          <li>Features computed on the {normed ? 'normalised' : 'clean µV'} signal</li>
        </ol>
      </More>

      <PyCode code={`import numpy as np
from scipy.stats import skew, kurtosis

def time_features(x, fs):
    T = len(x) / fs
    dx, ddx = np.diff(x), np.diff(x, 2)
    mob  = np.sqrt(np.var(dx) / np.var(x))
    comp = np.sqrt(np.var(ddx) / np.var(dx)) / mob
    return dict(mean=x.mean(), median=np.median(x), std=x.std(), variance=x.var(),
                rms=np.sqrt(np.mean(x**2)), mav=np.mean(np.abs(x)),
                min=x.min(), max=x.max(), ptp=np.ptp(x),
                skewness=skew(x), kurtosis=kurtosis(x),
                zcr=np.sum(np.diff(np.sign(x - x.mean())) != 0) / T,
                line_length=np.sum(np.abs(dx)) / T,
                energy=np.sum(x**2), power=np.mean(x**2),
                hjorth_mobility=mob, hjorth_complexity=comp)`} />
    </StepPage>
  )
}
