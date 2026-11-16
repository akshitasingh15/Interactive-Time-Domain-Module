# User Guide

## 1. Open the app
Open `dist/index.html` in Chrome, Edge or Firefox, or run `npm run dev` and go to http://localhost:5173.

## 2. Move around
- **Sidebar** (left): jump to any page.
- **Previous / Next** buttons at the bottom, or the **← →** arrow keys.
- On a phone, use the dropdown at the top of the page.

## 3. Choose data (page 0)
- Click one of the 4 **preloaded recordings**. They are synthetic, so you know what every step should remove.
- Or **upload** a file (drag and drop, or *Browse files*):
  - `.edf`: everything is read from the header.
  - `.csv / .txt / .tsv`: one column per channel in µV, with an optional header row of channel names
    and an optional first column `time` in seconds. Without a time column, type the sampling rate.
  - Only the first 180 s and 32 channels are loaded.
- Press **Start: Step 1**.

## 4. The view bar (top of every step)
| Control | Use |
| --- | --- |
| Channel | Which channel the plots show |
| Time shown | Window length (1 s … whole recording) |
| Position | Slide the window through the recording |
| Reset view / Reset settings | Undo zoom / restore default parameters |

## 5. Reading a step page
1. **Problem → What we do → Result**: the step in three sentences.
2. **Try it**: change parameters; all plots update instantly.
3. **Key numbers**: e.g. how many dB of mains hum were removed.
4. **Plots**: every plot has a *How to read* line. Grey = before, blue = after.
5. **Details and formulas** and **Python equivalent**: expand when needed.

## 6. Interacting with plots
- **Hover**: see exact time/frequency and values.
- **Drag** across a plot: zoom in. **Double-click**: zoom out.
- **Click a legend item**: hide/show that line.

## 7. Results page
- Pick a parameter with the chips. You see its formula and meaning, a bar chart per channel and a trend over time.
- **Compute on** switches between the clean µV signal and the normalised signal.
- **Copy as CSV** copies the whole results table (mean and SD for each parameter and channel) for Excel.

## 8. Suggested exercises
- *Resting EO → EC*, RMS: O1/O2 rise after 15 s (alpha with eyes closed).
- *Motor imagery*, RMS over time: C3 dips during imagery blocks (ERD).
- Turn off artifact removal (Step 5) and look at Fp1 kurtosis.
- Set the notch Q to 5 and then to 80, and compare the spectrum.

## 9. Troubleshooting
| Problem | Fix |
| --- | --- |
| Upload error "not enough numeric rows" | Check the delimiter and that the values are numbers |
| All epochs rejected | Raise the rejection limit in Step 7 |
| Values look 10⁶ too small | The file was in volts; volts are auto-detected only if all values are < 0.01 |
