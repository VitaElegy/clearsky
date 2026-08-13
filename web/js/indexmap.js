// ====== 观星指数地图 (真实底图 + 网格扫描 + 双线性热力/等值线 + 风云4B云图叠加) ======
let imap=null, imBaseLayer=null, imCloudLayer=null, imHeat=null, imMarkers=[], imSelected=null, imData=null, imSkipNextReload=false;
let imDotRenderer=null, imSelMarker=null;
let imBaseKey="cd", imShowCloud=false, imShowHeat=true, imShowDots=true, imShowContour=true;

// 真实底图源 (全部实测可用, 腾讯 rt.map.gtimg.com 返回纯色占位图已弃用)
const IM_BASE = {
  cd:  {name:"暗色矢量 (CARTO)", url:"https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", sub:"abcd", maxZoom:19,
        attr:'&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'},
  gv:  {name:"高德矢量", url:"https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}", sub:"1234", maxZoom:18,
        attr:'&copy; 高德'},
  gd:  {name:"高德卫星影像", url:"https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}", sub:"1234", maxZoom:18,
        attr:'&copy; 高德'},
  esri:{name:"ESRI World Imagery", url:"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", sub:"", maxZoom:18,
        attr:'Tiles &copy; Esri'},
};

// ---- 规则网格识别: /api/scan 返回的 lat/lng 等差网格, 双线性插值的前提 ----
function buildRegularGrid(pts){
  const r6 = v => Math.round(v*1e6)/1e6;
  const lats = [...new Set(pts.map(p=>r6(p.lat)))].sort((a,b)=>a-b);
  const lngs = [...new Set(pts.map(p=>r6(p.lng)))].sort((a,b)=>a-b);
  if(lats.length*lngs.length !== pts.length || lats.length<2 || lngs.length<2) return null;
  const data = lats.map(()=>new Array(lngs.length).fill(null));
  for(const p of pts){
    const i = lats.indexOf(r6(p.lat)), j = lngs.indexOf(r6(p.lng));
    if(i>=0 && j>=0) data[i][j] = p.score;
  }
  return {lat0:lats[0], dLat:(lats[lats.length-1]-lats[0])/(lats.length-1), nLat:lats.length,
          lng0:lngs[0], dLng:(lngs[lngs.length-1]-lngs[0])/(lngs.length-1), nLng:lngs.length, data};
}

// 盒式模糊(半径1), 抹平双线性色带边缘, 让色面更柔
function boxBlur(f, w, h){
  const src = f, out = new Float32Array(w*h);
  for(let y=0;y<h;y++){
    const ym = y>0?y-1:y, yp = y<h-1?y+1:y;
    for(let x=0;x<w;x++){
      const xm = x>0?x-1:x, xp = x<w-1?x+1:x;
      out[y*w+x] = (src[ym*w+xm]+src[ym*w+x]+src[ym*w+xp]+
                    src[y*w+xm]+src[y*w+x]+src[y*w+xp]+
                    src[yp*w+xm]+src[yp*w+x]+src[yp*w+xp])/9;
    }
  }
  return out;
}

// 等值线: Marching squares, 阈值处线性插值取点, 按 case 连段
// 边编号: 0=上, 1=右, 2=下, 3=左; 位: 8=左上,4=右上,2=右下,1=左下
const MS_SEG = {
  1:[[3,2]], 2:[[2,1]], 3:[[3,1]], 4:[[1,0]], 6:[[0,2]], 7:[[0,3]],
  8:[[0,3]], 9:[[0,2]], 11:[[0,1]], 12:[[1,3]], 13:[[1,2]], 14:[[3,2]],
  5:[[0,3],[1,2]], 10:[[0,1],[2,3]]
};
function marchingSegs(f, w, h, t){
  const segs = [];
  const ptsAt = (x,y)=>[x,y];
  const interp = (a, fa, b, fb) => {
    const d = fb-fa; const k = d===0 ? 0.5 : (t-fa)/d;
    return [a[0]+(b[0]-a[0])*k, a[1]+(b[1]-a[1])*k];
  };
  for(let y=0;y<h-1;y++){
    for(let x=0;x<w-1;x++){
      const f00=f[y*w+x], f10=f[y*w+x+1], f11=f[(y+1)*w+x+1], f01=f[(y+1)*w+x];
      let idx = (f00>=t?8:0)|(f10>=t?4:0)|(f11>=t?2:0)|(f01>=t?1:0);
      if(idx===0 || idx===15) continue;
      if(idx===5 || idx===10){
        idx = (f00+f10+f11+f01)/4 >= t ? 10 : 5;   // 鞍点按中心值消歧
      }
      const E = [
        interp([x,y], f00, [x+1,y], f10),          // 0 上
        interp([x+1,y], f10, [x+1,y+1], f11),      // 1 右
        interp([x+1,y+1], f11, [x,y+1], f01),      // 2 下
        interp([x,y+1], f01, [x,y], f00),          // 3 左
      ];
      for(const [a,b] of (MS_SEG[idx]||[])) segs.push([E[a], E[b]]);
    }
  }
  return segs;
}

// 指数热力连续场: 规则网格用双线性插值(Bilinear, 气象图标准做法),
// 非规则/缺测回退 IDW; 可选叠加等值线 (Marching squares)
const HeatLayer = L.Layer.extend({
  options:{opacity:0.46, res:300, contours:true, contourValues:[20,40,60,80]},
  initialize(pts, opts){
    L.setOptions(this, opts||{});
    this._pts = pts||[];
  },
  onAdd(map){
    this._map = map;
    this._c = L.DomUtil.create("canvas","im-heat");
    L.DomUtil.addClass(this._c,"leaflet-zoom-animated");
    map.getPanes().overlayPane.appendChild(this._c);
    this._reset();
    map.on("moveend zoomend viewreset resize", this._reset, this);
  },
  onRemove(map){
    map.off("moveend zoomend viewreset resize", this._reset, this);
    if(this._c) L.DomUtil.remove(this._c);
  },
  setData(pts){ this._pts = pts||[]; if(this._c) this._reset(); },
  setContours(on){ this.options.contours = !!on; if(this._c) this._draw(); },
  _reset(){
    const s = this._map.getSize();
    this._c.width = s.x; this._c.height = s.y;
    this._c.style.width = s.x+"px"; this._c.style.height = s.y+"px";
    this._c.style.opacity = this.options.opacity;
    this._draw();
  },
  _draw(){
    const ctx = this._c.getContext("2d");
    ctx.clearRect(0,0,this._c.width,this._c.height);
    const pts = (this._pts||[]).filter(p=>p.score!=null);
    if(!pts.length) return;
    const R = this.options.res || 240;
    const w = this._c.width, h = this._c.height;
    if(!isFinite(w) || !isFinite(h) || w<=0 || h<=0) return;
    const ow = Math.max(2, Math.min(R|0, w)), oh = Math.max(2, Math.round(ow*h/w));
    const off = document.createElement("canvas"); off.width=ow; off.height=oh;
    const octx = off.getContext("2d");
    const img = octx.createImageData(ow,oh);
    const field = new Float32Array(ow*oh);
    const bounds = this._map.getBounds();
    const cosLat = Math.cos(bounds.getCenter().lat*Math.PI/180);
    const grid = buildRegularGrid(pts);
    let imMask = null;   // 双线性分支的边缘羽化 mask
    let used = 0;

    if(grid){
      // ---- 双线性插值 (规则网格, O(1)/像素) ----
      const latMin = bounds.getSouth(), latMax = bounds.getNorth();
      const lngMin = bounds.getWest(), lngMax = bounds.getEast();
      const nLat = grid.nLat, nLng = grid.nLng, dLat = grid.dLat, dLng = grid.dLng;
      const {lat0, lng0, data} = grid;
      imMask = new Float32Array(ow*oh);   // 边缘羽化: 数据边界外淡出
      for(let y=0;y<oh;y++){
        const lat = latMax - (y+0.5)/oh*(latMax-latMin);
        const fi = (lat-lat0)/dLat;
        for(let x=0;x<ow;x++){
          const lng = lngMin + (x+0.5)/ow*(lngMax-lngMin);
          const fj = (lng-lng0)/dLng;
          const i0 = Math.floor(fi), j0 = Math.floor(fj);
          const ti = fi-i0, tj = fj-j0;
          if(i0<-1 || i0>nLat-1 || j0<-1 || j0>nLng-1) continue;
          const ia = Math.max(0, Math.min(nLat-2, i0)), ja = Math.max(0, Math.min(nLng-2, j0));
          const ib = ia+1, jb = ja+1;
          const v00=data[ia][ja], v10=data[ib][ja], v01=data[ia][jb], v11=data[ib][jb];
          if(v00==null || v10==null || v01==null || v11==null) continue;
          // 局部归一化权重, 越界时向格内收缩
          const u = i0<0 ? 1 : i0>nLat-2 ? 0 : ti;
          const v = j0<0 ? 1 : j0>nLng-2 ? 0 : tj;
          field[y*ow+x] = v00*(1-u)*(1-v) + v10*u*(1-v) + v01*(1-u)*v + v11*u*v;
          // 到数据区域边缘的距离 (网格坐标), 0.6 格内平滑羽化
          const d = Math.min(fi+0.5, nLat-0.5-fi, fj+0.5, nLng-0.5-fj);
          const a = Math.max(0, Math.min(1, d/0.6));
          imMask[y*ow+x] = a*a*(3-2*a);   // smoothstep
          used++;
        }
      }
    } else {
      // ---- IDW 回退 (非规则/缺测) ----
      const pp = pts.map(p=>{
        const c = this._map.latLngToContainerPoint([p.lat,p.lng]);
        return {x:c.x/w*ow, y:c.y/h*oh, v:p.score};
      });
      const n = Math.max(2, Math.sqrt(pts.length));
      const spacing = Math.max(4, ow/(n-1));
      const R2 = Math.pow(spacing*2.2, 2);
      const eps = 1e-6;
      for(let y=0;y<oh;y++){
        for(let x=0;x<ow;x++){
          let sw=0, sv=0;
          for(const p of pp){
            const dx=(p.x-x)*cosLat, dy=p.y-y;
            const d2=dx*dx+dy*dy;
            if(d2<R2){
              const t = 1 - Math.sqrt(d2)/Math.sqrt(R2);
              const wgt = t*t;
              sw+=wgt; sv+=wgt*p.v;
            }
          }
          if(sw>0){ field[y*ow+x] = sv/sw; used++; }
        }
      }
    }

    if(!used) return;
    const smooth = boxBlur(field, ow, oh);   // 平滑色带, 消除格线感
    let mask = null;
    if(grid) mask = boxBlur(imMask, ow, oh);
    for(let y=0;y<oh;y++){
      for(let x=0;x<ow;x++){
        const v = smooth[y*ow+x];
        const i=(y*ow+x)*4;
        if(v>0 && isFinite(v)){
          const col = heatColor(v);
          const a = mask ? mask[y*ow+x] : 1;
          img.data[i]=col[0]; img.data[i+1]=col[1]; img.data[i+2]=col[2]; img.data[i+3]=Math.round(a*255);
        } else { img.data[i+3]=0; }
      }
    }
    octx.putImageData(img,0,0);
    ctx.drawImage(off,0,0,w,h);

    // 等值线叠加 (白色半透明, 气象图风格)
    if(this.options.contours && grid){
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      for(const t of (this.options.contourValues||[])){
        const segs = marchingSegs(smooth, ow, oh, t);
        if(!segs.length) continue;
        ctx.beginPath();
        for(const [a,b] of segs){
          ctx.moveTo(a[0]/ow*w, a[1]/oh*h);
          ctx.lineTo(b[0]/ow*w, b[1]/oh*h);
        }
        // 深色打底 + 白色主线: 亮色/暗色底图上都清晰 (气象图惯例)
        ctx.strokeStyle = "rgba(10,17,32,0.4)"; ctx.lineWidth = 2.6; ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 1.1; ctx.stroke();
      }
    }
  }
});

// 0-100 连续色带 (对齐图例: 红->橙->黄->绿->青)
function heatColor(v){
  const stops=[[0,[255,82,82]],[25,[255,176,32]],[50,[255,213,79]],[75,[61,220,132]],[100,[0,229,255]]];
  const vv=Math.max(0,Math.min(100,v));
  for(let i=0;i<stops.length-1;i++){
    const [v0,c0]=stops[i], [v1,c1]=stops[i+1];
    if(vv<=v1){
      const t=(vv-v0)/(v1-v0||1);
      return [Math.round(c0[0]+(c1[0]-c0[0])*t), Math.round(c0[1]+(c1[1]-c0[1])*t), Math.round(c0[2]+(c1[2]-c0[2])*t)];
    }
  }
  return stops[stops.length-1][1];
}

function initIndexMap(){
  if(imap) return;
  imap = L.map("imMap", {zoomControl:true, attributionControl:true}).setView([APP.state.lat,APP.state.lng], 9);
  imap.createPane("cloud").style.zIndex = 460;
  imap.createPane("heat").style.zIndex = 430;
  imap.createPane("imdots").style.zIndex = 500;   // 采样细点
  imap.createPane("impick").style.zIndex = 520;   // 选中高亮环
  imScale = L.control.scale({imperial:false, position:"bottomleft"}).addTo(imap);
  imDotRenderer = L.canvas({tolerance:12, pane:"imdots"}).addTo(imap);  // 细点也容易点中
  imap.on("click", ()=>{ if(imSelected){ imSelected=null; drawImSelection(); renderImPick(); } });
  applyImBase();
}

function applyImBase(){
  const cfg = IM_BASE[imBaseKey] || IM_BASE.cd;
  if(imBaseLayer){ imap.removeLayer(imBaseLayer); imBaseLayer=null; }
  imBaseLayer = L.tileLayer(cfg.url, {tileSize:256, subdomains:cfg.sub||"", maxZoom:cfg.maxZoom, attribution:cfg.attr}).addTo(imap);
  if(imap.attributionControl) imap.attributionControl.setPrefix(false);
}

function setImBase(k){
  imBaseKey = k;
  if(imap) applyImBase();
}

function toggleImCloud(on){
  imShowCloud = on;
  $("imCloudNote").style.display = on ? "inline" : "none";
  if(!imap) return;
  if(on) addImCloud(); else if(imCloudLayer){ imap.removeLayer(imCloudLayer); imCloudLayer=null; }
}
function addImCloud(){
  if(!imap) return;
  if(imCloudLayer) imap.removeLayer(imCloudLayer);
  const B = L.latLngBounds([53.5,75.0],[3.0,137.0]);
  imCloudLayer = L.imageOverlay("https://img.nsmc.org.cn/CLOUDIMAGE/FY4B/AGRI/GCLR/FY4B_REGC_GCLR.JPG?_="+Date.now(),
    B, {opacity:0.32, pane:"cloud", interactive:false}).addTo(imap);
}

function toggleImHeat(on){
  imShowHeat = on;
  if(imap && imHeat){
    if(on){ imap.addLayer(imHeat); } else { imap.removeLayer(imHeat); }
  }
}

function toggleImContour(on){
  imShowContour = on;
  if(imHeat) imHeat.setContours(on);
}

function toggleImDots(on){
  imShowDots = on;
  if(!imap) return;
  if(on){ imMarkers.forEach(m=>m.addTo(imap)); } else { imMarkers.forEach(m=>imap.removeLayer(m)); }
}

async function loadIndexMap(force){
  if(!force && imSkipNextReload){ imSkipNextReload=false; renderImPick(); return; }
  initIndexMap();
  const info = $("imInfo");
  info.innerHTML = "扫描中…（后端并发查询各网格点观星指数，约 5-15 秒）";
  const model = $("imModel").value, grid = +$("imGrid").value,
        span = +$("imSpan").value, offset = +$("imOffset").value;
  const q = new URLSearchParams({lat:APP.state.lat, lng:APP.state.lng, span, grid, model, offset});
  try{
    const d = await getJSON("/api/scan?"+q, 60000);
    if(d.error) throw new Error(d.error);
    imData = d;
    drawImMarkers(d);
    // 热力层
    if(imHeat){ imap.removeLayer(imHeat); imHeat=null; }
    imHeat = new HeatLayer(d.points, {contours: imShowContour});
    if(imShowHeat) imHeat.addTo(imap);
    if(imShowCloud) addImCloud();
    // 摘要
    const ok = d.points.filter(p=>p.score!=null);
    const best = ok.length ? ok.reduce((a,b)=>(b.score??-1)>(a.score??-1)?b:a) : null;
    const worst = ok.length ? ok.reduce((a,b)=>(b.score??999)<(a.score??999)?b:a) : null;
    const dateTxt = best && best.date ? best.date : "今晚";
    info.innerHTML =
      `<b style="color:var(--ok)">${d.total} 点扫描完成</b> · 有效 ${ok.length} · 失败 ${d.failures} · ${dateTxt} · 模型 ${d.model.toUpperCase()} · 生成 ${esc(d.generated_at)}` +
      (best?`<br>⭐ 最佳: ${fmt(best.lat,4)},${fmt(best.lng,4)} → <b style="color:${scoreColor(best.score)}">${fmt(best.score,0)}</b> ${scoreTxt(best.score)}（点击地图点可设为观测地）`:"") +
      (worst?`<br>⚠️ 最差: ${fmt(worst.lat,4)},${fmt(worst.lng,4)} → <b style="color:${scoreColor(worst.score)}">${fmt(worst.score,0)}</b>`:"");
    // 图例: 连续渐变条 + 分档
    $("imLegend").innerHTML =
      `<span style="display:inline-flex;align-items:center;gap:5px"><i style="display:inline-block;width:110px;height:8px;border-radius:4px;background:linear-gradient(90deg,#ff5252,#ffb020,#ffd54f,#3ddc84,#00e5ff)"></i><b>0→100</b></span>` +
      [["≥80 极佳","#00e5ff"],["60-79 良好","#3ddc84"],["40-59 一般","#ffd54f"],["20-39 较差","#ffb020"],["<20 极差","#ff5252"]]
        .map(([k,c])=>`<span><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${c};margin-right:3px"></i>${k}</span>`).join("") +
      `<span style="color:var(--dim)">· 色面=双线性插值(Bilinear) · 细点=采样点 · 白线=等值线(20/40/60/80)</span>`;
    // 视野贴合网格
    if(ok.length){
      const b = L.latLngBounds(ok.map(p=>[p.lat,p.lng]));
      imap.fitBounds(b.pad(0.15), {maxZoom:11});
    }
    renderImPick();
  }catch(e){
    info.innerHTML = `<span class="err">扫描失败: ${esc(e.message)}</span>`;
  }
}

function drawImMarkers(d){
  imMarkers.forEach(m=>imap.removeLayer(m));
  imMarkers = [];
  const prev = imSelected;
  imSelected = null;
  // 采样点改细点: 只做定位/交互, 视觉交给热力色面 (大圆点方案已废弃)
  const r = d.grid===3 ? 4.5 : d.grid===5 ? 4 : 3.5;
  for(const p of d.points){
    const c = imColor(p.score);
    const m = L.circleMarker([p.lat,p.lng], {
      radius:r, color:"rgba(255,255,255,0.95)", weight:1.2, fillColor:c, fillOpacity:0.95,
      renderer:imDotRenderer, bubblingMouseEvents:false,
    });
    const nights = (p.nights||[]).map(n=>`${String(n.date).slice(5)}: ${n.score==null?"-":fmt(n.score,0)}`).join(" / ");
    m.bindTooltip(`<b>${p.score==null?"无数据":fmt(p.score,0)}</b> ${scoreTxt(p.score)}<br>${fmt(p.lat,4)}, ${fmt(p.lng,4)}<br>${esc(nights)}`, {direction:"top", className:"im-tip"});
    m.on("mouseover", ()=>m.setStyle({fillOpacity:1, weight:2}));
    m.on("mouseout", ()=>m.setStyle({fillOpacity:0.95, weight:1.2}));
    m.on("click", ()=>{ pickImPoint(p); });
    imMarkers.push(m);
    if(imShowDots) m.addTo(imap);
  }
  if(prev){
    const np = d.points.find(x=>Math.abs(x.lat-prev.lat)<1e-6 && Math.abs(x.lng-prev.lng)<1e-6) || null;
    if(np) imSelected = np;
  }
  drawImSelection();
}

function drawImSelection(){
  if(imSelMarker){ imap.removeLayer(imSelMarker); imSelMarker=null; }
  if(!imSelected) return;
  const p = imSelected;
  imSelMarker = L.circleMarker([p.lat,p.lng], {
    radius:10, color:"#ffffff", weight:2.5, fillColor:imColor(p.score), fillOpacity:0.35,
    dashArray:"4 4", pane:"impick", bubblingMouseEvents:false,
  }).addTo(imap);
}

function pickImPoint(p){
  imSelected = p;
  drawImSelection();
  imSkipNextReload = true;
  APP.state.lat = p.lat; APP.state.lng = p.lng;
  if(APP.onLocChanged) APP.onLocChanged();
  renderImPick();
}

function renderImPick(){
  const box = $("imPick");
  if(!imSelected){ box.innerHTML=""; return; }
  const p = imSelected;
  const nights = (p.nights||[]).map((n,i)=>{
    const label = i===0?"昨晚":i===1?"今晚":i===2?"明晚":"后"+i+"晚";
    const c = scoreColor(n.score);
    return `<div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid #101a30"><span style="font-size:12px">${label} <span style="color:var(--dim)">${esc(String(n.date).slice(5))}</span></span><b style="color:${c}">${n.score==null?"-":fmt(n.score,0)}</b></div>`;
  }).join("");
  box.innerHTML = `
    <div class="card" style="margin:0">
      <h2><span class="dot"></span>已选观测点 <span class="tag-hot">${fmt(p.lat,4)}, ${fmt(p.lng,4)}</span></h2>
      <div style="font-size:13px">今晚评分 <b style="font-size:22px;color:${scoreColor(p.score)}">${p.score==null?"-":fmt(p.score,0)}</b> / 100 · ${scoreTxt(p.score)} · ${esc(p.date||"")}</div>
      <div style="margin-top:6px">${nights}</div>
      <div style="font-size:11px;color:var(--dim);margin-top:6px">已同步为全局观测地，观星/天气/光害等页面将自动刷新</div>
    </div>`;
}

function imColor(s){
  if(s==null) return "#555";
  return scoreColor(s);
}

APP.initIndexMap = initIndexMap;
APP.loadIndexMap = loadIndexMap;
APP.setImBase = setImBase;
APP.toggleImCloud = toggleImCloud;
APP.toggleImHeat = toggleImHeat;
APP.toggleImContour = toggleImContour;
APP.toggleImDots = toggleImDots;
