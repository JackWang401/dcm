# Lightweight DCM Editor

Small local web tool for common DCM calibration editing workflows:

- Edit parameter values for common DCM blocks including `FESTWERT`, `TEXTSTRING`, `FESTWERTEBLOCK`, `STUETZSTELLENVERTEILUNG`, `KENNLINIE`, `FESTKENNLINIE`, `KENNFELD`, and `FESTKENNFELD`
- Visualize vector and map parameters with a line chart or heatmap
- Compare the loaded snapshot against current edits before saving
- Compare the current editor state against another DCM file
- Show numeric validation warnings while still allowing explicit saves
- Undo and redo committed edits with unsaved-change tracking
- Edit structured metadata fields such as `LANGNAME` and units while preserving non-editable lines
- Export all or changed editor fields to CSV and import edited CSV rows back into the tool
- Save the edited document back in place or write it to a new path with `Save As`
- Export an Excel diff report against the loaded snapshot or active compare baseline
- Open a DCM directly from the HTML file picker, then edit parameters from the compact list/detail layout

## Run

```bash
python3 app.py
```

Then open `http://127.0.0.1:8765`.

## One-Click Launch

- macOS: double-click [launch_mac.command](/Users/wangjianhai/02_ADAS/01_repo/01_Tools/05_dcm/launch_mac.command)
- Windows: double-click [launch_windows.bat](/Users/wangjianhai/02_ADAS/01_repo/01_Tools/05_dcm/launch_windows.bat)

These launchers start the local server and open the editor in your default browser automatically.

## Notes

- The tool creates a timestamped `.bak` file before each save.
- It preserves untouched content outside supported parameter blocks.
- Saving is guarded by a source hash so you do not overwrite a file that changed on disk after loading.
- Numeric fields are checked against the original token type and shown as validation warnings, but the editor still lets you save those changes when needed.

## CSV Round-Trip

- Exported CSV uses flat rows with columns:
  `parameter,kind,field,index,row,column,key,baseline_value,value`
- Edit the `value` column externally and import the CSV back into the editor.
- Supported fields include scalar `value`, vector/map axes and cells, and structured `metadata`.
- CSV imports are applied as one undoable editor transaction.

## Sample

You can test the UI with:

`/Users/wangjianhai/02_ADAS/01_repo/01_Tools/05_dcm/examples/sample.dcm`
