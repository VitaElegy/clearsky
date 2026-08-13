# -*- coding: utf-8 -*-
"""ClearSky观星指数实现 - 命令行入口

用法:
    python -m clearsky.cli info                        # 查看算法元数据
    python -m clearsky.cli predict -m icon -c 0.10 -t 0.79 -s 0.87 -d 0
    python -m clearsky.cli predict -m ifs -c 0.30 -t 0.60 -s 0.70 -d 0.3 --precip
    python -m clearsky.cli test                        # 复现测试 (20 次地点分组交叉验证)
    python -m clearsky.cli batch -i input.csv -o out.csv   # 批量预测
"""
import argparse, csv, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
METADATA = os.path.join(HERE, "algorithm.json")

def load_metadata():
    with open(METADATA, encoding="utf-8") as f:
        return json.load(f)

def cmd_info(_):
    meta = load_metadata()
    print(json.dumps(meta, ensure_ascii=False, indent=2))

def cmd_predict(args):
    from .scoring import explain
    r = explain(args.model, args.cloud, args.trans, args.seeing, args.dew,
                precipitation=args.precip, fog=args.fog)
    print(json.dumps({
        "model": r.model, "score": r.score, "base": r.base,
        "capped": r.capped, "reasons": r.reasons,
        "inputs": r.inputs,
    }, ensure_ascii=False, indent=2))

def cmd_test(_):
    import subprocess
    code = subprocess.call([sys.executable, os.path.join(HERE, "test_scoring.py")])
    sys.exit(code)

def cmd_batch(args):
    from .scoring import predict_score
    rows = list(csv.DictReader(open(args.input, encoding="utf-8-sig")))
    out_rows = []
    for row in rows:
        try:
            score = predict_score(
                row.get("model", "icon"),
                float(row["cloudIndex"]), float(row["transparency"]),
                float(row["seeing"]), float(row["dewRisk"]),
                precipitation=(row.get("precipitation", "").lower() in ("1", "true", "yes") or None),
                fog=(row.get("fog", "").lower() in ("1", "true", "yes") or None),
            )
        except Exception as e:
            score = f"ERR:{e}"
        out_rows.append({**row, "score_pred": score})
    with open(args.output, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(out_rows[0].keys()))
        w.writeheader(); w.writerows(out_rows)
    print(f"batch done: {len(out_rows)} rows -> {args.output}")

def main():
    p = argparse.ArgumentParser(prog="python -m clearsky.cli", description="ClearSky观星指数实现 CLI")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("info", help="打印算法元数据")
    sub.add_parser("test", help="运行复现测试")
    pr = sub.add_parser("predict", help="单点预测")
    pr.add_argument("-m", "--model", choices=["icon", "ifs"], required=True)
    pr.add_argument("-c", "--cloud", type=float, required=True)
    pr.add_argument("-t", "--trans", type=float, required=True)
    pr.add_argument("-s", "--seeing", type=float, required=True)
    pr.add_argument("-d", "--dew", type=float, default=0.0)
    pr.add_argument("--precip", action="store_true", help="有降水/雷暴")
    pr.add_argument("--fog", action="store_true", help="有雾")
    pr.set_defaults(fn=cmd_predict)
    ba = sub.add_parser("batch", help="CSV 批量预测")
    ba.add_argument("-i", "--input", required=True)
    ba.add_argument("-o", "--output", required=True)
    ba.set_defaults(fn=cmd_batch)
    args = p.parse_args()
    if args.cmd == "info": cmd_info(args)
    elif args.cmd == "test": cmd_test(args)
    else: args.fn(args)

if __name__ == "__main__":
    main()
