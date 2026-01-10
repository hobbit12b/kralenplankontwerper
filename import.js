const ImportEngine = (() => {

  function hexToRgb(hex){
    const h = hex.replace("#","");
    const r = parseInt(h.slice(0,2),16);
    const g = parseInt(h.slice(2,4),16);
    const b = parseInt(h.slice(4,6),16);
    return {r,g,b};
  }

  function srgbToLinear(c){
    c /= 255;
    return c <= 0.04045 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4);
  }

  function rgbToXyz({r,g,b}){
    const R = srgbToLinear(r);
    const G = srgbToLinear(g);
    const B = srgbToLinear(b);
    const x = R*0.4124564 + G*0.3575761 + B*0.1804375;
    const y = R*0.2126729 + G*0.7151522 + B*0.0721750;
    const z = R*0.0193339 + G*0.1191920 + B*0.9503041;
    return {x,y,z};
  }

  function xyzToLab({x,y,z}){
    const Xn = 0.95047, Yn = 1.0, Zn = 1.08883;
    let fx = x / Xn, fy = y / Yn, fz = z / Zn;

    function f(t){
      return t > 0.008856 ? Math.pow(t, 1/3) : (7.787*t + 16/116);
    }
    fx = f(fx); fy = f(fy); fz = f(fz);
    const L = 116*fy - 16;
    const a = 500*(fx - fy);
    const b = 200*(fy - fz);
    return {L,a,b};
  }

  function rgbToLab(rgb){
    return xyzToLab(rgbToXyz(rgb));
  }

  function labDist2(p,q){
    const dL = p.L-q.L, da=p.a-q.a, db=p.b-q.b;
    return dL*dL + da*da + db*db;
  }

  function makePaletteLabs(palette){
    return palette.map(c => ({...c, lab: rgbToLab(hexToRgb(c.hex))}));
  }

  function drawImageCover(ctx, img){
    const {width:w, height:h} = ctx.canvas;
    const s = Math.max(w/img.width, h/img.height);
    const iw = img.width*s, ih = img.height*s;
    const x = (w - iw)/2;
    const y = (h - ih)/2;
    ctx.drawImage(img, x, y, iw, ih);
  }

  function blur1DLine(arr, w, h, radius){
    if(radius <= 0) return arr;
    const out = new Uint8ClampedArray(arr.length);
    const r = radius;
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        let sumR=0,sumG=0,sumB=0,sumA=0, count=0;
        for(let k=-r;k<=r;k++){
          const xx = Math.max(0, Math.min(w-1, x+k));
          const idx = (y*w+xx)*4;
          sumR += arr[idx];
          sumG += arr[idx+1];
          sumB += arr[idx+2];
          sumA += arr[idx+3];
          count++;
        }
        const o = (y*w+x)*4;
        out[o]   = (sumR/count)|0;
        out[o+1] = (sumG/count)|0;
        out[o+2] = (sumB/count)|0;
        out[o+3] = (sumA/count)|0;
      }
    }
    return out;
  }

  function blur2D(data, w, h, radius){
    if(radius <= 0) return data;
    const pass1 = blur1DLine(data, w, h, radius);
    const out = new Uint8ClampedArray(pass1.length);
    const r = radius;
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        let sumR=0,sumG=0,sumB=0,sumA=0, count=0;
        for(let k=-r;k<=r;k++){
          const yy = Math.max(0, Math.min(h-1, y+k));
          const idx = (yy*w+x)*4;
          sumR += pass1[idx];
          sumG += pass1[idx+1];
          sumB += pass1[idx+2];
          sumA += pass1[idx+3];
          count++;
        }
        const o = (y*w+x)*4;
        out[o]   = (sumR/count)|0;
        out[o+1] = (sumG/count)|0;
        out[o+2] = (sumB/count)|0;
        out[o+3] = (sumA/count)|0;
      }
    }
    return out;
  }

  function posterize(data, levels){
    if(levels <= 2) levels = 2;
    const step = 255/(levels-1);
    const out = new Uint8ClampedArray(data.length);
    for(let i=0;i<data.length;i+=4){
      out[i]   = Math.round(data[i]/step)*step;
      out[i+1] = Math.round(data[i+1]/step)*step;
      out[i+2] = Math.round(data[i+2]/step)*step;
      out[i+3] = data[i+3];
    }
    return out;
  }

  function luminance(r,g,b){
    return 0.2126*r + 0.7152*g + 0.0722*b;
  }

  function sobelEdges(data, w, h){
    const edges = new Float32Array(w*h);
    const gxK = [-1,0,1,-2,0,2,-1,0,1];
    const gyK = [-1,-2,-1,0,0,0,1,2,1];

    function lumAt(x,y){
      const idx = (y*w+x)*4;
      return luminance(data[idx], data[idx+1], data[idx+2]);
    }

    for(let y=1;y<h-1;y++){
      for(let x=1;x<w-1;x++){
        let gx=0, gy=0, k=0;
        for(let yy=-1;yy<=1;yy++){
          for(let xx=-1;xx<=1;xx++){
            const L = lumAt(x+xx,y+yy);
            gx += L*gxK[k];
            gy += L*gyK[k];
            k++;
          }
        }
        const mag = Math.sqrt(gx*gx + gy*gy);
        edges[y*w+x] = mag;
      }
    }
    let max = 1;
    for(let i=0;i<edges.length;i++) if(edges[i]>max) max=edges[i];
    for(let i=0;i<edges.length;i++) edges[i] = edges[i]/max;
    return edges;
  }

  function colorDist2(a,b){
    const dr = a.r-b.r, dg=a.g-b.g, db=a.b-b.b;
    return dr*dr + dg*dg + db*db;
  }

  function sampleCornerMean(data, w, h, block){
    const pts = [
      {x0:0, y0:0},
      {x0:w-block, y0:0},
      {x0:0, y0:h-block},
      {x0:w-block, y0:h-block},
    ];
    let sumR=0,sumG=0,sumB=0, n=0;
    for(const p of pts){
      for(let y=p.y0;y<p.y0+block;y++){
        for(let x=p.x0;x<p.x0+block;x++){
          const i = (y*w+x)*4;
          sumR += data[i];
          sumG += data[i+1];
          sumB += data[i+2];
          n++;
        }
      }
    }
    return { r: sumR/n, g: sumG/n, b: sumB/n };
  }

  function floodFillBackgroundMask(data, w, h, threshold01){
    /* Flood fill vanaf de randen, alles dat op de achtergrond lijkt wordt true */
    const bg = new Uint8Array(w*h);
    const qx = new Int32Array(w*h);
    const qy = new Int32Array(w*h);
    let qs = 0, qe = 0;

    const corner = sampleCornerMean(data, w, h, 12);
    /* threshold01 uit slider, omgezet naar echte tolerantie */
    const tol = 18 + (1-threshold01)*110;       /* 18 tot 128 */
    const tol2 = tol*tol;

    function push(x,y){
      const idx = y*w+x;
      if(bg[idx]) return;
      bg[idx] = 1;
      qx[qe] = x; qy[qe] = y; qe++;
    }

    function canBg(x,y){
      const i = (y*w+x)*4;
      const c = {r:data[i], g:data[i+1], b:data[i+2]};
      return colorDist2(c, corner) <= tol2;
    }

    /* startpunten: hele rand */
    for(let x=0;x<w;x++){
      if(canBg(x,0)) push(x,0);
      if(canBg(x,h-1)) push(x,h-1);
    }
    for(let y=0;y<h;y++){
      if(canBg(0,y)) push(0,y);
      if(canBg(w-1,y)) push(w-1,y);
    }

    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    while(qs < qe){
      const x = qx[qs], y = qy[qs]; qs++;
      for(const d of dirs){
        const xx = x+d[0], yy = y+d[1];
        if(xx<0||yy<0||xx>=w||yy>=h) continue;
        const idx = yy*w+xx;
        if(bg[idx]) continue;
        if(canBg(xx,yy)) push(xx,yy);
      }
    }
    return bg; /* 1 is achtergrond */
  }

  function mapToPaletteCell(rgb, paletteLabs){
    const lab = rgbToLab(rgb);
    let best = paletteLabs[0], bestD = Infinity;
    for(const c of paletteLabs){
      const d = labDist2(lab, c.lab);
      if(d < bestD){ bestD = d; best = c; }
    }
    return best.id;
  }

  function majorityClean(grid, passes=1){
    const N = 19;
    let cur = grid.map(row => row.slice());
    const dirs = [-1,0,1];

    function inb(r,c){ return r>=0 && r<N && c>=0 && c<N; }

    for(let p=0;p<passes;p++){
      const next = cur.map(row => row.slice());
      for(let r=0;r<N;r++){
        for(let c=0;c<N;c++){
          const v = cur[r][c];
          if(v === null) continue;
          const counts = new Map();
          let total = 0;
          for(const dr of dirs){
            for(const dc of dirs){
              if(dr===0 && dc===0) continue;
              const rr = r+dr, cc = c+dc;
              if(!inb(rr,cc)) continue;
              const nv = cur[rr][cc];
              if(nv === null) continue;
              counts.set(nv, (counts.get(nv)||0)+1);
              total++;
            }
          }
          if(total < 3) continue;
          let best = v, bestCt = 0;
          for(const [k,ct] of counts.entries()){
            if(ct > bestCt){ bestCt = ct; best = k; }
          }
          if(bestCt >= 4 && best !== v) next[r][c] = best;
        }
      }
      cur = next;
    }
    return cur;
  }

  function build19x19FromImage(img, settings, paletteAll){
    const N = 19;
    const workSize = 228;

    const work = document.createElement("canvas");
    work.width = workSize;
    work.height = workSize;
    const ctx = work.getContext("2d", { willReadFrequently:true });

    ctx.clearRect(0,0,workSize,workSize);
    drawImageCover(ctx, img);

    const raw = ctx.getImageData(0,0,workSize,workSize);
    const rawData = raw.data;

    const simplify01 = settings.simplify/100;
    const bg01 = settings.bgThreshold/100;

    /* Achtergrond eruit knippen, vooral voor illustraties */
    const bgMask = settings.mode === "illustration"
      ? floodFillBackgroundMask(rawData, workSize, workSize, bg01)
      : null;

    /* Edges alleen gebruiken als optie aan staat, geen verplicht zwart */
    const dataForEdges = blur2D(rawData, workSize, workSize, 1);
    const edges = (settings.useEdges && settings.mode === "illustration") ? sobelEdges(dataForEdges, workSize, workSize) : null;

    /* Kleurversimpeling voor vlakken */
    const blurRadius = settings.mode === "illustration"
      ? Math.round(2 + simplify01*3)
      : Math.round(1 + simplify01*2);

    let data = blur2D(rawData, workSize, workSize, blurRadius);

    const levels = settings.mode === "illustration"
      ? Math.round(3 + (1-simplify01)*5)
      : Math.round(5 + (1-simplify01)*6);

    data = posterize(data, levels);

    const paletteLabs = makePaletteLabs(paletteAll);

    const grid = Array.from({length:N}, () => Array.from({length:N}, () => null));
    const cell = workSize / N;

    for(let r=0;r<N;r++){
      for(let c=0;c<N;c++){
        const x0 = Math.floor(c*cell);
        const y0 = Math.floor(r*cell);
        const x1 = Math.floor((c+1)*cell);
        const y1 = Math.floor((r+1)*cell);

        let counts = new Map();
        let samples = 0;
        let subjectSamples = 0;
        let edgeMax = 0;

        for(let y=y0;y<y1;y++){
          for(let x=x0;x<x1;x++){
            const px = y*workSize+x;
            if(bgMask && bgMask[px]){ /* achtergrond pixel */
              samples++;
              continue;
            }

            const idx = px*4;
            const R = data[idx], G = data[idx+1], B = data[idx+2];

            const id = mapToPaletteCell({r:R,g:G,b:B}, paletteLabs);
            counts.set(id, (counts.get(id)||0)+1);

            if(edges){
              const e = edges[px];
              if(e > edgeMax) edgeMax = e;
            }

            samples++;
            subjectSamples++;
          }
        }

        /* Als er bijna geen subject pixels zijn, dan leeg */
        if(bgMask && subjectSamples < Math.max(2, Math.floor(samples*0.10))){
          grid[r][c] = null;
          continue;
        }

        /* Dominante kleur in subject pixels */
        let chosen = null;
        let bestCt = 0;
        for(const [id,ct] of counts.entries()){
          if(ct > bestCt){ bestCt = ct; chosen = id; }
        }

        /* Wit gedrag:
           bij illustraties: wit in het subject mag altijd kralen worden
           bij fotos: wit wordt leeg, tenzij expliciet aan */
        if(settings.mode !== "illustration"){
          if(!settings.placeWhite && chosen === "white"){
            chosen = null;
          } else if(chosen === "white"){
            const whiteRatio = bestCt / Math.max(1, subjectSamples);
            if(!settings.placeWhite && whiteRatio > bg01) chosen = null;
          }
        }

        /* Optionele lijnen: alleen waar het ook echt als lijn gedraagt */
        if(edges){
          const edgeStrength = settings.edgeStrength/100;
          const threshold = 0.22 + (1-edgeStrength)*0.18;

          const blackCt = counts.get("black") || 0;
          const blackRatio = blackCt / Math.max(1, subjectSamples);

          if(edgeMax > threshold && blackRatio > 0.04){
            chosen = "black";
          }
        }

        grid[r][c] = chosen;
      }
    }

    const cleaned = majorityClean(grid, settings.mode === "illustration" ? 1 : 1);
    return cleaned;
  }

  function renderRoundBeadsSVG(grid, paletteMap, sizePx=420){
    const N = 19;
    const w = sizePx, h = sizePx;

    /* Afmetingen:
       cell = afstand tussen spijkers (hart op hart)
       houtmarge rondom buitenste spijkers = 1x cell
       daarna buitenrand wit = 1x cell
       totaal = (N-1) + 2 (houtmarge) + 2 (wit)  => N+3 cells */
    const cell = Math.min(w,h) / (N + 3);
    const whiteBorder = cell;
    const woodMargin = cell;

    const woodX = whiteBorder;
    const woodY = whiteBorder;
    const woodW = (N - 1)*cell + 2*woodMargin;
    const woodH = (N - 1)*cell + 2*woodMargin;

    const beadR = cell*0.36;
    const pegR  = cell*0.12;
    const holeR = beadR*0.28;

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", w);
    svg.setAttribute("height", h);
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);

    const defs = document.createElementNS(svgNS, "defs");
    const clip = document.createElementNS(svgNS, "clipPath");
    const clipId = "clipWood_" + Math.random().toString(16).slice(2);
    clip.setAttribute("id", clipId);

    const woodRectClip = document.createElementNS(svgNS, "rect");
    woodRectClip.setAttribute("x", woodX);
    woodRectClip.setAttribute("y", woodY);
    woodRectClip.setAttribute("width", woodW);
    woodRectClip.setAttribute("height", woodH);
    woodRectClip.setAttribute("rx", 14);
    clip.appendChild(woodRectClip);
    defs.appendChild(clip);
    svg.appendChild(defs);

    /* Buitenrand wit */
    const outer = document.createElementNS(svgNS, "rect");
    outer.setAttribute("x","0");
    outer.setAttribute("y","0");
    outer.setAttribute("width", w);
    outer.setAttribute("height", h);
    outer.setAttribute("rx", 18);
    outer.setAttribute("fill", "#ffffff");
    svg.appendChild(outer);

    /* Houten plank alleen binnen het houtvlak */
    const woodImg = document.createElementNS(svgNS, "image");
    woodImg.setAttribute("href", "assets/hout.jpg");
    woodImg.setAttribute("x", woodX);
    woodImg.setAttribute("y", woodY);
    woodImg.setAttribute("width", woodW);
    woodImg.setAttribute("height", woodH);
    woodImg.setAttribute("preserveAspectRatio", "xMidYMid slice");
    woodImg.setAttribute("clip-path", `url(#${clipId})`);
    svg.appendChild(woodImg);

    /* Subtiele rand om hout */
    const woodBorder = document.createElementNS(svgNS, "rect");
    woodBorder.setAttribute("x", woodX);
    woodBorder.setAttribute("y", woodY);
    woodBorder.setAttribute("width", woodW);
    woodBorder.setAttribute("height", woodH);
    woodBorder.setAttribute("rx", 14);
    woodBorder.setAttribute("fill", "transparent");
    woodBorder.setAttribute("stroke", "rgba(0,0,0,0.12)");
    woodBorder.setAttribute("stroke-width", "1");
    svg.appendChild(woodBorder);

    /* Spijkers en kralen binnen het houtvlak */
    for(let rr=0; rr<N; rr++){
      for(let cc=0; cc<N; cc++){
        const cx = woodX + woodMargin + cc*cell;
        const cy = woodY + woodMargin + rr*cell;

        const peg = document.createElementNS(svgNS, "circle");
        peg.setAttribute("cx", cx);
        peg.setAttribute("cy", cy);
        peg.setAttribute("r", pegR);
        peg.setAttribute("fill", "rgba(0,0,0,0.18)");
        svg.appendChild(peg);

        const id = grid[rr][cc];
        if(!id) continue;

        let hex = paletteMap.get(id)?.hex || "#ffffff";
        if(id === "white") hex = "#ffffff";

        const bead = document.createElementNS(svgNS, "circle");
        bead.setAttribute("cx", cx);
        bead.setAttribute("cy", cy);
        bead.setAttribute("r", beadR);
        bead.setAttribute("fill", hex);

        /* witte kralen moeten op hout duidelijk blijven */
        const stroke = id === "white" ? "rgba(0,0,0,0.32)" : "rgba(0,0,0,0.16)";
        bead.setAttribute("stroke", stroke);
        bead.setAttribute("stroke-width", "1");
        svg.appendChild(bead);

        const hole = document.createElementNS(svgNS, "circle");
        hole.setAttribute("cx", cx);
        hole.setAttribute("cy", cy);
        hole.setAttribute("r", holeR);
        hole.setAttribute("fill", "rgba(0,0,0,0.10)");
        svg.appendChild(hole);

        const shine = document.createElementNS(svgNS, "circle");
        shine.setAttribute("cx", cx - beadR*0.22);
        shine.setAttribute("cy", cy - beadR*0.22);
        shine.setAttribute("r", beadR*0.18);
        shine.setAttribute("fill", "rgba(255,255,255,0.30)");
        svg.appendChild(shine);
      }
    }

    return svg;
  }



  return { build19x19FromImage, renderRoundBeadsSVG };
})();
