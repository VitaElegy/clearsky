# -*- coding: utf-8 -*-
"""数据源 URL 注册表（健康检查 / 数据源清单）。

用法:
    from clearsky.urls import URLS, get_urls, DEFAULT_COORDS
    for u in get_urls("core"):
        print(u.id, u.url)

说明:
    - 默认坐标 = 威远穹窿 (29.58, 104.50)，可整体替换成任意观测地。
    - 分组:
        core    主服务（观星指数等，最核心）
        nodeapi 数据网关（光害/天象/太阳活动/天气等）
        weather     气象上游（7Timer / Open-Meteo / 中央气象台）
        satellite   卫星云图实况（风云4B / 向日葵8 / 阿里云镜像）
        maps        底图/导航（腾讯/高德/天地图/DarkMap）
        misc        其他开放数据（CelesTrak / NOAA / GIBS / DSS / 高程）
    - critical=True 表示该服务挂了会直接影响"观星决策"主链路。
    - 公开演示密钥仅用于低频率个人/学习调用，勿高频调用或商用。
"""
from dataclasses import dataclass, field
from typing import Optional

# 默认观测点: 威远穹窿 (四川威远县)
DEFAULT_COORDS = {"lat": 29.58, "lng": 104.50, "name": "weiyuan"}

# 公开演示密钥（仅用于低频率个人/学习调用）
KEY = "clearsky_demo_2026"
TIANDITU_TK = "6b826f1206bb5330228f54ee95ec6af8"

# 通用浏览器 UA（部分上游按 UA 返回不同内容）
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
REFERER = "https://www.twtapp.com/"


@dataclass(frozen=True)
class URLEntry:
    id: str                 # 唯一 id
    name: str               # 中文名
    group: str              # 分组
    url: str                # 可直接请求的 URL（已填默认参数）
    critical: bool = False  # 是否主链路关键服务
    method: str = "GET"
    timeout: float = 8.0    # 单请求超时（秒）
    headers: dict = field(default_factory=dict)
    note: str = ""


def _fmt(tpl: str, **kw) -> str:
    return tpl.format(**kw)


def build_urls(coords: Optional[dict] = None) -> list:
    """按给定坐标构建完整 URL 注册表。coords 需含 lat/lng。"""
    c = coords or DEFAULT_COORDS
    lat, lng = c["lat"], c["lng"]

    def u(id_, name, group, url, critical=False, timeout=8.0, headers=None, note=""):
        return URLEntry(id_, name, group, url, critical, "GET", timeout,
                        headers or {}, note)

    jh = {"User-Agent": UA, "Accept": "application/json,text/plain,*/*",
          "Referer": REFERER}

    return [
        # ---------- 主服务（观星指数等） ----------
        u("stargazing_hourly", "观星指数·逐小时 (ICON/IFS)", "core",
          f"https://stargazing.twtapp.com/api/v1/stargazing/nightly/hourly/range?lat={lat}&lng={lng}&key={KEY}",
          critical=True, headers=jh,
          note="观星指数原始数据，评分算法所用"),
        u("stargazing_allday", "观星指数·整晚聚合", "core",
          f"https://stargazing.twtapp.com/api/v1/stargazing/nightly/point/range/all?lat={lat}&lng={lng}&key={KEY}",
          critical=True, headers=jh,
          note="整晚分/暗夜窗口"),
        u("orbit_cache", "可见卫星 TLE 缓存 (CelesTrak 镜像)", "core",
          "https://orbit-cache.twtapp.com/public/v1/catalogs/visual",
          critical=False, headers=jh, note="157 颗可见卫星 TLE"),
        u("sunset_glow", "日出/日落辉光 (sunset-glow)", "core",
          f"https://stargazing.twtapp.com/api/v1/sunset-glow/point/range?lat={lat}&lng={lng}&key={KEY}",
          critical=False, headers=jh, note="辉光指数/峰值时刻/方位"),
        u("nodeapi_ovation", "OVATION 极光卵实况 (NOAA 网格)", "nodeapi",
          "https://nodeapi.knockdream.com/skydata/ovation_aurora_latest.json",
          critical=False, headers=jh, note="~670KB 全球格点, 健康检查只读前 2KB"),
        u("nodeapi_meteor_radio", "流星无线电回波图", "nodeapi",
          "https://nodeapi.knockdream.com/skydata/meteor_radio_latest.png",
          critical=False, headers=jh, note="全球流星无线电台实时回波 PNG"),
        u("nodeapi_apod", "NASA 每日天文图 (APOD)", "nodeapi",
          "https://nodeapi.knockdream.com/api/apod",
          critical=False, headers=jh, note="含中文标题/说明, 图片走阿里云 OSS"),

        # ---------- nodeapi 数据网关 ----------
        u("nodeapi_lightpollution", "光污染等级 (DarkMap 2025)", "nodeapi",
          f"https://nodeapi.knockdream.com/api/lightpollution/latest?lat={lat}&lon={lng}&key={KEY}",
          critical=True, headers=jh, note="mpsas/ratio/dataVersion"),
        u("nodeapi_astro_events", "天文事件 (流星雨峰值等)", "nodeapi",
          f"https://nodeapi.knockdream.com/api/astro/events?key={KEY}",
          critical=False, headers=jh),
        u("nodeapi_kp", "Kp 指数历史", "nodeapi",
          "https://nodeapi.knockdream.com/api/space/kp-index",
          critical=False, headers=jh),
        u("nodeapi_aurora", "极光功率 (南北半球)", "nodeapi",
          "https://nodeapi.knockdream.com/api/aurora-power",
          critical=False, headers=jh),
        u("nodeapi_solar_wind", "太阳风", "nodeapi",
          "https://nodeapi.knockdream.com/api/solar-wind",
          critical=False, headers=jh),
        u("nodeapi_magnetic", "行星际磁场 Bt/Bz", "nodeapi",
          "https://nodeapi.knockdream.com/api/magnetic-field",
          critical=False, headers=jh),
        u("nodeapi_metno", "MetNo 天气预报 (含海拔)", "nodeapi",
          f"https://nodeapi.knockdream.com/api/weather/metno?lat={lat}&lon={lng}&key={KEY}",
          critical=False, headers=jh),
        u("nodeapi_15days", "15 天天气 (OpenWeatherMap)", "nodeapi",
          f"https://nodeapi.knockdream.com/api/weather/15days?lat={lat}&lon={lng}",
          critical=False, headers=jh),
        u("nodeapi_air_quality", "实时空气质量 (WAQI)", "nodeapi",
          f"https://nodeapi.knockdream.com/api/air-quality?lat={lat}&lon={lng}",
          critical=False, headers=jh),
        u("nodeapi_starlink_tle", "Starlink TLE", "nodeapi",
          f"https://nodeapi.knockdream.com/api/starlink/tle?key={KEY}",
          critical=False, headers=jh),

        # ---------- 气象上游 ----------
        u("seven_timer", "7Timer 晴天钟", "weather",
          f"https://www.7timer.info/bin/astro.php?lon={lng}&lat={lat}&ac=0&unit=metric&output=json&tzshift=8",
          critical=True, headers={"User-Agent": UA},
          note="cloudcover/seeing/transparency/prec_type 等原始观星参数"),
        u("open_meteo", "Open-Meteo 预报", "weather",
          f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lng}&hourly=temperature_2m",
          critical=False, timeout=10.0),
        u("open_meteo_air", "Open-Meteo 空气质量", "weather",
          f"https://air-quality-api.open-meteo.com/v1/air-quality?latitude={lat}&longitude={lng}",
          critical=False, timeout=10.0),
        u("nmc_cloud", "中央气象台云图", "weather",
          "https://image.nmc.cn/product/",
          critical=False, headers={"User-Agent": UA, "Referer": "http://www.nmc.cn/"},
          note="防盗链严格，检查可能返回 403（不代表服务不可用）"),

        # ---------- 卫星云图实况 ----------
        u("nsmc_fy4b", "风云4B 卫星云图 (NSMC)", "satellite",
          "https://img.nsmc.org.cn/CLOUDIMAGE/FY4B/AGRI/GCLR/FY4B_REGC_GCLR.JPG",
          critical=True, timeout=12.0, headers={"User-Agent": UA},
          note="实况云图，判断预报是否翻车的关键"),
        u("jma_himawari", "向日葵8 卫星 (JMA)", "satellite",
          "https://www.jma.go.jp/",
          critical=False, timeout=10.0, headers={"User-Agent": UA, "Referer": "https://www.jma.go.jp/"},
          note="检查域名可达性；具体瓦片路径需带时刻参数"),
        u("astronomy_oss", "向日葵8 云图镜像 (阿里云)", "satellite",
          "https://astronomy-service.oss-cn-shanghai.aliyuncs.com/weather/himawari8_thumbnail.jpg",
          critical=False, timeout=10.0),

        # ---------- 底图 / 导航 ----------
        u("tencent_map_tile", "腾讯地图瓦片", "maps",
          "https://rt0.map.gtimg.com/tile?z=3&x=1&y=1&styleid=1",
          critical=False),
        u("amap_tile", "高德卫星瓦片", "maps",
          "https://webst01.is.autonavi.com/appmaptile?style=6&x=1&y=1&z=3",
          critical=False),
        u("tianditu", "天地图矢量瓦片", "maps",
          f"https://t0.tianditu.gov.cn/DataServer?T=vec_w&x=1&y=1&l=3&tk={TIANDITU_TK}",
          critical=False, headers={"User-Agent": UA, "Referer": "https://www.tianditu.gov.cn/"},
          note="403 通常为 tk 失效或风控，需到天地图官网重新申请"),
        u("darkmap", "DarkMap 光污染地图", "maps",
          "https://www.darkmap.cn/",
          critical=False, timeout=10.0, headers={"User-Agent": UA}),

        # ---------- 其他开放数据 ----------
        u("celestrak", "CelesTrak TLE", "misc",
          "https://celestrak.org/",
          critical=False, timeout=10.0),
        u("noaa_swpc", "NOAA SWPC 太阳风/极光", "misc",
          "https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json",
          critical=False, timeout=10.0),
        u("nasa_gibs", "NASA GIBS 底图/夜光", "misc",
          "https://gibs.earthdata.nasa.gov/",
          critical=False, timeout=10.0),
        u("stsci_dss", "STScI DSS 深空底图", "misc",
          "https://archive.stsci.edu/dss/",
          critical=False, timeout=10.0),
        u("open_elevation", "Open-Elevation 高程", "misc",
          f"https://api.open-elevation.com/api/v1/lookup?locations={lat},{lng}",
          critical=False, timeout=10.0),
        u("opentopodata", "OpenTopoData SRTM30 高程", "misc",
          f"https://api.opentopodata.org/v1/srtm30m?locations={lat},{lng}",
          critical=False, timeout=10.0),
    ]


URLS = build_urls()

# 分组定义（用于 --group 参数与报告排序）
GROUPS = ["core", "nodeapi", "weather", "satellite", "maps", "misc"]
GROUP_LABELS = {
    "core": "主服务",
    "nodeapi": "nodeapi 数据网关",
    "weather": "气象上游",
    "satellite": "卫星云图",
    "maps": "底图/导航",
    "misc": "其他开放数据",
}


def get_urls(group: Optional[str] = None, critical_only: bool = False) -> list:
    """按分组/关键性过滤 URL 注册表。group=None 或 'all' 返回全部。"""
    out = []
    for e in URLS:
        if group and group != "all" and e.group != group:
            continue
        if critical_only and not e.critical:
            continue
        out.append(e)
    return out


if __name__ == "__main__":
    for e in URLS:
        mark = "★" if e.critical else " "
        print(f"{mark} [{e.group:11s}] {e.id:28s} {e.name}  ->  {e.url[:80]}")
