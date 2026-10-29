# Process Lab website

Open `dist/index.html` in a browser. All experiment data is embedded, so the interactive demo works without a server or internet. Fonts fall back to system fonts when offline.

Or serve it from this directory with `python -m http.server 8000 --directory dist`, then open http://localhost:8000.

Use Present for a six-slide, three-member presentation. Use arrow keys to move and Escape to close. The experiment has role sliders, an adjustable budget, three presets, a keyboard-accessible Pareto chart and utilization metrics. Download source/data/speaking notes from the bottom of the page. Save as PDF opens the browser print dialog.

The website explores saved C++ simulation results; it does not run C++ in the browser. Staffing choices outside the evaluated domain are clearly marked without invented results. After changing and rerunning the simulator, regenerate dist/data.js and copy updated CSV files before presenting.
