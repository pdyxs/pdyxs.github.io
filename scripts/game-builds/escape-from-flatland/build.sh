#!/usr/bin/env bash
# Rebuild Escape from Flatland's game.swf. Usage: build.sh <Escape-unzipped-dir> <FLEX_HOME> <out.swf>
# See README.md. Never builds inside the source dir: it works on a copy.
set -euo pipefail
SRC=$(realpath "$1"); export FLEX_HOME=$(realpath "$2"); OUT=$(realpath -m "$3")
HERE=$(cd "$(dirname "$0")" && pwd)
export PLAYERGLOBAL_HOME=$FLEX_HOME/frameworks/libs/player
W=$(mktemp -d); cp -r "$SRC" "$W/p"; cd "$W/p"
git apply --unsafe-paths -p1 "$HERE/offline.patch"
# Flex resolves [Embed] relative to the embedding file, so place assets beside each user.
mkdir -p src/assets src/com/pdyxs/ld21/flatland/assets
cp -r assets/audio assets/fonts src/assets/; cp -r assets/levels src/com/pdyxs/ld21/flatland/assets/
# The SDK's font transcoder cannot read CFF .otf; convert glyphs to TrueType (needs fonttools).
python3 "$HERE/otf2ttf.py" assets/fonts/MesquiteStd.otf src/assets/fonts/MesquiteStd.otf
"$FLEX_HOME/bin/mxmlc" -target-player=32.0 -locale=en_US \
  -source-path+=src -source-path+=Source -source-path+=greensock-as3 -source-path+="$HERE/stubs" \
  -source-path+="$HERE/../shared/ruffle-spark-label" \
  -library-path+=greensock-as3/greensock.swc -static-link-runtime-shared-libraries=true \
  -output "$OUT" src/Escape.mxml
echo "built $OUT (work dir $W)"
