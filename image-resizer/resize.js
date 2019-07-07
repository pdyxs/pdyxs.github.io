var Jimp = require("jimp");
var fs = require('fs');
var imageCount = 0;

function resize(file, output, width, height){
	Jimp.read(file, function (err, fileImage) {
	    if (err) throw err;
			if (!height)
	     height = width * fileImage.bitmap.height / fileImage.bitmap.width;

	    fileImage.clone().cover(width, height).write(output);
	});
}

module.exports = resize;
