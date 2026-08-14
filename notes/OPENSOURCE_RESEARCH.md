# 开源观星算法调研 (2026-08-13)

背景: 自研评分模型（`clearsky/scoring.py`）基于公开 API 采样拟合, 本文调研开源社区更科学、
可解释的替代方案, 并固定可复现的 commit。

## 1. 调研方法

1. **GitHub 仓库搜索 API** (8 组关键词): `stargazing index` / `stargazing weather` /
   `astronomy weather forecast` / `astroweather` / `观星` / `观星 指数` /
   `clear sky chart` / `astronomical observing conditions` 等
2. 对最相关的 4 个仓库**克隆并通读评分源码**
3. 结论: 各项目思路差异大（物理公式 / 加权平均 / 多因子乘法 / 极简线性）

## 2. 候选项目对比 (已克隆, commit 已固定)

| 项目 | commit | 本地路径 | 算法核心 | 定位 |
|---|---|---|---|---|
| mawinkler/astroweather (pyastroweatherio) | `e0bcff4` | upstream/gh/mawinkler_astroweather | met.no → 物理计算: 透明度(云50%/湿度18%/风12%/LI10%/视宁10%), 视宁度, Lifted Index, 消光 mag_loss; 晨昏/月光/暗夜计算最全 | **最严谨的物理模型**, HA 生态 |
| mbeher2200/DarkHours | `f225e6e` | upstream/gh/mbeher2200_DarkHours | 加权几何平均 (weather40 × moon25 × dark25 × bortle10); weather<4 硬封顶; 暗夜 3× 加权; 云分低/中/高三层独立重叠, 风/AOD/PM2.5 限制因子, 结露建议因子 | **"连续分+封顶"结构最接近**, 可解释性强 |
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

1. **要和自研模型数值风格一致** → 用 `clearsky/` (ICON 连续段 MAE≈0.4)
2. **要更科学、可解释的自用版** → DarkHours 加权几何平均 或 pyastroweatherio 物理公式
   (它们把月光/风/结露/AOD 都算进去; 自研模型只依赖 4 个暴露字段)
3. **要同 ICON 数据的开源实现** → bot_astrosferum (需 GRIB 全廓线)
4. **任何算法都救不了"预报≠实况"** → 必须叠加风云 4B 卫星云图实况 (web/ 已内置)

## 5. 另 3 个已并入仓库 (直接提交在 upstream/, 非 gitlink)

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
