# fast-protocol
FAST Streaming Protocol for Node.js (Encoder/Decoder for Javascript) (FAST protocol version 1.1) - still developer version, do not use!

```javascript
// load fast stream module
var FastStream = require('fast-protocol')

// create encoder using FAST template definition from file
var encoder = new FastStream.Encoder('emdi-7.0.xml')

// encode message
var buffer = encoder.encode('RDPacketHeader', { SenderCompID: 1,
  PacketSeqNum: [ 0, 8, 58, 9 ],
  SendingTime: [ 21, 105, 89, 139, 55, 77, 80, 126 ] })

// create message decoder
var decoder = new FastStream.Decoder('emdi-7.0.xml')

decoder.decode(buffer, {
  'RDPacketHeader': function(msg) {
    console.log('\nRDPacketHeader:', JSON.stringify(msg, null, 2))
  }
})
```
