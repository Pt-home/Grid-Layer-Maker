# Grid Layer Maker (Photopea plugin)

Insert a transparent **grid layer** into the **current document** or open a **new document** with a grid.
Configurable:
- Horizontal / vertical step (px)
- Independent angles (0.1° precision) for each family of lines
- Line thickness (px)
- Line color
- Optional crisp 1px alignment (0.5px offset)
- Optional border margin (skip drawing near edges)

## Install
1. Host this repo on GitHub Pages (or any HTTPS host).
2. In Photopea: **More > Plugins > Manage Plugins > Add plugin**.
   Paste the URL to `manifest.json`, e.g.
   `https://yourusername.github.io/grid-layer-maker/manifest.json`
3. Open **More > Plugins > Grid Layer Maker**.

## Use
- Choose **Insert into: Current** to auto-detect current document size (via `eval`) and paste the PNG as a new layer.
- Choose **Insert into: New** to set width/height and open a new Photopea document containing the grid PNG.

> If your environment blocks `eval` messaging or returns no size, the plugin falls back to the width/height inputs.

## Notes
- The grid is rendered offscreen on a transparent canvas, then sent to Photopea via `postMessage`:
  - Insert into current: `{ type: "paste", data: "data:image/png;base64,..." }`
  - Open new doc: `{ type: "open", data: "data:image/png;base64,..." , name: "Grid.png" }`
- If your Photopea build expects different message keys, adjust them in `script.js` (`postToPP` calls).
