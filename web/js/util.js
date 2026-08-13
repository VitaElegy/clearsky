// ====== 工具函数 ======
const $ = id => document.getElementById(id);
APP.$ = $;
function toast(m){ const t=$("toast"); t.textContent=m; t.style.display="block"; clearTimeout(t._h); t._h=setTimeout(()=>t.style.display="none",2600); }
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function fmt(n,d=1){ if(n==null||isNaN(n)) return "-"; return (Math.round(n*10**d)/10**d).toFixed(d); }
function scoreColor(s){ if(s>=80)return"#00e5ff"; if(s>=60)return"#3ddc84"; if(s>=40)return"#ffd54f"; if(s>=20)return"#ffb020"; return"#ff5252"; }
function scoreTxt(s){ if(s>=80)return"极佳"; if(s>=60)return"良好"; if(s>=40)return"一般"; if(s>=20)return"较差"; return"极差"; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
async function getJSON(url, timeoutMs){
  const ctrl = timeoutMs ? new AbortController() : null;
  if(ctrl) setTimeout(()=>ctrl.abort(), timeoutMs);
  try{
    const r = await fetch(url, {headers:{Accept:"application/json"}, signal: ctrl?ctrl.signal:undefined});
    if(!r.ok) throw new Error("HTTP "+r.status);
    return r.json();
  }finally{ if(ctrl) clearTimeout(ctrl); }
}
function proxy(url){ return "/proxy?url="+encodeURIComponent(url); }
function aqiTxt(a){ if(a<=50)return["优","#3ddc84"]; if(a<=100)return["良","#8bc34a"]; if(a<=150)return["轻度污染","#ffd54f"]; if(a<=200)return["中度污染","#ffb020"]; if(a<=300)return["重度污染","#ff5252"]; return["严重污染","#c62828"]; }
function relTime(iso){ const t=new Date(iso).getTime(); if(isNaN(t)) return iso||"-"; const d=Date.now()-t; if(d<60e3) return "刚刚"; if(d<3600e3) return Math.floor(d/60e3)+" 分钟前"; if(d<86400e3) return Math.floor(d/3600e3)+" 小时前"; return new Date(iso).toLocaleString("zh-CN"); }
