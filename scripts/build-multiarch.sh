#!/bin/bash
# 为多个架构构建 any-listen web-server 镜像（不需要 QEMU 跑构建）
#
# 用法：
#   ./scripts/build-multiarch.sh                 # 构建 amd64 + arm64（默认 tag 后缀 -amd64/-arm64）
#   ./scripts/build-multiarch.sh arm64           # 只构建 arm64
#   TAG=my-tag ./scripts/build-multiarch.sh      # 自定义镜像名
#   SAVE_DIR=/tmp/out ./scripts/build-multiarch.sh arm64   # 额外导出 tar，便于拷到 ARM 机器
#
# 前置：
#   - 在仓库根目录执行
#   - 需要已安装 podman、pnpm、curl
#   - 若网络需要代理：BUILD_PROXY=http://127.0.0.1:7890（只影响拉取基座镜像/原生库）
set -euo pipefail

ARCHS=${*:-"amd64 arm64"}
TAG=${TAG:-localhost/any-listen-web-server:download-ui}
NATIVE_VERSION=${NATIVE_VERSION:-11}
SAVE_DIR=${SAVE_DIR:-}
REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$REPO_ROOT"

BUILD_ARGS=()
if [[ -n "${BUILD_PROXY:-}" ]]; then
  BUILD_ARGS+=(--build-arg "http_proxy=${BUILD_PROXY}" --build-arg "https_proxy=${BUILD_PROXY}")
fi

echo "==> 1/3 构建 web-server（在宿主机构建一次，产物与架构无关）"
WEB_SERVER_ONLY=true pnpm build:web

# 上游 release 资产名与 Node 的 process.arch 一致：x64 / arm64 / arm
# （镜像内目录必须是 native/linux_<process.arch>_v11，运行时按 getNativeName() 查找）
asset_arch() {
  case "$1" in
    amd64) echo x64 ;;
    *) echo "$1" ;;
  esac
}

echo "==> 2/3 下载各架构的原生库（better_sqlite3.node）"
for arch in $ARCHS; do
  aarch=$(asset_arch "$arch")
  dir=".native-cross/linux_${aarch}_v${NATIVE_VERSION}"
  if [[ -f "${dir}/better_sqlite3.node" ]]; then
    echo "    ${arch}(${aarch}): 已存在，跳过"
    continue
  fi
  mkdir -p "$dir"
  url="https://github.com/any-listen/any-listen-web-server-native-lib/releases/download/v${NATIVE_VERSION}/linux_${aarch}_v${NATIVE_VERSION}.tar.gz"
  echo "    ${arch}(${aarch}): ${url}"
  curl -fsSL --retry 3 -o "/tmp/native-${aarch}.tar.gz" "$url"
  tar xzf "/tmp/native-${aarch}.tar.gz" -C "$dir"
  rm -f "/tmp/native-${aarch}.tar.gz"
done

echo "==> 3/3 装配镜像"
for arch in $ARCHS; do
  case "$arch" in
    amd64) platform=linux/amd64 ;;
    arm64) platform=linux/arm64 ;;
    arm)   platform=linux/arm/v7 ;;
    *) echo "不支持的架构: $arch"; exit 1 ;;
  esac
  image="${TAG}-${arch}"
  echo "--- ${platform} -> ${image}"
  podman build --network=host --platform "$platform" \
    --build-arg "NATIVE_ARCH=$(asset_arch "$arch")" \
    --build-arg "NATIVE_VERSION=${NATIVE_VERSION}" \
    "${BUILD_ARGS[@]}" \
    --ignorefile .dockerignore.cross \
    -f Dockerfile.cross \
    -t "$image" .
  if [[ -n "$SAVE_DIR" ]]; then
    mkdir -p "$SAVE_DIR"
    echo "    导出 $SAVE_DIR/any-listen-${arch}.tar"
    podman save -o "$SAVE_DIR/any-listen-${arch}.tar" "$image"
  fi
done

echo
echo "完成。用法："
echo "  本机运行      : podman run --platform linux/<arch> ... ${TAG}-<arch>"
echo "  拷到 ARM 机器 : podman load -i any-listen-arm64.tar"
echo "  打多架构清单  : podman manifest create ${TAG} && podman manifest add ${TAG} docker://... "
echo "                  （或先 podman push 各架构镜像，再把 manifest 推到 registry）"
