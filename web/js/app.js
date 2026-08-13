// ====== 主流程 / Tab 切换 / 地点 ======
function renderChips(){
  const el = $("chips"); if(!el) return;
  el.innerHTML = APP.PRE.map((p,i)=>`<span class="chip ${Math.abs(p.lat-APP.state.lat)<1e-9&&Math.abs(p.lng-APP.state.lng)<1e-9?"on":""}" onclick="APP.pick(${i})">${esc(p.name)}</span>`).join("");
}
function pick(i){
  const p = APP.PRE[i];
  APP.state.lat=p.lat; APP.state.lng=p.lng; APP.state.name=p.name;
  syncInputs(); renderChips(); loadAll();
}
function applyLoc(){
  const lat=parseFloat($("lat").value), lng=parseFloat($("lng").value);
  if(isNaN(lat)||isNaN(lng)||lat<-90||lat>90||lng<-180||lng>180){ toast("坐标无效"); return; }
  APP.state.lat=lat; APP.state.lng=lng; APP.state.name=lat.toFixed(4)+","+lng.toFixed(4);
  syncInputs(); renderChips(); loadAll();
}
function syncInputs(){
  const la=$("lat"), ln=$("lng");
  if(la) la.value=APP.state.lat; if(ln) ln.value=APP.state.lng;
  const hd=$("hdLoc"); if(hd) hd.textContent = `${APP.state.name||(APP.state.lat+","+APP.state.lng)} ${APP.state.lat},${APP.state.lng}`;
  if(APP.updateLinks) APP.updateLinks();
}
// 地图点选/拖动回调 (map.js 调用)
function onLocChanged(){
  syncInputs(); renderChips(); loadAll();
}

// Tab 切换 + 懒加载
function switchTab(name){
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("on", t.dataset.tab===name));
  document.querySelectorAll(".panel").forEach(p=>p.classList.toggle("active", p.id==="panel-"+name));
  if(APP.loaded[name]) return;
  APP.loaded[name] = true;
  const L = {
    score: ()=>{ APP.loadScore(); },
    weather: ()=>{ APP.loadTimer(); APP.loadOpenMeteo(); APP.loadMetno(); APP.load15days(); APP.loadAQI(); },
    light: ()=>{ APP.loadLP(); APP.loadElevation(); },
    cloud: ()=>{ APP.initMap(); APP.recenter(); },
    sun: ()=>{ APP.loadSolar(); APP.loadAuroraForecast(); },
    events: ()=>{ APP.loadAstro(); APP.loadMeteors(); APP.loadComets(); },
    sat: ()=>{ APP.loadOrbitSat(); APP.loadStarlink(); APP.loadQianfan(); },
    health: ()=>{ APP.loadHealth(); },
    about: ()=>{ APP.loadAbout(); },
  }[name];
  if(L) L();
}

// 全量刷新 (换地点时)
async function loadAll(){
  syncInputs();
  if(APP.updateLinks) APP.updateLinks();
  if(map) APP.recenter();
  // 已加载过的 tab 重新拉数据
  const reload = {
    score: ()=>APP.loadScore(),
    weather: ()=>{ APP.loadTimer(); APP.loadOpenMeteo(); APP.loadMetno(); APP.load15days(); APP.loadAQI(); },
    light: ()=>{ APP.loadLP(); APP.loadElevation(); },
    sun: ()=>{ APP.loadSolar(); APP.loadAuroraForecast(); },
    events: ()=>{ APP.loadAstro(); APP.loadMeteors(); APP.loadComets(); },
    sat: ()=>{ APP.loadOrbitSat(); APP.loadStarlink(); APP.loadQianfan(); },
  };
  for(const [name,fn] of Object.entries(reload)){ if(APP.loaded[name]) fn(); }
}

// 启动
function boot(){
  document.querySelectorAll(".tab").forEach(t=>{
    t.addEventListener("click", ()=>switchTab(t.dataset.tab));
  });
  renderChips(); syncInputs();
  APP.initMap(); APP.recenter();
  switchTab("score");
  // 启动即做一次健康检查 (更新顶部状态点): 用关键服务分组, 快且不占带宽; 完整 30 端点在「健康」Tab 检查
  setTimeout(()=>APP.loadHealth("core"), 400);
  setInterval(()=>{ if(document.visibilityState==="visible") APP.loadHealth("core"); }, 15*60*1000);
  setInterval(()=>{ if(document.visibilityState==="visible" && APP.loaded.cloud) APP.recenter(); }, 600000);
}
APP.pick = pick; APP.applyLoc = applyLoc; APP.switchTab = switchTab; APP.loadAll = loadAll;
APP.onLocChanged = onLocChanged;
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", boot); else boot();
