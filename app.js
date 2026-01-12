const App = (() => {
  const N = 19;

  const state = {
    id: null,
    name: "",
    cells: Array.from({length:N}, () => Array.from({length:N}, () => null)),
    extras: [],
    activeColorId: "red",
    
    activeTool: "paint",
    toolMode: "paint",
    shapeStart: null,
    shapePreview: null,
    zoom: 1,
    undo: [],
    redo: [],
    saveTimer: null,
    boardSize: 760,
  };

  function uid(){
    return "d_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
  }

  function paletteAll(){
    return [...BasePalette, ...state.extras.map(x => ({...x, hex: normalizeHex(x.hex)}))];
  }

  function paletteMap(){
    const m = new Map();
    for(const c of paletteAll()) m.set(c.id, c);
    return m;
  }

  function refreshToolUI(){
    const mode = state.toolMode || "paint";

    const toggle = document.getElementById("tbToggleDraw");
    if(toggle){
      const u = toggle.querySelector("use");
      // knop toont wat je KUNT kiezen (dus inverse)
      const next = (mode === "erase") ? "paint" : "erase";
      if(u) u.setAttribute("href", next === "erase" ? "#i-eraser" : "#i-pen");
      toggle.setAttribute("title", next === "erase" ? "Gum" : "Tekenen");
      toggle.classList.toggle("btn-toggle-on", mode === "paint" || mode === "erase");
    }

    const mapping = [["tbLine","line"],["tbRect","rect"],["tbCircle","circle"],["tbTri","tri"]];
    const dot = document.getElementById("activeColorDot");
    const name = document.getElementById("activeColorName");
    if(dot || name){
      const pm = paletteMap();
      const c = pm.get(state.activeColorId);
      const hex = (state.activeColorId === "white") ? "#ffffff" : (c?.hex || "#000000");
      if(dot) dot.style.background = hex;
      if(name) name.textContent = c?.name || state.activeColorId;
    }

    for(const [id, m] of mapping){
      const b = document.getElementById(id);
      if(b) b.classList.toggle("btn-toggle-on", mode === m);
    }
  }

  function setActiveTool(mode){
    state.toolMode = mode;
    state.activeTool = (mode === "erase") ? "erase" : "paint";
    state.shapeStart = null;
    state.shapePreview = null;
    shapeDrag = null;
    drawing = null;
    refreshToolUI();
    redrawBoard();
  }

  function setActiveColor(id){
    state.activeColorId = id;

    /* kleur kiezen betekent: weer tekenen */
    state.toolMode = "paint";
    state.activeTool = "paint";
    refreshToolUI();

    const c = paletteMap().get(id);
    const hex = (id === "white") ? "#ffffff" : (c?.hex || "#000000");

    const chip = document.getElementById("activeColorDot") || document.getElementById("activeColorChip");
    const nameEl = document.getElementById("activeColorName");

    if(chip) chip.style.background = hex;
    if(nameEl) nameEl.textContent = c?.name || id;
  }
function pushUndo(changes){
    if(!changes || !changes.length) return;
    state.undo.push(changes);
    if(state.undo.length > 200) state.undo.shift();
    state.redo = [];
    redrawBoard();
    scheduleSave();
  }

  function applyChanges(changes, direction){
    for(const ch of changes){
      const {r,c,from,to} = ch;
      state.cells[r][c] = direction === "undo" ? from : to;
    }
  }

  function undo(){
    const changes = state.undo.pop();
    if(!changes) return;
    applyChanges(changes, "undo");
    state.redo.push(changes);
    redrawBoard();
    scheduleSave();
  }

  function redo(){
    const changes = state.redo.pop();
    if(!changes) return;
    applyChanges(changes, "redo");
    state.undo.push(changes);
    redrawBoard();
    scheduleSave();
  }

  function newDesign(){
    state.id = uid();
    state.name = "";
    document.getElementById("designName").value = "";
    state.cells = Array.from({length:N}, () => Array.from({length:N}, () => null));
    state.undo = [];
    state.redo = [];
    redrawBoard();
    scheduleSave(true);
  }

  
  function safeFileName(name){
    return (name || "kralenplank").toLowerCase().replace(/[^a-z0-9\u00C0-\u024F]+/gi, "_").replace(/^_+|_+$/g,"");
  }

  function downloadJSON(obj, filename){
    const blob = new Blob([JSON.stringify(obj, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

function serialize(){
    return {
      id: state.id || uid(),
      version: 1,
      gridSize: 19,
      name: state.name || "Kralenplank",
      updatedAt: new Date().toISOString(),
      createdAt: state.createdAt || new Date().toISOString(),
      pinned: state.pinned || false,
      cells: state.cells,
      extras: state.extras,
      thumb: makeThumbnailData(),
    };
  }

  function loadDesign(design){
    if(!design) return;
    state.id = design.id;
    state.name = design.name || "";
    state.cells = design.cells || Array.from({length:N}, () => Array.from({length:N}, () => null));
    state.extras = Array.isArray(design.extras) ? design.extras : [];
    state.createdAt = design.createdAt || new Date().toISOString();
    state.pinned = !!design.pinned;

    document.getElementById("designName").value = state.name;
    state.undo = [];
    state.redo = [];
    redrawPaletteExtras();
    setActiveColor(state.activeColorId);
    redrawBoard();
  }

  function scheduleSave(force){
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(async () => {
      const design = serialize();
      await StorageProvider.saveDesign(design);
      await renderRecents();
    }, force ? 10 : 650);
  }

  function redrawPaletteBase(){
    const host = document.getElementById("paletteBase");
    host.innerHTML = "";
    for(const c of BasePalette){
      const el = document.createElement("div");
      el.className = "swatch";
      el.innerHTML = `<div class="dot" style="background:${c.hex}"></div><div class="label">${c.name}</div>`;
      el.addEventListener("click", () => setActiveColor(c.id));
      host.appendChild(el);
    }
  }

  function redrawPaletteExtras(){
    const host = document.getElementById("paletteExtras");
    host.innerHTML = "";
    for(const c of state.extras){
      const el = document.createElement("div");
      el.className = "swatch";

      const dot = document.createElement("div");
      dot.className = "dot";
      dot.style.background = normalizeHex(c.hex);

      const label = document.createElement("div");
      label.className = "label";
      label.textContent = c.name;

      const spacer = document.createElement("div");
      spacer.className = "spacer";

      const del = document.createElement("button");
      del.className = "delete";
      del.type = "button";
      del.title = "Verwijder kleur";
      del.textContent = "×";
      del.addEventListener("click", (ev) => {
        ev.stopPropagation();
        removeExtraColor(c.id);
      });

      el.appendChild(dot);
      el.appendChild(label);
      el.appendChild(spacer);
      el.appendChild(del);

      el.addEventListener("click", () => setActiveColor(c.id));
      host.appendChild(el);
    }
  }

  function addExtraColor(){
    const name = document.getElementById("extraName").value.trim();
    const hex = document.getElementById("extraHex").value;
    if(!name) return;
    const id = "x_" + name.toLowerCase().replace(/\s+/g,"_") + "_" + Math.random().toString(16).slice(2,6);
    state.extras.push({id, name, hex: normalizeHex(hex)});
    document.getElementById("extraName").value = "";
    redrawPaletteExtras();
    scheduleSave(true);
  }
  function removeExtraColor(id){
    state.extras = state.extras.filter(c => c.id !== id);

    // verwijder deze kleur uit de plank
    for(let r=0;r<N;r++){
      for(let c=0;c<N;c++){
        if(state.cells[r][c] === id) state.cells[r][c] = null;
      }
    }

    if(state.activeColorId === id){
      setActiveColor("red");
    }

    redrawPaletteExtras();
    redrawBoard();
    scheduleSave(true);
  }


  function renderBoardSVG(sizePx){
    const pm = paletteMap();
    return ImportEngine.renderRoundBeadsSVG(state.cells, pm, sizePx);
  }
  function redrawMiniPreview(){
    const host = document.getElementById("miniPreview");
    if(!host) return;
    host.innerHTML = "";
    const pm = paletteMap();
    const svg = ImportEngine.renderRoundBeadsSVG(state.cells, pm, 240);
    host.appendChild(svg);
  }


  function redrawBoard(){
    const host = document.getElementById("boardHost");
    host.innerHTML = "";

    const pad = parseFloat(getComputedStyle(host).paddingLeft || "0") + parseFloat(getComputedStyle(host).paddingRight || "0");
    const available = Math.max(240, host.clientWidth - pad);
    const size = Math.min(2000, available);
    state.boardSize = size;

    const svg = renderBoardSVG(size);
    svg.style.transform = `scale(${state.zoom})`;
    svg.style.transformOrigin = "center";

    svg.addEventListener("pointerdown", onPointerDown);
    svg.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    // preview overlay voor vormen
    if(state.shapePreview && Array.isArray(state.shapePreview) && state.shapePreview.length){
      const svgNS = "http://www.w3.org/2000/svg";
      const layer = document.createElementNS(svgNS, "g");
      layer.setAttribute("id","previewLayer");
      layer.setAttribute("opacity","0.5");

      const cell = state.boardSize / (N + 3);
      const origin = 2 * cell;
      const beadR = cell*0.36;
      const holeR = beadR*0.28;

      // kleur
      const pm = paletteMap();
      const c = pm.get(state.activeColorId);
      const fill = (state.activeColorId === "white") ? "#ffffff" : (c?.hex || "#000000");

      for(const p of state.shapePreview){
        if(!p) continue;
        const r = p.r, c2 = p.c;
        if(r<0||r>=N||c2<0||c2>=N) continue;
        const cx = origin + c2*cell;
        const cy = origin + r*cell;

        const bead = document.createElementNS(svgNS,"circle");
        bead.setAttribute("cx", cx);
        bead.setAttribute("cy", cy);
        bead.setAttribute("r", beadR);
        bead.setAttribute("fill", fill);
        bead.setAttribute("stroke", "rgba(0,0,0,0.25)");
        bead.setAttribute("stroke-width", Math.max(0.6, cell*0.03));
        layer.appendChild(bead);

        const hole = document.createElementNS(svgNS,"circle");
        hole.setAttribute("cx", cx);
        hole.setAttribute("cy", cy);
        hole.setAttribute("r", holeR);
        hole.setAttribute("fill", "rgba(255,255,255,0.35)");
        layer.appendChild(hole);
      }

      svg.appendChild(layer);
    }

    host.appendChild(svg);
    redrawMiniPreview();
  }

  let drawing = null;
  let shapeDrag = null;

  
  function bresenham(r0,c0,r1,c1){
    const pts = [];
    let x0=c0, y0=r0, x1=c1, y1=r1;
    let dx = Math.abs(x1-x0), sx = x0<x1 ? 1 : -1;
    let dy = -Math.abs(y1-y0), sy = y0<y1 ? 1 : -1;
    let err = dx + dy;
    while(true){
      pts.push({r:y0,c:x0});
      if(x0===x1 && y0===y1) break;
      const e2 = 2*err;
      if(e2 >= dy){ err += dy; x0 += sx; }
      if(e2 <= dx){ err += dx; y0 += sy; }
    }
    return pts;
  }

  function uniqPts(pts){
    const s = new Set(), out=[];
    for(const p of pts){
      const k = p.r + "," + p.c;
      if(s.has(k)) continue;
      s.add(k); out.push(p);
    }
    return out;
  }

  function rectOutline(r0,c0,r1,c1){
    const pts=[];
    const rMin=Math.min(r0,r1), rMax=Math.max(r0,r1);
    const cMin=Math.min(c0,c1), cMax=Math.max(c0,c1);
    for(let c=cMin; c<=cMax; c++){ pts.push({r:rMin,c}); pts.push({r:rMax,c}); }
    for(let r=rMin; r<=rMax; r++){ pts.push({r,c:cMin}); pts.push({r,c:cMax}); }
    return uniqPts(pts);
  }

  function circleOutline(r0,c0,r1,c1){
    const rMin=Math.min(r0,r1), rMax=Math.max(r0,r1);
    const cMin=Math.min(c0,c1), cMax=Math.max(c0,c1);

    // middelpunt en stralen op roosterbasis
    const cy=(rMin+rMax)/2;
    const cx=(cMin+cMax)/2;
    const ry=(rMax-rMin)/2;
    const rx=(cMax-cMin)/2;

    // klik zonder slepen
    if(rx===0 && ry===0) return [{r:r0,c:c0}];

    const pts=[];
    const R = Math.max(rx, ry);
    const steps = Math.max(36, Math.ceil(2*Math.PI*R*6)); // genoeg samples voor kleine roosters

    for(let i=0;i<steps;i++){
      const a = (i/steps) * Math.PI*2;
      const rr = Math.round(cy + ry*Math.sin(a));
      const cc = Math.round(cx + rx*Math.cos(a));
      pts.push({r:rr,c:cc});
    }

    return uniqPts(pts);
  }

  function triOutline(r0,c0,r1,c1){
    const rMin=Math.min(r0,r1), rMax=Math.max(r0,r1);
    const cMin=Math.min(c0,c1), cMax=Math.max(c0,c1);
    const apexR=rMin, apexC=Math.round((cMin+cMax)/2);
    const leftR=rMax, leftC=cMin;
    const rightR=rMax, rightC=cMax;
    const pts = []
      .concat(bresenham(apexR,apexC,leftR,leftC))
      .concat(bresenham(apexR,apexC,rightR,rightC))
      .concat(bresenham(leftR,leftC,rightR,rightC));
    return uniqPts(pts);
  }

  function pointsForShape(mode, start, end){
    if(!start || !end) return [];
    const {r:r0,c:c0}=start, {r:r1,c:c1}=end;
    if(mode === "line") return bresenham(r0,c0,r1,c1);
    if(mode === "rect") return rectOutline(r0,c0,r1,c1);
    if(mode === "circle") return circleOutline(r0,c0,r1,c1);
    if(mode === "tri") return triOutline(r0,c0,r1,c1);
    return [];
  }

function hitTestCell(svg, clientX, clientY){
    const rect = svg.getBoundingClientRect();

    /* naar SVG viewBox pixels (0..boardSize) */
    const sx = ((clientX - rect.left) / rect.width) * state.boardSize;
    const sy = ((clientY - rect.top) / rect.height) * state.boardSize;

    /* zelfde geometrie als renderRoundBeadsSVG */
    const cell = state.boardSize / (N + 3);
    const origin = 2 * cell; // wit rand (1) + houtmarge (1)

    // snel buitengebied afvangen
    const min = origin - cell*0.65;
    const max = origin + (N-1)*cell + cell*0.65;
    if(sx < min || sy < min || sx > max || sy > max) return null;

    // dichtstbijzijnde spijker kiezen op basis van afstand tot het centrum
    let c = Math.round((sx - origin) / cell);
    let r = Math.round((sy - origin) / cell);

    if(r < 0 || r >= N || c < 0 || c >= N) return null;

    const cx = origin + c*cell;
    const cy = origin + r*cell;

    const dx = sx - cx;
    const dy = sy - cy;
    const dist = Math.hypot(dx, dy);

    // klik moet redelijk dicht bij een spijker zitten
    if(dist > cell*0.65) return null;

    return {r,c};
  }

  function onPointerDown(e){
    const svg = e.currentTarget;
    const hit = hitTestCell(svg, e.clientX, e.clientY);
    if(!hit) return;

    // zorg dat we alle moves en pointerup krijgen, ook als je buiten de plank komt
    if(svg.setPointerCapture && e.pointerId != null){
      try{ svg.setPointerCapture(e.pointerId); }catch(_){ /* ignore */ }
    }

    state.shapePreview = null;

    const mode = state.toolMode || "paint";

    // paint / erase blijft zoals je gewend bent
    if(mode === "paint" || mode === "erase"){
      const {r,c} = hit;
      const cur = state.cells[r][c];
      const active = state.activeColorId;

      let target = null;

      if(mode === "erase"){
        target = null;
      } else {
        target = active;
        if(cur === active) target = null;
      }

      drawing = {
        target,
        visited: new Set(),
        changes: []
      };
      shapeDrag = null;

      paintCell(r,c);
      e.preventDefault();
      return;
    }

    // vormen
    drawing = null;
    shapeDrag = {mode, start: hit, end: hit, pointerId: e.pointerId};
    state.shapeStart = hit;
    state.shapePreview = pointsForShape(mode, hit, hit);
    redrawBoard();
    e.preventDefault();
  }


  function onPointerMove(e){
    if(drawing){
      if(drawing.pointerId != null && e.pointerId != null && e.pointerId !== drawing.pointerId) return;
      const svg = document.querySelector("#boardHost svg");
      if(!svg) return;

      const hit = hitTestCell(svg, e.clientX, e.clientY);
      if(!hit) return;

      paintCell(hit.r, hit.c);
      e.preventDefault();
      return;
    }

    if(!shapeDrag) return;

    if(shapeDrag.pointerId != null && e.pointerId != null && e.pointerId !== shapeDrag.pointerId) return;

    const svg = e.currentTarget || document.querySelector("#boardHost svg");
    if(!svg) return;

    const hit = hitTestCell(svg, e.clientX, e.clientY);
    if(!hit) return;

    shapeDrag.end = hit;
    state.shapePreview = pointsForShape(shapeDrag.mode, shapeDrag.start, shapeDrag.end);
    redrawBoard();
    e.preventDefault();
  }


  function onPointerUp(e){
    const svg = document.querySelector("#boardHost svg");
    if(svg && svg.releasePointerCapture && e && e.pointerId != null){
      try{ svg.releasePointerCapture(e.pointerId); }catch(_){ /* ignore */ }
    }

    if(drawing){
      if(drawing.pointerId != null && e && e.pointerId != null && e.pointerId !== drawing.pointerId) return;
      if(drawing.changes.length) pushUndo(drawing.changes);
      drawing = null;
      return;
    }

    if(!shapeDrag) return;

    if(shapeDrag.pointerId != null && e && e.pointerId != null && e.pointerId !== shapeDrag.pointerId) return;

    const pts = pointsForShape(shapeDrag.mode, shapeDrag.start, shapeDrag.end);
    applyShapePoints(pts);

    shapeDrag = null;
    state.shapeStart = null;
    state.shapePreview = null;
    redrawBoard();
  }


  
  function applyShapePoints(points){
    const changes = [];
    for(const p of points){
      if(!p) continue;
      const r = p.r, c = p.c;
      if(r<0||r>=N||c<0||c>=N) continue;
      const from = state.cells[r][c];
      const to = state.activeColorId;
      if(from === to) continue;
      state.cells[r][c] = to;
      changes.push({r,c,from,to});
    }
    if(changes.length) pushUndo(changes);
  }

function paintCell(r,c){
    const key = r + "," + c;
    if(drawing.visited.has(key)) return;
    drawing.visited.add(key);

    const from = state.cells[r][c];
    const to = drawing.target;

    if(from === to) return;

    state.cells[r][c] = to;
    drawing.changes.push({r,c,from,to});
    redrawBoard();
  }

  function makeThumbnailData(){
    const pm = paletteMap();
    const svg = ImportEngine.renderRoundBeadsSVG(state.cells, pm, 170);
    const xml = new XMLSerializer().serializeToString(svg);
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
  }

  async function renderRecents(){
    const list = await StorageProvider.listDesigns(3);
    const host = document.getElementById("recents");
    host.innerHTML = "";

    for(const d of list){
      const card = document.createElement("div");
      card.className = "recent-card";

      const thumb = document.createElement("div");
      thumb.className = "recent-thumb";
      if(d.thumb){
        const img = document.createElement("img");
        img.src = d.thumb;
        img.alt = d.name || "Ontwerp";
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "cover";
        thumb.appendChild(img);
      }

      const name = document.createElement("div");
      name.className = "recent-name";
      name.textContent = d.name || "Zonder naam";

      card.appendChild(thumb);
      card.appendChild(name);

      card.addEventListener("click", () => loadDesign(d));
      host.appendChild(card);
    }
  }

  function wireUI(){
    const $ = (id) => document.getElementById(id);

    document.getElementById("designName").addEventListener("input", (e) => {
      state.name = e.target.value;
      scheduleSave();
    });

    const bNew = $("btnNew") || $("btnNewFile");
    if(bNew) bNew.addEventListener("click", () => { if(typeof createNew==="function") createNew(); else if(typeof newProject==="function") newProject(); });
document.getElementById("btnUndo")?.addEventListener("click", () => undo());
    document.getElementById("btnRedo")?.addEventListener("click", () => redo());

    /* Bovenbalk tools */
    const tbUndoBtn = $("tbUndo");
    const tbRedoBtn = $("tbRedo");
    if(tbUndoBtn) tbUndoBtn.addEventListener("click", () => undo());
    if(tbRedoBtn) tbRedoBtn.addEventListener("click", () => redo());

    const tbToggle = $("tbToggleDraw");
    if(tbToggle){
      tbToggle.addEventListener("click", () => {
        const m = state.toolMode || "paint";
        setActiveTool(m === "erase" ? "paint" : "erase");
      });
    }

    const toolBtns = [
      ["tbLine","line"],
      ["tbRect","rect"],
      ["tbCircle","circle"],
      ["tbTri","tri"]
    ];
    for(const [id, mode] of toolBtns){
      const b = $(id);
      if(b){
        b.addEventListener("click", () => setActiveTool(mode));
      }
    }

    const zIn = $("tbZoomIn");
    const zOut = $("tbZoomOut");
    if(zIn) zIn.addEventListener("click", () => { state.zoom = Math.min(3, (state.zoom||1) + 0.1); redrawBoard(); });
    if(zOut) zOut.addEventListener("click", () => { state.zoom = Math.max(0.3, (state.zoom||1) - 0.1); redrawBoard(); });


    
    /* bovenbalk sneltoetsen */
    const tbUndo = document.getElementById("tbUndo");
    if(tbUndoBtn) tbUndoBtn.addEventListener("click", () => undo());

    const tbRedo = document.getElementById("tbRedo");
    if(tbRedoBtn) tbRedoBtn.addEventListener("click", () => redo());

    const tbEraser = document.getElementById("tbEraser");
    if(tbEraser){
      tbEraser.addEventListener("click", () => {
        setActiveTool(state.activeTool === "erase" ? "paint" : "erase");
      });
    }

    const tbPaint = document.getElementById("tbPaint");
    if(tbPaint){
      tbPaint.addEventListener("click", () => setActiveTool("paint"));
    }

const er = document.getElementById("btnEraser");
    if(er){
      er.addEventListener("click", () => {
        setActiveTool(state.activeTool === "erase" ? "paint" : "erase");
      });
    }

    $("zoom")?.addEventListener("input", (e) => {
      state.zoom = parseFloat(e.target.value);
      redrawBoard();
    });
    (function(){
      const zoomIn = document.getElementById("tbZoomIn") || document.getElementById("btnZoomIn");
      const zoomOut = document.getElementById("tbZoomOut") || document.getElementById("btnZoomOut");
      if(zoomIn){
        zoomIn.addEventListener("click", () => {
          state.zoom = Math.min(2.5, state.zoom + 0.15);
          document.getElementById("zoom").value = state.zoom;
          redrawBoard();
        });
      }
      if(zoomOut){
        zoomOut.addEventListener("click", () => {
          state.zoom = Math.max(0.4, state.zoom - 0.15);
          document.getElementById("zoom").value = state.zoom;
          redrawBoard();
        });
      }
    })();

$("btnAddExtra")?.addEventListener("click", () => addExtraColor());

    $("btnPrint")?.addEventListener("click", () => window.print());

    const bImport = $("btnImportImage") || $("btnImport");
    if(bImport) bImport.addEventListener("click", () => {
      $("importDialog")?.showModal();
    });
$("useEdges")?.addEventListener("change", () => {
      const row = $("edgeStrengthRow");
      if(row) row.style.display = $("useEdges")?.checked ? "flex" : "none";
    });

$("btnApplyImport")?.addEventListener("click", async () => {
      const img = window.__importImage;
      if(!img) return;

      const settings = window.__importSettings;
      const allowExtras = document.getElementById("allowExtrasInImport").checked;

      const pal = allowExtras ? paletteAll() : BasePalette;
      const grid = ImportEngine.build19x19FromImage(img, settings, pal);

      const changes = [];
      for(let r=0;r<N;r++){
        for(let c=0;c<N;c++){
          const from = state.cells[r][c];
          const to = grid[r][c];
          if(from !== to){
            state.cells[r][c] = to;
            changes.push({r,c,from,to});
          }
        }
      }
      pushUndo(changes);
      document.getElementById("importDialog").close();
    });

    $("presetIllustration")?.addEventListener("click", () => setImportPreset("illustration"));
    $("presetPhoto")?.addEventListener("click", () => setImportPreset("photo"));

    $("importFile")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if(!file) return;
      const img = await fileToImage(file);
      window.__importImage = img;
      updateImportPreview();
    });

    for(const id of ["placeWhite","useEdges","bgThreshold","simplify","edgeStrength","allowExtrasInImport"]){
      document.getElementById(id).addEventListener("input", () => updateImportPreview());
    }

    $("btnExportPack")?.addEventListener("click", async () => {
      const pack = await StorageProvider.exportPack();
      const blob = new Blob([JSON.stringify(pack, null, 2)], {type:"application/json"});
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "kralenplank-pack.json";
      a.click();
      URL.revokeObjectURL(a.href);
    });

    $("btnImportPack")?.addEventListener("click", () => {
      document.getElementById("packFile").click();
    });

    $("projectFile")?.addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      if(!f) return;
      try{
        const text = await f.text();
        const design = JSON.parse(text);
        loadDesign(design);
        redrawPaletteExtras();
        redrawBoard();
        scheduleSave(true);
      }catch(err){
        alert("Dit bestand kan niet geopend worden.");
        console.error(err);
      }finally{
        e.target.value = "";
      }
    });

    $("packFile")?.addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      if(!f) return;
      const text = await f.text();
      const pack = JSON.parse(text);
      await StorageProvider.importPack(pack);
      await renderRecents();
    });

    $("btnOpen")?.addEventListener("click", () => {
      document.getElementById("projectFile").click();
    });


    $("btnSave")?.addEventListener("click", async () => {
      const design = serialize();
      await StorageProvider.saveDesign(design);
      await renderRecents();
      const fn = safeFileName(design.name) + ".json";
      downloadJSON(design, fn);
    });


    /* Import modal flow */
    document.getElementById("btnImportImage")?.addEventListener("click", () => {
      openImportModal();
    });
            document.getElementById("btnImportIllustration")?.addEventListener("click", () => { closeImportModal(); if(typeof setImportPreset==="function") setImportPreset("illustration"); pickImportFile("illustration"); });
document.getElementById("btnImportPhoto")?.addEventListener("click", () => { closeImportModal(); if(typeof setImportPreset==="function") setImportPreset("photo"); pickImportFile("photo"); });
}

  function setImportPreset(mode){
  window.__importKind = mode;

    const illBtn = document.getElementById("presetIllustration");
    const phBtn = document.getElementById("presetPhoto");
if(mode === "illustration"){
      if(illBtn) illBtn.classList.add("primary");
      if(phBtn) phBtn.classList.remove("primary");
      document.getElementById("useEdges").checked = false;
      document.getElementById("placeWhite").checked = false;
      document.getElementById("bgThreshold").value = 62;
      document.getElementById("simplify").value = 72;
      document.getElementById("edgeStrength").value = 55;
      document.getElementById("edgeStrengthRow").style.display = document.getElementById("useEdges").checked ? "flex" : "none";
    } else {
      if(illBtn) illBtn.classList.remove("primary");
      if(phBtn) phBtn.classList.add("primary");
      document.getElementById("useEdges").checked = false;
      document.getElementById("placeWhite").checked = false;
      document.getElementById("bgThreshold").value = 50;
      document.getElementById("simplify").value = 45;
      document.getElementById("edgeStrength").value = 30;
      document.getElementById("edgeStrengthRow").style.display = "none";
    }
    window.__importSettings = readImportSettings(mode);
    updateImportPreview();
  }

  function readImportSettings(mode){
    return {
      mode,
      placeWhite: document.getElementById("placeWhite").checked,
      useEdges: document.getElementById("useEdges").checked,
      bgThreshold: parseInt(document.getElementById("bgThreshold").value,10),
      simplify: parseInt(document.getElementById("simplify").value,10),
      edgeStrength: parseInt(document.getElementById("edgeStrength").value,10),
      linesOnEmpty: false
    };
  }

  function updateImportPreview(){
    const img = window.__importImage;
    if(!img) return;

    const mode = window.__importKind || "illustration";

    window.__importSettings = readImportSettings(mode);

    const allowExtras = document.getElementById("allowExtrasInImport").checked;
    const pal = allowExtras ? paletteAll() : BasePalette;

    const grid = ImportEngine.build19x19FromImage(img, window.__importSettings, pal);

    const host = document.getElementById("importPreviewHost");
    
  if(!host) return;
host.innerHTML = "";
    const pm = new Map(pal.map(c => [c.id, c]));
    const svg = ImportEngine.renderRoundBeadsSVG(grid, pm, 520);
    host.appendChild(svg);
  }

  function fileToImage(file){
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = reject;
      img.src = url;
    });
  }

  async function saveProject(){ document.getElementById('btnExport')?.click(); }

function newProject(){ newDesign(); }


  function createNew(){ newProject(); }
async function init(){
    redrawPaletteBase();
    redrawPaletteExtras();
    setActiveColor(state.activeColorId);

    wireUI();
    setImportPreset("illustration");

    const list = await StorageProvider.listDesigns(1);
    if(list[0]) loadDesign(list[0]);
    else newDesign();

    await renderRecents();
  }

  return { init };
})();

window.addEventListener("DOMContentLoaded", () => App.init());


function openImportModal(){
  const d = document.getElementById("importDialog") || document.getElementById("importModal");
  if(!d) return;
  if(typeof d.showModal === "function") d.showModal();
  else d.classList.add("open");
}
function closeImportModal(){
  const d = document.getElementById("importDialog") || document.getElementById("importModal");
  if(!d) return;
  if(typeof d.close === "function") d.close();
  else d.classList.remove("open");
}

function pickImportFile(kind){
  window.__importKind = kind;

  // kind: "illustration" | "photo"
  state.importKind = kind;

  const input = document.getElementById("importFile") || document.getElementById("fileInputHidden") || document.getElementById("fileInput");
  if(!input) return;

  // Reset so same file twice still triggers change
  input.value = "";
  input.click();
}
