const fastStream = require('fast-protocol')
const fs = require('fs')
const debug = require('debug')('gwlog')
var diff = require('deep-diff')

function toHexString(byteArray) {
  var s = '';
  byteArray.forEach(function(byte) {
    s += ('0' + (byte & 0xFF).toString(16)).slice(-2) + ' ';
  });
  return s;
}

function join(array) {
  var s = ''
  if (array) {
    array.forEach(function(token) {
      s += (token === parseInt(token, 10)) ? '[' + token + ']' : (s.length ? '.' : '') + token
    })
  }
  return s
}

const HEADER_SIZE = 20
const inputFile = fs.openSync(process.argv[2], 'r')

let header = Buffer.alloc(HEADER_SIZE)
let datagram = Buffer.alloc(1500)

let decoder = new fastStream.Decoder(process.argv[3])
let encoder = new fastStream.Encoder(process.argv[3])

let index = 0
for (let bytesHeader = fs.readSync(inputFile, header, 0, HEADER_SIZE, null); bytesHeader == HEADER_SIZE;bytesHeader = fs.readSync(inputFile, header, 0, HEADER_SIZE, null)) {
	let dataLength = header.readUInt16LE(16)
	let bytesData = fs.readSync(inputFile, datagram, 0, dataLength, null)
	console.log(++index, ' datagram length:', dataLength)

  let buffer = []
  let msgs1 = []
	decoder.decode(datagram.slice(0, dataLength), function(msg, name){
    msgs1.push(msg)
    //console.log(name + ':', msg)
    buffer = buffer.concat(encoder.encode(name, msg))
		//console.log(name + ':', JSON.stringify(msg))
	})

  console.log(index, ' encoded length:', buffer.length)

  let msgs2 = []
  let decoderTest = new fastStream.Decoder(process.argv[3])
  decoderTest.decode(buffer, function(msg, name){
    msgs2.push(msg)
		//console.log(name + ':', msg)
	})

  //console.log('\n', toHexString(datagram.slice(0, dataLength)), '\n')
  //console.log('\n', toHexString(buffer), '\n')

  // compare
  var differences = diff(msgs1, msgs2)
  if (differences != null) {
    for (var d = 0; d < differences.length; ++d) {
      switch (differences[d].kind) {
        case 'N': // indicates a newly added property/element
          console.log('Error: Additional property found:', join(differences[d].path))
          break
        case 'D': // indicates a property/element was deleted
          console.log('Error: Property ', join(differences[d].path), 'missing')
          break
        case 'E': // indicates a property/element was changed
          console.log('Error: Property value', join(differences[d].path), 'differs:', differences[d].lhs, '<>', differences[d].rhs)
          break
        case 'A': // indicates a change occurred within an array
          console.log('Error: Array content ', join(differences[d].path), 'differs:', differences[d].lhs, '<>', differences[d].rhs)
          break
      }
    }
    throw new Error('Decoded message does not match expected message')
  }
}
fs.closeSync(inputFile)
