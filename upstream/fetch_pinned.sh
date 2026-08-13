#!/usr/bin/env bash
# 注: chromasky-backend/toolkit 与 pyastroweatherio 已直接提交在本仓库 upstream/ 下,
#     无需克隆 (commit 见 notes/OPENSOURCE_RESEARCH.md §6).
# 拉取/还原调研中固定的开源项目 (commit 已固定, 见 notes/OPENSOURCE_RESEARCH.md)
set -euo pipefail
cd "$(dirname "$0")/gh"
declare -A REPOS=(
  [mawinkler_astroweather]="https://github.com/mawinkler/astroweather.git|e0bcff4"
  [mbeher2200_DarkHours]="https://github.com/mbeher2200/DarkHours.git|f225e6e"
  [Haeniken_bot_astrosferum]="https://github.com/Haeniken/bot_astrosferum.git|9edee4c"
  [giancarloerra_APD]="https://github.com/giancarloerra/APD.git|567da54"
)
for dir in "${!REPOS[@]}"; do
  IFS='|' read -r url commit <<< "${REPOS[$dir]}"
  if [ -d "$dir/.git" ]; then
    echo "[skip] $dir exists"
  else
    echo "[clone] $dir @ $commit"
    git clone -q --depth 1 "$url" "$dir"
    git -C "$dir" checkout -q "$commit" || git -C "$dir" fetch -q --depth 1 origin "$commit" && git -C "$dir" checkout -q "$commit"
  fi
done
echo "done"
