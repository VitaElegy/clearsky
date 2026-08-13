// ====== 数据源健康检查 (后端 /api/health, clearsky.healthcheck) ======
async function loadHealth(){
  $("healthSummary").innerHTML = `<div class="loading">检查中…（并发探测全部数据源，约 3-15 秒）</div>`;
  $("healthTable").innerHTML = "";
  const group = $("healthGroup") ? $("healthGroup").value : "all";
  try{
    const d = await getJSON("/api/health?group="+encodeURIComponent(group)+"&timeout=8");
    if(d.error) throw new Error(d.error);
    const s = d.summary || {};
    const dot = $("healthDot");
    if(dot){
      dot.className = "health-dot " + (s.critical_fail>0 ? "bad" : (s.fail>0 ? "warn" : "ok"));
      dot.title = `关键 ${s.critical_fail} 异常 / 共失败 ${s.fail} · 平均 ${s.avg_total_ms}ms`;
    }
    $("healthSummary").innerHTML = `
      <div class="grid2" style="margin-bottom:10px">
        <div class="stat"><div class="k">可用 / 总数</div><div class="v" style="color:${s.fail?"var(--warn)":"var(--ok)"}">${s.ok} / ${s.total}</div><div class="s">失败 ${s.fail} · 关键失败 ${s.critical_fail}</div></div>
        <div class="stat"><div class="k">耗时</div><div class="v" style="font-size:15px">${s.elapsed_s??"-"} s</div><div class="s">平均延迟 ${s.avg_total_ms??"-"} ms/请求</div></div>
      </div>`;
    const rows = (d.results||[]).map(r=>{
      const ms = r.total_ms!=null ? r.total_ms.toFixed(0)+"ms" : "-";
      const cls = r.ok ? "" : "fail";
      const st = r.ok ? (r.status ? r.status : "✓") : "✗";
      const stColor = r.ok ? "var(--ok)" : "var(--bad)";
      const err = r.error ? `<div class="err">${esc(r.error)}</div>` : "";
      return `<div class="hrow ${cls}">
        <span class="st" style="color:${stColor}">${st}</span>
        <span class="grp">${esc(r.group||"")}</span>
        <span class="nm" title="${esc(r.url||"")}">${esc(r.name||r.id||"")}</span>
        <span class="ms" title="连接 ${r.connect_ms??"-"}ms / TTFB ${r.ttfb_ms??"-"}ms">${r.ok? ms : ""}</span>
        ${err}
      </div>`;
    }).join("");
    $("healthTable").innerHTML = rows || `<div class="loading">无结果</div>`;
    toast(`健康检查完成: ${s.ok}/${s.total} 可用，平均 ${s.avg_total_ms}ms`);
  }catch(e){
    $("healthSummary").innerHTML = `<div class="err">健康检查失败: ${esc(e.message)}（请确认后端已安装 clearsky 库并启动 server.py）</div>`;
    const dot = $("healthDot"); if(dot){ dot.className="health-dot bad"; dot.title="健康检查不可用"; }
  }
}
APP.loadHealth = loadHealth;
