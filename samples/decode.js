var fastStream = require('../index.js')
var fs = require('fs');

console.log('Decode binary file', process.argv[2], 'using FAST template from', process.argv[3])
var buffer = fs.readFileSync(process.argv[2])

var decoder = new fastStream.Decoder(process.argv[3])
decoder.decode(buffer, function(msg, name){
			console.log(JSON.stringify(msg, null, 2))
		})

console.log('Done.')
