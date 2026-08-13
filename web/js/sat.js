// ====== 卫星目录 / 星链 / 千帆 ======
async function loadOrbitSat(){
  $("orbitSat").innerHTML = `<div class="loading">加载中…</div>`;
  try{
    const d = await getJSON(proxy("https://orbit-cache.twtapp.com/public/v1/catalogs/visual"));
    const recs = d.records || [];
    const iss = recs.filter(r => /ISS|SPACE STATION/i.test(r.OBJECT_NAME||""));
    const rows = recs.slice(0, 12).map(r=>{
      const issMark = /ISS|SPACE STATION/i.test(r.OBJECT_NAME||"") ? " 🛰️" : "";
      return `<tr><td>${esc(r.OBJECT_NAME)}${issMark}</td><td>${r.NORAD_CAT_ID??"-"}</td><td>${r.INCLINATION==null?"-":fmt(r.INCLINATION,1)+"°"}</td><td>${r.MEAN_MOTION==null?"-":fmt(r.MEAN_MOTION,2)}</td></tr>`;
    }).join("");
    $("orbitSat").innerHTML = `
      <div class="grid2" style="margin-bottom:10px">
        <div class="stat"><div class="k">可见卫星目录</div><div class="v">${recs.length}</div><div class="s">CelesTrak visual 镜像</div></div>
        <div class="stat"><div class="k">ISS 国际空间站</div><div class="v">${iss.length? "✓ 在列" : "未收录"}</div><div class="s">${esc(d.source||"")} · ${esc(relTime(d.fetchedAt))}</div></div>
      </div>
      <div style="overflow-x:auto"><table class="trend-table"><thead><tr><th>名称</th><th>NORAD</th><th>倾角</th><th>周期(圈/日)</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div style="font-size:10px;color:var(--dim);margin-top:6px">仅前 12 条展示；完整 157 条 TLE 由 CelesTrak 镜像提供</div>`;
  }catch(e){
    $("orbitSat").innerHTML = `<div class="err">可见卫星目录失败: ${esc(e.message)}</div>`;
  }
}

async function loadStarlink(){
  $("starlink").innerHTML = `<div class="loading">加载中…</div>`;
  try{
    const r = await fetch(proxy("https://nodeapi.knockdream.com/api/starlink/tle?key="+APP.KEY));
    if(!r.ok) throw new Error("HTTP "+r.status);
    const txt = await r.text();
    const lines = txt.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    const groups = Math.floor(lines.length/3);   // 3 行一组: 名称 + TLE 两行
    const names = lines.filter((_,i)=>i%3===0).slice(0,10);
    const now = new Date();
    const epoch = lines[1] ? lines[1].slice(18,32) : "-";  // 第2行 18-32 是历元
    $("starlink").innerHTML = `
      <div class="grid2" style="margin-bottom:10px">
        <div class="stat"><div class="k">星链卫星 TLE</div><div class="v">${groups}</div><div class="s">nodeapi 网关</div></div>
        <div class="stat"><div class="k">历元</div><div class="v" style="font-size:15px">${esc(epoch)}</div><div class="s">2 行根数格式</div></div>
      </div>
      <div class="hlist">${names.map(n=>`<div class="hrow"><span class="st">🛰️</span><span class="nm">${esc(n)}</span></div>`).join("")}</div>
      <div style="font-size:10px;color:var(--dim);margin-top:6px">示例前 10 颗；完整 TLE 用于过境计算（来源 CelesTrak）</div>`;
  }catch(e){
    $("starlink").innerHTML = `<div class="err">星链 TLE 失败: ${esc(e.message)}</div>`;
  }
}

async function loadQianfan(){
  $("qianfan").innerHTML = `<div class="loading">加载中…</div>`;
  try{
    const d = await getJSON(proxy("https://nodeapi.knockdream.com/api/qianfan/satcat?key="+APP.KEY));
    const recs = d.records || [];
    const rows = recs.slice(0, 12).map(r=>`<tr><td>${esc(r.OBJECT_NAME)}</td><td>${r.NORAD_CAT_ID??"-"}</td><td>${r.INCLINATION==null?"-":fmt(r.INCLINATION,1)+"°"}</td><td>${r.PERIOD==null?"-":fmt(r.PERIOD,1)+"min"}</td><td>${r.APOGEE??"-"}/${r.PERIGEE??"-"} km</td></tr>`).join("");
    $("qianfan").innerHTML = `
      <div class="grid2" style="margin-bottom:10px">
        <div class="stat"><div class="k">千帆星座在轨</div><div class="v">${recs.length}</div><div class="s">更新 ${esc(relTime(new Date(d.updatedAt)))}</div></div>
        <div class="stat"><div class="k">轨道</div><div class="v" style="font-size:15px">~${recs[0]?.APOGEE??"-"} km LEO</div><div class="s">${esc(recs[0]?.OWNER||"")} · ${esc(recs[0]?.LAUNCH_SITE||"")}</div></div>
      </div>
      <div style="overflow-x:auto"><table class="trend-table"><thead><tr><th>名称</th><th>NORAD</th><th>倾角</th><th>周期</th><th>远/近地点</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }catch(e){
    $("qianfan").innerHTML = `<div class="err">千帆星座失败: ${esc(e.message)}</div>`;
  }
}
APP.loadOrbitSat = loadOrbitSat;
APP.loadStarlink = loadStarlink;
APP.loadQianfan = loadQianfan;
