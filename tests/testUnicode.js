var fastStream = require('../index.js')
var diff = require('deep-diff')
var Long = require('long')

var logDebug = true


//////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// - encode provided messages
// - decode encoded binary buffer
// - compare excepted and encoded message
// - print out differences if exists
//
//////////////////////////////////////////////////////////////////////////////////////////////////////////////
function testCodec() {
  var buffer = [192, 145, 200, 35, 113, 20, 30, 85, 107, 99, 230, 207, 78, 66, 90, 176, 176, 208, 164, 209, 140, 209, 142, 209, 135, 208, 181, 209, 128, 209, 129, 208, 189, 209, 139, 208, 185, 32, 208, 186, 208, 190, 208, 189, 209, 130, 209, 128, 208, 176, 208, 186, 209, 130, 32, 78, 66, 82, 45, 49, 50, 46, 50, 48, 47, 73, 228, 78, 66, 82, 45, 49, 50, 46, 50, 176, 184, 128, 70, 88, 88, 88, 88, 216, 128, 130, 129, 146, 85, 83, 196, 198, 130, 79, 224, 128, 133, 70, 85, 84, 45, 66, 79, 79, 75, 45, 177, 130, 130, 70, 85, 84, 45, 66, 79, 79, 75, 45, 181, 134, 131, 70, 85, 84, 45, 66, 79, 79, 75, 45, 50, 176, 149, 131, 70, 85, 84, 45, 66, 79, 79, 75, 45, 53, 176, 179, 131, 70, 85, 84, 45, 84, 82, 65, 68, 69, 211, 128, 128, 130, 78, 66, 210, 128, 128, 251, 91, 118, 232, 251, 126, 56, 45, 168, 251, 7, 232, 251, 46, 43, 163, 254, 0, 105, 2, 140, 254, 0, 101, 127, 220, 128, 128, 128, 128, 128, 128, 128, 128, 131, 135, 9, 80, 125, 241, 35, 113, 26, 34, 49, 105, 121, 128, 133, 9, 80, 123, 211, 35, 113, 19, 125, 93, 0, 25, 128, 9, 80, 125, 171, 100, 17, 49, 129, 0, 244]

  
  // encode message
  var encoder = new fastStream.Encoder('unicodeString.xml')
  var output = []

  // decode buffer
  var decoder = new fastStream.Decoder('unicodeString.xml')
  var i = 0
  decoder.decode(buffer, function(msg, name) {
    output = encoder.encode(name, msg)
    if (logDebug) console.log('Output message:', msg)
    ++i
  })

  for (var i = 0; i < output.length; ++i) {
	  if (output[i] != buffer[i]) console.log('Diff found at index ' + i)
  }
}

testCodec()

console.log('Test done.')
