# -*- coding: utf-8 -*-
"""
观星指数评分算法
================

基于 2016 条公开 API 采样（14 地点 × ICON/IFS × 3 天 × 24h）拟合的评分模型：

  观星指数 = 连续线性基础分 + 离散"天气封顶"

  连续基础分（ICON；按地点分组"未见地点"测试 R²≈0.993 / MAE≈0.32）:
    base = 89.67 - 88.06*cloudIndex + 5.29*transparency + 5.11*seeing - 8.91*dewRisk

  连续基础分（IFS；同上测试 R²≈0.950 / MAE≈1.56，剩余误差多为天气封顶）:
    base = 90.04 - 87.85*cloudIndex + 5.13*transparency + 4.67*seeing - 32.64*dewRisk

  天气封顶（接口只暴露 4 个字段，触发条件需外部天气数据辅助识别）:
    - 10.0 : 降水/雷暴/暴风雨等"不可观测"天气 (ICON 35 行 / IFS 79 行精确等于 10.0)
    - 25.0 : 一般性降水/湿气/多云等"很差"天气 (ICON 14 行 / IFS 116 行精确等于 25.0)
    - ~55  : 雾/100% 湿度+低云 (哈尔滨 ICON, cloud=0 但 RH=100%, score≈54.8-59.2)
    说明: 指数理论上还包含月光/降水/风/结露等因素，
          但接口未暴露这些字段，故封顶只能部分实现。

用法:
    from scoring import predict_score, explain
    s = predict_score('icon', 0.10, 0.79, 0.87, 0.0)
    print(explain('icon', 0.10, 0.79, 0.87, 0.0))
"""

from dataclasses import dataclass, field
from typing import Optional

# 各模型线性基础分系数（在"非封顶行"上最小二乘拟合）
COEFFICIENTS = {
    # model: (intercept, cloud, transparency, seeing, dewRisk)
    "icon": (89.6731, -88.0570, 5.2897, 5.1110, -8.9050),
    "ifs":  (90.0422, -87.8491, 5.1256, 4.6664, -32.6401),
}

# 离散天气封顶值
CAP_PRECIPITATION = 10.0   # 降水/雷暴 → 10
CAP_BAD_WEATHER   = 25.0   # 一般恶劣天气 → 25
CAP_FOG           = 55.0   # 雾/近饱和+低云 → ~55（观测到的区间 54.8~59.2）


def _base_score(model: str, cloud_index: float, transparency: float,
                seeing: float, dew_risk: float) -> float:
    """连续线性基础分（未封顶）。"""
    if model not in COEFFICIENTS:
        raise ValueError(f"unknown model {model!r}, choose from {list(COEFFICIENTS)}")
    b, c, t, s, d = COEFFICIENTS[model]
    return b + c * cloud_index + t * transparency + s * seeing + d * dew_risk


def _apply_caps(model: str, base: float, cloud_index: float,
                transparency: float, dew_risk: float,
                precipitation: Optional[bool],
                fog: Optional[bool]) -> tuple[float, list[str]]:
    """应用离散天气封顶，返回 (score, 触发的封顶原因列表)。"""
    reasons: list[str] = []

    # 1) 降水/雷暴 → 硬封顶 10
    if precipitation is True:
        return CAP_PRECIPITATION, ["precipitation/storm -> cap 10"]

    # 2) 雾/近饱和 → 硬封顶 ~55
    if fog is True or (dew_risk > 0.25 and cloud_index > 0.5):
        return CAP_FOG, ["fog / near-saturated low cloud -> cap ~55"]

    # 3) 一般恶劣天气 → 硬封顶 25
    #    (无外部降水/雾字段时的最佳推断：云量大且透明度差；或降水字段为 False 但云量极高)
    bad_weather = (cloud_index > 0.75 and transparency < 0.6) or (cloud_index > 0.92)
    if bad_weather:
        return CAP_BAD_WEATHER, ["poor weather (heavy cloud + low transparency) -> cap 25"]

    # 4) 无外部字段时的兜底：仅当有明确降水标记才用 10
    if precipitation is False and cloud_index > 0.85:
        return CAP_BAD_WEATHER, ["heavy cloud -> cap 25"]

    return base, reasons


@dataclass
class ScoreResult:
    score: float
    base: float
    model: str
    capped: bool = False
    reasons: list = field(default_factory=list)
    inputs: dict = field(default_factory=dict)

    def __repr__(self):
        return (f"ScoreResult(model={self.model}, score={self.score:.1f}, "
                f"base={self.base:.1f}, capped={self.capped}, reasons={self.reasons})")


def predict_score(model: str, cloud_index: float, transparency: float,
                  seeing: float, dew_risk: float,
                  precipitation: Optional[bool] = None,
                  fog: Optional[bool] = None) -> float:
    """预测观星指数 (0-100)。

    参数:
        model: 'icon' 或 'ifs'
        cloud_index: 云量 0-1
        transparency: 透明度 0-1
        seeing: 视宁度 0-1 (越大越好)
        dew_risk: 结露风险 0-1 (越大越差)
        precipitation: 是否有降水/雷暴 (None=未知)
        fog: 是否有雾 (None=未知)
    返回:
        观星指数 0-100
    """
    base = _base_score(model, cloud_index, transparency, seeing, dew_risk)
    score, _ = _apply_caps(model, base, cloud_index, transparency, dew_risk,
                           precipitation, fog)
    return round(max(0.0, min(100.0, score)), 1)


def explain(model: str, cloud_index: float, transparency: float,
            seeing: float, dew_risk: float,
            precipitation: Optional[bool] = None,
            fog: Optional[bool] = None) -> ScoreResult:
    """带解释的预测。"""
    base = _base_score(model, cloud_index, transparency, seeing, dew_risk)
    score, reasons = _apply_caps(model, base, cloud_index, transparency, dew_risk,
                                 precipitation, fog)
    b, c, t, s, d = COEFFICIENTS[model]
    return ScoreResult(
        score=round(max(0.0, min(100.0, score)), 1),
        base=round(base, 1),
        model=model,
        capped=bool(reasons),
        reasons=reasons,
        inputs=dict(model=model, cloud_index=cloud_index, transparency=transparency,
                    seeing=seeing, dew_risk=dew_risk, precipitation=precipitation, fog=fog),
    )


if __name__ == "__main__":
    # 威远穹窿 2026-08-13 晚 20:00 ICON (真实 API 值 89.1)
    r = explain("icon", 0.1043, 0.7866, 0.8711, 0.0)
    print(r)
    print(f"真值=89.1 预测={r.score}")
