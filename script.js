/* Photopea plugin: Grid Layer Maker (strict in-bounds)
 * Draws grid lines clipped exactly to the document rectangle.
 * No canvas rotation tricks: we compute each parallel line as
 *   n · x = c   where n = (-sinθ, cosθ) is the unit normal.
 * The spacing `step` is the perpendicular distance between lines.
 * For each c across the projected range of the rect, we clip the line
 * segment to the rect [margin .. W-margin] x [margin .. H-margin].
 */

const qs = (id) => document.getElementById(id);

// UI elements
const targetEl = qs("target");
const nameEl   = qs("docName");
const wEl      = qs("w");
const hEl      = qs("h");
const stepXEl  = qs("stepX");
const stepYEl  = qs("stepY");
const angXEl   = qs("angX");
const angYEl   = qs("angY");
const thickEl  = qs("thick");
const colorEl  = qs("color");
const crispEl  = qs("crisp");
const marginEl = qs("margin");

qs("preview").addEventListener("click", async () => {
  const {W, H} = await decideSize(false);
  const png = renderGridPNG(W, H, readGridParams());
  const win = window.open();
  win.document.write(`<img src="${png}" style="max-width:100%;height:auto;image-rendering:pixelated" />`);
  win.document.title = "Grid Preview";
});

qs("make").addEventListener("click", async () => {
  const intoCurrent = targetEl.value === "current";
  const {W, H} = await decideSize(intoCurrent);
  const png = renderGridPNG(W, H, readGridParams());

  if (intoCurrent) {
    postToPP({ type: "paste", data: png });
  } else {
    const name = (nameEl.value || "Grid") + ".png";
    postToPP({ type: "open", data: png, name });
  }
});

// ----- Helpers -----

function readGridParams() {
  return {
    stepX: clampInt(stepXEl.value, 1, 1e6),
    stepY: clampInt(stepYEl.value, 1, 1e6),
    angX:  Number(angXEl.value) || 0,
    angY:  Number(angYEl.value) || 0,
    thick: clampInt(thickEl.value, 1, 1024),
    color: colorEl.value || "#000000",
    crisp: crispEl.value === "on",
    margin: Math.max(0, Math.floor(Number(marginEl.value) || 0))
  };
}

function clampInt(v, lo, hi) {
  v = Math.floor(Number(v) || lo);
  return Math.max(lo, Math.min(hi, v));
}

function renderGridPNG(W, H, p) {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;

  // Draw two families, each clipped to the exact rect
  if (p.stepX > 0) drawFamily(ctx, W, H, p.stepX, p.angX, p.thick, p.color, p.crisp, p.margin);
  if (p.stepY > 0) drawFamily(ctx, W, H, p.stepY, p.angY, p.thick, p.color, p.crisp, p.margin);

  return c.toDataURL("image/png");
}

/**
 * Draw a family of parallel lines with perpendicular spacing `step`
 * line direction angle θ (deg). We clip each line to the rectangle.
 */
function drawFamily(ctx, W, H, step, deg, thick, color, crisp, margin) {
  const theta = (deg * Math.PI) / 180.0;
  const n = { x: -Math.sin(theta), y: Math.cos(theta) }; // unit normal
  const v = { x:  Math.cos(theta), y: Math.sin(theta) }; // unit direction

  // Rectangle to draw inside (apply margin)
  const x0 = margin, y0 = margin, x1 = W - margin, y1 = H - margin;
  if (x1 <= x0 || y1 <= y0) return;

  // Project rect corners on the normal to find range of c
  const corners = [
    {x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}
  ];
  let minC = Infinity, maxC = -Infinity;
  for (const p of corners) {
    const c = n.x * p.x + n.y * p.y;
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
  }

  // Offset for crisp 1px: only meaningful when lines are horizontal/vertical
  // We keep it, but only snap for close-to-axis cases
  let offset = 0;
  const isHorizLike = Math.abs(v.y) < 1e-6; // θ ≈ 0°
  const isVertLike  = Math.abs(v.x) < 1e-6; // θ ≈ 90°
  if (crisp && (thick % 2 === 1) && (isHorizLike || isVertLike)) offset = 0.5;

  // Find the first c at or above minC on a step grid.
  // We shift by offset along the *screen* axis; that translates to an offset in c-space:
  // For near-axis lines, offsetC ≈ offset * |n·axis| -> simplify to offset when axis-aligned.
  const startC = Math.ceil((minC - offset) / step) * step + offset;

  ctx.strokeStyle = color;
  ctx.lineWidth = thick;
  ctx.lineCap = "butt";

  // Iterate over all c within [minC, maxC]
  for (let c = startC; c <= maxC + 1e-9; c += step) {
    const seg = clipLineToRect(n, c, x0, y0, x1, y1);
    if (!seg) continue;
    ctx.beginPath();
    ctx.moveTo(seg.ax, seg.ay);
    ctx.lineTo(seg.bx, seg.by);
    ctx.stroke();
  }
}

/**
 * Clip line (n·x = c) to axis-aligned rectangle [x0..x1]×[y0..y1].
 * Return segment endpoints {ax,ay,bx,by} or null if outside.
 */
function clipLineToRect(n, c, x0, y0, x1, y1) {
  const pts = [];

  // Intersect with x = x0
  if (Math.abs(n.y) > 1e-12) {
    const y = (c - n.x * x0) / n.y;
    if (y >= y0 - 1e-9 && y <= y1 + 1e-9) pts.push({x:x0, y});
  }
  // x = x1
  if (Math.abs(n.y) > 1e-12) {
    const y = (c - n.x * x1) / n.y;
    if (y >= y0 - 1e-9 && y <= y1 + 1e-9) pts.push({x:x1, y});
  }
  // y = y0
  if (Math.abs(n.x) > 1e-12) {
    const x = (c - n.y * y0) / n.x;
    if (x >= x0 - 1e-9 && x <= x1 + 1e-9) pts.push({x, y:y0});
  }
  // y = y1
  if (Math.abs(n.x) > 1e-12) {
    const x = (c - n.y * y1) / n.x;
    if (x >= x0 - 1e-9 && x <= x1 + 1e-9) pts.push({x, y:y1});
  }

  if (pts.length < 2) return null;

  // Pick the two farthest points (robust for corner hits and duplicates)
  let a = pts[0], b = pts[1], maxd = dist2(a,b);
  for (let i = 0; i < pts.length; i++) {
    for (let j = i+1; j < pts.length; j++) {
      const d = dist2(pts[i], pts[j]);
      if (d > maxd) { maxd = d; a = pts[i]; b = pts[j]; }
    }
  }
  return { ax:a.x, ay:a.y, bx:b.x, by:b.y };
}

function dist2(p,q){ const dx=p.x-q.x, dy=p.y-q.y; return dx*dx+dy*dy; }

/** Decide the pixel size to render: either current doc size (via eval) or fields for new doc. */
async function decideSize(intoCurrent) {
  if (!intoCurrent) {
    return {
      W: clampInt(wEl.value, 1, 30000),
      H: clampInt(hEl.value, 1, 30000)
    };
  }
  try {
    const res = await evalInPhotopea(`
      (function(){
        var d = app.activeDocument;
        if(!d) return "0,0";
        return d.width + "," + d.height;
      })();
    `);
    const [wStr, hStr] = String(res || "").split(",");
    const W = clampInt(wStr, 1, 30000);
    const H = clampInt(hStr, 1, 30000);
    return { W, H };
  } catch (e) {
    console.warn("Could not fetch current doc size, falling back to inputs.", e);
    return {
      W: clampInt(wEl.value, 1, 30000),
      H: clampInt(hEl.value, 1, 30000)
    };
  }
}

// ---- Photopea messaging helpers ----

function postToPP(msg) {
  window.parent.postMessage(msg, "*");
}

/** Run arbitrary JS inside Photopea and resolve the returned value. */
function evalInPhotopea(script) {
  return new Promise((resolve, reject) => {
    const token = "eval_" + Math.random().toString(36).slice(2);
    function onMessage(ev) {
      const data = ev.data || {};
      if (data && data.type === "eval" && data.token === token) {
        window.removeEventListener("message", onMessage);
        if (data.error) reject(new Error(data.error));
        else resolve(data.result);
      }
    }
    window.addEventListener("message", onMessage);
    postToPP({ type: "eval", script, token });
    setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("Eval timeout"));
    }, 4000);
  });
}
