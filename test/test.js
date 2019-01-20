const expect = require('chai').expect
var FastStream = require('../index.js')
//var assert = require('assert');
var diff = require('deep-diff')

var logDebug = false

function toHexString(byteArray) {
  var s = ''
  byteArray.forEach(function(byte) {
    s += ('0' + (byte & 0xFF).toString(16)).slice(-2) + ' '
  })
  return s
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


//////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// - encode provided messages
// - decode encoded binary buffer
// - compare excepted and encoded message
// - print out differences if exists
//
//////////////////////////////////////////////////////////////////////////////////////////////////////////////
function testCodec(messages) {
  var buffer = []

  // encode messages ony by one
  var encoder = new FastStream.Encoder(__dirname + '/test.xml')
  for (var i = 0; i < messages.length; ++i) {
    if (logDebug) console.log('Input message:', messages[i].msg)
    buffer = buffer.concat(encoder.encode(messages[i].name, messages[i].msg))
  }

  if (logDebug) console.log('\n', toHexString(buffer), '\n')

  // decode buffer
  var decoder = new FastStream.Decoder(__dirname + '/test.xml')
  var i = 0
  decoder.decode(buffer, function(msg, name) {

    if (logDebug) console.log('Output message(', name, '):\n', msg)

    var differences = diff(messages[i].msg, msg)
    if (differences != null) {
      for (var d = 0; d < differences.length; ++d) {
        switch (differences[d].kind) {
          case 'N': // indicates a newly added property/element
            console.log('Error: Additional property found:', messages[i].name, '.', join(differences[d].path))
            break
          case 'D': // indicates a property/element was deleted
            console.log('Error: Property ', messages[i].name, '.', join(differences[d].path), 'missing')
            break
          case 'E': // indicates a property/element was changed
            console.log('Error: Property value', messages[i].name, '.', join(differences[d].path), 'differs:', differences[d].lhs, '<>', differences[d].rhs)
            break
          case 'A': // indicates a change occurred within an array
            console.log('Error: Array content ', messages[i].name, '.', join(differences[d].path), 'differs:', differences[d].lhs, '<>', differences[d].rhs)
            break
        }
      }
      expect(messages[i].msg).to.be.deep.equal(msg);
      throw new Error('Decoded message does not match expected message')
    }
    console.log('Info: ', messages[i].name, 'passed test')
    ++i

    //assert.deepEqual(messages[i].msg, msg, differences)
    /*
    if (JSON.stringify(messages[i++].msg) !== JSON.stringify(msg)) {
      console.log('Output message:', msg)
      console.log('Expected message:', messages[i-1].msg)
      throw new Error('Decoded message does not match input message')
    }*/
  })
}


console.log('Start testing fast-protocol encode/decode')


testCodec([
  {
    name: "Int32TestMessage",
    msg: {
      Int32Array: [
        {
          MandatoryInt32: -8193,
          MandatoryInt32Const: -2147483648,
          MandatoryInt32Copy: 2147483647,
          MandatoryInt32Default: 2147483647,
          MandatoryInt32Increment: -2147483648,
          MandatoryInt32Delta: -2147483648,
          OptionalInt32: -942755,
          OptionalInt32Const: undefined,
          OptionalInt32Copy: undefined,
          OptionalInt32Default: undefined,
          OptionalInt32DefaultWithoutValue: undefined,
          OptionalInt32Increment: undefined,
          OptionalInt32Delta: undefined
        },
        {
          MandatoryInt32: 1,
          MandatoryInt32Const: -2147483648,
          MandatoryInt32Copy: 2147483647,
          MandatoryInt32Default: 2147483647,
          MandatoryInt32Increment: -2147483648,
          MandatoryInt32Delta: -2147483648,
          OptionalInt32: undefined,
          OptionalInt32Const: undefined,
          OptionalInt32Copy: undefined,
          OptionalInt32Default: undefined,
          OptionalInt32DefaultWithoutValue: undefined,
          OptionalInt32Increment: undefined,
          OptionalInt32Delta: undefined
        },
        {
          MandatoryInt32: 1000,
          MandatoryInt32Const: -2147483648,
          MandatoryInt32Copy: 2147483647,
          MandatoryInt32Default: -2147483648,
          MandatoryInt32Increment: -2147483647,
          MandatoryInt32Delta: 2147483647,
          OptionalInt32: 1,
          OptionalInt32Const: -2147483648,
          OptionalInt32Copy: undefined,
          OptionalInt32Default: 2147483647,
          OptionalInt32DefaultWithoutValue: 2147483646,
          OptionalInt32Increment: 0,
          OptionalInt32Delta: 0
        },
        {
          MandatoryInt32: 1000000,
          MandatoryInt32Const: -2147483648,
          MandatoryInt32Copy: -2147483648,
          MandatoryInt32Default: 2147483647,
          MandatoryInt32Increment: -1,
          MandatoryInt32Delta: -2147483648,
          OptionalInt32: undefined,
          OptionalInt32Const: undefined,
          OptionalInt32Copy: undefined,
          OptionalInt32Default: undefined,
          OptionalInt32DefaultWithoutValue: undefined,
          OptionalInt32Increment: undefined,
          OptionalInt32Delta: undefined
        },
        {
          MandatoryInt32: 1000000000,
          MandatoryInt32Const: -2147483648,
          MandatoryInt32Copy: -2147483648,
          MandatoryInt32Default: -2147483648,
          MandatoryInt32Increment: 0,
          MandatoryInt32Delta: 1,
          OptionalInt32: -1,
          OptionalInt32Const: -2147483648,
          OptionalInt32Copy: undefined,
          OptionalInt32Default: 1,
          OptionalInt32DefaultWithoutValue: 1,
          OptionalInt32Increment: -1,
          OptionalInt32Delta: -2147483648
        },
        {
          MandatoryInt32: 2000000000,
          MandatoryInt32Const: -2147483648,
          MandatoryInt32Copy: 0,
          MandatoryInt32Default: 0,
          MandatoryInt32Increment: 1,
          MandatoryInt32Delta: 0,
          OptionalInt32: -2147483648,
          OptionalInt32Const: undefined,
          OptionalInt32Copy: undefined,
          OptionalInt32Default: 0,
          OptionalInt32DefaultWithoutValue: 0,
          OptionalInt32Increment: 0,
          OptionalInt32Delta: 2147483647
        },
        {
          MandatoryInt32: -2000000000,
          MandatoryInt32Const: -2147483648,
          MandatoryInt32Copy: 2147483647,
          MandatoryInt32Default: 2147483647,
          MandatoryInt32Increment: -1,
          MandatoryInt32Delta: -1,
          OptionalInt32: undefined,
          OptionalInt32Const: -2147483648,
          OptionalInt32Copy: undefined,
          OptionalInt32Default: -1,
          OptionalInt32DefaultWithoutValue: -1,
          OptionalInt32Increment: 1,
          OptionalInt32Delta: -1
        },
        {
          MandatoryInt32: -2147483648,
          MandatoryInt32Const: -2147483648,
          MandatoryInt32Copy: -2147483648,
          MandatoryInt32Default: -2147483648,
          MandatoryInt32Increment: 2147483647,
          MandatoryInt32Delta: 2147483647,
          OptionalInt32: 2147483646,
          OptionalInt32Const: undefined,
          OptionalInt32Copy: undefined,
          OptionalInt32Default: 2147483647,
          OptionalInt32DefaultWithoutValue: undefined,
          OptionalInt32Increment: -2147483648,
          OptionalInt32Delta: 0
        },
        {
          MandatoryInt32: 2147483647,
          MandatoryInt32Const: -2147483648,
          MandatoryInt32Copy: -1,
          MandatoryInt32Default: -1,
          MandatoryInt32Increment: 0,
          MandatoryInt32Delta: -1,
          OptionalInt32: 0,
          OptionalInt32Const: -2147483648,
          OptionalInt32Copy: undefined,
          OptionalInt32Default: undefined,
          OptionalInt32DefaultWithoutValue: undefined,
          OptionalInt32Increment: -2147483648,
          OptionalInt32Delta: 0
        }
      ]
    }
  }
])


testCodec([
  {
    name: "UInt32TestMessage",
    msg: {
      UInt32Array: [
        {
          MandatoryUInt32: 1,
          MandatoryUInt32Const: 4294967295,
          MandatoryUInt32Copy: 1,
          MandatoryUInt32Default: 1,
          MandatoryUInt32Increment: 1,
          MandatoryUInt32Delta: 0,
          OptionalUInt32: undefined,
          OptionalUInt32Const: undefined,
          OptionalUInt32Copy: undefined,
          OptionalUInt32Default: undefined,
          OptionalUInt32DefaultWithoutValue: undefined,
          OptionalUInt32Incremental: undefined,
          OptionalUInt32Delta: undefined
        },
        {
          MandatoryUInt32: 1000,
          MandatoryUInt32Const: 4294967295,
          MandatoryUInt32Copy: 1,
          MandatoryUInt32Default: 2147483647,
          MandatoryUInt32Increment: 0,
          MandatoryUInt32Delta: 1,
          OptionalUInt32: 0,
          OptionalUInt32Const: 4294967295,
          OptionalUInt32Copy: 1,
          OptionalUInt32Default: 2147483646,
          OptionalUInt32DefaultWithoutValue: 2147483646,
          OptionalUInt32Incremental: 0,
          OptionalUInt32Delta: 0
        },
        {
          MandatoryUInt32: 1000000,
          MandatoryUInt32Const: 4294967295,
          MandatoryUInt32Copy: 2147483647,
          MandatoryUInt32Default: 0,
          MandatoryUInt32Increment: 1,
          MandatoryUInt32Delta: 2147483647,
          OptionalUInt32: undefined,
          OptionalUInt32Const: undefined,
          OptionalUInt32Copy: undefined,
          OptionalUInt32Default: undefined,
          OptionalUInt32DefaultWithoutValue: undefined,
          OptionalUInt32Incremental: 1,
          OptionalUInt32Delta: undefined
        },
        {
          MandatoryUInt32: 1000000000,
          MandatoryUInt32Const: 4294967295,
          MandatoryUInt32Copy: 2147483647,
          MandatoryUInt32Default: 1,
          MandatoryUInt32Increment: 2,
          MandatoryUInt32Delta: 0,
          OptionalUInt32: 2147483646,
          OptionalUInt32Const: undefined,
          OptionalUInt32Copy: 2147483646,
          OptionalUInt32Default: 2147483646,
          OptionalUInt32DefaultWithoutValue: 2147483646,
          OptionalUInt32Incremental: undefined,
          OptionalUInt32Delta: 0
        },
        {
          MandatoryUInt32: 2000000000,
          MandatoryUInt32Const: 4294967295,
          MandatoryUInt32Copy: 0,
          MandatoryUInt32Default: 2147483647,
          MandatoryUInt32Increment: 2147483647,
          MandatoryUInt32Delta: 2147483647,
          OptionalUInt32: undefined,
          OptionalUInt32Const: 4294967295,
          OptionalUInt32Copy: 2147483646,
          OptionalUInt32Default: 0,
          OptionalUInt32DefaultWithoutValue: 0,
          OptionalUInt32Incremental: 2147483645,
          OptionalUInt32Delta: 1
        },
        {
          MandatoryUInt32: 4000000000,
          MandatoryUInt32Const: 4294967295,
          MandatoryUInt32Copy: 1,
          MandatoryUInt32Default: 1,
          MandatoryUInt32Increment: 2147483647,
          MandatoryUInt32Delta: 2147483647,
          OptionalUInt32: 1,
          OptionalUInt32Const: undefined,
          OptionalUInt32Copy: undefined,
          OptionalUInt32Default: undefined,
          OptionalUInt32DefaultWithoutValue: undefined,
          OptionalUInt32Incremental: 2147483646,
          OptionalUInt32Delta: 2147483646
        },
        {
          MandatoryUInt32: 2147483647,
          MandatoryUInt32Const: 4294967295,
          MandatoryUInt32Copy: 2,
          MandatoryUInt32Default: 0,
          MandatoryUInt32Increment: 2147483647,
          MandatoryUInt32Delta: 0,
          OptionalUInt32: 0,
          OptionalUInt32Const: 4294967295,
          OptionalUInt32Copy: 0,
          OptionalUInt32Default: 1,
          OptionalUInt32DefaultWithoutValue: 1,
          OptionalUInt32Incremental: undefined,
          OptionalUInt32Delta: 0
        }
      ]
    }
  }
])

testCodec([
  {
    name: "Int64TestMessage",
    msg: {
      Int64Array: [
        {
          MandatoryInt64: "-8193",
          MandatoryInt64Const: "-9223372036854775807",
          MandatoryInt64Copy: "-942755",
          MandatoryInt64Default: "9223372036854775807",
          MandatoryInt64Increment: "-9223372036854775807",
          MandatoryInt64Delta: "-9223372036854775807",
          OptionalInt64: "-942755",
          OptionalInt64Const: undefined,
          OptionalInt64Copy: undefined,
          OptionalInt64Default: undefined,
          OptionalInt64DefaultWithoutValue: undefined,
          OptionalInt64Increment: undefined,
          OptionalInt64Delta: undefined
        },
        {
          MandatoryInt64: "1",
          MandatoryInt64Const: "-9223372036854775807",
          MandatoryInt64Copy: "9223372036854775807",
          MandatoryInt64Default: "9223372036854775807",
          MandatoryInt64Increment: "-9223372036854775807",
          MandatoryInt64Delta: "-9223372036854775807",
          OptionalInt64: undefined,
          OptionalInt64Const: undefined,
          OptionalInt64Copy: undefined,
          OptionalInt64Default: undefined,
          OptionalInt64DefaultWithoutValue: undefined,
          OptionalInt64Increment: undefined,
          OptionalInt64Delta: undefined
        },
        {
          MandatoryInt64: "1000",
          MandatoryInt64Const: "-9223372036854775807",
          MandatoryInt64Copy: "9223372036854775807",
          MandatoryInt64Default: "-9223372036854775807",
          MandatoryInt64Increment: "-9223372036854775806",
          MandatoryInt64Delta: "9223372036854775807",
          OptionalInt64: "1",
          OptionalInt64Const: "-9223372036854775807",
          OptionalInt64Copy: undefined,
          OptionalInt64Default: "9223372036854775806",
          OptionalInt64DefaultWithoutValue: "9223372036854775806",
          OptionalInt64Increment: "0",
          OptionalInt64Delta: "0"
        },
        {
          MandatoryInt64: "1000000",
          MandatoryInt64Const: "-9223372036854775807",
          MandatoryInt64Copy: "-9223372036854775807",
          MandatoryInt64Default: "9223372036854775807",
          MandatoryInt64Increment: "-1",
          MandatoryInt64Delta: "-9223372036854775807",
          OptionalInt64: undefined,
          OptionalInt64Const: undefined,
          OptionalInt64Copy: undefined,
          OptionalInt64Default: undefined,
          OptionalInt64DefaultWithoutValue: undefined,
          OptionalInt64Increment: undefined,
          OptionalInt64Delta: undefined
        },
        {
          MandatoryInt64: "1000000000",
          MandatoryInt64Const: "-9223372036854775807",
          MandatoryInt64Copy: "-9223372036854775807",
          MandatoryInt64Default: "-9223372036854775807",
          MandatoryInt64Increment: "0",
          MandatoryInt64Delta: "1",
          OptionalInt64: "-1",
          OptionalInt64Const: "-9223372036854775807",
          OptionalInt64Copy: undefined,
          OptionalInt64Default: "1",
          OptionalInt64DefaultWithoutValue: "1",
          OptionalInt64Increment: "-1",
          OptionalInt64Delta: "-9223372036854775807"
        },
        {
          MandatoryInt64: "1000000000000",
          MandatoryInt64Const: "-9223372036854775807",
          MandatoryInt64Copy: "0",
          MandatoryInt64Default: "0",
          MandatoryInt64Increment: "1",
          MandatoryInt64Delta: "0",
          OptionalInt64: "-9223372036854775807",
          OptionalInt64Const: undefined,
          OptionalInt64Copy: undefined,
          OptionalInt64Default: "0",
          OptionalInt64DefaultWithoutValue: "0",
          OptionalInt64Increment: "0",
          OptionalInt64Delta: "9223372036854775806"
        },
        {
          MandatoryInt64: "1000000000000000",
          MandatoryInt64Const: "-9223372036854775807",
          MandatoryInt64Copy: "9223372036854775807",
          MandatoryInt64Default: "9223372036854775807",
          MandatoryInt64Increment: "-1",
          MandatoryInt64Delta: "-1",
          OptionalInt64: undefined,
          OptionalInt64Const: "-9223372036854775807",
          OptionalInt64Copy: undefined,
          OptionalInt64Default: "-1",
          OptionalInt64DefaultWithoutValue: "-1",
          OptionalInt64Increment: "1",
          OptionalInt64Delta: "-1"
        },
        {
          MandatoryInt64: "-9223372036854775807",
          MandatoryInt64Const: "-9223372036854775807",
          MandatoryInt64Copy: "-9223372036854775807",
          MandatoryInt64Default: "-9223372036854775807",
          MandatoryInt64Increment: "9223372036854775807",
          MandatoryInt64Delta: "9223372036854775807",
          OptionalInt64: "9223372036854775806",
          OptionalInt64Const: undefined,
          OptionalInt64Copy: undefined,
          OptionalInt64Default: "9223372036854775806",
          OptionalInt64DefaultWithoutValue: "9223372036854775806",
          OptionalInt64Increment: "-9223372036854775807",
          OptionalInt64Delta: "0"
        },
        {
          MandatoryInt64: "9223372036854775807",
          MandatoryInt64Const: "-9223372036854775807",
          MandatoryInt64Copy: "-1",
          MandatoryInt64Default: "-1",
          MandatoryInt64Increment: "0",
          MandatoryInt64Delta: "-1",
          OptionalInt64: "0",
          OptionalInt64Const: "-9223372036854775807",
          OptionalInt64Copy: undefined,
          OptionalInt64Default: undefined,
          OptionalInt64DefaultWithoutValue: undefined,
          OptionalInt64Increment: "-9223372036854775806",
          OptionalInt64Delta: "0"
        }
      ]
    }
  }
])

testCodec([
  {
    name: "UInt64TestMessage",
    msg: {
      UInt64Array: [
        {
          MandatoryUInt64: "1",
          MandatoryUInt64Const: "18446744073709551615",
          MandatoryUInt64Copy: "1",
          MandatoryUInt64Default: "1",
          MandatoryUInt64Increment: "1",
          MandatoryUInt64Delta: "0",
          OptionalUInt64: undefined,
          OptionalUInt64Const: undefined,
          OptionalUInt64Copy: undefined,
          OptionalUInt64Default: undefined,
          OptionalUInt64DefaultWithoutValue: undefined,
          OptionalUInt64Incremental: undefined,
          OptionalUInt64Delta: undefined
        },
        {
          MandatoryUInt64: "1000",
          MandatoryUInt64Const: "18446744073709551615",
          MandatoryUInt64Copy: "1",
          MandatoryUInt64Default: "18446744073709551615",
          MandatoryUInt64Increment: "0",
          MandatoryUInt64Delta: "1",
          OptionalUInt64: "0",
          OptionalUInt64Const: "18446744073709551615",
          OptionalUInt64Copy: "1",
          OptionalUInt64Default: "18446744073709551615",
          OptionalUInt64DefaultWithoutValue: "18446744073709551614",
          OptionalUInt64Incremental: "0",
          OptionalUInt64Delta: "0"
        },
        {
          MandatoryUInt64: "1000000",
          MandatoryUInt64Const: "18446744073709551615",
          MandatoryUInt64Copy: "18446744073709551615",
          MandatoryUInt64Default: "0",
          MandatoryUInt64Increment: "1",
          MandatoryUInt64Delta: "18446744073709551615",
          OptionalUInt64: undefined,
          OptionalUInt64Const: undefined,
          OptionalUInt64Copy: undefined,
          OptionalUInt64Default: undefined,
          OptionalUInt64DefaultWithoutValue: undefined,
          OptionalUInt64Incremental: "1",
          OptionalUInt64Delta: undefined
        },
        {
          MandatoryUInt64: "1000000000",
          MandatoryUInt64Const: "18446744073709551615",
          MandatoryUInt64Copy: "18446744073709551615",
          MandatoryUInt64Default: "1",
          MandatoryUInt64Increment: "2",
          MandatoryUInt64Delta: "0",
          OptionalUInt64: "18446744073709551614",
          OptionalUInt64Const: undefined,
          OptionalUInt64Copy: "18446744073709551614",
          OptionalUInt64Default: "18446744073709551615",
          OptionalUInt64DefaultWithoutValue: "18446744073709551614",
          OptionalUInt64Incremental: undefined,
          OptionalUInt64Delta: "0"
        },
        {
          MandatoryUInt64: "1000000000000",
          MandatoryUInt64Const: "18446744073709551615",
          MandatoryUInt64Copy: "0",
          MandatoryUInt64Default: "18446744073709551615",
          MandatoryUInt64Increment: "18446744073709551613",
          MandatoryUInt64Delta: "18446744073709551615",
          OptionalUInt64: undefined,
          OptionalUInt64Const: "18446744073709551615",
          OptionalUInt64Copy: "18446744073709551614",
          OptionalUInt64Default: "0",
          OptionalUInt64DefaultWithoutValue: "184467440737",
          OptionalUInt64Incremental: "18446744073709551613",
          OptionalUInt64Delta: "1"
        },
        {
          MandatoryUInt64: "1000000000000000",
          MandatoryUInt64Const: "18446744073709551615",
          MandatoryUInt64Copy: "1",
          MandatoryUInt64Default: "1",
          MandatoryUInt64Increment: "18446744073709551614",
          MandatoryUInt64Delta: "18446744073709551615",
          OptionalUInt64: "1",
          OptionalUInt64Const: undefined,
          OptionalUInt64Copy: undefined,
          OptionalUInt64Default: undefined,
          OptionalUInt64DefaultWithoutValue: undefined,
          OptionalUInt64Incremental: "18446744073709551614",
          OptionalUInt64Delta: "18446744073709551614"
        },
        {
          MandatoryUInt64: "18446744073709551615",
          MandatoryUInt64Const: "18446744073709551615",
          MandatoryUInt64Copy: "2",
          MandatoryUInt64Default: "0",
          MandatoryUInt64Increment: "18446744073709551615",
          MandatoryUInt64Delta: "0",
          OptionalUInt64: "0",
          OptionalUInt64Const: "18446744073709551615",
          OptionalUInt64Copy: "0",
          OptionalUInt64Default: "1",
          OptionalUInt64DefaultWithoutValue: "1",
          OptionalUInt64Incremental: undefined,
          OptionalUInt64Delta: "0"
        }
      ]
    }
  }
])

testCodec([
  {
    name: "StringTestMessage",
    msg: {
      StringArray: [
        {
          MandatoryString: "",
          MandatoryStringConst: "Hello World",
          MandatoryStringCopy: "",
          MandatoryStringDefault: "",
          //MandatoryStringTail: "",
          MandatoryStringDelta: "",
          OptionalString: undefined,
          OptionalStringConst: undefined,
          OptionalStringCopy: undefined,
          OptionalStringDefault: undefined,
          OptionalStringIncremental: undefined,
          OptionalStringDelta: undefined
        }
      ]
    }
  }
])


testCodec([
  {
    name: "StringTestMessageDelta",
    msg: {
      StringArray: [
        {MandatoryStringDelta: "Hello"},
        {MandatoryStringDelta: "Hello World"},
        {MandatoryStringDelta: "Hello World"},
        {MandatoryStringDelta: "World"},
        {MandatoryStringDelta: "Hello World"},
        {MandatoryStringDelta: "Hello World!"},
        {MandatoryStringDelta: "!Hello World"}
      ]
    }
  }
])

// test RDPacketHeader
testCodec([
  {
    name: "RDPacketHeader",
    msg: { SenderCompID: 1,
      PacketSeqNum: [ 0, 8, 58, 9 ],
      SendingTime: [ 21, 105, 89, 139, 55, 77, 80, 125 ] }
  },
  {
    name: "RDPacketHeader",
    msg: { SenderCompID: 2,
      PacketSeqNum: [ 0, 8, 58, 10 ],
      SendingTime: [ 21, 105, 89, 139, 55, 77, 80, 126 ] }
  }
])


testCodec([
  {
    name: "DeltaStringOperatorMessage",
    msg: {MandatoryStringDelta: "Hello"}
  },
  {
    name: "DeltaStringOperatorMessage",
    msg: {MandatoryStringDelta: "Hello World"}
  },
  {
    name: "DeltaStringOperatorMessage",
    msg: {MandatoryStringDelta: "World"}
  }
])


// test TestMessage
testCodec([
  {
    name: "TestMessage",  // #1
    msg: {
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
  },
  {
    name: "TestMessage",  // #2
    msg: {
      MandatoryUInt32: 123,
      MandatoryUInt32Increment: 235,
      MandatoryUInt32Copy: 456,
      MandatoryUInt32Default: 567,
      MandatoryUInt32Delta: 678,
      MandatoryString: 'HELLO',
      MandatoryStringCopy: 'XXX',
      MandatoryStringDefault: 'HELLO',
      MandatoryStringDelta: '123789',
      OptionalUInt32: 100,
      OptionalUInt32Increment: 201,
      OptionalUInt32Copy: 300,
      OptionalUInt32Default: 400,
      OptionalUInt32Delta: 500,
      OptionalString: "BUZZ",
      OptionalStringCopy: "FOO",
      OptionalStringDefault: 'YYY',
      MandatoryGroup: {
        GrpMandatoryUInt32: 321,
        GrpMandatoryUInt32Increment: 655
      },
      OptionalGroup: undefined
    }
  },
])

// test Decimal
testCodec([
  {
    name: "DecimalTestMessage",
    msg: {
      DecimalArray: [
        {
          MandatoryDecimal: "1e2",
          MandatoryDecimalConst: "1e0",
          MandatoryDecimalCopy: "3e-2",
          MandatoryDecimalDelta: "3e-2",
          MandatoryDecimalDefault: "1e0",
          OptionalDecimal: undefined,
          OptionalDecimalConst: undefined,
          OptionalDecimalCopy: undefined,
          OptionalDecimalDelta: undefined,
          OptionalDecimalDefault: undefined,
        }
      ]
    }
  },
  {
    name: "DecimalTestMessage",
    msg: {
      DecimalArray: [
        {
          MandatoryDecimal: "1e2",
          MandatoryDecimalConst: "1e0",
          MandatoryDecimalCopy: "3e-2",
          MandatoryDecimalDelta: "3e-2",
          MandatoryDecimalDefault: "1e0",
          OptionalDecimal: "2e-1",
          OptionalDecimalConst: "1e0",
          OptionalDecimalCopy: "2e-1",
          OptionalDecimalDelta: "2e-1",
          OptionalDecimalDefault: "1e0",
        }
      ]
    }
  },
  {
    name: "DecimalTestMessage",
    msg: {
      DecimalArray: [
        {
          MandatoryDecimal: "1e2",
          MandatoryDecimalConst: "1e0",
          MandatoryDecimalCopy: "3e-2",
          MandatoryDecimalDelta: "3e-2",
          MandatoryDecimalDefault: "1e0",
          OptionalDecimal: undefined,
          OptionalDecimalConst: undefined,
          OptionalDecimalCopy: undefined,
          OptionalDecimalDelta: undefined,
          OptionalDecimalDefault: undefined,
        }
      ]
    }
  }
])

// test SequenceMessage
testCodec([
  {
    name: "SequenceMessage",
    msg: {
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
  }
])

// test ByteVectorTestMessage
testCodec([
  {
    name: "ByteVectorTestMessage",
    msg: {
      ByteVectorArray: [
        {
          MandatoryByteVector: [23, 24, 25],
          MandatoryByteVectorConst: [0x12, 0x34, 0x56, 0x78, 0x90, 0xab, 0xcd, 0xef],
          MandatoryByteVectorCopy: [21, 22, 23],
          OptionalByteVector: undefined,
          OptionalByteVectorConst: undefined,
          OptionalByteVectorCopy: undefined
        }
      ]
    }
  }
])


console.log('Test done.')
