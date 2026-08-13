# -*- coding: utf-8 -*-
"""ClearSky观星指数算法实现包 (APP Stargazing Score Replica)。

用法:
    from clearsky import predict_score, explain, COEFFICIENTS, VERSION
"""
from .scoring import predict_score, explain, ScoreResult, COEFFICIENTS, CAP_PRECIPITATION, CAP_BAD_WEATHER, CAP_FOG

VERSION = "1.0.0"
__all__ = ["predict_score", "explain", "ScoreResult", "COEFFICIENTS",
           "CAP_PRECIPITATION", "CAP_BAD_WEATHER", "CAP_FOG", "VERSION"]
