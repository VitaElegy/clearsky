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

def cmd_check(args):
    from .healthcheck import check_all, format_report
    rep = check_all(group=args.group, timeout=args.timeout,
                    critical_only=args.critical_only, workers=args.workers)
    if args.json:
        print(json.dumps(rep.to_dict(), ensure_ascii=False, indent=2))
    else:
        print(format_report(rep, verbose=args.verbose))
    if args.strict and rep.fail_count:
        sys.exit(1)
    if args.critical_only and rep.critical_failures:
        sys.exit(1)


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
    ch = sub.add_parser("check", help="运行前 URL 健康检查 (连通性+延迟)")
    ch.add_argument("--group", default="all", help="all|core|nodeapi|weather|satellite|maps|misc")
    ch.add_argument("--timeout", type=float, default=None, help="单请求超时秒数")
    ch.add_argument("--workers", type=int, default=12, help="并发线程数")
    ch.add_argument("--critical-only", action="store_true", help="只检查关键服务")
    ch.add_argument("--verbose", action="store_true", help="表格附带 URL")
    ch.add_argument("--json", action="store_true", help="JSON 输出")
    ch.add_argument("--strict", action="store_true", help="有失败时以非零退出")
    ch.set_defaults(fn=cmd_check)
    args = p.parse_args()
    if args.cmd == "info": cmd_info(args)
    elif args.cmd == "test": cmd_test(args)
    elif args.cmd == "check": cmd_check(args)
    else: args.fn(args)

if __name__ == "__main__":
    main()

