var fs = require('fs');
var path = require('path');
var resize = require('./resize');

const getSubdirs = p => fs.readdirSync(p).filter(f => fs.statSync(path.join(p, f)).isDirectory())

function buildImages(file, subpath) {
  return (err) => {
    if (err) return;

    resize(path.resolve(file), path.resolve(path.join(subpath, "image.png")), 600, 600);
    resize(path.resolve(file), path.resolve(path.join(subpath, "social.png")), 1080, 1080);
  }
}

if (process.argv.length >= 3)
{
  var directory = process.argv[2];
  var dirs = getSubdirs(directory)
  for (var i = 0; i != dirs.length; ++i) {
    var subdir = dirs[i];

    var subpath = path.join(directory, subdir);
    var filejpg = path.join(directory, subdir, "original.jpg");
    var filepng = path.join(directory, subdir, "original.png");
    fs.access(filejpg, fs.constants.F_OK, buildImages(filejpg, subpath));
    fs.access(filepng, fs.constants.F_OK, buildImages(filepng, subpath));
  }
}
