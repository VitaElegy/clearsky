// ====== 关于 / 导航链接 / 算法结论 ======
function updateLinks(){
  const {lat,lng}=APP.state, n=encodeURIComponent(APP.state.name||(lat+","+lng));
  const a=$("linkAmap"); if(a) a.href = `https://uri.amap.com/navigation?to=${lng},${lat},${n}&mode=car&coordinate=gaode&callnative=1`;
  const g=$("linkGoogle"); if(g) g.href = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  const d=$("linkDarkmap"); if(d) d.href = `https://www.darkmap.cn/?app=true&longitude=${lng}&latitude=${lat}`;
  const w=$("linkWindy"); if(w) w.href = `https://www.windy.com/${lat}/${lng}?clouds,${lat},${lng},8`;
}

const MODULES = [
  ["观星指数", "ICON/IFS 数值预报 · 逐小时+整晚分", "直连"],
  ["晴天钟 7天", "7Timer astro.php", "代理"],
  ["Open-Meteo / MetNo", "开放预报 + 数字高程", "直连/代理"],
  ["15天天气 / 空气质量", "OpenWeatherMap / WAQI (nodeapi)", "代理"],
  ["光污染", "DarkMap 2025 · MPSAS/Bortle/历年", "代理"],
  ["卫星云图实况", "风云4B (NSMC) / 向日葵8 (阿里云镜像)", "直连"],
  ["太阳活动 / 极光", "NOAA SWPC (nodeapi)", "代理"],
  ["天象 / 流星雨 / 彗星", "nodeapi + 内置 38 流星雨星表", "代理/本地"],
  ["卫星目录", "orbit-cache (CelesTrak 镜像) / Starlink / 千帆", "代理"],
  ["底图 / 导航", "腾讯 / 高德 / 天地图 / DarkMap / Windy", "直连/跳转"],
  ["健康检查", "clearsky.healthcheck · 30+ URL 连通性+延迟", "本地"],
];

function modulesHtml(){
  return `<div class="hlist">${MODULES.map(([k,v,s])=>`<div class="hrow"><span class="nm"><b>${esc(k)}</b><br><span style="font-size:10px;color:var(--dim)">${esc(v)}</span></span><span class="ms">${esc(s)}</span></div>`).join("")}</div>`;
}

function openSrcHtml(list){
  return (list||[]).map(o=>`<div class="kv"><span class="k"><a href="${esc(o.url)}" target="_blank" style="color:var(--blue)">${esc(o.name)}</a></span><span>${esc(o.note||"")}</span></div>`).join("");
}

async function loadAbout(){
  // 导航链接
  updateLinks();
  // 算法结论
  $("aboutAlgo").innerHTML = `<div class="loading">加载中…</div>`;
  try{
    const m = await getJSON("/api/info");
    const alg = m.algorithm||{};
    const icon = m.models?.icon||{}, ifs = m.models?.ifs||{};
    const caps = (m.caps||[]).map(c=>`<div class="kv"><span class="k">${esc(c.label)}</span><span>${esc(c.trigger||"")}</span></div>`).join("");
    const val = m.validation?.results||{};
    const ic = val.icon?.continuous_domain||{}, iff = val.ifs?.continuous_domain||{};
    $("aboutAlgo").innerHTML = `
      <div class="kv"><span class="k">来源</span><span>${esc(alg.source||"")}</span></div>
      <div class="kv"><span class="k">方法</span><span>${esc(alg.method||"")} · ${esc(alg.version||"")}</span></div>
      <div class="kv"><span class="k">ICON 公式</span><span>89.673 − 88.057·云 + 5.290·透 + 5.111·视 − 8.905·结露</span></div>
      <div class="kv"><span class="k">IFS 公式</span><span>90.042 − 87.849·云 + 5.126·透 + 4.666·视 − 32.640·结露</span></div>
      <div class="kv"><span class="k">天气封顶</span><span>${esc((m.caps||[]).map(c=>c.value+"="+c.label).join(" / "))}</span></div>
      ${caps}
      <div class="kv"><span class="k">验证 ICON</span><span>R² ${esc(ic.r2||"-")} · MAE ${esc(ic.mae||"-")} · ±1分 ${esc(ic.within1||"-")}</span></div>
      <div class="kv"><span class="k">验证 IFS</span><span>R² ${esc(iff.r2||"-")} · MAE ${esc(iff.mae||"-")} · ±1分 ${esc(iff.within1||"-")}</span></div>
      <div class="kv"><span class="k">整晚分</span><span>${esc((m.nightly_aggregation||{}).rule||"")}</span></div>
      <div style="margin-top:6px;color:var(--dim)">${esc(alg.name||"")}</div>`;
  }catch(e){
    $("aboutAlgo").innerHTML = `<div class="err">算法结论加载失败: ${esc(e.message)}</div>`;
  }
  // 开源调研
  $("aboutOpen").innerHTML = `<div class="loading">加载中…</div>`;
  try{
    const m = await getJSON("/api/info");
    $("aboutOpen").innerHTML = openSrcHtml(m.open_source_references) +
      `<div style="margin-top:6px;font-size:11px;color:var(--dim)">结论: ICON 连续段拟合 MAE≈0.4 已完全可用；更科学的替代见 DarkHours / pyastroweatherio</div>`;
  }catch(e){
    $("aboutOpen").innerHTML = `<div class="err">开源调研加载失败: ${esc(e.message)}</div>`;
  }
  // 模块
  $("aboutModules").innerHTML = modulesHtml();
}
APP.updateLinks = updateLinks;
APP.loadAbout = loadAbout;


// ====== NASA 每日天文图 (nodeapi /api/apod, 含中文标题/说明) ======
async function loadApod(){
  const box = $("apodBox");
  box.innerHTML = `<div class="loading">加载中…</div>`;
  try{
    const d = await getJSON(proxy("https://nodeapi.knockdream.com/api/apod"));
    const it = (d.data||[])[0];
    if(!it) throw new Error("无数据");
    const host = it.ossHostname || "https://astronomy-service.oss-cn-shanghai.aliyuncs.com";
    const imgUrl = host + "/" + (it.detailOssUrl||"");
    const img = new Image();
    img.style.cssText = "width:100%;max-width:760px;border-radius:8px;background:#0a1120";
    img.alt = it.title_CN || it.title || "APOD";
    await new Promise((ok,no)=>{ img.onload=ok; img.onerror=()=>no(new Error("图片加载失败")); img.src=imgUrl; });
    box.innerHTML = "";
    box.appendChild(img);
    box.insertAdjacentHTML("beforeend", `
      <div style="margin-top:8px"><b>${esc(it.title_CN||it.title||"")}</b> <span style="font-size:10px;color:var(--dim)">${esc(it.date||"")} · © ${esc(it.copyright||"NASA")}</span></div>
      <div style="font-size:12px;color:var(--dim);margin-top:6px">${esc((it.explanation_CN||it.explanation||"").slice(0,420))}${((it.explanation_CN||it.explanation||"").length>420)?"…":""}</div>
      <div style="font-size:10px;color:var(--dim);margin-top:4px"><a href="${esc(host+"/"+(it.originalOssUrl||""))}" target="_blank" style="color:var(--blue)">查看原图</a></div>`);
  }catch(e){
    box.innerHTML = `<div class="err">每日天文图加载失败: ${esc(e.message)}</div>`;
  }
}
APP.loadApod = loadApod;
