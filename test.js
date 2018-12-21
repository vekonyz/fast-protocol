var FastStream = require('./index.js')


function toHexString(byteArray) {
  var s = '';
  byteArray.forEach(function(byte) {
    s += ('0' + (byte & 0xFF).toString(16)).slice(-2) + ' ';
  });
  return s;
}

var encoder = new FastStream.Encoder('test.xml')
var RDPacketHeader = { SenderCompID: 1,
  PacketSeqNum: [ 0, 8, 58, 9 ],
  SendingTime: [ 21, 105, 89, 139, 55, 77, 80, 126 ] }

var TestMessage = {
  MandatoryUInt32: 123,
  MandatoryUInt32Increment: 234,
  MandatoryUInt32Copy: 456,
  MandatoryUInt32Default: 567,
  MandatoryUInt32Delta: 678,
  MandatoryString: 'HELLO',
  MandatoryStringCopy: 'XXX',
  MandatoryStringDefault: 'HELLO',
  MandatoryStringDelta: '123456',
  OptionalUInt32: 100,
  OptionalUInt32Increment: 200,
  OptionalUInt32Copy: 300,
  OptionalUInt32Default: 400,
  OptionalUInt32Delta: 500,
  OptionalString: "BUZZ",
  OptionalStringCopy: "FOO",
  OptionalStringDefault: 'YYY',
  MandatoryGroup: {
    GrpMandatoryUInt32: 321,
    GrpMandatoryUInt32Increment: 654
  },
  OptionalGroup: {
    GrpMandatoryUInt32: 432,
  }
}

var DecimalMessage = {
  MandatoryDecimal: {m: 1, e: 0},
  MandatoryDecimalCopy: {m: 3, e: -2},
  OptionalDecimal: {m: 2, e: -1},
}

var SequenceMessage = {
  MandatorySequence: [
    {SeqMandatoryUInt32: 12,
    SeqMandatoryUInt32Increment: 23},
    {SeqMandatoryUInt32: 14,
    SeqMandatoryUInt32Increment: 24},
    {SeqMandatoryUInt32: 16,
    SeqMandatoryUInt32Increment: 25}
  ],
  OptionalSequence: [
    {SeqMandatoryUInt32: 18},
    {SeqMandatoryUInt32: 20}
  ],
  OptionalSequenceConstLength: [
    {SeqMandatoryUInt32: 33},
    {SeqMandatoryUInt32: 43}
  ]
}

var buffer = []

console.log('\n1. TestMessage:', TestMessage)
buffer = buffer.concat(encoder.encode('TestMessage', TestMessage))

TestMessage.MandatoryUInt32Increment++
TestMessage.MandatoryUInt32Delta = 378
TestMessage.MandatoryString = 'WORLD'
TestMessage.MandatoryStringDelta = '123'
TestMessage.MandatoryGroup.GrpMandatoryUInt32Increment++
console.log('\n2. TestMessage:', TestMessage)
buffer = buffer.concat(encoder.encode('TestMessage', TestMessage))

delete TestMessage.OptionalUInt32
delete TestMessage.OptionalUInt32Increment
delete TestMessage.OptionalUInt32Copy
delete TestMessage.OptionalUInt32Default
delete TestMessage.OptionalUInt32Delta
delete TestMessage.OptionalString
delete TestMessage.OptionalStringCopy
delete TestMessage.OptionalStringDefault
delete TestMessage.OptionalGroup
TestMessage.MandatoryUInt32Delta++
TestMessage.MandatoryString = '!'
TestMessage.MandatoryGroup.GrpMandatoryUInt32Increment++
console.log('\n3. TestMessage:', TestMessage)
buffer = buffer.concat(encoder.encode('TestMessage', TestMessage))
//console.log('\n', toHexString(buffer))

console.log('\n1. DecimalMessage:', DecimalMessage)
buffer = buffer.concat(encoder.encode('DecimalMessage', DecimalMessage))
//console.log('\n', toHexString(buffer))

delete DecimalMessage.OptionalDecimal
console.log('\n2. DecimalMessage:', DecimalMessage)
buffer = buffer.concat(encoder.encode('DecimalMessage', DecimalMessage))
//console.log('\n', toHexString(buffer))

console.log('\n1. SequenceMessage:', SequenceMessage)
buffer = buffer.concat(encoder.encode('SequenceMessage', SequenceMessage))
//console.log('\n', toHexString(buffer))

delete SequenceMessage.OptionalSequence
delete SequenceMessage.OptionalSequenceConstLength
console.log('\n2. SequenceMessage:', SequenceMessage)
buffer = buffer.concat(encoder.encode('SequenceMessage', SequenceMessage))
//console.log('\n', toHexString(buffer))

console.log('\n1. RDPacketHeader:', RDPacketHeader)
buffer = buffer.concat(encoder.encode('RDPacketHeader', RDPacketHeader))
//console.log('\n', toHexString(buffer))

var decoder = new FastStream.Decoder('test.xml')
decoder.decode(buffer, {
  'default': function(msg, name) {
    console.log('\n', name + ':', msg, '\n')
    //console.log('\n', name + ':', JSON.stringify(msg, null, 2))
  }
})

