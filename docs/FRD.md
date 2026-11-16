# Functional Requirements Document: EEG Preprocessing and Time-Domain Feature Explorer

BCI Course Project · Version 1.0 · 14 November 2026

## 1. Introduction

### 1.1 Purpose

This document defines the functional and non-functional requirements for a web application that lets a user load EEG data, preprocess it with a configurable pipeline, and view and export time-domain features. It is the reference for design, implementation and acceptance testing.

### 1.2 Product summary

The user either selects a preloaded EEG dataset or uploads their own file. The application inspects the data, applies preprocessing steps chosen by the user, and computes time-domain features per channel and per epoch. Results are shown as tables and plots and can be exported. The application must work for any EEG paradigm (motor imagery, P300, SSVEP, emotion, resting state, and others) and must not assume the structure of any one dataset.

### 1.3 Scope

**In scope:** data selection and upload, validation, inspection, preprocessing (filtering, referencing, ICA artifact removal, epoching, baseline correction, resampling), before/after visualization, time-domain feature extraction, result display, export, session handling.

**Out of scope:** classification or decoding, frequency-domain and time-frequency features (possible extension), real-time acquisition, user accounts, multi-subject statistics, clinical interpretation of results.

### 1.4 Definitions

| Term | Meaning |
| --- | --- |
| Epoch | A segment of the recording, either event-locked, start/end bounded, or a fixed sliding window |
| Stage / snapshot | The stored result of one preprocessing step |
| Event / marker | A labeled time point stored in the file (annotation or stim channel) |
| ICA / ICLabel | Independent Component Analysis and the classifier that labels components as brain, eye, muscle, heart, and so on |
| PSD | Power spectral density, estimated with Welch method |
| MoSCoW priority | M = must, S = should, C = could |

### 1.5 References

Course material: Unit 2 (acquisition and preprocessing), Unit 3 (feature extraction), EEG overview slides, Experiment 4 (preprocessing), Experiment 5 (time and frequency features). Libraries: MNE-Python, mne-icalabel, SciPy, NumPy, pandas, FastAPI, React, Plotly.

## 2. Overall Description

### 2.1 Architecture

Three parts: a React single-page frontend, a FastAPI backend that performs all signal processing with MNE-Python, and temporary server-side session storage. The frontend never processes raw EEG; it only requests decimated views and results.

### 2.2 Users

- **Student analyst (primary):** loads data, tunes the pipeline, reads features.
- **Evaluator:** runs the preloaded dataset and checks that each step is correct and explained.

### 2.3 Constraints and assumptions

- Delivery within 14 days; Python backend, React frontend.
- Pipeline order and defaults follow Experiment 4; feature set follows Experiment 5.
- Uploaded data is sensitive and must not persist beyond the session.
- ICLabel needs channel positions (standard montage names) and enough channels; when unavailable the system falls back to manual component selection or disables ICA.
- Target browsers: current Chrome, Firefox, Edge. Primary screen width 1280 px or more.

## 3. Workflow

Data (select or upload) → Inspect → Preprocess (stepwise, each with before/after) → Features → Export. Every preprocessing step produces a snapshot. Changing an upstream step marks all downstream snapshots as stale.

## 4. Functional Requirements

### 4.1 Data source (DS)

| ID | Requirement | Pri |
| --- | --- | --- |
| DS-01 | Offer two options: preloaded dataset or upload | M |
| DS-02 | List preloaded datasets with name, description, paradigm, channel count, sampling rate, duration | M |
| DS-03 | Selecting a preloaded dataset creates a session without any upload | M |
| DS-04 | Preloaded datasets use exactly the same code path as uploads (no special cases) | M |
| DS-05 | Accept .edf and .csv; also .bdf, .fif, .set, .gdf | M (edf, csv), S (others) |
| DS-06 | Reject files above a configurable size limit (default 50 MB) with a clear message | M |
| DS-07 | File picker and drag-and-drop, with upload progress | S |
| DS-08 | Accept an optional events file (time or sample, label) for CSV data | S |

### 4.2 Validation and metadata entry (VA)

| ID | Requirement | Pri |
| --- | --- | --- |
| VA-01 | Validate extension and readability; on failure state the cause | M |
| VA-02 | For CSV, show a form: sampling rate (required), orientation (channels × samples or reverse), header row yes/no, channel names (default Ch1…ChN), units (default µV), optional label column | M |
| VA-03 | Block progression if the sampling rate cannot be determined | M |
| VA-04 | Reject files with no EEG channel or shorter than 2 seconds | M |
| VA-05 | Detect non-EEG channels (EOG, ECG, EMG, stim, trigger, misc) by type or name; exclude them from processing by default, with user override | M |

### 4.3 Inspection (IN)

| ID | Requirement | Pri |
| --- | --- | --- |
| IN-01 | Metadata card: file name, format, sampling rate, channel count, duration, samples, channel names and types, units, reference and stored filter settings if present | M |
| IN-02 | Event table: unique labels, counts, first occurrence; clear message if none | M |
| IN-03 | Raw signal viewer: multi-channel select, start time and window length, scroll, zoom, amplitude scale | M |
| IN-04 | Viewer receives at most a configured number of points per channel (decimated), default 5000 | M |
| IN-05 | Overlay event markers as vertical lines | S |
| IN-06 | Raw PSD (Welch) for selected channels | M |
| IN-07 | Flag likely bad channels (flat, or log-variance z-score above 3) without removing them automatically | S |
| IN-08 | Include/exclude channels; optional channel renaming and montage selection (for example standard 10-20) | S |

### 4.4 Preprocessing (PP)

**General**

| ID | Requirement | Pri |
| --- | --- | --- |
| PP-01 | Fixed step order: channel selection → notch → band-pass → re-reference → ICA → epoching → baseline correction → resampling. Each step is optional | M |
| PP-02 | Each step has a parameter form with defaults, an Apply button, running state, and a result summary | M |
| PP-03 | Each step stores a snapshot; stale-state propagation as in section 3 | M |
| PP-04 | Raw data is never modified; Reset returns to raw | M |
| PP-05 | Paradigm presets (General 1-40 Hz, Motor imagery 8-30 Hz, ERP/P300 about 0.1-30 Hz, Custom) only fill defaults and never lock fields | S |
| PP-06 | Advisory warnings for questionable choices (for example no notch while a line-frequency peak exists, aggressive high-pass for ERP data) | C |

**Filtering (FL)**

| ID | Requirement | Pri |
| --- | --- | --- |
| FL-01 | Band-pass with high-pass (default 1 Hz) and low-pass (default 40 Hz) cutoffs; either may be blank for one-sided filtering | M |
| FL-02 | Filter type FIR (default) or IIR Butterworth with selectable order | M |
| FL-03 | Notch filter at 50 Hz (default), 60 Hz, or custom frequency; optional harmonics | M |
| FL-04 | Show raw vs filtered PSD overlay after applying | M |

**Re-referencing (RF)**

| ID | Requirement | Pri |
| --- | --- | --- |
| RF-01 | Options: keep original (default), common average, linked mastoid/earlobe (only if those channels exist), custom channel(s) | M (first two), S |
| RF-02 | If ICLabel is requested and data is not average-referenced, warn and offer to apply common average first | M |

**ICA artifact removal (AR)**

| ID | Requirement | Pri |
| --- | --- | --- |
| AR-01 | Fit ICA with selectable method (extended Infomax default, FastICA) and component count; fixed random seed | M |
| AR-02 | Precondition checks with configurable thresholds: warn below 16 channels, block below 8 channels or very short recordings (initial values, to be tuned) | M |
| AR-03 | Run as a background job with progress and a status endpoint | M |
| AR-04 | Component panel: topography (if montage available), time course, PSD, ICLabel class probabilities | M |
| AR-05 | Pre-select components whose non-brain probability exceeds a threshold (default 0.8); user can toggle any component | M |
| AR-06 | If ICLabel is unavailable, allow fully manual component selection | M |
| AR-07 | Apply removal and show before/after for chosen channels (time series and PSD) | M |

**Epoching (EP)**

| ID | Requirement | Pri |
| --- | --- | --- |
| EP-01 | Three modes: (a) none/continuous with sliding windows (length, overlap), (b) event-locked (chosen labels, tmin, tmax), (c) start/end segments (chosen start label and end label) | M |
| EP-02 | Choose labels from the event table; allow several labels and optional condition names | M |
| EP-03 | Support variable-length epochs; all later steps must work on them | M |
| EP-04 | Report epoch count, counts per label, and min/mean/max duration; report epochs dropped because they exceed the recording | M |
| EP-05 | Optional peak-to-peak rejection threshold with a count of rejected epochs | S |
| EP-06 | Epoch viewer: choose an epoch and see its waveform; overlay average for equal-length epochs | S |

**Baseline correction (BC)**

| ID | Requirement | Pri |
| --- | --- | --- |
| BC-01 | Available only for equal-length event-locked epochs; window default is from tmin to 0 (for example -200 to 0 ms) and must lie inside the epoch | M |
| BC-02 | Disabled with an explanatory tooltip for other epoch modes | M |
| BC-03 | Show before/after comparison | M |

**Resampling (RS)**

| ID | Requirement | Pri |
| --- | --- | --- |
| RS-01 | Target rate set by user (off by default); must be at least 2.5 times the low-pass cutoff; anti-alias filtering applied; events adjusted | M |
| RS-02 | Show before/after time series comparison | M |

### 4.5 Visualization (VZ)

| ID | Requirement | Pri |
| --- | --- | --- |
| VZ-01 | For every applied step, show before/after time series for selected channels over the same window, as overlay or side by side | M |
| VZ-02 | Show before/after PSD with log amplitude axis | M |
| VZ-03 | Stage selector to view any stored snapshot | M |
| VZ-04 | Interactive hover, zoom, pan, legend toggle, PNG export | S |
| VZ-05 | Axis labels with units; colorblind-safe palette | S |

### 4.6 Feature extraction (FE)

| ID | Requirement | Pri |
| --- | --- | --- |
| FE-01 | Compute on a user-chosen stage (default latest), for chosen channels and epochs/labels | M |
| FE-02 | Feature catalog with checkboxes (see section 7): mean, standard deviation, skewness, kurtosis, zero crossings, Hjorth activity/mobility/complexity, fractal dimension, RMS, peak-to-peak, area under curve; optional line length | M (first nine), S (rest) |
| FE-03 | Epoched data: per channel per epoch values plus aggregates (mean and std across epochs, per label). Continuous data: per channel over the whole recording | M |
| FE-04 | Parameters: fractal algorithm (Higuchi default with kmax 10, Petrosian, Katz), zero-crossing threshold, standard deviation ddof | S |
| FE-05 | Undefined results (constant signal, too few samples) return NaN, are flagged in the table, and never crash the request | M |

### 4.7 Results and export (RE)

| ID | Requirement | Pri |
| --- | --- | --- |
| RE-01 | Feature table: sortable, filterable, searchable by channel, paginated | M |
| RE-02 | View modes: per-channel summary, per-epoch detail, per-label comparison | M |
| RE-03 | Channel-wise bar chart for a selected feature, with error bars for epoched data | M |
| RE-04 | Heatmap of channels × features, z-scored per feature | S |
| RE-05 | Grouped bar chart per label or condition | S |
| RE-06 | Homologous channel comparison (for example F3/F4, O1/O2) when such pairs exist | C |
| RE-07 | Distribution plot (box or violin) across epochs for one channel and feature | C |
| RE-08 | Scalp topography of one feature when a montage is available | C |
| RE-09 | Export feature table as CSV in long and wide format | M |
| RE-10 | Export the data at any stage as .fif; optionally .edf or .csv | M (.fif), S |
| RE-11 | Export the pipeline log as JSON (see SS-05) | M |

### 4.8 Session and privacy (SS)

| ID | Requirement | Pri |
| --- | --- | --- |
| SS-01 | Create a session id on load; keep all data server-side under that id | M |
| SS-02 | Delete session data after an idle timeout (default 60 min) and on explicit End session | M |
| SS-03 | Provide a visible Delete my data control | M |
| SS-04 | Limit concurrent sessions and per-session memory (configurable) | S |
| SS-05 | Pipeline log records every step, all parameters, removed ICA components, random seeds, library versions, and timestamps | M |
| SS-06 | Session summary view listing applied steps | S |

### 4.9 Error handling (ER)

| ID | Requirement | Pri |
| --- | --- | --- |
| ER-01 | Parameter violations return field-level messages (see section 6) | M |
| ER-02 | Backend exceptions are mapped to readable messages; stack traces never reach the UI | M |
| ER-03 | Long operations have a timeout (default 10 min) and fail gracefully | S |

## 5. User Interface Requirements

A stepper at the top shows three pages: Data, Preprocess, Features. Every page has empty, loading and error states.

**Page 1, Data:** two cards (preloaded, upload); CSV metadata form when needed; metadata card; event table; raw viewer and raw PSD.

**Page 2, Preprocess:** left panel with one collapsible section per step and a status badge (not run, done, stale, skipped); right panel with tabs for time series, PSD and ICA components; stage selector above the plots; Reset button.

**Page 3, Features:** left panel for stage, channel, epoch/label and feature selection plus parameters; right panel with tabs for Table, Bar chart, Heatmap, Comparison; export bar.

Every parameter has a short tooltip that names the course concept it relates to (for example Nyquist, aliasing, baseline).

## 6. Validation Rules

| Rule | Condition |
| --- | --- |
| V-01 | 0 < high-pass < low-pass < Nyquist (half the sampling rate) |
| V-02 | Notch frequency and its harmonics must be below Nyquist |
| V-03 | Resampling target at least 2.5 × low-pass cutoff and below the original rate |
| V-04 | Epoch tmin < tmax; epoch window must contain at least 10 samples |
| V-05 | Baseline window lies within the epoch window |
| V-06 | Start/end mode needs a start label and an end label that occur in the event table |
| V-07 | Sliding window length at least 0.5 s; overlap from 0 to under 100 percent |
| V-08 | ICA component count at most channels minus 1 |
| V-09 | Fractal dimension needs at least 50 samples per epoch, otherwise NaN |

## 7. Feature Definitions

For a signal x\[1..N\] sampled at fs, with first difference d\[n\] = x\[n+1\] - x\[n\]:

| Feature | Definition |
| --- | --- |
| Mean | (1/N) Σ x\[n\] |
| Standard deviation | sqrt of variance, ddof 1 by default (configurable) |
| Skewness | third standardized moment (population form, as in SciPy default) |
| Kurtosis | fourth standardized moment minus 3 (excess form, SciPy default); report the convention in the UI |
| Zero crossings | number of sign changes of the mean-removed signal; also reported per second |
| Hjorth activity | variance of x |
| Hjorth mobility | sqrt( var(d) / var(x) ) |
| Hjorth complexity | mobility(d) / mobility(x) |
| Fractal dimension | Higuchi (kmax 10, value between 1 and 2); Petrosian and Katz as options |
| RMS | sqrt( (1/N) Σ x\[n\]² ) |
| Peak-to-peak | max(x) - min(x) |
| Area under curve | trapezoidal integral of the absolute signal over time (unit amplitude × s) |
| Line length (optional) | Σ abs( d\[n\] ) |

Conventions that the lab code may define differently (ddof, kurtosis form, fractal algorithm, zero-crossing definition) must be checked against the Experiment 5 implementation and aligned or documented.

## 8. API Specification

All routes are under /api. Errors use the body {error: {code, message, field}}.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | /datasets | List preloaded datasets |
| POST | /sessions | Upload a file (multipart), returns session id and metadata |
| POST | /sessions/preloaded | Body {dataset\_id}, returns session id and metadata |
| POST | /sessions/{id}/csv-metadata | Submit CSV settings |
| GET | /sessions/{id}/info | Metadata and channel list |
| GET | /sessions/{id}/events | Event table |
| GET | /sessions/{id}/signal | Query: stage, channels, start, duration, max\_points |
| GET | /sessions/{id}/psd | Query: stage, channels |
| GET | /sessions/{id}/steps | Status of all steps and snapshots |
| POST | /sessions/{id}/steps/{step} | Apply a step with its parameters |
| POST | /sessions/{id}/ica/fit | Start ICA job, returns job id |
| GET | /sessions/{id}/ica/components | Component data and ICLabel probabilities |
| POST | /sessions/{id}/ica/apply | Body {exclude: \[indices\]} |
| GET | /jobs/{job\_id} | Job status and progress |
| POST | /sessions/{id}/features | Compute features, returns table and plot data |
| GET | /sessions/{id}/features/export | Query: format, view |
| GET | /sessions/{id}/export/{stage} | Query: format (fif, edf, csv) |
| GET | /sessions/{id}/log | Pipeline log JSON |
| DELETE | /sessions/{id} | Delete all session data |

## 9. Data Model

- **Session:** id, created\_at, last\_active, source (preloaded or upload), metadata, list of stages.
- **Stage snapshot:** name, parameters, status (done, stale, skipped), sampling rate, channel count, epoch count, created\_at.
- **Event:** sample index, time in seconds, label.
- **Feature row:** epoch\_id, label, epoch\_start\_s, epoch\_duration\_s, channel, one column per feature, nan\_flags.

## 10. Non-Functional Requirements

| Area | Requirement |
| --- | --- |
| Performance | Signal window request under 1 s; file load under 15 s for 50 MB; filtering under 30 s for 64 channels × 10 min; feature computation under 10 s for 64 channels × 200 epochs; ICA shows progress and finishes in a few minutes on typical data (targets to be verified) |
| Privacy and security | No permanent storage of uploads; no logging of signal content; file type and size checks; temp files in a private folder; HTTPS if hosted |
| Usability | A first-time user completes the full flow with the preloaded dataset in under 5 minutes without reading documentation |
| Reliability | One failed step never corrupts earlier snapshots; app stays usable after any handled error |
| Reproducibility | Seeded ICA, pinned dependency versions, same inputs and parameters give identical outputs |
| Maintainability | Signal processing in a standalone Python package (no web code) with unit tests; API documented through FastAPI auto docs |
| Portability | Run locally with two commands (backend, frontend) and a README; Docker optional |

## 11. Acceptance Criteria

**Test datasets:** (T1) PhysioNet motor movement/imagery EDF, event-locked annotations; (T2) lab emotion-recognition EDF with start/end markers, if permission to use it is confirmed; (T3) a recording with no markers, as EDF or CSV; (T4) invalid files (corrupt, wrong extension, oversize).

| ID | Criterion |
| --- | --- |
| AC-01 | Each supported format loads and the metadata matches the file header |
| AC-02 | A preloaded dataset completes the full pipeline with no code change |
| AC-03 | After band-pass, PSD shows attenuation outside the cutoffs; notch removes the line-frequency peak |
| AC-04 | ICA lists components with class probabilities; removing an eye component visibly reduces blink artifacts |
| AC-05 | Epoch counts equal the event counts in the event table (minus reported drops) |
| AC-06 | Feature values match reference implementations (SciPy, antropy, or the Experiment 5 code) within 1e-6 |
| AC-07 | Unit tests pass: constant signal gives std 0 and NaN shape features; sine wave gives zero crossings near 2·f·T; white noise gives Higuchi FD near 2 and sine near 1 |
| AC-08 | Invalid parameters produce field-level errors and never a server error |
| AC-09 | End session removes all session data from disk and memory |
| AC-10 | Same flow works on T1, T2 and T3, demonstrating paradigm independence |

## 12. Open Items and Risks

| ID | Item |
| --- | --- |
| OI-01 | Project handout not yet reviewed; extra requirements may exist |
| OI-02 | Permission to bundle the lab emotion dataset (otherwise PhysioNet is the default preloaded set) |
| OI-03 | Confirm Experiment 5 conventions (ddof, kurtosis form, fractal algorithm, zero crossings) |
| OI-04 | Deployment target: local only or hosted |
| OI-05 | Confirm that ICA with ICLabel is expected in the project, as in Experiment 4 |

| Risk | Mitigation |
| --- | --- |
| ICA is slow | Background job, progress, optional decimated fit |
| ICLabel assumes average reference and roughly 1-100 Hz data; a 1-40 Hz band-pass may reduce accuracy | Verify on test data, warn the user, allow manual selection |
| Uploads vary widely in format and markers | Inspection-driven UI (RE-driven by event table), CSV form, continuous-window fallback |
| Large files make the UI slow | Server-side decimation, windowed requests |
| Scope creep in a 14-day window | Deliver all Must items first; Should and Could only after |

## 13. Milestones

| Days | Deliverable | Requirement groups |
| --- | --- | --- |
| 1-2 | Standalone Python module: load, inspect, pipeline, features, tested on T1-T3 | IN, PP, FE core |
| 3-5 | Backend: sessions, upload, preloaded, step endpoints, snapshots | DS, VA, PP, SS, ER |
| 6 | ICA and ICLabel endpoints and background jobs | AR |
| 7 | Feature endpoints, unit tests | FE, RE-09 |
| 8-10 | Frontend: Data, Preprocess, Features pages | UI, VZ, RE |
| 11-12 | Error handling, edge cases, polish, Should items | ER, S items |
| 13 | Testing against acceptance criteria, README | AC-01 to AC-10 |
| 14 | Report, demo, buffer | n/a |

Minimum viable product: every requirement marked M.

## 14. Traceability to Course Material

| Course source | Requirements |
| --- | --- |
| Experiment 4A (load, inspect, report fs, channels, duration) | IN-01, IN-03, IN-06 |
| Experiment 4B (filter, ICA and ICLabel, epoch, baseline, downsample, compare each) | FL, AR, EP, BC, RS, VZ-01, VZ-02, RE-10 |
| Experiment 5B (time-domain features) | FE-02, section 7 |
| Experiment 5D (channel-wise bars, homologous channels, which features are useful) | RE-03, RE-05, RE-06 |
| Unit 2 (filters, aliasing, referencing, baseline, epoching, normalization) | PP-01, V-01 to V-05, RF-01 |
| Unit 1 ethics and data governance | SS-01 to SS-03, privacy NFR |
