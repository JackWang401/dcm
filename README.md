# Lightweight DCM Editor

Small local web tool for common DCM calibration editing workflows:

- Edit parameter values for `FESTWERT`, `FESTWERTEBLOCK`, `KENNLINIE`, and `KENNFELD`
- Visualize vector and map parameters with a line chart or heatmap
- Compare the loaded snapshot against current edits before saving

## Run

```bash
python3 app.py
```

Then open `http://127.0.0.1:8765`.

## Notes

- The tool creates a timestamped `.bak` file before each save.
- It preserves untouched content outside supported parameter blocks.
- Saving is guarded by a source hash so you do not overwrite a file that changed on disk after loading.

## Sample

You can test the UI with:

`/Users/wangjianhai/02_ADAS/01_repo/01_Tools/05_dcm/examples/sample.dcm`
