// ====== 观星指数 ======
async function loadScore(){
  $("scoreBig").innerHTML = `<div class="loading">加载中…</div>`;
  $("hours").innerHTML = "";
  $("models").innerHTML = `<div class="loading">加载中…</div>`;
  $("repApi").textContent = "-"; $("repLocal").textContent = "-"; $("repDiff").textContent = "-";
  $("repDetail").textContent = "加载中…";
  try{
    const u = `https://stargazing.twtapp.com/api/v1/stargazing/nightly/hourly/range?lat=${APP.state.lat}&lng=${APP.state.lng}&key=${APP.KEY}`;
    const d = await getJSON(u);
    if(!d.days || !d.days.length) throw new Error("空响应");
    // 今晚平均 (20:00-次日, 后端已排好)
    const today = d.days[0];
    const avg = today.hourly.reduce((a,h)=>a+h.score,0)/today.hourly.length;
    const h0 = today.hourly[0] || {};
    $("scoreBig").innerHTML = `<div class="score-big"><b style="color:${scoreColor(avg)}">${fmt(avg,0)}</b><span>/100 · ${scoreTxt(avg)} · ${today.date} 夜</span></div>
    <div class="score-desc">云量 ${fmt(h0.cloudIndex*100,0)}% · 透明度 ${fmt(h0.transparency*100,0)}% · 视宁度 ${fmt(h0.seeing*100,0)}% · 结露风险 ${fmt(h0.dewRisk*100,0)}% · ${today.hourly.length} 小时</div>`;
    // 逐小时条
    let html="";
    for(const day of d.days){
      for(const h of day.hourly){
        html += `<div class="hour"><div class="t">${esc(h.hourLabel)}</div><div class="s" style="background:${scoreColor(h.score)}">${fmt(h.score,0)}</div><div class="m">${String(day.date).slice(5)}</div></div>`;
      }
    }
    $("hours").innerHTML = html;
    // 本地实现对照: 用 API 首小时字段调后端 clearsky
    APP.loadReplica(h0, avg);
  }catch(e){
    $("scoreBig").innerHTML = `<div class="err">观星指数接口失败: ${esc(e.message)}</div>`;
  }
  try{
    const m = await getJSON(`https://stargazing.twtapp.com/api/v1/stargazing/nightly/point/range/all?lat=${APP.state.lat}&lng=${APP.state.lng}&key=${APP.KEY}`);
    let mh="";
    for(const [mk,md] of Object.entries(m.models||{})){
      const label = mk==="icon" ? "ICON (德国 ICON)" : "IFS (ECMWF)";
      mh += `<div class="model"><h3>${label}</h3>` + (md.days||[]).map(dd=>{
        const c=scoreColor(dd.score);
        return `<div class="row"><span class="d">${String(dd.date).slice(5)}</span><span class="mini"><i style="width:${clamp(dd.score,0,100)}%;background:${c}"></i></span><span class="v" style="color:${c}">${fmt(dd.score,0)}</span></div>`;
      }).join("") + `</div>`;
    }
    $("models").innerHTML = mh || `<div class="loading">无模型数据</div>`;
  }catch(e){
    $("models").innerHTML = `<div class="err">模型对比失败: ${esc(e.message)}</div>`;
  }
}

// 本地实现算法对照 (后端 /api/predict, 基于 clearsky 库)
async function loadReplica(h, apiAvg){
  try{
    const q = new URLSearchParams({model:"icon", cloud:h.cloudIndex, trans:h.transparency, seeing:h.seeing, dew:h.dewRisk});
    const d = await getJSON("/api/predict?"+q);
    if(d.error) throw new Error(d.error);
    const api = apiAvg!=null ? apiAvg : h.score;
    const diff = d.score - api;
    $("repApi").textContent = fmt(api,1);
    $("repLocal").textContent = fmt(d.score,1);
    $("repDiff").textContent = (diff>=0?"+":"")+fmt(diff,1);
    $("repDiff").style.color = Math.abs(diff)<1 ? "var(--ok)" : "var(--warn)";
    $("repDetail").innerHTML =
      `对比 ${esc(h.hourLabel||"")} · 云量${fmt(h.cloudIndex*100,0)}% 透明度${fmt(h.transparency*100,0)}% 视宁度${fmt(h.seeing*100,0)}% 结露${fmt(h.dewRisk*100,0)}%` +
      (d.capped ? ` · <span style="color:var(--warn)">天气封顶触发: ${esc(d.reasons.join(", ")||"未知")} → ${fmt(d.score,0)}</span>` : " · 无天气封顶") +
      `<br><span style="font-size:10px;color:var(--dim)">实现公式(ICON 连续段 MAE≈0.38, ±1分内 93.4%)：89.673 − 88.057·云量 + 5.290·透明度 + 5.111·视宁度 − 8.905·结露</span>`;
  }catch(e){
    $("repDetail").innerHTML = `<span class="err">实现对照不可用: ${esc(e.message)}</span>`;
  }
}
APP.loadScore = loadScore;
APP.loadReplica = loadReplica;
