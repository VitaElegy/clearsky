# 开源观星评分算法调研报告 (固定版)

- 调研日期: 2026-08-13
- 调研对象: ClearSky观星指数算法的开源替代 / 相似实现
- 原始搜索结果: `notes/gh_search/repos.json` (GitHub 仓库搜索 API 原始响应)
- 实现代码: `clearsky/` (scoring.py / cli.py / algorithm.json / test_scoring.py)
- 克隆源码: `upstream/gh/` (已固定 commit, 见下)

## 1. 调研方法

1. **GitHub 仓库搜索 API** (8 组关键词): `stargazing index` / `stargazing weather` /
   `astronomy weather forecast` / `astroweather` / `观星` / `观星 指数` /
   `clear sky chart` / `astronomical observing conditions` 等
2. **Sourcegraph 代码级搜索** (`.api/search/stream`):
   `"cloudIndex" "transparency" "seeing"` / `"dew_risk" "transparency" "seeing"` /
   `"观星指数"` / `"stargazing.twtapp.com"` → **0 个代码匹配**
3. 对最相关的 4 个仓库**克隆并通读评分源码**
4. 结论: **ClearSky算法为自研未开源** (无任何代码泄漏 / 相似实现)

## 2. 候选项目对比 (已克隆, commit 已固定)

| 项目 | commit | 本地路径 | 算法核心 | 定位 |
|---|---|---|---|---|
| mawinkler/astroweather (pyastroweatherio) | `e0bcff4` | upstream/gh/mawinkler_astroweather | met.no → 物理计算: 透明度(云50%/湿度18%/风12%/LI10%/视宁10%), 视宁度, Lifted Index, 消光 mag_loss; 晨昏/月光/暗夜计算最全 | **最严谨的物理模型**, HA 生态 |
| mbeher2200/DarkHours | `f225e6e` | upstream/gh/mbeher2200_DarkHours | 加权几何平均 (weather40 × moon25 × dark25 × bortle10); weather<4 硬封顶; 暗夜 3× 加权; 云分低/中/高三层独立重叠, 风/AOD/PM2.5 限制因子, 结露建议因子 | **与ClearSky"连续分+封顶"最接近**, 可解释性强 |
| Haeniken/bot_astrosferum | `9edee4c` | upstream/gh/Haeniken_bot_astrosferum | ICON 全垂直廓线: 云透过率^CloudWeight × 视宁^1 × 相干时间^0.25 × 风 × 雾 × 降水(>0.05mm 一票否决); Shapley 多因子损失归因 | **同源数据(ICON)的学术实现**, 工程量大 |
| giancarloerra/APD | `567da54` | upstream/gh/giancarloerra_APD | MeteoBlue 夜间分组: score = 100 − 0.8×云量% − 0.2×降水概率% | 极简参考 |

未克隆但记录在案的: monsterlabs/AstroWeather(★10, 7Timer 可视化, 无评分算法),
mohsaad/pydarksky(★3, Clear Sky Chart 解析), focisrc/ucast(★3, 射电天文微天气),
orionscottage/core/scoring.py(HuggingFace Space, 本地加分制), StarScope(HN 2026-06,
weather+darkness+moon 0-100).

## 3. 如何重新拉取固定版本 (commit 已固定)

```bash
cd upstream/gh
git clone https://github.com/mawinkler/astroweather.git mawinkler_astroweather && git -C mawinkler_astroweather checkout e0bcff4
git clone https://github.com/mbeher2200/DarkHours.git mbeher2200_DarkHours && git -C mbeher2200_DarkHours checkout f225e6e
git clone https://github.com/Haeniken/bot_astrosferum.git Haeniken_bot_astrosferum && git -C Haeniken_bot_astrosferum checkout 9edee4c
git clone https://github.com/giancarloerra/APD.git giancarloerra_APD && git -C giancarloerra_APD checkout 567da54
```

## 4. 怎么选 (结论)

1. **要跟ClearSky App 数值对得上** → 用 `clearsky/` (ICON 连续段 MAE≈0.4)
2. **要更科学、可解释的自用版** → DarkHours 加权几何平均 或 pyastroweatherio 物理公式
   (它们把月光/风/结露/AOD 都算进去; ClearSky API 只暴露 4 字段)
3. **要同 ICON 数据的开源实现** → bot_astrosferum (需 GRIB 全廓线)
4. **任何算法都救不了"预报≠实况"** → 必须叠加风云 4B 卫星云图实况 (web/ 已内置)

## 5. 快速调用

```bash
# 算法元数据 (系数/封顶/指标/引用)
.venv/bin/python -m clearsky.cli info

# 单点预测 (威远穹窿今晚 20:00 ICON → 89.1)
.venv/bin/python -m clearsky.cli predict -m icon -c 0.1043 -t 0.7866 -s 0.8711 -d 0

# 带天气封顶标记
.venv/bin/python -m clearsky.cli predict -m ifs -c 0.3 -t 0.6 -s 0.7 -d 0.3 --fog

# 复现测试 (20 次地点分组交叉验证)
.venv/bin/python -m clearsky.cli test

# CSV 批量预测 (输入含 cloudIndex/transparency/seeing/dewRisk, 可选 model/precipitation/fog)
.venv/bin/python -m clearsky.cli batch -i in.csv -o out.csv

# Python 直接调用
from clearsky import predict_score, explain
print(predict_score("icon", 0.1043, 0.7866, 0.8711, 0.0))   # 89.1
print(explain("icon", 0.1043, 0.7866, 0.8711, 0.0))         # ScoreResult(score=89.1, ...)
```

## 6. 另 3 个已并入仓库 (直接提交在 upstream/, 非 gitlink)

| 项目 | 固定 commit | 本地路径 | 说明 |
|---|---|---|---|
| chromasky-backend | `68be7c5` | upstream/chromasky-backend | 火烧云/晚霞预测 (乘法 A×B×C×D×10), 非观星指数 |
| chromasky-toolkit | `121c29e` | upstream/chromasky-toolkit | ChromaSky 工具链 |
| pyastroweatherio | `403bc98` | upstream/pyastroweatherio | Home Assistant 天文天气物理计算 (astroweather 的核心库) |

安装为可导入包后可从任意目录调用:
```bash
cd /Users/elegy/clearsky
.venv/bin/pip install -e .   # 已执行
cd /任意目录 && .venv/bin/python -c "from clearsky import predict_score; print(predict_score('icon',0.1043,0.7866,0.8711,0))"  # 89.1
```
