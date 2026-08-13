// ====== 天气 ======
const TIMER_COLORS = {
  cloudcover:[["#0e6",1],["#fe6",2],["#f93",3],["#f66",4],["#c03",5],["#63c",6],["#30c",7],["#009",8]],
  transparency:[["#e66",1],["#e93",2],["#fc6",3],["#ff9",4],["#cfc",5],["#9fc",6],["#6fc",7],["#3f9",8]],
  seeing:[["#c00",1],["#f60",2],["#fc0",3],["#ff9",4],["#9f9",5],["#6f6",6],["#3c3",7],["#0c0",8]],
};
function timerCell(v,type){
  const arr=TIMER_COLORS[type]||[];
  for(const [c,th] of arr){ if(v<=th) return `<span class="cell" style="background:${c}">${v}</span>`; }
  return `<span class="cell" style="background:#00a">${v}</span>`;
}
async function loadTimer(){
  $("timerLoad").textContent="加载中…";
  $("timerTbl").innerHTML="";
  try{
    const d = await getJSON(proxy(`https://www.7timer.info/bin/astro.php?lon=${APP.state.lng}&lat=${APP.state.lat}&ac=0&unit=metric&output=json&tzshift=8`));
    const init = d.init; const y=+init.slice(0,4), mo=+init.slice(4,6), da=+init.slice(6,8), hh=+init.slice(8,10);
    const start = new Date(y,mo-1,da,hh+8,0,0);
    const rows = d.dataseries.map(p=>{
      const t = new Date(start.getTime() + p.timepoint*3600e3);
      const hm = String(t.getHours()).padStart(2,"0")+":00";
      return `<tr><td>${(t.getMonth()+1)+"/"+t.getDate()}</td><td>${hm}</td><td>${timerCell(p.cloudcover,"cloudcover")}</td><td>${timerCell(p.transparency,"transparency")}</td><td>${timerCell(p.seeing,"seeing")}</td><td>${p.rh2m}%</td><td>${p.temp2m}°</td><td>${p.wind10m.direction}${p.wind10m.speed}</td><td>${p.prec_type==="none"?"-":p.prec_type}</td></tr>`;
    }).join("");
    $("timerTbl").innerHTML = `<thead><tr><th>日期</th><th>时间</th><th>☁云量</th><th>🔭透明度</th><th>👁视宁度</th><th>💧湿度</th><th>🌡温度</th><th>🌬风</th><th>降水</th></tr></thead><tbody>${rows}</tbody>`;
    $("timerLoad").textContent="";
  }catch(e){
    $("timerLoad").innerHTML = `<span class="err">7Timer 失败: ${esc(e.message)}</span>`;
  }
}

async function loadOpenMeteo(){
  $("omBox").innerHTML = `<div class="loading">加载中…</div>`;
  try{
    const d = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${APP.state.lat}&longitude=${APP.state.lng}&hourly=temperature_2m,precipitation_probability,cloud_cover,visibility&forecast_days=2&timezone=Asia%2FShanghai`);
    const times = d.hourly.time.slice(0,48);
    const rows = times.map((t,i)=>{
      const hm = t.slice(11,16);
      const temp = d.hourly.temperature_2m[i];
      const pop = d.hourly.precipitation_probability[i];
      const cc = d.hourly.cloud_cover[i];
      const ccC = cc<25?"#3ddc84":cc<60?"#ffd54f":cc<85?"#ffb020":"#ff5252";
      return `<tr><td>${t.slice(5,10)}</td><td>${hm}</td><td>${fmt(temp,0)}°</td><td>${pop==null?"-":pop+"%"}</td><td><span style="color:${ccC}">${cc==null?"-":cc+"%"}</span></td></tr>`;
    }).join("");
    $("omBox").innerHTML = `<div style="overflow-x:auto"><table class="om-table"><thead><tr><th>日期</th><th>时间</th><th>温度</th><th>降水概率</th><th>云量</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }catch(e){
    $("omBox").innerHTML = `<div class="err">Open-Meteo 失败: ${esc(e.message)}</div>`;
  }
}

async function loadMetno(){
  $("metnoBox").innerHTML = `<div class="loading">加载中…</div>`;
  try{
    const d = await getJSON(proxy(`https://nodeapi.knockdream.com/api/weather/metno?lat=${APP.state.lat}&lon=${APP.state.lng}&key=${APP.KEY}`));
    const elev = d.geometry.coordinates[2];
    const ts = d.properties.timeseries || [];
    const cur = ts[0]?.data?.instant?.details || {};
    const sym = ts[0]?.data?.next_1_hours?.summary?.symbol_code || ts[0]?.data?.next_6_hours?.summary?.symbol_code || "-";
    const next24 = ts.slice(1,25).map(x=>{
      const det = x.data?.instant?.details || {};
      return {t:x.time.slice(11,16), temp:det.air_temperature, cc:det.cloud_area_fraction, wind:det.wind_speed};
    });
    const rows = next24.map(x=>`<tr><td>${x.t}</td><td>${x.temp==null?"-":fmt(x.temp,0)+"°"}</td><td>${x.cc==null?"-":fmt(x.cc,0)+"%"}</td><td>${x.wind==null?"-":fmt(x.wind,1)+"m/s"}</td></tr>`).join("");
    $("metnoBox").innerHTML = `
      <div class="grid2">
        <div class="stat"><div class="k">海拔</div><div class="v">${fmt(elev,0)} m</div><div class="s">MetNo 数字高程模型</div></div>
        <div class="stat"><div class="k">当前天气符号</div><div class="v" style="font-size:15px">${esc(sym)}</div><div class="s">未来1-6h 概要</div></div>
        <div class="stat"><div class="k">温度 / 湿度</div><div class="v" style="font-size:15px">${fmt(cur.air_temperature,0)}° / ${fmt(cur.relative_humidity,0)}%</div><div class="s">当前时刻</div></div>
        <div class="stat"><div class="k">云量 / 风</div><div class="v" style="font-size:15px">${fmt(cur.cloud_area_fraction,0)}% / ${fmt(cur.wind_speed,1)}m/s</div><div class="s">低${fmt(cur.cloud_area_fraction_low,0)}% 中${fmt(cur.cloud_area_fraction_medium,0)}% 高${fmt(cur.cloud_area_fraction_high,0)}%</div></div>
      </div>
      <div style="font-size:11px;color:var(--dim);margin:8px 0 4px">未来24小时逐时:</div>
      <div style="overflow-x:auto"><table class="om-table"><thead><tr><th>时间</th><th>温度</th><th>云量</th><th>风速</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div style="font-size:10px;color:var(--dim);margin-top:6px">数据更新: ${esc(relTime(d.properties.meta.updated_at))}</div>`;
  }catch(e){
    $("metnoBox").innerHTML = `<div class="err">MetNo 失败: ${esc(e.message)}</div>`;
  }
}

async function load15days(){
  $("days15").innerHTML = `<div class="loading">加载中…</div>`;
  try{
    const d = await getJSON(proxy(`https://nodeapi.knockdream.com/api/weather/15days?lat=${APP.state.lat}&lon=${APP.state.lng}`));
    const rows = (d.list||[]).map(x=>{
      const dt = new Date(x.dt*1000);
      const w = x.weather && x.weather[0] ? x.weather[0].description : "-";
      const pop = x.pop!=null ? Math.round(x.pop*100)+"%" : "-";
      return `<tr><td>${(dt.getMonth()+1)+"/"+dt.getDate()}</td><td>${esc(w)}</td><td>${fmt(x.temp?.max,0)}°</td><td>${fmt(x.temp?.min,0)}°</td><td>${pop}</td><td>${x.clouds?.all!=null?x.clouds.all+"%":"-"}</td><td>${x.humidity!=null?x.humidity+"%":"-"}</td><td>${x.wind?.speed!=null?fmt(x.wind.speed,1)+"m/s":"-"}</td></tr>`;
    }).join("");
    $("days15").innerHTML = `<div style="overflow-x:auto"><table class="om-table"><thead><tr><th>日期</th><th>天气</th><th>最高</th><th>最低</th><th>降水概率</th><th>云量</th><th>湿度</th><th>风</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }catch(e){
    $("days15").innerHTML = `<div class="err">15天天气失败: ${esc(e.message)}</div>`;
  }
}

async function loadAQI(){
  $("aqiBox").innerHTML = `<div class="loading">加载中…</div>`;
  try{
    const d = await getJSON(proxy(`https://nodeapi.knockdream.com/api/air-quality?lat=${APP.state.lat}&lon=${APP.state.lng}`));
    const cur = d.current || {};
    const aqi = cur.aqi;
    const [txt,c] = aqiTxt(aqi);
    const iaqi = cur.iaqi || {};
    const parts = [["PM2.5",iaqi.pm25?.v],["PM10",iaqi.pm10?.v],["O₃",iaqi.o3?.v],["NO₂",iaqi.no2?.v],["SO₂",iaqi.so2?.v],["CO",iaqi.co?.v]].map(([k,v])=>`<div class="stat"><div class="k">${k}</div><div class="v" style="font-size:15px">${v==null?"-":fmt(v,0)}</div></div>`).join("");
    const fc = (d.forecast||[]).map(x=>`<tr><td>${String(x.day).slice(5)}</td><td>${fmt(x.avg,0)}</td><td>${fmt(x.min,0)}-${fmt(x.max,0)}</td></tr>`).join("");
    $("aqiBox").innerHTML = `
      <div class="aqi-big">
        <div><div class="aqi-num" style="color:${c}">${aqi==null?"-":aqi}</div><div style="font-size:12px;color:${c}">${txt}</div></div>
        <div style="flex:1;font-size:11px;color:var(--dim)">${esc(cur.city?.name||"")} · ${esc(relTime(cur.time?.s))}<br>数据源: WAQI (${esc((cur.attributions||[]).map(a=>a.name).join(" / ")||"")})</div>
      </div>
      <div class="grid2" style="margin-top:10px">${parts}</div>
      <div style="font-size:11px;color:var(--dim);margin:8px 0 4px">未来预报 (日均):</div>
      <div style="overflow-x:auto"><table class="om-table"><thead><tr><th>日期</th><th>平均</th><th>范围</th></tr></thead><tbody>${fc}</tbody></table></div>`;
  }catch(e){
    $("aqiBox").innerHTML = `<div class="err">空气质量失败: ${esc(e.message)}</div>`;
  }
}

APP.loadTimer = loadTimer;
APP.loadOpenMeteo = loadOpenMeteo;
APP.loadMetno = loadMetno;
APP.load15days = load15days;
APP.loadAQI = loadAQI;
