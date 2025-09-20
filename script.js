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

let ppReady = false;
window.addEventListener("message", (e) => {
  if (e.data === "done" && !ppReady) {
    ppReady = true;
  }
});

// Utility: run a script, collect all responses until "done"
function runScript(script) {
  return new Promise((resolve) => {
    const results = [];
    const handler = (e) => {
      if (e.data === "done") {
        window.removeEventListener("message", handler);
        resolve(results);
      } else {
        results.push(e.data);
      }
    };
    window.addEventListener("message", handler);
    window.parent.postMessage(script, "*");
  });
}

function waitReady(timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    if (ppReady) return resolve();
    const t = setTimeout(() => reject(new Error("Photopea not ready")), timeoutMs);
    const onMsg = (e) => {
      if (e.data === "done") {
        clearTimeout(t);
        window.removeEventListener("message", onMsg);
        ppReady = true;
        resolve();
      }
    };
    window.addEventListener("message", onMsg);
  });
}

qs("preview").addEventListener("click", async () => {
  const {W, H} = await decideSize(false); // use fields
  const png = renderGridPNG(W, H, readGridParams());
  const win = window.open();
  win.document.write(`<img src="${png}" style="max-width:100%;height:auto;image-rendering:pixelated" />`);
  win.document.title = "Grid Preview";
});

qs("make").addEventListener("click", async () => {
  try {
    await waitReady();
  } catch (e) { /* continue, many environments send "done" very early */ }
  const intoCurrent = targetEl.value === "current";
  const {W, H} = await decideSize(intoCurrent);
  const png = renderGridPNG(W, H, readGridParams());

  if (intoCurrent) {
    // Insert into current doc as a placed layer
    const safe = png.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const script = `app.open("${safe}", null, true);`;
    await runScript(script);
  } else {
    const safe = png.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const script = `app.open("${safe}");`;
    await runScript(script);
  }
});

// ----- Grid rendering (strict in-bounds) -----

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
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;

  if (p.stepX > 0) drawFamily(ctx, W, H, p.stepX, p.angX, p.thick, p.color, p.crisp, p.margin);
  if (p.stepY > 0) drawFamily(ctx, W, H, p.stepY, p.angY, p.thick, p.color, p.crisp, p.margin);

  return c.toDataURL("image/png");
}

function drawFamily(ctx, W, H, step, deg, thick, color, crisp, margin) {
  const theta = (deg * Math.PI) / 180.0;
  const n = { x: -Math.sin(theta), y: Math.cos(theta) };
  const v = { x:  Math.cos(theta), y: Math.sin(theta) };
  const x0 = margin, y0 = margin, x1 = W - margin, y1 = H - margin; if (x1<=x0||y1<=y0) return;
  const corners=[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
  let minC=Infinity,maxC=-Infinity;
  for(const p of corners){ const c=n.x*p.x+n.y*p.y; if(c<minC)minC=c; if(c>maxC)maxC=c; }
  let offset=0, horizLike=Math.abs(v.y)<1e-6, vertLike=Math.abs(v.x)<1e-6;
  if (crisp && (thick%2===1) && (horizLike||vertLike)) offset = 0.5;
  const startC = Math.ceil((minC - offset) / step) * step + offset;
  ctx.strokeStyle = color; ctx.lineWidth = thick; ctx.lineCap = "butt";
  for(let c=startC;c<=maxC+1e-9;c+=step){
    const seg = clipLineToRect(n, c, x0, y0, x1, y1);
    if(!seg) continue; ctx.beginPath(); ctx.moveTo(seg.ax, seg.ay); ctx.lineTo(seg.bx, seg.by); ctx.stroke();
  }
}

function clipLineToRect(n,c,x0,y0,x1,y1){
  const pts=[];
  if (Math.abs(n.y)>1e-12){ let y=(c-n.x*x0)/n.y; if(y0-1<=y&&y<=y1+1) pts.push({x:x0,y}); y=(c-n.x*x1)/n.y; if(y0-1<=y&&y<=y1+1) pts.push({x:x1,y}); }
  if (Math.abs(n.x)>1e-12){ let x=(c-n.y*y0)/n.x; if(x0-1<=x&&x<=x1+1) pts.push({x,y:y0}); x=(c-n.y*y1)/n.x; if(x0-1<=x&&x<=x1+1) pts.push({x,y:y1}); }
  if (pts.length<2) return null;
  let a=pts[0], b=pts[1], md=dist2(a,b);
  for(let i=0;i<pts.length;i++) for(let j=i+1;j<pts.length;j++){ const d=dist2(pts[i],pts[j]); if(d>md){md=d;a=pts[i];b=pts[j];}}
  return {ax:a.x, ay:a.y, bx:b.x, by:b.y};
}
function dist2(p,q){ const dx=p.x-q.x, dy=p.y-q.y; return dx*dx+dy*dy; }

// Query current document size (W,H in px). Fallback to UI fields.
async function decideSize(intoCurrent) {
  if (!intoCurrent) {
    return { W: clampInt(wEl.value, 1, 30000), H: clampInt(hEl.value, 1, 30000) };
  }
  try {
    await waitReady();
    const res = await runScript(`
      var d = app.activeDocument;
      if (!d) { app.echoToOE("0,0"); }
      else { app.echoToOE(d.width + "," + d.height); }
    `);
    const [str] = res;
    const [wStr, hStr] = String(str || "").split(",");
    return { W: clampInt(wStr, 1, 30000), H: clampInt(hStr, 1, 30000) };
  } catch (e) {
    console.warn("Could not fetch current doc size, falling back to inputs.", e);
    return { W: clampInt(wEl.value, 1, 30000), H: clampInt(hEl.value, 1, 30000) };
  }
}

// ---- helper to post raw script ----
// (we already use window.parent.postMessage in runScript)
