# Developer Guide

## Setup
```bash
npm install
npm run dev      # dev server
npm test         # Vitest suite
npm run build    # dist/index.html (single file, via vite-plugin-singlefile)
```
Node.js 20+ is required.

## Architecture
A client-only React single-page app. There is no backend: files are parsed and processed in the browser.

```
DataSource (upload / preset) ──► raw {fs, channels[], events}
                                   │
                usePipeline(raw, params)   ← each stage memoised separately
   dc → notch → bandpass → artifact → reref → epochs → norm → features
                                   │
            Step pages (Steps.jsx) + Features.jsx render plots/tables
```

## Code map
| Path | Responsibility |
| --- | --- |
| `src/App.jsx` | Page routing (hash `#raw`, `#notch`…), sidebar, view bar, Prev/Next, keyboard nav |
| `src/lib/dsp.js` | All signal processing: detrend, biquad filters, `filtfilt`, Welch PSD, artifacts, CAR, epochs, normalisation, `timeFeatures` |
| `src/lib/usePipeline.js` | Default parameters and the chained, memoised pipeline |
| `src/lib/parsers.js` | CSV/TXT/TSV and EDF readers, unit and size limits |
| `src/lib/datasets.js` | Synthetic preloaded recordings (seeded, reproducible) |
| `src/lib/features.js` | Feature metadata (label, unit, formula, description), number formatting |
| `src/components/Plots.jsx` | Interactive SVG plots: `SignalPlot`, `XYPlot`, `BarChart` |
| `src/components/Steps.jsx` | One component per preprocessing page |
| `src/components/Features.jsx` | Results page |
| `src/components/DataSource.jsx` | Start page: presets and upload |
| `src/components/ui.jsx` | Shared UI: StepPage, Controls, Obs, PlotCard, PyCode… |
| `public/*.js` | UI enhancements: animated background (`grainient.js`), sidebar line, top bar |
| `tests/dsp.test.js` | Unit tests |

## Key algorithms
- **Filters:** RBJ biquads. An n-th-order Butterworth filter is built from n/2 sections with Q_k = 1/(2 sin((2k−1)π/2n)).
- **Zero-phase:** odd-reflection padding → forward → reverse → forward → reverse (same idea as SciPy `filtfilt`).
- **PSD:** Welch with a Hann window, ~2 s segments, 50% overlap (only used for display).
- **Features:** computed per kept epoch, then mean ± SD across epochs.

## Adding a preprocessing step
1. Add the function to `dsp.js` and a test in `tests/dsp.test.js`.
2. Add default parameters to `DEFAULT_PARAMS` and a memoised stage in `usePipeline.js`.
3. Create a `StepX` component in `Steps.jsx` using `StepPage`.
4. Register it in `PAGES` and `steps` in `App.jsx`.

## Adding a time-domain feature
1. Compute it in `timeFeatures()` (`dsp.js`).
2. Add metadata to `FEATURES` in `features.js`. The table, charts and CSV pick it up automatically.

## Conventions
- Signals are `Float64Array` in µV; time in seconds; `fs` in Hz.
- Pure functions in `lib/`, rendering in `components/`.
- Run `npm test` before every pull request.
