# fast-protocol

[![Build Status](https://travis-ci.com/vekonyz/fast-protocol.svg?branch=master)](https://travis-ci.com/vekonyz/fast-protocol)

**fast-protocol** is a javascript/node.js module providing encoder/decoder functions for FAST -> 'FIX Adapted for Streaming' protocol version 1.1.

## Attention
Currently the module is still in development, therefore not yet usable.

## Install

```bash
npm install fast-protocol
```

## Features

* Load FAST xml template definition from file
* Provide FAST message encoding and decoding

## Known limitations
* no 'streaming' support, only datagram or complete buffer can be encoded
* no templateRef support
* no individual operator support for decimal

### Importing

```javascript
var fastStream = require('fast-protocol')
```

## Simple Examples

### Encoding
The following example shows simple encoding usage:

```javascript
// load fast stream module
var FastStream = require('fast-protocol')

// create encoder using FAST template definition from file
var encoder = new FastStream.Encoder('emdi-7.0.xml')

// encode message
var buffer = encoder.encode('RDPacketHeader', { SenderCompID: 1,
  PacketSeqNum: [ 0, 8, 58, 9 ],
  SendingTime: [ 21, 105, 89, 139, 55, 77, 80, 126 ] })

// process buffer
...
```

### Decoding - using single callback function

```javascript
// load fast stream module
var FastStream = require('fast-protocol')

// create message decoder
var decoder = new FastStream.Decoder('emdi-7.0.xml')

// read binary buffer - user specific function
var buffer = readBuffer()

// decode buffer content
decoder.decode(buffer, function(msg, name) {
  console.log(name, JSON.stringify(msg, null, 2))
})
```

### Decoding - using message specific callback function

You can also provide a javascript object with message specific callback functions, like this example:

```javascript
// load fast stream module
var FastStream = require('fast-protocol')

// create message decoder
var decoder = new FastStream.Decoder('emdi-7.0.xml')

// read binary buffer - user specific function
var buffer = readBuffer()

// decode buffer content
decoder.decode(buffer, {
  RDPacketHeader: function(msg) {
    // process RDPacketHeader
    console.log('PacketHeader', JSON.stringify(msg, null, 2))
  },
  ProductSnapshot: function(msg) {
    // process ProductSnapshot
    console.log('ProductSnapshot', JSON.stringify(msg, null, 2))
  }
})
```


## API Documentation

## Contributing

You are welcome!
