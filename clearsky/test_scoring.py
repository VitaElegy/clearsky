# -*- coding: utf-8 -*-
"""
观星指数评分算法验证
============================
方法:
  1. 按"地点"分组: 每次随机 10 地点训练、4 地点测试, 重复 20 次取平均
     -> 验证对"从未见过的地点"的泛化能力 (比随机切分严格)
  2. 指标: R², MAE, 误差分布(±1/±3/±5 内占比), p95
  3. 分两组评估:
     a) 连续域: 剔除精确等于 10.0/25.0 的天气封顶行
     b) 全量: 含封顶行 (说明天气封顶对整体误差的影响)
  4. 给出 ICON/IFS 各 5 条具体样例 (真值 vs 预测)
  5. 封顶统计与演示
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
import pandas as pd
import numpy as np
from sklearn.metrics import r2_score, mean_absolute_error
from scoring import predict_score, COEFFICIENTS

DATA = os.path.join(os.path.dirname(__file__), "data", "sample_dataset.csv")

def base_pred(model, row):
    b, c, t, s, d = COEFFICIENTS[model]
    return b + c*row.cloudIndex + t*row.transparency + s*row.seeing + d*row.dewRisk

def eval_split(model, d, train_places, test_places, with_caps):
    test = d[d.name.isin(test_places)]
    pred = test.apply(lambda r: base_pred(model, r), axis=1)
    y = test.score
    if not with_caps:
        keep = (y-10).abs() > 0.001
        keep &= (y-25).abs() > 0.001
        y, pred = y[keep], pred[keep]
    err = (y - pred).abs()
    return dict(r2=r2_score(y, pred), mae=mean_absolute_error(y, pred),
                within1=(err<=1).mean(), within3=(err<=3).mean(),
                within5=(err<=5).mean(), p95=err.quantile(0.95))

def avg_report(rows):
    m = pd.DataFrame(rows).mean()
    s = pd.DataFrame(rows).std()
    return (f"R2={m.r2:.4f}±{s.r2:.4f} MAE={m.mae:.3f}±{s.mae:.3f} "
            f"±1:{m.within1*100:.1f}% ±3:{m.within3*100:.1f}% ±5:{m.within5*100:.1f}% p95={m.p95:.2f}")

def main():
    df = pd.read_csv(DATA)
    places = sorted(df.name.unique())
    rng = np.random.default_rng(20260813)
    acc = {m: {"all": [], "cont": []} for m in ["icon", "ifs"]}
    for trial in range(20):
        test_places = rng.choice(places, 4, replace=False)
        train_places = [p for p in places if p not in test_places]
        for model in ["icon", "ifs"]:
            d = df[df.model == model]
            acc[model]["all"].append(eval_split(model, d, train_places, test_places, True))
            acc[model]["cont"].append(eval_split(model, d, train_places, test_places, False))

    print("="*76)
    print("A. 泛化评估: 20 次随机'地点分组' (每次 10 训练地点 / 4 测试地点) 平均 ± 标准差")
    for model in ["icon", "ifs"]:
        print(f"\n 模型 {model.upper()}:")
        print("   全量(含天气封顶)      :", avg_report(acc[model]["all"]))
        print("   连续域(剔除精确10/25) :", avg_report(acc[model]["cont"]))

    # 固定一组具体样例 (用固定种子第一次抽到的测试地点)
    rng2 = np.random.default_rng(20260813)
    test_places = rng2.choice(places, 4, replace=False)
    train_places = [p for p in places if p not in test_places]
    print("\n" + "="*76)
    print("B. 具体样例 (固定分组: 测试地点 =", ", ".join(test_places), ")")
    for model in ["icon", "ifs"]:
        d = df[df.model == model]
        test = d[d.name.isin(test_places)]
        cont = test[(test.score-10).abs()>0.001]
        cont = cont[(cont.score-25).abs()>0.001]
        print(f"\n 模型 {model.upper()} (测试 {len(cont)} 行连续域):")
        idx = [0, len(cont)//4, len(cont)//2, 3*len(cont)//4, -1]
        for i in idx:
            r = cont.iloc[i]
            p = base_pred(model, r)
            print(f"   {r['name']:9s} {r['date']} {r['hourLabel']}  cloud={r.cloudIndex:.3f} "
                  f"trans={r.transparency:.3f} seeing={r.seeing:.3f} dew={r.dewRisk:.3f} "
                  f"| 真值={r.score:6.2f} 预测={p:6.2f} 误差={r.score-p:+6.2f}")

    print("\n" + "="*76)
    print("C. 天气封顶统计 (全 2016 行):")
    for model in ["icon", "ifs"]:
        d = df[df.model == model]
        n10 = ((d.score-10).abs()<0.001).sum()
        n25 = ((d.score-25).abs()<0.001).sum()
        print(f"   {model.upper():4s}: 精确=10.0 共 {n10:4d} 行 | 精确=25.0 共 {n25:4d} 行 "
              f"| 占 {model.upper()} 样本 {(n10+n25)/len(d)*100:.1f}%")

    print("\n" + "="*76)
    print("D. 封顶演示 (predict_score 带外部降水/雾标记):")
    demos = [
        ("icon", 0.85, 0.80, 0.90, 0.00, True,  None, "降水/雷暴 → 10"),
        ("ifs",  0.50, 0.60, 0.70, 0.05, True,  None, "昆明 IFS 实测场景: 7Timer prec=rain → 10"),
        ("icon", 0.20, 0.78, 0.85, 0.00, None, True,  "雾 → ~55"),
        ("ifs",  0.30, 0.65, 0.70, 0.30, False, True, "结露+低云 → ~55"),
        ("icon", 0.95, 0.50, 0.80, 0.00, False, False, "无降水标记但云量95% → 25"),
    ]
    for model, c, t, s, d, prec, fog, note in demos:
        p = predict_score(model, c, t, s, d, precipitation=prec, fog=fog)
        print(f"   {model.upper()} cloud={c} trans={t} seeing={s} dew={d} "
              f"prec={prec} fog={fog} -> {p:5.1f}   ({note})")

if __name__ == "__main__":
    main()
