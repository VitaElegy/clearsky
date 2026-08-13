// ====== 天象 / 流星雨 / 彗星 ======
function solarLon(date){
  const jd = date.getTime()/86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.460 + 0.9856474*n) % 360;
  const g = ((357.528 + 0.9856003*n) % 360) * Math.PI/180;
  const lam = L + 1.915*Math.sin(g) + 0.020*Math.sin(2*g);
  return ((lam%360)+360)%360;
}
async function loadAstro(){
  $("astroEvents").innerHTML = `<div class="loading">加载中…</div>`;
  try{
    const d = await getJSON(proxy("https://nodeapi.knockdream.com/api/astro/events?key=clearsky_demo_2026"));
    const list = (d.data||[]).slice(0,12).map(e=>`<div class="meteor"><span>${esc(e.event||"")}</span><span style="font-size:10px;color:var(--dim)">${esc((e.date||"").replace("T"," ").slice(0,16))}</span></div>`).join("");
    $("astroEvents").innerHTML = list || `<div class="loading">暂无近期事件</div>`;
  }catch(e){ $("astroEvents").innerHTML = `<div class="err">天象接口暂不可用: ${esc(e.message)}</div>`; }
}
async function loadMeteors(){
  $("meteors").innerHTML = `<div class="loading">加载中…</div>`;
  try{
    const data = await (await fetch("all_meteor.json")).json();
    const now = new Date(); const lon = solarLon(now);
    const active = data.filter(m=>{
      let [a,b]=m.active; if(a>b) b+=360;
      let L=lon; if(L<a) L+=360;
      return L>=a && L<=b;
    });
    const hot = active.filter(m=>{ let [a,b]=m.active; if(a>b)b+=360; let L=lon; if(L<a)L+=360; return Math.abs((L-(a+b)/2))<3; });
    $("meteors").innerHTML = active.length ? active.map(m=>{
      const isHot = hot.includes(m);
      return `<div class="meteor"><span>${isHot?"⭐":""} ${esc(m.name_zh)} <span class="tag ${isHot?"hot":""}">${isHot?"峰值中":"活跃"}</span></span><span style="font-size:10px;color:var(--dim)">${esc(m.name_en)} · ${m.velocity}km/s</span><span class="zhr">ZHR ${m.zhr_max}</span></div>`;
    }).join("") : `<div class="loading">当前无活跃流星雨(太阳黄经 ${fmt(lon,1)}°)</div>`;
    const all = [...data].sort((a,b)=>a.peak-b.peak).map(m=>{
      const pct = Math.min(100, Math.max(0, (m.zhr_max/120)*100));
      return `<div class="meteor"><span>${esc(m.name_zh)}<span style="font-size:10px;color:var(--dim)"> ${esc(m.name_en)}</span></span><span class="mini" style="flex:1;height:6px;background:#0a1120;border-radius:3px;margin-left:8px"><i style="display:block;height:100%;width:${pct}%;background:var(--warn);border-radius:3px"></i></span><span class="zhr">${m.zhr_max}</span></div>`;
    }).join("");
    $("meteorAll").innerHTML = all;
  }catch(e){
    $("meteors").innerHTML = `<div class="err">流星雨加载失败: ${esc(e.message)}</div>`;
  }
}
async function loadComets(){
  $("comets").innerHTML = `<div class="loading">加载中…</div>`;
  try{
    const d = await getJSON(proxy("https://nodeapi.knockdream.com/api/comets/latest-fitted"));
    const list = d.slice(0,12).map(c=>{
      const m = c.mag || {};
      const bright = (m.today!=null && m.today<10);
      return `<div class="meteor"><span>☄️ ${esc(c._id)}</span><span style="font-size:10px;color:var(--dim)">距角 ${fmt(c.elong,0)}° · 拟合${c.fitAccepted?"✓":"?"}</span><span class="zhr" style="color:${bright?"var(--warn)":"var(--dim)"}">今 ${m.today==null?"-":fmt(m.today,1)}m / 15d ${m.day_15==null?"-":fmt(m.day_15,1)}m</span></div>`;
    }).join("");
    $("comets").innerHTML = list || `<div class="loading">暂无彗星数据</div>`;
  }catch(e){
    $("comets").innerHTML = `<div class="err">彗星数据失败: ${esc(e.message)}</div>`;
  }
}
APP.loadAstro = loadAstro; APP.loadMeteors = loadMeteors; APP.loadComets = loadComets;
