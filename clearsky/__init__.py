# -*- coding: utf-8 -*-
"""ClearSky观星指数算法实现包 (APP Stargazing Score Replica) —— 第三方库。

用法:
    # 观星指数评分（纯本地，零网络）
    from clearsky import predict_score, explain, COEFFICIENTS, VERSION

    # 数据源 URL 健康检查（运行前探测连通性与延迟）
    from clearsky import check_all, check_url, get_urls
    report = check_all(group="core")          # 只查关键链路
    report = check_all()                       # 查全部 29 个端点
    print(report.summary())

    # 命令行（已注册 clearsky 入口点）
    #   clearsky info | predict | test | batch | check
"""
from .scoring import predict_score, explain, ScoreResult, COEFFICIENTS, CAP_PRECIPITATION, CAP_BAD_WEATHER, CAP_FOG
from .urls import URLS, URLEntry, get_urls, build_urls, DEFAULT_COORDS, GROUPS, GROUP_LABELS
from .healthcheck import check_all, check_url, format_report, CheckResult, HealthReport

VERSION = "1.1.0"
__version__ = VERSION

__all__ = [
    # 评分算法
    "predict_score", "explain", "ScoreResult", "COEFFICIENTS",
    "CAP_PRECIPITATION", "CAP_BAD_WEATHER", "CAP_FOG",
    # URL 注册表
    "URLS", "URLEntry", "get_urls", "build_urls", "DEFAULT_COORDS",
    "GROUPS", "GROUP_LABELS",
    # 健康检查
    "check_all", "check_url", "format_report", "CheckResult", "HealthReport",
    "VERSION",
]
