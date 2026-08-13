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
