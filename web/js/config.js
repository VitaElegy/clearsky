// ====== 全局配置 ======
window.APP = window.APP || {};
const APP = window.APP;

APP.KEY = "clearsky_demo_2026";
APP.PRE = [
  {name:"威远穹窿·穹窿地貌", lat:29.5810, lng:104.5053},
  {name:"威远县严陵镇(出发地)", lat:29.5282, lng:104.6710},
  {name:"乐贤半岛(晴空区)", lat:29.5221, lng:105.0927},
  {name:"龙泉山城市森林公园", lat:30.5570, lng:104.4300},
  {name:"峨眉山金顶", lat:29.5210, lng:103.3360},
  {name:"泸沽湖(川)", lat:27.7000, lng:100.7900},
  {name:"稻城亚丁", lat:28.4400, lng:100.3300},
  {name:"重庆四面山", lat:28.5800, lng:106.3700},
  {name:"四姑娘山", lat:31.1100, lng:102.9000},
];
APP.state = {lat:29.5810, lng:104.5053, name:"威远穹窿", base:"cd", cloud:true, himawari:false};
APP.loaded = {};   // tab 是否已加载
