# ClearSky · 观星指数综合网页服务

面向天文观测的本地综合网页服务：ICON/IFS 数值预报评分、区域网格观星地图、极光卵实况、
卫星云图、APOD 每日天文图、天象/流星雨/彗星、光污染、太阳活动与健康检查。
纯 Python 标准库，零运行时依赖。

```bash
cd web
python3 server.py 8890
# 电脑打开:  http://localhost:8890
# 手机同WiFi: http://<电脑IP>:8890   (server 已绑定 0.0.0.0)
```

## 功能总览（全部实测可用）

| 模块 | 数据源 | 状态 |
|---|---|---|
| 观星指数 5晚逐小时 | ICON 数值预报 | ✅ 直连 |
| 多模型对比 ICON vs IFS | 两套数值预报 | ✅ 直连 |
| **观星指数地图 (区域网格扫描)** | 后端 `/api/scan` 并发扫 3×3~7×7 网格点, Leaflet 真实底图(CARTO暗色/高德矢量/高德卫星/ESRI) + 双线性插值(Bilinear)热力连续色面(边缘羽化) + Marching-squares 等值线(20/40/60/80) + 细采样点选点(可点容差) + 风云4B云图叠加 | ✅ 后端聚合 |
| 晴天钟 7天对照 | 7Timer astro.php | ✅ 代理 |
| 光污染 Bortle/MPSAS/历年 | DarkMap 2025 | ✅ 代理 |
| 卫星云图实况 | 国家卫星气象中心 风云4B | ✅ 直连 |
| 底图 | CARTO暗色 / 高德矢量 / 高德卫星 / ESRI (无key直连) | ✅ 直连 |
| 流星雨活跃/全年 | 内置流星雨星表 | ✅ 本地 |
| 天象事件 | 天文事件接口 | ✅ 代理 |
| 太阳活动 Kp/太阳风/极光/Bz | NOAA 上游聚合 | ✅ 代理 |
| 高德/Google/DarkMap/Windy 跳转 | URL 生成 | ✅ |

## 数据源

聚合的公开上游数据源（均可免费直连或经本地 `/proxy` 转发）：

- 数值预报: ICON / ECMWF IFS / Open-Meteo
- 晴天钟: 7Timer
- 太阳活动/极光: NOAA SWPC（Kp、太阳风、OVATION 极光卵、射电通量）
- 卫星云图: 国家卫星气象中心 NSMC 风云4B、向日葵8（阿里云镜像）
- 每日天文图: NASA APOD
- 天象/流星雨: 内置星表 + 天文事件接口
- 光污染: DarkMap
- 卫星目录: CelesTrak TLE 缓存

## 为什么多数据源对照

观星指数来自数值预报模型，预报之间存在不确定性（实测 ICON 评分 26 vs IFS 评分 48 的情况并不少见）。
页面同时给出 **晴天钟（另一套预报）+ 风云4B 卫星云图实况**，以实况为准，避免“预报翻车”。

## 观星指数算法（`clearsky/`）

基于公开 API 采样数据（2016 行，14 地点 × ICON/IFS × 3 天 × 24h）拟合的评分模型：

```
ICON:  base = 89.673 - 88.057*cloudIndex + 5.290*transparency + 5.111*seeing - 8.905*dewRisk
IFS :  base = 90.042 - 87.849*cloudIndex + 5.126*transparency + 4.666*seeing - 32.640*dewRisk
score = max(0, min(100, base))，但触发天气封顶时取离散值
```

- 离散天气封顶: 降水/雷暴 → 10；一般恶劣天气 → 25；雾/近饱和+低云 → ~55
- 整晚分 ≈ 同一天历日夜间小时 (20:00-24:00 + 00:00-05:00, 共10h) 分数的简单平均
- 泛化验证: 20 次随机“地点分组”（10 训练/4 测试），ICON 连续域 MAE≈0.38，±1 分内 93.4%
- 更科学的开源替代方案见 `notes/OPENSOURCE_RESEARCH.md`（DarkHours / pyastroweatherio / bot_astrosferum）

## 命令行工具

```bash
# 算法元数据 (系数/封顶/验证指标/开源引用)
python -m clearsky.cli info

# 单点预测 (威远穹窿今晚 20:00 ICON → 89.1)
python -m clearsky.cli predict -m icon -c 0.1043 -t 0.7866 -s 0.8711 -d 0

# 带天气封顶标记 (降水/雾)
python -m clearsky.cli predict -m ifs -c 0.3 -t 0.6 -s 0.7 -d 0.3 --fog

# 复现测试 (20 次地点分组交叉验证)
python -m clearsky.cli test

# CSV 批量预测 (列: model,cloudIndex,transparency,seeing,dewRisk[,precipitation,fog])
python -m clearsky.cli batch -i in.csv -o out.csv

# URL 健康检查 (运行前连通性/延迟探测)
python -m clearsky.cli check --group core --json
```

## Python API

```python
from clearsky import predict_score, explain
predict_score("icon", 0.1043, 0.7866, 0.8711, 0.0)   # 89.1
explain("icon", 0.1043, 0.7866, 0.8711, 0.0)         # ScoreResult(score=89.1, ...)

from clearsky import check_all, check_url, get_urls
rep = check_all(group="core")          # 只查关键链路
print(rep.summary())                   # {total, ok, fail, critical_fail, elapsed_s, avg_total_ms}
```

## 健康检查

**Web 启动前自动检查**（默认开启）:
```bash
python web/server.py                         # 启动前自动全量健康检查(约10-15s)+延迟TOP5, 失败不阻塞
python web/server.py --no-check              # 跳过检查直接启动
python web/server.py --check-exit            # 关键服务失败则中止启动
python web/server.py --check-group core      # 只查核心分组
```

**Web 页内健康检查**: 「🩺 健康」Tab 调用 `/api/health`，展示全部数据源状态 + 连接/TTFB/总延迟，
顶部状态点实时反映关键服务是否正常; 每 15 分钟自动复查。`web/server.py` 使用 **ThreadingTCPServer 多线程**处理请求，
全量健康检查(约 6-15s)期间静态页/天气/卫星等其他请求完全不受阻塞。

**URL 注册表**: `clearsky/urls.py` 维护 34 个端点 (6 组: core/nodeapi/weather/satellite/maps/misc)，
默认坐标=威远穹窿 (29.58,104.50)，可用 `build_urls(coords={...})` 换成任意观测地重建。
检查指标: 连接(含 TLS) / TTFB / 总耗时, 自动跟随重定向, 只读响应前 2KB 避免下载大图。

## 文件地图

| 文件 | 作用 |
|---|---|
| `clearsky/scoring.py` | 评分算法核心 (predict_score / explain / COEFFICIENTS) |
| `clearsky/__init__.py` | 包导出 (from clearsky import predict_score) |
| `clearsky/algorithm.json` | **机器可读算法元数据** (系数/封顶/指标/引用) |
| `clearsky/cli.py` | 命令行入口 (info/predict/test/batch/check) + `clearsky` 入口点 |
| `clearsky/urls.py` | **URL 注册表** (34 端点/6 组/关键性标记/默认坐标) |
| `clearsky/healthcheck.py` | **URL 健康检查** (连通+连接/TTFB/总延迟, 并发, 报告) |
| `clearsky/test_healthcheck.py` | healthcheck 离线单元测试 (本地 mock HTTP) |
| `web/index.html` + `web/js/*` | 综合网页 (10 Tab: 观星/**指数地图**/天气/光害/云图/极光/天象/卫星/健康/关于) |
| `web/css/app.css` | 网页深色主题样式 |
| `web/server.py` | 本地服务: 启动前健康检查 + 静态页 + `/api/*` + `/proxy` 代理 |
| `clearsky/test_scoring.py` | 复现测试 (20 次地点分组交叉验证) |
| `clearsky/data/sample_dataset.csv` | 2016 行真实 API 采样 (训练/验证数据) |
| `clearsky/data/nightly_probe.json` | 整晚分聚合探针 |
| `notes/OPENSOURCE_RESEARCH.md` | 开源算法调研报告 |
| `upstream/fetch_pinned.sh` | 一键克隆/还原 4 个固定 commit 的开源项目 |
| `upstream/` | 已并入的开源实现 (chromasky-backend/toolkit、pyastroweatherio) |
| `pyproject.toml` | 第三方库构建配置 (wheel/entry point/元数据) |

## 安装为第三方库

```bash
pip install -e .
clearsky info          # 命令行入口
python -c "from clearsky import predict_score; print(predict_score('icon',0.1043,0.7866,0.8711,0))"  # 89.1
```

## 注意

- 观星指数=预报，请结合晴天钟+卫星云图实况判断
- 公开演示密钥仅用于低频率个人/学习调用，请勿高频调用或商用
