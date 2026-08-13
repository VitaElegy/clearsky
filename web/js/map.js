// ====== 地图 / 卫星云图 ======
let map=null, cloudLayer=null, himawariLayer=null, marker=null;
function tileTemplate(base){
  // 注: 腾讯 rt.map.gtimg.com 瓦片已实测返回纯色占位图(无内容), 故弃用
  if(base==="tx") return {url:"https://rt{s}.map.gtimg.com/tile?z={z}&x={x}&y={y}&styleid=1", sub:"0123"};
  if(base==="cd") return {url:"https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", sub:"abcd", maxZoom:19};
  // 注: 天地图 DataServer 瓦片在 Chrome 被 ORB 拦截(无CORS头), 已弃用
  if(base==="gv") return {url:"https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}", sub:"1234", maxZoom:18};
  if(base==="gd") return {url:"https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}", sub:"1234", maxZoom:18};
}
function initMap(){
  if(map) return;
  map = L.map("map",{zoomControl:true, attributionControl:false}).setView([APP.state.lat,APP.state.lng],11);
  map.createPane("cloud").style.zIndex = 450;
  refreshBase();
  const mi = L.icon({iconUrl:"vendor/marker-icon.png", shadowUrl:"vendor/marker-shadow.png", iconSize:[25,41], iconAnchor:[12,41], shadowSize:[41,41]});
  marker = L.marker([APP.state.lat,APP.state.lng],{draggable:true, icon:mi}).addTo(map);
  marker.on("dragend",e=>{ const p=e.target.getLatLng(); APP.state.lat=+p.lat.toFixed(4); APP.state.lng=+p.lng.toFixed(4); APP.onLocChanged(); });
  map.on("click",e=>{ APP.state.lat=+e.latlng.lat.toFixed(4); APP.state.lng=+e.latlng.lng.toFixed(4); marker.setLatLng([APP.state.lat,APP.state.lng]); APP.onLocChanged(); });
}
function refreshBase(){
  if(!map) return;
  map.eachLayer(l=>{ if(l instanceof L.TileLayer && l!==cloudLayer && l!==himawariLayer) map.removeLayer(l); });
  const t = tileTemplate(APP.state.base);
  L.tileLayer(t.url,{tileSize:256,subdomains:t.sub,maxZoom:18}).addTo(map);
  if(APP.state.cloud) addCloud();
  if(APP.state.himawari) addHimawari();
}
function setBase(b){ APP.state.base=b; refreshBase(); }
function toggleCloud(){ APP.state.cloud=!APP.state.cloud; $("cloudBtn").textContent="风云4B: "+(APP.state.cloud?"开":"关"); if(APP.state.cloud) addCloud(); else if(cloudLayer){ map.removeLayer(cloudLayer); cloudLayer=null; } }
function toggleHimawari(){ APP.state.himawari=!APP.state.himawari; $("himawariBtn").textContent="向日葵8: "+(APP.state.himawari?"开":"关"); if(APP.state.himawari) addHimawari(); else if(himawariLayer){ map.removeLayer(himawariLayer); himawariLayer=null; } }
function addCloud(){
  if(!map) return;
  if(cloudLayer) map.removeLayer(cloudLayer);
  const B = L.latLngBounds([53.5,75.0],[3.0,137.0]);
  const url = "https://img.nsmc.org.cn/CLOUDIMAGE/FY4B/AGRI/GCLR/FY4B_REGC_GCLR.JPG?_="+Date.now();
  cloudLayer = L.imageOverlay(url, B, {opacity:0.55, pane:"cloud", interactive:false}).addTo(map);
  $("cloudInfo").textContent = "风云4B 中国区红外云图 · "+new Date().toLocaleTimeString("zh-CN",{hour12:false})+" 加载 (近似投影, 仅供参考) · 每10分钟更新";
}
function addHimawari(){
  if(!map) return;
  if(himawariLayer) map.removeLayer(himawariLayer);
  // 向日葵8 全盘图覆盖西太平洋区域(近似)
  const B = L.latLngBounds([60.0,90.0],[-60.0,190.0]);
  const url = "https://astronomy-service.oss-cn-shanghai.aliyuncs.com/weather/himawari8_thumbnail.jpg?_="+Date.now();
  himawariLayer = L.imageOverlay(url, B, {opacity:0.5, pane:"cloud", interactive:false}).addTo(map);
  $("cloudInfo").textContent = "向日葵8 全盘云图(阿里云镜像) · "+new Date().toLocaleTimeString("zh-CN",{hour12:false})+" (近似投影, 仅供参考)";
}
function recenter(){ if(map) map.setView([APP.state.lat,APP.state.lng],11); }
APP.initMap = initMap; APP.refreshBase = refreshBase; APP.setBase = setBase;
APP.toggleCloud = toggleCloud; APP.toggleHimawari = toggleHimawari; APP.recenter = recenter;
