// ====== 光污染 ======
function bortle(mpsas){
  if(mpsas>=21.7) return ["Bortle 3","乡村星空",60];
  if(mpsas>=20.49) return ["Bortle 4","乡村/郊区过渡",45];
  if(mpsas>=19.5) return ["Bortle 5","郊区天空",30];
  if(mpsas>=18.94) return ["Bortle 6","明亮郊区",20];
  if(mpsas>=18.38) return ["Bortle 7","城郊",12];
  if(mpsas>=17.8) return ["Bortle 8","城市",6];
  return ["Bortle 9","市中心",2];
}
async function loadLP(){
  $("lpBox").innerHTML = `<div class="loading">加载中…</div>`;
  $("lpTrend").innerHTML = `<div class="loading">加载中…</div>`;
  try{
    const u = proxy(`https://nodeapi.knockdream.com/api/lightpollution/latest?lat=${APP.state.lat}&lon=${APP.state.lng}&key=${APP.KEY}`);
    const d = await getJSON(u);
    const [b,t,pct] = bortle(d.brightness.mpsas);
    $("lpBox").innerHTML = `<div class="lp-grid">
      <div class="lp-val"><b style="color:${scoreColor(pct*1.6)}">${b.replace("Bortle ","B")}</b><small>${b}</small></div>
      <div class="lp-val"><b>${fmt(d.brightness.mpsas,2)}</b><small>MPSAS(星等/平方角秒)</small></div>
      <div class="lp-val"><b>${fmt(d.brightness.ratio*100,0)}%</b><small>天空亮度比</small></div>
    </div>
    <div class="score-desc">${b} · ${pct}% 与理想暗空的差距 · ${esc(d.dataVersion)} · ${esc(relTime(d.timestamp))}</div>`;
    const all = await getJSON(proxy(`https://nodeapi.knockdream.com/api/lightpollution/all?lat=${APP.state.lat}&lon=${APP.state.lng}&key=${APP.KEY}`));
    const years = all.measurements || [];
    const rows = years.map(y=>{
      const c = y.brightness.mpsas>=21.7?"#3ddc84":y.brightness.mpsas>=20.49?"#ffd54f":y.brightness.mpsas>=19.5?"#ffb020":"#ff5252";
      return `<tr><td>${y.year}</td><td style="color:${c};font-weight:700">${fmt(y.brightness.mpsas,2)}</td><td>${fmt(y.brightness.ratio*100,0)}%</td></tr>`;
    }).join("");
    $("lpTrend").innerHTML = `<div style="overflow-x:auto"><table class="trend-table"><thead><tr><th>年份</th><th>MPSAS</th><th>亮度比</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }catch(e){
    $("lpBox").innerHTML = `<div class="err">光污染接口失败: ${esc(e.message)}</div>`;
    $("lpTrend").innerHTML = "";
  }
}

async function loadElevation(){
  $("elevBox").innerHTML = `<div class="loading">加载中…</div>`;
  const jobs = [
    ["Open-Elevation", `https://api.open-elevation.com/api/v1/lookup?locations=${APP.state.lat},${APP.state.lng}`,
      d=>d.results?.[0]?.elevation],
    ["OpenTopoData SRTM30", proxy(`https://api.opentopodata.org/v1/srtm30m?locations=${APP.state.lat},${APP.state.lng}`),
      d=>d.results?.[0]?.elevation],
  ];
  let html = "";
  for(const [name,url,f] of jobs){
    try{ const d = await getJSON(url); const v = f(d); html += `<div class="stat"><div class="k">${name}</div><div class="v">${v==null?"-":fmt(v,0)+" m"}</div></div>`; }
    catch(e){ html += `<div class="stat"><div class="k">${name}</div><div class="v" style="color:var(--bad)">-</div><div class="s">不可用</div></div>`; }
  }
  $("elevBox").innerHTML = `<div class="grid2">${html}</div><div style="font-size:11px;color:var(--dim);margin-top:6px">海拔影响温度/结露判断，可与 MetNo 页海拔交叉验证</div>`;
}
APP.loadLP = loadLP;
APP.loadElevation = loadElevation;
