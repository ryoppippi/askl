#!/bin/sh
# askl installer — usage: curl -fsSL https://raw.githubusercontent.com/ryoppippi/oxlint-plugin-agent-skills/main/scripts/install.sh | sh
# Pins the release, verifies SHA-256 against the release's checksums.txt,
# and only replaces an existing askl after verification succeeds.
set -eu

REPO="ryoppippi/oxlint-plugin-agent-skills"
INSTALL_DIR="${ASKL_INSTALL_DIR:-$HOME/.local/bin}"

# Detect platform
case "$(uname -s)" in
  Darwin) os="darwin" ;;
  Linux) os="linux" ;;
  *) echo "askl: unsupported OS: $(uname -s) (use Windows via the .exe release asset)" >&2; exit 1 ;;
esac

case "$(uname -m)" in
  arm64 | aarch64) arch="arm64" ;;
  x86_64 | amd64) arch="x64" ;;
  *) echo "askl: unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

asset="askl-$os-$arch"

# Resolve "latest" to a concrete tag so the binary and checksums.txt are
# guaranteed to come from the same release.
tag="${ASKL_VERSION:-}"
if [ -z "$tag" ]; then
  tag=$(curl -fsSL -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest")
  tag="${tag##*/}"
fi
case "$tag" in
  v*) ;;
  *) echo "askl: could not resolve release tag (got: '$tag')" >&2; exit 1 ;;
esac

# ASKL_DOWNLOAD_BASE exists for the test suite; production installs always
# use GitHub Releases.
base="${ASKL_DOWNLOAD_BASE:-https://github.com/$REPO/releases/download}/$tag"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM

echo "Downloading $asset ($tag) ..."
curl -fsSL "$base/$asset" -o "$tmp/$asset"
curl -fsSL "$base/checksums.txt" -o "$tmp/checksums.txt"

# Verify SHA-256 before anything touches $INSTALL_DIR.
expected=$(grep " $asset\$" "$tmp/checksums.txt" | cut -d' ' -f1)
if [ -z "$expected" ]; then
  echo "askl: $asset not found in checksums.txt for $tag" >&2
  exit 1
fi
if command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "$tmp/$asset" | cut -d' ' -f1)
elif command -v shasum >/dev/null 2>&1; then
  actual=$(shasum -a 256 "$tmp/$asset" | cut -d' ' -f1)
else
  echo "askl: neither sha256sum nor shasum found; cannot verify download" >&2
  exit 1
fi
if [ "$actual" != "$expected" ]; then
  echo "askl: SHA-256 mismatch for $asset ($tag)" >&2
  echo "  expected: $expected" >&2
  echo "  actual:   $actual" >&2
  echo "  refusing to install." >&2
  exit 1
fi
echo "SHA-256 verified."

# Atomic install: the verified binary lands next to the target, then a
# rename replaces any existing askl — a failed download can never leave a
# broken or half-written binary in PATH.
mkdir -p "$INSTALL_DIR"
chmod +x "$tmp/$asset"
mv -f "$tmp/$asset" "$INSTALL_DIR/askl.tmp.$$"
mv -f "$INSTALL_DIR/askl.tmp.$$" "$INSTALL_DIR/askl"

echo "Installed askl $tag to $INSTALL_DIR/askl"

case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    echo ""
    echo "NOTE: $INSTALL_DIR is not in your PATH. Add this to your shell profile:"
    echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
    ;;
esac

echo ""
"$INSTALL_DIR/askl" --version
echo "Run 'askl --help' to get started."
