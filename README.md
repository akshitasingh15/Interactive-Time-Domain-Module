# EEG Preprocessing Lab

An interactive web app for learning EEG preprocessing. It takes an EEG recording from raw data to clean
signal one step per page, and then computes **17 time-domain parameters** per channel. It was built for
the BCI course project (Option A: web-app module).

Everything runs in the browser. No server is needed and no data leaves your computer.

## Quick start

**Option 1: open the built app.** Run `npm run build`, then double-click `dist/index.html`.

**Option 2: run from source.** Requires [Node.js](https://nodejs.org) 20 or newer (LTS recommended).

```bash
git clone <this-repo-url>
cd <repo-folder>
npm install        # install dependencies
npm run dev        # start the dev server → open http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm test` | Run the automated test suite (Vitest, 11 tests) |
| `npm run build` | Build into `dist/` (self-contained `index.html` + 3 UI scripts) |
| `npm run preview` | Serve the production build locally |

## Features

- **Data:** 4 preloaded synthetic recordings (resting EO→EC, noisy, motor imagery, single-channel sleep),
  or upload `.edf`, `.csv`, `.txt` or `.tsv` files.
- **Pipeline (one page each):** raw inspection → DC offset and detrend → notch (50/60 Hz) → Butterworth
  band-pass (zero-phase) → threshold artifact detection and correction → re-referencing (CAR) →
  epoching with peak-to-peak rejection → normalisation.
- **Each page shows:** a Problem → What we do → Result summary, adjustable parameters, before/after
  plots, key numbers, formulas and the equivalent Python (SciPy/MNE) code.
- **Results:** 17 time-domain parameters (mean, median, SD, variance, RMS, MAV, min, max, peak-to-peak,
  skewness, kurtosis, zero-crossing rate, line length, energy, power, Hjorth mobility and complexity)
  as a table (copy as CSV), bar chart and per-epoch trend.
- **Interactive plots:** hover for values, drag to zoom, double-click to reset, click a legend item to hide it.

## Documentation

- [User guide](docs/USER_GUIDE.md): how to use the app
- [Developer guide](docs/DEVELOPER_GUIDE.md): architecture, code map, how to add steps or features
- [Functional requirements](docs/FRD.md): original requirements document

## Tests

```bash
npm test
```

There are 11 tests in `tests/dsp.test.js`. They cover detrending, notch attenuation (> 20 dB at 50 Hz),
band-pass accuracy, artifact detection and repair, the CAR property, epoch rejection, z-scoring,
time-domain features against analytic values for a sine wave, CSV parsing and dataset generation.

## Tech stack

React 19, Vite, Vitest. All signal processing (IIR biquads, filtfilt, Welch PSD, features) is
implemented from scratch in `src/lib/dsp.js`.

## Team

See the contribution statement submitted with the project.
