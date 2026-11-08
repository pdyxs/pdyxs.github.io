# Whenfore Art Thou: reproducible build

`src/content/what/games/digital/whenfore-art-thou/game.swf` is built from `pdyxs/ld22` at
commit `17faba2` ("the END ish", 2011-12-20 13:34 +1100, the last commit of the Ludum Dare 22 jam),
project dir `whenfore/`, patched to run without its server. The repo is not vendored: clone it and
extract that commit anywhere (`git -C ld22 archive 17faba2 | tar -x -C <dir>`), then pass `<dir>` to `build.sh`.

Not the original: `whenthrow/` (what the card used to ship, `whenthrow/bin-release/whenfore.swf`) and
`whenbirthday/` are April 2012 copies with kittens and `PartN.xml` scenes (the "Throwmas" e-card).
`whenfore/` is the only dir in the jam history, with the `Act*Scene*.xml` scenes.

## Toolchain
Same as `../escape-from-flatland/README.md`: Apache Flex SDK 4.16.1 binary plus Adobe
`playerglobal32_0.swc` at `$FLEX_HOME/frameworks/libs/player/32.0/playerglobal.swc`, and Java.
FlashPunk and GreenSock come from the repo itself (`flashpunk/`, `greensock-as3/`); nothing else is needed.

## Recipe
    scripts/game-builds/whenfore/build.sh <ld22 @ 17faba2 dir> <FLEX_HOME> game.swf

applies `offline.patch`, copies `whenfore/assets` beside the three classes that `[Embed]` them
(Flex resolves `[Embed]` relative to the embedding file), then runs mxmlc with
`-target-player=32.0 -source-path+=src,../flashpunk,../greensock-as3`.

## Patch (marked "OFFLINE")
The game talks to `http://www.pdyxs.org/whenfor/*.php` (`php_sql_server/` in the repo: PHP+MySQL, long gone)
for the user's battles and to store decisions. `offline.patch` replaces `makeServerRequest` in
`whenfore.mxml` with an in-memory stand-in that returns the same XML the PHP scripts printed
(one user, one battle, decisions kept for the session). `WhEngine` is already created single-player
(`isSinglePlayer=true`), so the server only ever stored decisions. The launcher UI (Start!, MakeDecision,
the battle button, the debug label) is the original's, unchanged: click the "Battle 1" button to start.

`dbConnect.php` in the archived repo holds a plaintext database password. It is not copied anywhere here.
