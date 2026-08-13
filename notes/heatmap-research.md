# 热力图渲染方式深度调研（2026-08-14）

## 背景问题
观星指数地图原实现：25~49 个网格采样点用 `L.circleMarker` 画成 **r=9~13 的大实心圆 + 深色描边**，覆盖在底图上非常突兀；热力面用 IDW 反距离加权 + 线性衰减，低分辨率下看起来像一层纯色蒙版，空间差异不明显。

## 主流热力图是怎么做的

### 1. 点密度型热力（simpleheat / Leaflet.heat）——不适用
- [mourner/simpleheat](https://github.com/mourner/simpleheat)：每点画一个预生成模糊圆 sprite，`globalAlpha = intensity/max`，回读灰度后用 256×1 LUT 渐变映射成彩图。
- [Leaflet/Leaflet.heat](https://github.com/Leaflet/Leaflet.heat)：simpleheat 的封装，加网格聚类降采样、`radius/blur/gradient/minOpacity/maxZoom`、缩放动画。
- **结论**：这类算法表达的是"点密度/兴趣分布"，本质是模糊圆叠加。我们的数据是**规则网格上的标量值场**（云量/观星指数），用它会出现斑块感，不是正确模型。

### 2. 标量场栅格（气象/光污染图）——正确方向
- **Windy / Ventusky**（社区官方答复）：标量场（云量、温度等）用**双线性插值 (bilinear interpolation)**，在规则模型网格上逐像素插值，WebGL shader 上屏；等值线用 marching squares/iso-lines。
- **Light Pollution Map / DarkSky**：预渲染 GeoTIFF 栅格瓦片（zenith radiance），按需取瓦片平滑上色——适合静态大数据，不适合我们每次动态扫描。
- **OpenLayers/Leaflet 通用做法**：把插值后的栅格画到离屏 canvas/WebGL，再叠加细小的采样点（仅做定位/交互），而不是让点本身承担全部视觉。
- **Kriging.js**：克里金插值在学术上更准，但对规则网格是杀鸡用牛刀，且不稳定、慢。

### 3. 专业图层的通用视觉规律（调研多家实现后的总结）
| 要素 | 业余做法（我们之前的） | 专业做法 |
| --- | --- | --- |
| 色面 | IDW 线性衰减，低 res | 规则网格双线性插值 + 高斯/盒式平滑，res 240+ |
| 采样点 | 大实心圆 + 深描边 | 小圆点（r 3~5）+ 浅描边/无描边，仅作定位；点击命中靠 renderer tolerance 扩大 |
| 选中态 | 改所有点描边 | 独立高亮环（白圈/虚线），不干扰其它点 |
| 等值线 | 无 | marching squares 画 iso-lines（气象图标配） |
| 图例 | 色点列表 | 连续渐变条 + 分档标签 |

## 本项目落地方案
1. **双线性插值**：`/api/scan` 返回的就是规则网格（lat/lng 等差），逐像素在 lat/lng 空间双线性插值，O(1)/像素，无牛眼圈。
2. **平滑**：低 res 离屏 + 盒式模糊 + 拉伸上屏。
3. **细点**：r≈4、白色 1px 描边、`L.canvas({tolerance:12})` 扩大点击区。
4. **选中环**：独立白圈 marker，不动其它点样式。
5. **等值线**：marching squares，阈值 20/40/60/80，白色半透明线。
6. **图例**：渐变条。

## 参考源码（已抓取）
- `https://raw.githubusercontent.com/mourner/simpleheat/master/simpleheat.js`
- `https://raw.githubusercontent.com/Leaflet/Leaflet.heat/master/dist/leaflet-heat.js`
- Windy/Ventusky 官方论坛答复（bilinear + WebGL shader）
- 光污染图实现：预渲染 GeoTIFF 栅格瓦片（R + Leaflet 示例 cgettings/Light-Pollution-Map）
