const fastStream = require('fast-protocol')
const fs = require('fs')
const debug = require('debug')('gwlog')

function toHexString(byteArray) {
  var s = '';
  byteArray.forEach(function(byte) {
    s += ('0' + (byte & 0xFF).toString(16)).slice(-2) + ' ';
  });
  return s;
}

const HEADER_SIZE = 20
const inputFile = fs.openSync(process.argv[2], 'r')

let header = Buffer.alloc(HEADER_SIZE)
let datagram = Buffer.alloc(1500)

let decoder = new fastStream.Decoder(process.argv[3])

let index = 1
for (let bytesHeader = fs.readSync(inputFile, header, 0, HEADER_SIZE, null); bytesHeader == HEADER_SIZE;bytesHeader = fs.readSync(inputFile, header, 0, HEADER_SIZE, null)) {
	let dataLength = header.readUInt16LE(16)
	let bytesData = fs.readSync(inputFile, datagram, 0, dataLength, null)
	console.log(index++, ' datagram length:', dataLength)

	decoder.decode(datagram.slice(0, dataLength), function(msg, name){
		console.log(name + ':', msg)
		//console.log(name + ':', JSON.stringify(msg))
	})
}
fs.closeSync(inputFile)


