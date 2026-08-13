// ====== 观星指数地图 (区域网格扫描 /api/scan) ======
let imap=null, imBaseLayer=null, imMarkers=[], imSelected=null, imData=null, imSkipNextReload=false;

function imTile(){
  if(APP.state.base==="gd")
    return {url:"https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}", sub:"1234"};
  return {url:"https://rt{s}.map.gtimg.com/tile?z={z}&x={x}&y={y}&styleid=1", sub:"0123"};
}

function initIndexMap(){
  if(imap) return;
  imap = L.map("imMap", {zoomControl:true, attributionControl:false}).setView([APP.state.lat,APP.state.lng], 9);
  imBaseLayer = L.tileLayer(imTile().url, {tileSize:256, subdomains:imTile().sub, maxZoom:18}).addTo(imap);
  imap.on("click", ()=>{
    // 点空白处取消选中高亮
    if(imSelected){ imSelected=null; renderImPick(); }
  });
}

function imColor(s){
  if(s==null) return "#555";
  return scoreColor(s);
}

async function loadIndexMap(force){
  if(!force && imSkipNextReload){ imSkipNextReload=false; renderImPick(); return; }
  initIndexMap();
  const box = $("imMap");
  const info = $("imInfo");
  info.innerHTML = "扫描中…（后端并发查询各网格点观星指数，约 5-15 秒）";
  const model = $("imModel").value, grid = +$("imGrid").value,
        span = +$("imSpan").value, offset = +$("imOffset").value;
  const q = new URLSearchParams({lat:APP.state.lat, lng:APP.state.lng, span, grid, model, offset});
  try{
    const d = await getJSON("/api/scan?"+q, 60000);
    if(d.error) throw new Error(d.error);
    imData = d;
    // 底图跟随当前底图设置
    const t = imTile();
    if(imBaseLayer) imap.removeLayer(imBaseLayer);
    imBaseLayer = L.tileLayer(t.url, {tileSize:256, subdomains:t.sub, maxZoom:18}).addTo(imap);
    drawImMarkers(d);
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
    $("imLegend").innerHTML = lg.map(([k,c])=>`<span><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c};margin-right:3px"></i>${k}</span>`).join("");
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
  const prev = imSelected;   // 重扫后按坐标恢复选中 (避免点击同步坐标时选中卡片丢失)
  imSelected = null;
  const r = d.grid===3 ? 13 : d.grid===5 ? 11 : 9;
  for(const p of d.points){
    const c = imColor(p.score);
    const m = L.circleMarker([p.lat,p.lng], {
      radius:r, color:"#0a1120", weight:1, fillColor:c, fillOpacity:0.85, bubblingMouseEvents:false,
    }).addTo(imap);
    const nights = (p.nights||[]).map(n=>`${String(n.date).slice(5)}: ${n.score==null?"-":fmt(n.score,0)}`).join(" / ");
    m.bindTooltip(`<b>${p.score==null?"无数据":fmt(p.score,0)}</b> ${scoreTxt(p.score)}<br>${fmt(p.lat,4)}, ${fmt(p.lng,4)}<br>${esc(nights)}`, {direction:"top", className:"im-tip"});
    m.on("click", ()=>{ pickImPoint(p); });
    imMarkers.push(m);
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
  // 高亮
  imMarkers.forEach(m=>{
    const ll = m.getLatLng();
    const sel = Math.abs(ll.lat-p.lat)<1e-6 && Math.abs(ll.lng-p.lng)<1e-6;
    m.setStyle({color: sel ? "#ffffff" : "#0a1120", weight: sel ? 3 : 1});
  });
  // 设为观测地并刷新其他 Tab; 跳过本次由坐标同步触发的 indexmap 重扫,
  // 避免新网格不再包含刚选中的点导致选中卡片消失
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

APP.initIndexMap = initIndexMap;
APP.loadIndexMap = loadIndexMap;
