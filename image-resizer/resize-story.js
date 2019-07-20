var fs = require('fs');
var path = require('path');
var resize = require('./resize');
var _ = require('lodash');
var buildVideo = require('./buildvideo');

const getSubdirs = p => fs.readdirSync(p).filter(f => fs.statSync(path.join(p, f)).isDirectory())

function buildImages(file, subpath) {
  resize(path.resolve(file), path.resolve(path.join(subpath, "image.png")), 600, 600);
  resize(path.resolve(file), path.resolve(path.join(subpath, "social.png")), 1080, 1080);
}

function buildVideos(files, subpath) {
  var resolvedFiles = _.map(files, f => path.resolve(f));
  buildVideo(
    resolvedFiles,
    path.resolve(path.join(subpath, "image.mp4")),
    { size: '640x?' }
  ).then(() => buildVideo(
    resolvedFiles,
    path.resolve(path.join(subpath, "social.mp4")),
    { size: '1920x?' }
  ));
}

if (process.argv.length >= 3)
{
  var directory = process.argv[2];
  var dirs = getSubdirs(directory)
  for (var i = 0; i != dirs.length; ++i) {
    var subdir = dirs[i];

    var subpath = path.join(directory, subdir);

    var files = fs.readdirSync(subpath);

    for (var filei = 0; filei != files.length; ++filei) {
      var file = files[filei];
      if (file == "original.jpg" || file == "original.png") {
        buildImages(path.join(directory, subdir, file), subpath);
      }
    }

    var videoFiles = _.filter(files, f => _.startsWith(f, "original-"));
    if (videoFiles.length > 0 && !_.includes(files, "image.mp4")) {
      buildVideos(_.map(videoFiles, f => path.join(subpath, f)), subpath);
    }
  }
}
