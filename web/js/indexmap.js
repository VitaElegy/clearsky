// ====== 观星指数地图 (真实底图 + 网格扫描 + 热力插值 + 风云4B云图叠加) ======
let imap=null, imBaseLayer=null, imCloudLayer=null, imHeat=null, imMarkers=[], imSelected=null, imData=null, imSkipNextReload=false;
let imBaseKey="cd", imShowCloud=false, imShowHeat=true, imShowDots=true;

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

// 指数热力连续场: 反距离加权(IDW)插值绘制到低分辨率离屏 canvas 再拉伸
const HeatLayer = L.Layer.extend({
  options:{opacity:0.5, res:200, radius:1.4},
  initialize(pts){ this._pts = pts||[]; },
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
    const R = this.options.res || 200;
    const w = this._c.width, h = this._c.height;
    if(!isFinite(w) || !isFinite(h) || w<=0 || h<=0) return;
    const ow = Math.max(2, Math.min(R|0, w)), oh = Math.max(2, Math.round(ow*h/w));
    const off = document.createElement("canvas"); off.width=ow; off.height=oh;
    const octx = off.getContext("2d");
    const img = octx.createImageData(ow,oh);
    const bounds = this._map.getBounds();
    // 网格点转到容器像素(当前视图)
    const pp = pts.map(p=>{
      const c = this._map.latLngToContainerPoint([p.lat,p.lng]);
      return {x:c.x/w*ow, y:c.y/h*oh, v:p.score};
    });
    const cosLat = Math.cos(bounds.getCenter().lat*Math.PI/180);
    // 自适应影响半径: 约 2.2 倍网格间距, 保证点与点之间连成连续色面
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
            // 线性衰减权重: w=(1-d/R)^2, 比 1/d2 更平滑, 减少牛眼圈纹
            const t = 1 - Math.sqrt(d2)/Math.sqrt(R2);
            const wgt = t*t;
            sw+=wgt; sv+=wgt*p.v;
          }
        }
        const v = sw>0 ? sv/sw : 0;
        const col = heatColor(v);
        const i=(y*ow+x)*4;
        img.data[i]=col[0]; img.data[i+1]=col[1]; img.data[i+2]=col[2];
        img.data[i+3]= sw>0 ? 255 : 0;
      }
    }
    octx.putImageData(img,0,0);
    ctx.drawImage(off,0,0,w,h);
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
  imScale = L.control.scale({imperial:false, position:"bottomleft"}).addTo(imap);
  imap.on("click", ()=>{ if(imSelected){ imSelected=null; renderImPick(); } });
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
    imHeat = new HeatLayer(d.points);
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
    // 图例
    const lg = [["≥80 极佳","#00e5ff"],["60-79 良好","#3ddc84"],["40-59 一般","#ffd54f"],["20-39 较差","#ffb020"],["<20 极差","#ff5252"],["无数据","#555"]];
    $("imLegend").innerHTML = lg.map(([k,c])=>`<span><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c};margin-right:3px"></i>${k}</span>`).join("") +
      `<span style="color:var(--dim)">· 色面=热力插值(IDW) · 圆点=实际网格采样</span>`;
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
  const r = d.grid===3 ? 13 : d.grid===5 ? 11 : 9;
  for(const p of d.points){
    const c = imColor(p.score);
    const m = L.circleMarker([p.lat,p.lng], {
      radius:r, color:"#0a1120", weight:1, fillColor:c, fillOpacity:0.85, bubblingMouseEvents:false,
    });
    const nights = (p.nights||[]).map(n=>`${String(n.date).slice(5)}: ${n.score==null?"-":fmt(n.score,0)}`).join(" / ");
    m.bindTooltip(`<b>${p.score==null?"无数据":fmt(p.score,0)}</b> ${scoreTxt(p.score)}<br>${fmt(p.lat,4)}, ${fmt(p.lng,4)}<br>${esc(nights)}`, {direction:"top", className:"im-tip"});
    m.on("click", ()=>{ pickImPoint(p); });
    imMarkers.push(m);
    if(imShowDots) m.addTo(imap);
  }
  if(prev){
    const np = d.points.find(x=>Math.abs(x.lat-prev.lat)<1e-6 && Math.abs(x.lng-prev.lng)<1e-6) || null;
    if(np){
      imSelected = np;
      const ll = [np.lat, np.lng];
      imMarkers.forEach(m=>{
        const c = m.getLatLng();
        m.setStyle({color: Math.abs(c.lat-ll[0])<1e-6 && Math.abs(c.lng-ll[1])<1e-6 ? "#ffffff" : "#0a1120", weight: Math.abs(c.lat-ll[0])<1e-6 && Math.abs(c.lng-ll[1])<1e-6 ? 3 : 1});
      });
    }
  }
}

function pickImPoint(p){
  imSelected = p;
  imMarkers.forEach(m=>{
    const ll = m.getLatLng();
    const sel = Math.abs(ll.lat-p.lat)<1e-6 && Math.abs(ll.lng-p.lng)<1e-6;
    m.setStyle({color: sel ? "#ffffff" : "#0a1120", weight: sel ? 3 : 1});
  });
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
APP.toggleImDots = toggleImDots;
