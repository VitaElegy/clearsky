# ClearSky (ClearSky) 建模分析 + 实现

工作区: `/Users/elegy/clearsky/`
- `apk/`         原始 App (3.4.0, 100.65MB) 与解包内容
- `apktool/out/` AndroidManifest 等资源解码结果
- `notes/API.md` **完整接口建模分析报告**（已实测验证）
- `notes/libapp.strings.txt` 全部 Dart 字符串
- `web/`         实现版网页（可直接运行）

## 一键运行实现版
```bash
cd /Users/elegy/clearsky/web
python3 server.py 8890
# 电脑打开:  http://localhost:8890
# 手机同WiFi: http://<电脑IP>:8890   (server 已绑定 0.0.0.0)
```

## 实现版功能（全部实测可用）
| 模块 | 数据源 | 状态 |
|---|---|---|
| 观星指数 5晚逐小时 | ClearSky stargazing.twtapp.com (ICON模型) | ✅ 直连 |
| 多模型对比 ICON vs IFS | ClearSky接口 | ✅ 直连 |
| 晴天钟 7天对照 | 7Timer astro.php (ClearSky上游) | ✅ 代理 |
| 光污染 Bortle/MPSAS/历年 | ClearSky nodeapi (DarkMap 2025) | ✅ 代理 |
| 卫星云图实况 | 国家卫星气象中心 风云4B | ✅ 直连 |
| 底图 | 腾讯矢量 / 高德卫星 (无key) | ✅ 直连 |
| 流星雨活跃/全年 | 内置 all_meteor.json (App资产) | ✅ 本地 |
| 天象事件 | ClearSky /api/astro/events | ✅ 代理 |
| 太阳活动 Kp/太阳风/极光/Bz | ClearSky nodeapi (NOAA上游) | ✅ 代理 |
| 高德/Google/DarkMap/Windy 跳转 | URL 生成 | ✅ |

## 为什么双数据源
ClearSky观星指数是 **ICON/IFS 数值预报模型**，今晚实测威远穹窿：
- ICON 评分 26 vs IFS 评分 48 → 模型打架，预报不可全信
- 页面同时给 **7Timer 晴天钟（同样预报但另一套）+ 风云4B 卫星云图实况**
- 卫星实况云量 100% 时，ICON 说 76% —— 以实况为准，这是你之前踩过的坑

## 建模核心发现（详见 notes/API.md）
1. App = Flutter 壳，核心逻辑在 `app_core.bin`，Rust 库 `native_core.bin`
2. 自建后端三件套:
   - `stargazing.twtapp.com` 观星指数 (FastAPI, **CORS开放**, 浏览器可直连)
   - `nodeapi.knockdream.com` 光污染/天象/太阳活动/流星/卫星 (带 Origin 校验, 需代理)
   - `meteo.twtapp.com` / `astrometry.twtapp.com` / `orbit-cache.twtapp.com`
3. 公开硬编码密钥: `clearsky_demo_2026`(观星指数) / `darkmap_public_read`(光害瓦片) / 天地图 tk
4. 上游开放数据: 7Timer / Open-Meteo / NOAA SWPC / NASA DONKI / CelesTrak / NSMC 风云 / 天地图 / DarkMap
5. 内置资产: 38个流星雨星表、星空识别模型、相机库、晴天钟图标

## 注意
- 密钥为 App 内公开硬编码，仅用于学习实现，请勿高频率调用或商用
- nodeapi 带 Origin 会被 500，页面走本地代理规避
- 观星指数=预报，请结合晴天钟+卫星云图实况判断

---

# 观星指数算法实现 + 开源算法调研 (2026-08-13)

## 一、建模出的算法: ClearSky观星指数 = 连续线性基础分 + 离散天气封顶

### 1. 逐小时评分公式 (stargazing.twtapp.com, FastAPI)
```
ICON:  base = 89.673 - 88.057*cloudIndex + 5.290*transparency + 5.111*seeing - 8.905*dewRisk
IFS :  base = 90.042 - 87.849*cloudIndex + 5.126*transparency + 4.666*seeing - 32.640*dewRisk
score = max(0, min(100, base))，但触发天气封顶时取离散值
```
- 实现: `clearsky/scoring.py` (`predict_score` / `explain`)
- 数据: `clearsky/data/sample_dataset.csv` (2016 行, 14 地点 × 2 模型 × 3 天 × 24h, 真实 API 采样)

### 2. 离散天气封顶 (API 只暴露 4 字段, 无法 100% 反推触发条件)
| 封顶值 | 含义 | 证据 |
|---|---|---|
| 10.0 | 降水/雷暴/暴风雨 | 昆明 IFS 大量 10.0, 7Timer 证实 prec=rain |
| 25.0 | 一般恶劣天气(降水/湿气) | 威远 IFS 三小时块 25.0 且 cloudIndex 仅 0.2-0.4, Open-Meteo 证实附近 0.1mm 降水 |
| ~55 | 雾/100%湿度+低云 | 哈尔滨 ICON: cloud≈0 但 RH=100%, score≈54.8-59.2 |
- App 字符串明确: "check cloud, **moonlight, precipitation, wind, and condensation risk**" — 月光/风/降水未在 API 暴露, 故封顶只能部分实现

### 3. 整晚分聚合 (新确认)
**整晚分 ≈ 同一天历日夜间小时 (20:00-24:00 + 00:00-05:00, 共10h) 分数的简单平均**
- 12 组实测: 平均绝对差 0.69, 最大 1.85 (数据: `clearsky/data/nightly_probe.json`)
- 注意: allday 接口的 local_hour 用 24.0 表示午夜 (敦煌等时区有 0.3 偏移), 需按 hourLabel 或模24归一
- 早期"均值 vs API 差异巨大"的结论是对齐 bug, 已修正

### 4. 实现验证 (`clearsky/test_scoring.py`)
方法: 20 次随机"地点分组" (10 训练地点/4 测试地点) → 对**从未见过的地点**泛化
| 模型 | 范围 | R² | MAE | ±1分内 | ±3分内 | p95 |
|---|---|---|---|---|---|---|
| ICON | 全量(含封顶) | 0.976±0.022 | 0.732±0.444 | 89.8% | 94.6% | 3.94 |
| ICON | 连续域(剔除精确10/25) | 0.986±0.019 | **0.382±0.330** | **93.4%** | 98.2% | 1.40 |
| IFS | 全量(含封顶) | 0.860±0.074 | 3.645±1.692 | 73.5% | 77.3% | 20.52 |
| IFS | 连续域(剔除精确10/25) | 0.953±0.048 | 1.524±1.157 | 86.1% | 89.1% | 9.58 |

具体样例 (测试地点 xian/harbin/kunming/weiyuan):
```
ICON weiyuan 2026-08-13 06:00 cloud=0.772 trans=0.741 seeing=0.788 dew=0    | 真值 29.70 实现 29.64 误差 +0.06
ICON xian   2026-08-15 03:00 cloud=0.852 trans=0.850 seeing=0.819 dew=0    | 真值 23.40 实现 23.32 误差 +0.08
ICON harbin 2026-08-13 09:00 cloud=0.907 trans=0.841 seeing=0.574 dew=0.205| 真值 16.20 实现 15.38 误差 +0.82
IFS  weiyuan 2026-08-13 06:00 cloud=0.469 trans=0.497 seeing=0.650 dew=0   | 真值 54.50 实现 54.47 误差 +0.03
IFS  weiyuan 2026-08-15 01:00 cloud=0.122 trans=0.273 seeing=0.434 dew=0   | 真值 82.80 实现 82.75 误差 +0.05
IFS  xian   2026-08-15 23:00 cloud=0.076 trans=0.560 seeing=0.563 dew=0.088| 真值 56.00 实现 86.03 误差 -30.03 (西安隐藏天气封顶)
```

结论: **ICON 连续段已完全实现 (MAE≈0.4, 98% 误差<3)**; IFS 受隐藏封顶影响 (19.3% 行精确=10/25), 只能实现连续段; 封顶需外部降水/雾字段 (7Timer prec_type / Open-Meteo precipitation) 触发。

## 二、GitHub/互联网开源算法调研: 有没有更合适的?

搜索了 GitHub 仓库搜索 API + Sourcegraph 代码搜索 (`cloudIndex/transparency/seeing/dewRisk`、`观星指数`、`stargazing.twtapp.com` 均无代码泄漏), 结论: **ClearSky算法是自研未开源**, 但有一批优秀的开源替代:

| 项目 | Stars | 算法特点 | 与ClearSky关系 |
|---|---|---|---|
| [mawinkler/astroweather](https://github.com/mawinkler/astroweather) (pyastroweatherio) | 150 | met.no→物理计算: 透明度(云/湿度/风/AOD五因子)、视宁度、Lifted Index、消光 mag_loss; 天文晨昏/月光/暗夜计算最完整 | 数据源不同但**物理上最严谨**, HA 生态成熟 |
| [mbeher2200/DarkHours](https://github.com/mbeher2200/DarkHours) | 70 | **加权几何平均**: weather 40% × moon 25% × dark 25% × Bortle 10%; weather<4 硬封顶; 暗夜时段 3× 加权; 云分三层(低/中/高)独立重叠 + 风/AOD/PM2.5 限制因子 | 与ClearSky"线性+封顶"思路最像, 但**可解释性更强、因子更全** |
| [Haeniken/bot_astrosferum](https://github.com/Haeniken/bot_astrosferum) | 4 | 基于 ICON 全垂直廓线: 云透过率^2 × 视宁^1 × 相干时间^0.25 × 风 × 雾 × 降水(>0.05mm 一票否决), Shapley 归因 | 与ClearSky同源数据(ICON), **学术味最浓**, 但依赖 GRIB 全廓线, 实现重 |
| [giancarloerra/APD](https://github.com/giancarloerra/APD) | 10 | MeteoBlue 夜小时分组: score = 100 - 0.8×云量% - 0.2×降水概率% (极简) | 适合快速入门, 精度最低 |
| [monsterlabs/AstroWeather](https://github.com/monsterlabs/AstroWeather) | 10 | 7Timer 数据可视化 (与ClearSky同上游) | iOS 壳, 无评分算法 |
| [mohsaad/pydarksky](https://github.com/mohsaad/pydarksky) | 3 | A. Danko Clear Sky Chart 解析 (北美) | 数据源不同 |
| orionscottage/core/scoring.py (HuggingFace Space) | - | 纯本地加分制评分 (几何+可选天气) | 简单透明, 可作参考 |
| [focisrc/ucast](https://github.com/focisrc/ucast) | 3 | 射电天文微天气 (对湿度/结露敏感) | 专业场景 |

### 结论: 哪个"更合适"?
1. **想和ClearSky App 对得上** (兼容/对照): 用我们实现的 `clearsky/scoring.py` — 已证明 ICON 连续段 MAE≈0.4。
2. **想要更科学、更能解释** (自己用): **DarkHours 的加权几何平均 + 天气封顶** 或 **pyastroweatherio 的物理公式** 更合适 —— 它们把月光、风、结露、AOD 都算进去了, 而ClearSky只暴露 4 字段、封顶原因不可见。
3. **要最像ClearSky又开源** (同 ICON 数据): bot_astrosferum 的多因子乘法模型, 但要拉 GRIB 全廓线, 工程量大。
4. **任何算法都救不了"预报≠实况"**: 你踩的坑是云量预报不准。**最终决策必须叠加实况**: 风云4B 卫星云图 / 7Timer 晴天钟交叉验证 (实现网页 web/ 已内置)。

## 三、文件清单
- `clearsky/scoring.py` 算法实现 (可 pip 级调用)
- `clearsky/test_scoring.py` 复现测试 (20 次地点分组交叉验证 + 样例)
- `clearsky/data/sample_dataset.csv` 2016 行真实采样
- `clearsky/data/nightly_probe.json` 整晚分聚合探针 (2 地点 × 2 模型 × 3 晚)
- `upstream/gh/` 克隆的开源项目 (astroweather/DarkHours/APD/bot_astrosferum)

---

# 固定交付物 (2026-08-13, 可长期复用; v1.1.0 起为正式第三方库)

## 安装 (第三方库)
```bash
# 本地开发安装 (可编辑, 推荐)
pip install -e .

# 或从构建好的 wheel 安装 (可分发/拷给其他机器)
python -m pip wheel . -w dist/ --no-deps
pip install dist/twt_stargazing_clearsky-1.1.0-py3-none-any.whl

# 测试/复现实验依赖 (评分算法与健康检查本身零第三方依赖)
pip install -e ".[test]"
```
安装后获得:
- Python 包: `import clearsky` (任意目录可用)
- 命令行: `clearsky info|predict|test|batch|check`

## URL 健康检查 (运行前探测连通性+延迟)
```bash
# 全量检查 30 个数据源 (默认并发 12, 约 10s)
clearsky check

# 只查关键链路 (观星指数/光害/7Timer/风云4B) — 最快
clearsky check --group core
clearsky check --critical-only

# 单组 / JSON / 严格模式 (有失败即退出码 1)
clearsky check --group weather --json
clearsky check --strict

# Python API
from clearsky import check_all, check_url, get_urls
rep = check_all()                          # 全部 30 端点
rep = check_all(group="core")          # 只查核心
print(rep.summary())                       # {total, ok, fail, critical_fail, elapsed_s, avg_total_ms}
for r in rep.results:                      # 每端点: id/status/connect_ms/ttfb_ms/total_ms
    print(r.ok, r.id, r.status, f"{r.total_ms:.0f}ms")
```

**Web 启动前自动检查** (实现网页):
```bash
python web/server.py --check                 # 启动前检查, 失败也启动
python web/server.py --check --check-exit    # 关键服务失败则中止启动
python web/server.py 8890 --check --check-group core
```

**URL 注册表**: `clearsky/urls.py` 维护 30 个端点 (6 组: core/nodeapi/weather/satellite/maps/misc),
默认坐标=威远穹窿 (29.58,104.50), 可用 `build_urls(coords={...})` 换成任意观测地重建。
检查指标: 连接(含 TLS) / TTFB / 总耗时, 自动跟随重定向, 只读响应前 2KB 避免下载大图。

## 快速调用
```bash
# 算法元数据 (系数/封顶/验证指标/开源引用)
.venv/bin/python -m clearsky.cli info

# 单点预测 (威远穹窿今晚 20:00 ICON → 89.1)
.venv/bin/python -m clearsky.cli predict -m icon -c 0.1043 -t 0.7866 -s 0.8711 -d 0

# 带天气封顶标记 (降水/雾)
.venv/bin/python -m clearsky.cli predict -m ifs -c 0.3 -t 0.6 -s 0.7 -d 0.3 --fog

# 复现测试 (20 次地点分组交叉验证, 输出全量指标+样例)
.venv/bin/python -m clearsky.cli test

# CSV 批量预测 (列: model,cloudIndex,transparency,seeing,dewRisk[,precipitation,fog])
.venv/bin/python -m clearsky.cli batch -i in.csv -o out.csv

# Python 直接调用
from clearsky import predict_score, explain
predict_score("icon", 0.1043, 0.7866, 0.8711, 0.0)   # 89.1
explain("icon", 0.1043, 0.7866, 0.8711, 0.0)         # ScoreResult(score=89.1, ...)
```

## 文件地图
| 文件 | 作用 |
|---|---|
| `clearsky/scoring.py` | 算法实现核心 (predict_score / explain / COEFFICIENTS) |
| `clearsky/__init__.py` | 包导出 (from clearsky import predict_score) |
| `clearsky/algorithm.json` | **机器可读算法元数据** (系数/封顶/指标/引用, 程序可直接读取) |
| `clearsky/cli.py` | 命令行入口 (info/predict/test/batch/check) + `clearsky` 入口点 |
| `clearsky/urls.py` | **URL 注册表** (30 端点/6 组/关键性标记/默认坐标) |
| `clearsky/healthcheck.py` | **URL 健康检查** (连通+连接/TTFB/总延迟, 并发, 报告) |
| `clearsky/test_healthcheck.py` | healthcheck 离线单元测试 (本地 mock HTTP) |
| `clearsky/test_scoring.py` | 复现测试 (20 次地点分组交叉验证) |
| `clearsky/data/sample_dataset.csv` | 2016 行真实 API 采样 (训练/验证数据) |
| `clearsky/data/nightly_probe.json` | 整晚分聚合探针 |
| `notes/OPENSOURCE_RESEARCH.md` | **开源算法调研报告 (固定版, 含 commit hash)** |
| `notes/gh_search/repos.json` | GitHub 搜索原始结果 |
| `upstream/fetch_pinned.sh` | 一键克隆/还原 4 个固定 commit 的开源项目 |
| `requirements.txt` | 测试依赖说明 (运行时零第三方依赖) |
| `pyproject.toml` | 第三方库构建配置 (wheel/entry point/元数据) |

## 实现结论 (一句话版)
- ICON 连续段 **完全实现**: 公式 `89.673-88.057·cloud+5.290·trans+5.111·seeing-8.905·dew`,
  未见地点 MAE=0.38, ±1 分内 93.4%
- IFS 连续段可实现 (MAE=1.52), 但 19.3% 行被隐藏天气封顶 (10/25/~55), 需外部降水/雾字段
- 整晚分 ≈ 同一天历日夜间 10 小时 (20-24 点 + 0-5 点) 分数简单平均 (±0.7)
- ClearSky算法自研未开源; 更科学的开源替代: DarkHours(加权几何平均+封顶) / pyastroweatherio(物理公式) / bot_astrosferum(ICON 多因子)
