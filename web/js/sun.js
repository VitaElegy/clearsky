// ====== 太阳活动 / 极光 ======
async function loadSolar(){
  $("solarGrid").innerHTML = `<div class="loading">加载中…</div>`;
  const jobs = [
    ["Kp指数(3h)", proxy("https://nodeapi.knockdream.com/api/space/kp-index"), d=>Array.isArray(d)&&d.length?fmt(d[d.length-1].kp,1):"-", "NOAA 实测"],
    ["太阳风速度", proxy("https://nodeapi.knockdream.com/api/solar-wind"), d=>Array.isArray(d)&&d.length?fmt(d[d.length-1].speed,0)+" km/s":"-", "实时"],
    ["极光功率(北)", proxy("https://nodeapi.knockdream.com/api/aurora-power"), d=>Array.isArray(d)&&d.length?fmt(d[d.length-1].northPower,0)+" GW":"-", "OVATION"],
    ["行星际磁场Bz", proxy("https://nodeapi.knockdream.com/api/magnetic-field"), d=>Array.isArray(d)&&d.length?fmt(d[d.length-1].bz_gsm,1)+" nT":"-", "实时"],
  ];
  let html="";
  for(const [k,url,f,src] of jobs){
    try{ const d=await getJSON(url); html+=`<div class="stat"><div class="k">${k}</div><div class="v">${esc(f(d))}</div><div class="s">${src}</div></div>`; }
    catch(e){ html+=`<div class="stat"><div class="k">${k}</div><div class="v" style="color:var(--bad)">-</div><div class="s">不可用</div></div>`; }
  }
  $("solarGrid").innerHTML = html;
}

async function loadAuroraForecast(){
  $("auroraForecast").innerHTML = `<div class="loading">加载中…</div>`;
  try{
    const d = await getJSON(proxy("https://nodeapi.knockdream.com/api/aurora-forecast"));
    const rows = d.slice(-27).reverse().map(x=>{
      const kp = x.kpIndex;
      const c = kp>=7?"#ff5252":kp>=5?"#ffb020":kp>=3?"#ffd54f":"#3ddc84";
      return `<tr><td>${String(x.date).slice(0,10)}</td><td style="color:${c};font-weight:700">${fmt(kp,1)}</td><td>${x.aIndex==null?"-":fmt(x.aIndex,0)}</td><td>${x.radioFlux==null?"-":fmt(x.radioFlux,0)}</td></tr>`;
    }).join("");
    $("auroraForecast").innerHTML = `<div style="overflow-x:auto"><table class="trend-table"><thead><tr><th>日期</th><th>Kp</th><th>A指数</th><th>射电通量</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div style="font-size:10px;color:var(--dim);margin-top:6px">Kp≥5 可能看到极光(高纬)；Kp≥7 强磁暴。本地中纬度需叠加相机长曝/电离层增强。</div>`;
  }catch(e){
    $("auroraForecast").innerHTML = `<div class="err">极光预报失败: ${esc(e.message)}</div>`;
  }
}
APP.loadSolar = loadSolar;
APP.loadAuroraForecast = loadAuroraForecast;

// ====== OVATION 极光卵实况 (nodeapi /skydata/ovation_aurora_latest.json) ======
async function loadOvation(){
  const box = $("ovationBox");
  box.innerHTML = `<div class="loading">加载中…（~670KB 全球网格）</div>`;
  try{
    const d = await getJSON(proxy("https://nodeapi.knockdream.com/skydata/ovation_aurora_latest.json"), 30000);
    const coords = d.coordinates || [];
    const obs = (d["Observation Time"]||"").replace("T"," ").slice(0,16)+"Z";
    if(!coords.length) throw new Error("空坐标");
    const W = 640, H = 320;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    cv.style.cssText = "width:100%;max-width:720px;height:auto;border-radius:8px;background:#030814";
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#030814"; ctx.fillRect(0,0,W,H);
    // 经纬网格
    ctx.strokeStyle = "rgba(80,120,200,0.16)"; ctx.lineWidth = 1;
    for(let lon=-180;lon<180;lon+=30){
      const x = (lon+180)/360*W;
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke();
    }
    for(let lat=-90;lat<=90;lat+=30){
      const y = (90-lat)/180*H;
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
    }
    // 赤道
    ctx.strokeStyle = "rgba(120,180,255,0.35)"; ctx.beginPath(); ctx.moveTo(0,H/2); ctx.lineTo(W,H/2); ctx.stroke();
    // 极光概率点
    const alpha = v => Math.max(0.08, Math.min(1, v/14));
    for(const [lon,lat,aur] of coords){
      if(!aur || aur < 2) continue;
      const x = (lon+180)/360*W;
      const y = (90-lat)/180*H;
      const r = 1.2 + aur/14*2.2;
      const c = aur>=10 ? "255,60,80" : aur>=5 ? "255,170,40" : "80,220,120";
      ctx.fillStyle = `rgba(${c},${alpha(aur)})`;
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    }
    // 当前观测地标记
    const myLon = APP.state.lng, myLat = APP.state.lat;
    const mx = (myLon+180)/360*W, my = (90-myLat)/180*H;
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mx,my,5,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "10px sans-serif"; ctx.fillText("★ 观测地", mx+8, my-4);
    box.innerHTML = "";
    box.appendChild(cv);
    const n = coords.filter(c=>c[2]>=2).length;
    const strong = coords.filter(c=>c[2]>=10).length;
    box.insertAdjacentHTML("beforeend",
      `<div style="font-size:11px;color:var(--dim);margin-top:6px">观测时间 ${esc(obs)} · 概率点 ${n} 个 (≥2%) · 强极光点 ${strong} 个 (≥10%) · 绿色≥5% / 橙色≥10% 概率带</div>`);
  }catch(e){
    box.innerHTML = `<div class="err">极光卵加载失败: ${esc(e.message)}</div>`;
  }
}

// ====== 日出/日落辉光 (sunset-glow, CORS 开放直连) ======
async function loadGlow(){
  const box = $("glowBox");
  box.innerHTML = `<div class="loading">加载中…</div>`;
  try{
    const url = `https://stargazing.twtapp.com/api/v1/sunset-glow/point/range?lat=${APP.state.lat}&lng=${APP.state.lng}&key=${APP.KEY}`;
    const d = await getJSON(url);
    const slots = (d.slots||[]).filter(x=>x.date && x.glow_type);
    if(!slots.length) throw new Error("无辉光数据");
    const today = new Date().toISOString().slice(0,10);
    const rows = slots.map(sl=>{
      const v = sl.visibility||{};
      const sc = sl.score||{};
      const color = sc.index>=4 ? "var(--warn)" : sc.index>=2 ? "var(--ok)" : "var(--dim)";
      return `<div class="meteor"><span>${esc(sl.date)} ${sl.glow_type==="sunset"?"🌇日落":"🌅日出"}${sl.date===today?' <span class="tag hot">今天</span>':""}</span>
        <span style="font-size:10px;color:var(--dim)">峰值 ${esc(v.peak_local||"-")} · ${esc(v.start_local||"-")}→${esc(v.end_local||"-")} · 方位 ${esc(sl.direction&&sl.direction.compass16||"-")} ${sl.direction?fmt(sl.direction.azimuth_deg,0)+"°":""}</span>
        <span class="zhr" style="color:${color}">辉光 ${fmt(sc.index,1)}</span></div>`;
    }).join("");
    box.innerHTML = rows + `<div style="font-size:10px;color:var(--dim);margin-top:6px">辉光指数越高越好；${esc(d.start_date||"")} ~ ${esc(d.end_date||"")} · 模型 ${esc(d.model||"icon")}</div>`;
  }catch(e){
    box.innerHTML = `<div class="err">辉光接口失败: ${esc(e.message)}</div>`;
  }
}
APP.loadOvation = loadOvation;
APP.loadGlow = loadGlow;
