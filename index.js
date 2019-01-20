
var convert = require('xml-js')
var Long = require('long')
var fs = require('fs');


module.exports = {
	Decoder: Decoder,
	Encoder: Encoder
}


var logInfo = false
var logDecode = false
var logEncode = false

function toHexString(byteArray) {
  var s = '';
  byteArray.forEach(function(byte) {
    s += ('0' + (byte & 0xFF).toString(16)).slice(-2) + ' ';
  });
  return s;
}

function arrayFromBuffer(buffer) {
	var ret = []
	for (var i = 0; i < buffer.length; ++i) ret.push(buffer[i])
	return ret
}

function parseByteVector(str) {
	for (var bytes = [], c = 0; c < str.length; c += 2)
	bytes.push(parseInt(str.substr(c, 2), 16));
	return bytes;
}

function parseDecimal(str) {
  if (!str) return undefined
  // [1] SIGN
  // [2] + [4] MANTISSA
  // [6] EXPONENT
  var matches = str.match(/^([+-])?(\d+)?(\.)?(\d*)?(e([+-]?\d+))?$/)

  var sign = matches[1] != null ? matches[1] : '+'
  var pre = matches[2] != null ? matches[2] : ''
  var post = matches[4] != null ? matches[4].replace(/0*$/, '') : ''

  var mantissa = Long.fromString(pre.concat(post)).multiply(sign == '-' ? Long.NEG_ONE : Long.ONE)
  var exponent = matches[6] != null ? Number(matches[6]) - post.length : 0 - post.length
  return {m: mantissa.toString(10), e: exponent}
}

function equals(array1, array2) {
	return array1.length === array2.length && array1.every(function(value, index) { return value === array2[index]})
}

var Operator = {
	NONE: undefined,
	CONSTANT: 1,
	COPY: 2,
	DEFAULT: 3,
	INCREMENT: 4,
	TAIL: 5,
	DELTA: 6,
	//var operatorName = Operator.properties[operator].name
	properties: {
		constant: {name: 'constant',	pmap: {mandatory: false, optional: true}},
		copy: {name: 'copy', pmap: {mandatory: true, optional: true}},
		default: {name: 'default', pmap: {mandatory: true, optional: true}},
		increment: {name: 'increment', pmap: {mandatory: true, optional: true}},
		tail: {name: 'tail', pmap: {mandatory: true, optional: true}},
		delta: {name: 'delta', pmap: {mandatory: false, optional: false}}
	},
	occupyBit: function(operator, optional) {
		return Operator.properties[operator].pmap[optional ? 'optional' : 'mandatory']
	}
}

var State = {
	UNDEFINED: undefined,
	ASSIGNED: 1,
	EMPTY: 2
}

// message template description
function Element(name, type, id, presence, operator, elements) {
	this.name = name
	this.type = type
	this.id = id
	this.pmap = 0
	this.pmapElements = 0
	this.presence = !presence ? 'mandatory' : presence
	this.operator = operator
	this.elements = undefined

	if (this.type == 'decimal' && this.operator && this.operator.value) this.operator.decimalValue = parseDecimal(this.operator.value)
	if (this.type == 'byteVector' && this.operator && this.operator.value) this.operator.arrayValue = parseByteVector(this.operator.value)

	switch (type) {
		case 'message':
			this.pmapElements = 1
			break
		case 'group':
			if (this.isOptional()) this.pmap = 1
			Element.parse(this, elements)
			break
		case 'sequence':
			this.lengthField = Element.parseElement(undefined, elements[0], presence)
			Element.parse(this, elements, 1)
			break
		case 'templateref':
			// to be implemented
			break
	}
}

Element.prototype.addElement = function(element) {
	if (!this.elements) this.elements = []
	this.elements.push(element)
}

/*
Element.prototype.isMessage = function()  {
	return this.type == 'message'
}*/

Element.prototype.isOptional = function()  {
	return this.presence == null ? false : this.presence == 'optional'
}

Element.prototype.hasOperator = function()  {
	return this.operator != null
}

Element.prototype.presenceBits = function() {
	switch (this.type) {
		case 'group':
			return this.isOptional() ? 1 : 0
		case 'sequence':
			return 0
	  case 'decimal':
			//break
		default:
			if (this.operator && Operator.occupyBit(this.operator.name, this.isOptional())) {
				return 1;
			}
	}

	return 0
}

Element.parseElement = function(parent, element, presence) {
	var operator = getOperator(element.elements)
	var field = new Element(element.attributes.name, element.name, element.attributes.id, presence ? presence : element.attributes.presence, !operator ? undefined : {name: operator.name, key: !operator.attributes || !operator.attributes.key ? element.attributes.name : operator.attributes.key, value: !operator.attributes ? undefined : operator.attributes.value}, element.elements, parent)
	field.pmap = field.presenceBits()
	if (parent)	{
		parent.addElement(field)
		parent.pmapElements += field.pmap
	}
	return field
}

Element.parse = function(parent, elements, start) {
	if (elements) {
		for (var i = !start ? 0 : start; i < elements.length; ++i) {
			Element.parseElement(parent, elements[i])
		}
	}
}






function Field(name) {
	this.State = State.UNDEFINED
	this.Value = undefined
	this.Name = name

	this.isUndefined = function() {
		return this.State == State.UNDEFINED
	}

	this.isAssigned = function() {
		return this.State == State.ASSIGNED
	}

	this.isEmpty = function() {
		return this.State == State.EMPTY
	}

	this.assign = function(value) {
		this.State = value == null ? State.EMPTY : State.ASSIGNED
		this.Value = value
	}

	this.reset = function() {
		this.State = State.EMPTY
		this.Value = undefined
	}
}

function Dictionary() {
}

Dictionary.prototype.getField = function(name) {
	if (!this.hasOwnProperty(name)) {
		this[name] = new Field(name)
	}
	return this[name]
}

Dictionary.prototype.reset = function(name) {
	for (var property in this) {
    if (this.hasOwnProperty(property)) {
			if (this[property].hasOwnProperty('reset')) {
				this[property].reset()
			}
    }
	}
}

function Context(pmap) {
	this.pmap = pmap
	this.idx = 0
	this.buffer = []
}

Context.prototype.isBitSet = function() {
	if (logDecode) console.log('PMAP[', this.idx, '] =', this.pmap[this.idx])
	if (!this.pmap.length) {
		console.log('PMAP overflow at', this.idx)
		console.trace()
		throw new Error('PMAP overflow')
	}
	return this.pmap[this.idx++]
}

Context.prototype.setBit = function(bit) {
	if (logEncode) console.log('SET PMAP[', this.pmap.length, '] =', bit)
	this.pmap.push(bit)
	if (logInfo) console.log('PMAP', this.pmap)
}


function getElementByName(elements, name) {
	for (var i = 0; i < elements.length; ++i) {
		if  (elements[i].name == name) {
			return elements[i]
		}
	}
}

function getElementsByName(elements, name) {
	var elems = []
	for (var i = 0; i < elements.length; ++i) {
		if  (elements[i].name == name) {
			elems.push(elements[i])
		}
	}

	return elems
}

function getOperator(elements) {
	if (elements) {
		for (var i = 0; i < elements.length; ++i) {
			switch (elements[i].name) {
				case 'constant':
				case 'copy':
				case 'default':
				case 'delta':
				case 'increment':
				case 'tail':
					return elements[i]
			}
		}
	}
}


function Decoder(fileName) {
	// dictionary used for this decoder, will be filled during template load
	this.Dictionary = new Dictionary()

	this.templateID = new Element('TemplateID', 'uInt32', 0, 'mandatory', {name: 'copy', key: 'templateID', value: undefined}, undefined)
	this.TemplateID = 0
	this.templates = []

	// decode buffer
	this.buffer = undefined
	this.pos = 0

	// load XML file
	var xml = fs.readFileSync(fileName)

	var js = convert.xml2js(xml, {compact: false, ignoreComment: true})
	var allTemplates = getElementByName(js.elements, 'templates')
	var templates = getElementsByName(allTemplates.elements, 'template')

	for (var i = 0; i < templates.length; ++i) {
		var tpl = new Element(templates[i].attributes.name, 'message', templates[i].attributes.id)
		Element.parse(tpl, templates[i].elements)

		this.templates[tpl.id] = tpl
	}
	if (!this.templates[120]) {
		// Add FAST Reset
		this.templates[120] = new Element('FASTReset', 'message', 120)
	}
}


Decoder.prototype.decode = function(buffer, callbacks) {
	this.pos = 0
	this.buffer = buffer
	while (this.pos < this.buffer.length) {
		// decode presence map
		var ctx = new Context(this.decodePMAP())

		// decode template id
		this.TemplateID = this.decodeUInt32Value(ctx, this.templateID)

		// lookup template definition
		var tpl = this.templates[this.TemplateID]
		if (tpl) {
			var msg = this.decodeGroup(ctx, tpl.elements)

			// call handler if available
			if (typeof callbacks === 'function') {
				callbacks(msg, tpl.name)
			} else if (callbacks[tpl.name]) {
				callbacks[tpl.name](msg, tpl)
			} else if (callbacks['default']){
				callbacks['default'](msg, tpl.name, tpl)
			}

			if (tpl.id == 120) {
				// FAST reset
				this.Dictionary.reset()
			}
		} else {
			// template definition not found
			console.log('Error: Template definition for template id =', this.TemplateID, 'not found!')
			throw new Error('Error: Template definition for template id = ' + this.TemplateID + ' not found!')
		}
	}
}

Decoder.prototype.decodeUInt32Value = function(ctx, field) {
	if (logDecode) console.log('DecodeUInt32Value', field.name, field.presence, field.operator != null ? field.operator.name : '')
	var optional = field.isOptional()
	if (!field.hasOperator()) return this.decodeU32(optional)

	switch (field.operator.name) {
		case 'constant':
			if (optional) return ctx.isBitSet() ? Number(field.operator.value) : undefined
			// ELSE
			return Number(field.operator.value)
		case 'copy':
			var entry = this.Dictionary.getField(field.name)
			if (ctx.isBitSet()) {
				entry.assign(this.decodeU32(optional))
			}
			return entry.Value
		case 'default':
			if (ctx.isBitSet()) return this.decodeU32(optional)
			// ELSE
			return optional & field.operator.value == null ? undefined : Number(field.operator.value)
		case 'increment':
			var entry = this.Dictionary.getField(field.name)
			if (ctx.isBitSet()) {
				entry.assign(this.decodeU32(optional))
			} else {
				if (entry.isAssigned()) {
					entry.assign(entry.Value + 1)
				}	else {
					entry.assign(undefined)
				}
			}
			return entry.Value
		case 'delta':
			var streamValue = this.decodeI32(optional)
			if (optional && streamValue == null) return undefined
			var entry = this.Dictionary.getField(field.name)
			entry.assign((streamValue == null) ? undefined : ((entry.isAssigned() ? entry.Value : 0) + streamValue) >>> 0 )
			return entry.Value
	}
}

Decoder.prototype.decodeInt32Value = function(ctx, field) {
	if (logDecode) console.log('DecodeInt32Value', field.name, field.presence, field.operator)
	var optional = field.isOptional()
	if (!field.hasOperator()) return this.decodeI32(optional)

	switch (field.operator.name) {
		case 'constant':
			if (optional) return ctx.isBitSet() ? Number(field.operator.value) : undefined
			// ELSE
			return Number(field.operator.value)
		case 'copy':
			var entry = this.Dictionary.getField(field.name)
			if (ctx.isBitSet()) {
				entry.assign(this.decodeI32(optional))
			}
			return entry.Value
		case 'default':
			if (ctx.isBitSet()) return this.decodeI32(optional)
			// ELSE
			return optional && field.operator.value == null ? undefined : Number(field.operator.value)
		case 'increment':
			var entry = this.Dictionary.getField(field.name)
			if (ctx.isBitSet()) {
				entry.assign(this.decodeI32(optional))
			} else {
				if (entry.isAssigned()) {
					entry.assign(entry.Value + 1)
				} else {
					entry.assign(undefined)
				}
			}
			return entry.Value
		case 'delta':
			var streamValue = this.decodeI64(optional)
			if (optional && streamValue == null) return undefined
			var entry = this.Dictionary.getField(field.name)
			entry.assign(streamValue == null ? undefined : entry.isAssigned() ? Long.fromValue(entry.Value).add(streamValue).toInt() : Long.fromValue(streamValue).toInt())
			return entry.Value
	}
}

Decoder.prototype.decodeUInt64Value = function(ctx, field) {
	if (logDecode) console.log('DecodeUInt64Value', field.name, field.presence, field.operator)
	if (logDecode) console.log('DECODE(U64):', toHexString(this.buffer.slice(this.pos)), '\n')
	var optional = field.isOptional()
	if (!field.hasOperator()) return this.decodeU64(optional)

	switch (field.operator.name) {
		case 'constant':
			if (optional) return ctx.isBitSet() ? field.operator.value : undefined
			// ELSE
			return field.operator.value
		case 'copy':
			var entry = this.Dictionary.getField(field.name)
			if (ctx.isBitSet()) {
				entry.assign(this.decodeU64(optional))
			}
			return entry.Value
		case 'default':
			return ctx.isBitSet() ? this.decodeU64(optional) : field.operator.value
		case 'increment':
			var entry = this.Dictionary.getField(field.name)
			if (ctx.isBitSet()) {
				entry.assign(this.decodeU64(optional))
			} else if (entry.isAssigned()) {
				entry.assign(Long.fromValue(entry.Value).add(Long.UONE))
			}
			return entry.isAssigned() ? entry.Value.toString(10) : undefined
		case 'delta':
			var streamValue = this.decodeI64(optional)
			if (optional && streamValue == null) return undefined
			var entry = this.Dictionary.getField(field.name)
			entry.assign(streamValue == null ? undefined : entry.isAssigned() ? Long.fromValue(entry.Value, true).add(streamValue) : streamValue)
			return entry.isAssigned() ? entry.Value.toString(10) : undefined
	}
}

Decoder.prototype.decodeInt64Value = function(ctx, field) {
	if (logDecode) console.log('DecodeInt64Value', field.name, field.presence, field.operator)
	if (logDecode) console.log('DECODE(I64):', toHexString(this.buffer.slice(this.pos)), '\n')
	var optional = field.isOptional()
	if (!field.hasOperator()) return this.decodeI64(optional)

	switch (field.operator.name) {
		case 'constant':
			if (optional) return ctx.isBitSet() ? field.operator.value : undefined
			// ELSE
			return field.operator.value
		case 'copy':
			var entry = this.Dictionary.getField(field.name)
			if (ctx.isBitSet()) {
				entry.assign(this.decodeI64(optional))
			}
			return entry.Value
		case 'default':
			return ctx.isBitSet() ? this.decodeI64(optional) : field.operator.value
		case 'increment':
			var entry = this.Dictionary.getField(field.name)
			if (ctx.isBitSet()) {
				entry.assign(this.decodeI64(optional))
			} else if (entry.isAssigned()) {
				entry.assign(Long.fromValue(entry.Value).add(Long.ONE))
			}
			return entry.isAssigned() ? entry.Value.toString(10) : undefined
		case 'delta':
			var streamValue = this.decodeI64(optional)
			if (optional && streamValue == null) return undefined
			var entry = this.Dictionary.getField(field.name)
			entry.assign(streamValue == null ? undefined : entry.isAssigned() ? Long.fromValue(entry.Value).add(streamValue) : streamValue)
			return entry.isAssigned() ? entry.Value.toString(10) : undefined
	}
}

function decimalToString(value) {
	if (value == null) return undefined
	return value.m.concat('e', value.e)
	/*
	if (value.e == 0) return value.m
	if (value.e > 0 && value.e < 10) return value.m.concat('0'.repeat(value.e))
	return value.m.concat('e', value.e)
	*/
}

Decoder.prototype.decodeDecimalValue = function(ctx, field) {
	if (logDecode) console.log('DecodeDecimalValue', field.name, field.presence, field.operator)
	var optional = field.isOptional()
	if (!field.hasOperator()) return decimalToString(this.decodeDecimal(optional))

	switch (field.operator.name) {
		case 'constant':
			if (optional) return ctx.isBitSet() ? field.operator.value : undefined
			// ELSE
			return field.operator.value
		case 'copy':
			var entry = this.Dictionary.getField(field.name)
			if (ctx.isBitSet()) {
				entry.assign(this.decodeDecimal(optional))
			}
			return decimalToString(entry.Value)
		case 'default':
			if (ctx.isBitSet()) {
				return decimalToString(this.decodeDecimal(optional))
			} else {
				return field.operator.value
			}
			break
		case 'delta':
			var streamExpValue = this.decodeI32(optional)
			if (streamExpValue == null) {
				return undefined
			}
			var entry = this.Dictionary.getField(field.name)
			var streamManValue = this.decodeI64(false)
			if (!entry.isAssigned()) {
				entry.assign({m: "0", e: 0})
			}
			entry.assign({m: Long.fromString(entry.Value.m).add(streamManValue).toString(10), e: entry.Value.e + streamExpValue})
			return decimalToString(entry.Value)
	}
}

Decoder.prototype.decodeStringValue = function(ctx, field) {
	if (logDecode) console.log('DecodeStringValue', field.name, field.presence, field.operator)
	var optional = field.isOptional()
	if (!field.hasOperator()) return this.decodeString(optional)

	switch (field.operator.name) {
		case 'constant':
			if (optional) return ctx.isBitSet() ? field.operator.value : undefined
			// ELSE
			return field.operator.value
		case 'copy':
			var entry = this.Dictionary.getField(field.name)
			if (ctx.isBitSet()) {
				entry.assign(this.decodeString(optional))
			}
			return entry.Value
		case 'default':
			return ctx.isBitSet() ? this.decodeString(optional) : field.operator.value
		case 'tail':
			break
		case 'delta':
			var entry = this.Dictionary.getField(field.name)
			var length = this.decodeI32(optional)
			if (optional && length == null) {
				//entry.assign(undefined)
				return undefined
			} else {
				var str = length == null ? '' : this.decodeString(false)
				if (length < 0) {
					entry.assign(str + entry.Value.substring((length + 1) * -1))
				} else if (length > 0) {
					entry.assign(entry.Value.substring(0, entry.Value.length - length) + str)
				} else { // length == 0
					entry.assign(entry.isAssigned() ? entry.Value + str : str)
				}
			}

			return entry.Value
	}
}

Decoder.prototype.decodeByteVectorValue = function(ctx, field) {
	if (logDecode) console.log('DecodeByteVectorValue', field.name, field.presence, field.operator)
	var optional = field.isOptional()
	if (!field.hasOperator()) return this.decodeByteVector(optional)

	switch (field.operator.name) {
		case 'constant':
			if (optional) return ctx.isBitSet() ? field.operator.arrayValue : undefined
			// ELSE
			return field.operator.arrayValue
		case 'copy':
			var entry = this.Dictionary.getField(field.name)
			if (ctx.isBitSet()) {
				entry.assign(this.decodeByteVector(optional))
			}
			return entry.Value
		case 'default':
			return ctx.isBitSet() ? this.decodeByteVector(optional) : field.operator.value
		case 'tail':
			break
		case 'delta':
			var entry = this.Dictionary.getField(field.name)
			var length = this.decodeI32(optional)
			if (optional && length == null) {
				//entry.assign(undefined)
				return undefined
			} else {
				var str = length == null ? '' : this.decodeByteVector(false)
				if (length < 0) {
					entry.assign(str + entry.Value.substring((length + 1) * -1))
				} else if (length > 0) {
					entry.assign(entry.Value.substring(0, entry.Value.length - length) + str)
				} else { // length == 0
					entry.assign(entry.isAssigned() ? entry.Value + str : str)
				}
			}

			return entry.Value
	}
}

Decoder.prototype.decodePMAP = function() {
	if (logDecode) console.log('DECODE PMAP', this.pos, this.buffer.length - this.pos)
	var pmap = []
	while (this.pos < this.buffer.length) {
		var byteVal = this.buffer[this.pos++]
		if (logInfo) console.log('PMAP BYTE', byteVal)
		var stop = byteVal & 0x80
		for (var i = 0; i < 7; ++i, byteVal <<= 1) {
			pmap.push(byteVal & 0x40 ? true : false)
		}

		if (stop) break
	}

	return pmap;
}

Decoder.prototype.decodeI32 = function(optional) {
	if (optional) {
		var byteVal = this.buffer[this.pos]
		if (byteVal == 0x80)
		{
			++this.pos;
			return undefined;
		}
	}

	var val = (this.buffer[this.pos] & 0x40) > 0 ? -1 : 0
	for (; this.pos < this.buffer.length; ) {
		var byteVal = this.buffer[this.pos++]
		val = (val << 7) + (byteVal & 0x7f)
		if (byteVal & 0x80) break
	}

	return (optional && val > 0) ? val - 1 : val
}

Decoder.prototype.decodeU32 = function(optional) {
	if (optional) {
		var byteVal = this.buffer[this.pos]
		if (byteVal == 0x80) {
			++this.pos;
			return undefined;
		}
	}

	var val = 0
	for (; this.pos < this.buffer.length; ) {
		var byteVal = this.buffer[this.pos++]

		val = ((val << 7) >>> 0) + (byteVal & 0x7f)	// use >>> fake operator for unsigned numbers since << is defined only for signed integer
		if (byteVal & 0x80) break
	}

	return optional ? val - 1 : val
}

Decoder.prototype.decodeI64 = function(optional) {
	if (logDecode) console.log('decodeI64', optional)
	if (optional) {
		var byteVal = this.buffer[this.pos]
		if (byteVal == 0x80) {
			++this.pos;
			return undefined;
		}
	}

	var value = (this.buffer[this.pos] & 0x40) > 0 ? Long.NEG_ONE : Long.ZERO

	for (var first = true; this.pos < this.buffer.length; first = false) {
		var byte = this.buffer[this.pos++]
		value = value.shiftLeft(first ? 6 : 7).or(byte & (first ? 0x3f : 0x7f))
		if (byte & 0x80) break
	}

	if (optional && value.greaterThan(Long.ZERO)) value = value.subtract(Long.ONE)

	return value.toString(10)
}

Decoder.prototype.decodeU64 = function(optional) {
	if (logDecode) console.log('decodeU64', optional)
	if (optional) {
		var byteVal = this.buffer[this.pos]
		if (byteVal == 0x80)
		{
			++this.pos;
			return undefined;
		}
	}

	var value = Long.UZERO
	for (; this.pos < this.buffer.length; ) {
		var byteVal = this.buffer[this.pos++]
		value = value.shiftLeft(7).or(byteVal & 0x7f)
		if (byteVal & 0x80) break
	}

	if (optional) value = value.subtract(Long.UONE)

	return value.toString(10)
}

Decoder.prototype.decodeDecimal = function(optional) {
	if (optional) {
		var byteVal = this.buffer[this.pos]
		if (byteVal == 0x80)
		{
			++this.pos;
			return undefined;
		}
	}

	var exp = this.decodeI32(optional)
	var man = this.decodeI64(false)
	return {'m': man, 'e': exp}
}

Decoder.prototype.decodeString = function(optional) {
	if (optional) {
		var byteVal = this.buffer[this.pos]
		if (byteVal == 0x80)
		{
			++this.pos;
			return undefined;
		}
	}

	var val = ""
	while (this.pos < this.buffer.length) {
		var byteVal = this.buffer[this.pos++]
		if (byteVal & 0x7f) {
			val += String.fromCharCode(byteVal & 0x7f)
		}

		if (byteVal & 0x80) break
	}

	return val
}

Decoder.prototype.decodeByteVector = function(optional) {
	var len = this.decodeU32(optional)
	if (len != null) {
		var val = arrayFromBuffer(this.buffer.slice(this.pos, this.pos + len))
		this.pos += len
		return val
	}
	return undefined
}

Decoder.prototype.decodeGroup = function(ctx, elements, start) {
	var val = {}
	if (!elements) return val

	for (var i = start ? start : 0; i < elements.length; ++i) {
		var element = elements[i]
		var fieldName = element.name
		var optional = (element.presence == null) ? false : (element.presence == 'optional')
		var operator = element.operator

		switch (element.type) {
			case 'int32':
				val[fieldName] = this.decodeInt32Value(ctx, element)
				if (logDecode) console.log(fieldName, '=', val[fieldName])
				break
			case 'uInt32':
				val[fieldName] = this.decodeUInt32Value(ctx, element)
				if (logDecode) console.log(fieldName, '=', val[fieldName])
				break
			case 'int64':
				val[fieldName] = this.decodeInt64Value(ctx, element)
				if (logDecode) console.log(fieldName, '=', val[fieldName])
				break
			case 'uInt64':
				val[fieldName] = this.decodeUInt64Value(ctx, element)
				if (logDecode) console.log(fieldName, '=', val[fieldName])
				break
			case 'decimal':
				val[fieldName] = this.decodeDecimalValue(ctx, element)
				if (logDecode) console.log(fieldName, '=', val[fieldName])
				break
			case 'string':
				val[fieldName] = this.decodeStringValue(ctx, element)
				if (logDecode) console.log(fieldName, '=', val[fieldName])
				break
			case 'byteVector':
				val[fieldName] = this.decodeByteVectorValue(ctx, element)
				if (logDecode) console.log(fieldName, '=', val[fieldName])
				break
			case 'group':
				var isBitSet = optional ? ctx.isBitSet() : false
				if ((!optional) || (optional && isBitSet)) {
					var groupCtx = new Context(element.pmapElements > 0 ? this.decodePMAP() : [])
					val[fieldName] = this.decodeGroup(groupCtx, element.elements)
				} else {
					val[fieldName] = undefined
				}
				break
			case 'sequence':
				val[fieldName] = this.decodeSequenceValue(ctx, element)
				break
			default:
				console.log('Not supported type', element.type, fieldName)
				break
		}
	}

	return val
}

Decoder.prototype.decodeSequenceValue = function(ctx, sequence) {
	if (logDecode) console.log('DecodeSequence', sequence.name, sequence.presence)
	var length = this.decodeUInt32Value(ctx, sequence.lengthField)
	if (logDecode) console.log(sequence.lengthField.name, '=', length)
	if (length == null) {
		return undefined
	}

	var val = []
	for (var i = 0; i < length; ++i) {
		var groupCtx = new Context(sequence.pmapElements ? this.decodePMAP() : [])
		val.push(this.decodeGroup(groupCtx, sequence.elements))
	}
	return val
}


function Encoder(fileName) {
		// dictionary used for this decoder, will be filled during template load
		this.Dictionary = new Dictionary()

		this.templateID = new Element('TemplateID', 'uInt32', 0, 'mandatory', {name: 'copy', key: 'templateID', value: undefined}, undefined)

		this.SHIFT = [0, 0, 7, 14, 21, 28, 35, 42, 49, 56, 63]

		this.templates = []

		// decode buffer
		this.buffer = []
		this.pos = 0

		// load XML file
		var xml = fs.readFileSync(fileName)

		var js = convert.xml2js(xml, {compact: false, ignoreComment: true})
		var allTemplates = getElementByName(js.elements, 'templates')
		var templates = getElementsByName(allTemplates.elements, 'template')

		for (var i = 0; i < templates.length; ++i) {
			var tpl = new Element(templates[i].attributes.name, 'message', templates[i].attributes.id)
			Element.parse(tpl, templates[i].elements)

			// add mapping for template id and name
			this.templates[tpl.id] = tpl
			this.templates[tpl.name] = tpl
		}
		if (!this.templates[120]) {
			// Add FAST Reset if not present in the template definition
			var FASTReset = new Element('FASTReset', 'message', 120)
			this.templates[120] = FASTReset
			this.templates['FASTReset'] = FASTReset
		}
}

Encoder.prototype.encode = function(name, value) {
	if (logEncode) console.log('Encode message', name, 'value:', value)

	// lookup template definition
	var tpl = this.templates[name]
	if (tpl == null) {
		throw new Error('Message tempate for ' + name + ' not found!')
	}

	// encode/reserve pmap bits
	var ctx = new Context([])

	// encode template id
	this.encodeUInt32Value(ctx, this.templateID, tpl.id)

	// encode message body
	this.encodeGroup(ctx, tpl, value)

	if (tpl.id == 120) {
		// FAST Reset
		if (logEncode) console.log('Reset Dictionary')
		this.Dictionary.reset()
	}

	// return the binary encoded message
	return ctx.buffer
}

Encoder.prototype.encodeGroup = function(ctx, field, value, start) {
	var elements = field.elements
	if (elements) {
		for (var i = start ? start : 0; i < elements.length; ++i) {
			var element = elements[i]
			var fieldName = element.name
			var optional = element.isOptional()
			var operator = element.operator

			switch (element.type) {
				case 'int32':
					this.encodeInt32Value(ctx, element, value[fieldName])
					break
				case 'uInt32':
					this.encodeUInt32Value(ctx, element, value[fieldName])
					break
				case 'int64':
					this.encodeInt64Value(ctx, element, value[fieldName] != null ? Long.fromValue(value[fieldName]) : undefined)
					break
				case 'uInt64':
					this.encodeUInt64Value(ctx, element, value[fieldName] != null ? Long.fromValue(value[fieldName], true) : undefined)
					break
				case 'decimal':
					this.encodeDecimalValue(ctx, element, value[fieldName])
					break
				case 'string':
					this.encodeStringValue(ctx, element, value[fieldName])
					break
				case 'byteVector':
					this.encodeByteVectorValue(ctx, element, value[fieldName])
					break
				case 'group':
					if (optional) {
						ctx.setBit(value[fieldName] != null)
					}
					if (value[fieldName] != null) {
						var groupCtx = new Context([])
						this.encodeGroup(groupCtx, element, value[fieldName])
						ctx.buffer.push.apply(ctx.buffer, groupCtx.buffer)
					}
					break
				case 'sequence':
					this.encodeSequence(ctx, element, value[fieldName])
					break
				default:
					console.log('Error: Not supported type', element.type, fieldName)
					break
			}
		}
	}

	if (field.pmapElements > 0)	this.encodePMAP(ctx)
}

Encoder.prototype.encodeSequence = function(ctx, field, value, start) {
	if (logEncode) console.log('EncodeSequence:', field.name, value, 'OPT:', field.isOptional(), 'HAS_OP:', field.lengthField.hasOperator())
	var begin = ctx.buffer.length

	var optional = field.isOptional()

	if (optional && !value) {
		this.encodeUInt32Value(ctx, field.lengthField, undefined)
		return
	}

	// encode length field
	this.encodeUInt32Value(ctx, field.lengthField, value.length)

	for (var i = 0; i < value.length; ++i) {
		var seqCtx = new Context([])
		this.encodeGroup(seqCtx, field, value[i])
		ctx.buffer.push.apply(ctx.buffer, seqCtx.buffer)
	}
}

Encoder.prototype.encodeUInt32Value = function(ctx, field, value) {
	if (logEncode) console.log('EncodeUInt32Value:', field.name, value, 'OPT:', field.isOptional(), 'HAS_OP:', field.hasOperator())
	var pos = ctx.buffer.length
	var optional = field.isOptional()
	if (!field.hasOperator()) {
		if (optional && value == null) {
			this.encodeNull(ctx)
		} else {
			this.encodeU32(ctx, value, optional)
		}
	} else {
		switch (field.operator.name) {
			case 'constant':
				if (optional) {
					ctx.setBit(value != null)
				}
				break
			case 'copy':
				var entry = this.Dictionary.getField(field.name)
				if (entry.isAssigned() && value == entry.Value) {
					ctx.setBit(false)
				} else {
					if (optional && value == null && !entry.isAssigned()) {
						ctx.setBit(false)
					} else {
						ctx.setBit(true)
						this.encodeU32(ctx, value, optional)
						entry.assign(value)
					}
				}
				break
			case 'default':
				if (optional && value == null) {
					if (field.operator.value == null) {
						ctx.setBit(false)
					} else {
						ctx.setBit(true)
						this.encodeNull(ctx)
					}
				} else if (value != field.operator.value) {
					ctx.setBit(true)
					this.encodeU32(ctx, value, optional)
				} else {
					ctx.setBit(false)
				}
				break
			case 'increment':
				var entry = this.Dictionary.getField(field.name)
				if (optional && value == null) {
					if (entry.isAssigned()) {
						ctx.setBit(true)
						this.encodeNull(ctx)
					} else {
						ctx.setBit(false)
					}
				} else if (entry.isAssigned() && value == entry.Value + 1) {
					ctx.setBit(false)
				} else {
					ctx.setBit(true)
					this.encodeU32(ctx, value, optional)
				}
				entry.assign(value)
				break
			case 'tail':
				break
			case 'delta':
				if (optional && value == null) {
					this.encodeNull(ctx)
					break
				}
				var entry = this.Dictionary.getField(field.name)
				var deltaValue = value - (entry.isAssigned() ? entry.Value : 0)
				this.encodeI32(ctx, deltaValue, optional)
				entry.assign(value)
				break
		}
	}
	if (logEncode) console.log('ENCODED(U32):', toHexString(ctx.buffer.slice(pos)), '\n')
}

Encoder.prototype.encodeInt32Value = function(ctx, field, value) {
	if (logEncode) console.log('EncodeInt32Value:', field.name, value, 'OPT:', field.isOptional(), 'HAS_OP:', field.hasOperator())
	var pos = ctx.buffer.length
	var optional = field.isOptional()
	if (!field.hasOperator()) {
		if (optional && value == null) {
			this.encodeNull(ctx)
		} else {
			this.encodeI32(ctx, value, optional)
		}
	} else {
		switch (field.operator.name) {
			case 'constant':
				if (optional) {
					ctx.setBit(value != null)
				}
				break
			case 'copy':
				var entry = this.Dictionary.getField(field.name)
				if (entry.isAssigned() && value == entry.Value) {
					ctx.setBit(false)
				} else {
					if (optional && value == null && !entry.isAssigned()) {
						ctx.setBit(false)
					} else {
						ctx.setBit(true)
						this.encodeI32(ctx, value, optional)
						entry.assign(value)
					}
				}
				break
			case 'default':
				if (optional && value == null) {
					if (field.operator.value == null) {
						ctx.setBit(false)
					} else {
						ctx.setBit(true)
						this.encodeNull(ctx)
					}
				} else if (value != field.operator.value) {
					ctx.setBit(true)
					this.encodeI32(ctx, value, optional)
				} else {
					ctx.setBit(false)
				}
				break
			case 'increment':
				var entry = this.Dictionary.getField(field.name)
				if (optional && value == null) {
					if (entry.isAssigned()) {
						ctx.setBit(true)
						this.encodeNull(ctx)
					} else {
						ctx.setBit(false)
					}
				} else if (entry.isAssigned() && value == entry.Value + 1) {
					ctx.setBit(false)
				} else {
					ctx.setBit(true)
					this.encodeI32(ctx, value, optional)
				}
				entry.assign(value)
				break
			case 'tail':
				break
			case 'delta':
				if (optional && value == null) {
					this.encodeNull(ctx)
					break
				}
				var entry = this.Dictionary.getField(field.name)
				var deltaValue = value - (entry.isAssigned() ? entry.Value : 0)
				this.encodeI64(ctx, Long.fromNumber(deltaValue), optional)
				entry.assign(value)
				break
		}
	}
	if (logEncode) console.log('ENCODED(I32):', toHexString(ctx.buffer.slice(pos)), '\n')
}

Encoder.prototype.encodeInt64Value = function(ctx, field, value) {
	if (logEncode) console.log('EncodeInt64Value:', field.name, value != null ? value.toString(10) : undefined, 'OPT:', field.isOptional(), 'Operator:', field.operator)
	var pos = ctx.buffer.length
	var optional = field.isOptional()
	if (!field.hasOperator()) {
		if (optional && value == null) {
			this.encodeNull(ctx)
		} else {
			this.encodeI64(ctx, value, optional)
		}
	} else {
		switch (field.operator.name) {
			case 'constant':
				if (optional) {
					ctx.setBit(value != null)
				}
				break
			case 'copy':
				var entry = this.Dictionary.getField(field.name)
				if (entry.isAssigned() && value != null && value.equals(entry.Value)) {
					ctx.setBit(false)
				} else {
					if (optional && value == null && !entry.isAssigned()) {
						ctx.setBit(false)
					} else {
						ctx.setBit(true)
						this.encodeI64(ctx, value, optional)
						entry.assign(value)
					}
				}
				break
			case 'default':
				if (optional && value == null) {
					if (field.operator.value == null) {
						ctx.setBit(false)
					} else {
						ctx.setBit(true)
						this.encodeNull(ctx)
					}
				} else if ( (field.operator.value == null) || (field.operator.value != null && Long.fromValue(value).notEquals(field.operator.value)) ) {
					ctx.setBit(true)
					this.encodeI64(ctx, value, optional)
				} else {
					ctx.setBit(false)
				}
				break
			case 'increment':
				var entry = this.Dictionary.getField(field.name)
				if (optional && value == null) {
					if (entry.isAssigned()) {
						ctx.setBit(true)
						this.encodeNull(ctx)
					} else {
						ctx.setBit(false)
					}
				} else if (entry.isAssigned() && value.equals(entry.Value.add(Long.ONE))) {
					ctx.setBit(false)
				} else {
					ctx.setBit(true)
					this.encodeI64(ctx, value, optional)
				}
				entry.assign(value)
				break
			case 'tail':
				break
			case 'delta':
				if (optional && value == null) {
					this.encodeNull(ctx)
					break
				}
				var entry = this.Dictionary.getField(field.name)
				var deltaValue = value.subtract((entry.isAssigned() ? entry.Value : Long.ZERO))
				this.encodeI64(ctx, deltaValue, optional)
				entry.assign(value)
				break
		}
	}
	if (logEncode) console.log('ENCODED(I64):', toHexString(ctx.buffer.slice(pos)), '\n')
}

Encoder.prototype.encodeUInt64Value = function(ctx, field, value) {
	if (logEncode) console.log('EncodeUInt64Value:', field.name, value == null ? undefined : value.toString(10), 'OPT:', field.isOptional(), 'Operator:', field.operator)
	var pos = ctx.buffer.length
	var optional = field.isOptional()
	if (!field.hasOperator()) {
		if (optional && !value) {
			this.encodeNull(ctx)
		} else {
			this.encodeU64(ctx, Long.fromValue(value, true), optional)
		}
	} else {
		switch (field.operator.name) {
			case 'constant':
				if (optional) {
					ctx.setBit(value != null)
				}
				break
			case 'copy':
				var entry = this.Dictionary.getField(field.name)
				if (entry.isAssigned() && value != null && value.equals(entry.Value)) {
					ctx.setBit(false)
				} else {
					if (optional && value == null && !entry.isAssigned()) {
						ctx.setBit(false)
					} else {
						ctx.setBit(true)
						this.encodeU64(ctx, value, optional)
						entry.assign(value)
					}
				}
				break
			case 'default':
				if (optional && value == null) {
					if (field.operator.value == null) {
						ctx.setBit(false)
					} else {
						ctx.setBit(true)
						this.encodeNull(ctx)
					}
				} else if ( (field.operator.value == null) || (field.operator.value != null && Long.fromValue(value, true).notEquals(Long.fromValue(field.operator.value, true))) ) {
					ctx.setBit(true)
					this.encodeU64(ctx, value, optional)
				} else {
					ctx.setBit(false)
				}
				break
			case 'increment':
				var entry = this.Dictionary.getField(field.name)
				if (optional && value == null) {
					if (entry.isAssigned()) {
						ctx.setBit(true)
						this.encodeNull(ctx)
					} else {
						ctx.setBit(false)
					}
				} else if (entry.isAssigned() && value == entry.Value + 1) {
					ctx.setBit(false)
				} else {
					ctx.setBit(true)
					this.encodeU64(ctx, value, optional)
				}
				entry.assign(value)
				break
			case 'tail':
				break
			case 'delta':
				if (optional && value == null) {
					this.encodeNull(ctx)
					break
				}
				var entry = this.Dictionary.getField(field.name)
				var deltaValue = value.subtract((entry.isAssigned() ? entry.Value : Long.UZERO))
				this.encodeI64(ctx, deltaValue.toSigned(), optional)
				entry.assign(value)
				break
		}
	}
	if (logEncode) console.log('ENCODED(U64):', toHexString(ctx.buffer.slice(pos)), '\n')
}

Encoder.prototype.encodeDecimalValue = function(ctx, field, valueIn) {
	if (logEncode) console.log('EncodeDecimalValue:', field.name, valueIn, field.isOptional(), field.operator)
	var value = parseDecimal(valueIn)
	var pos = ctx.buffer.length
	var optional = field.isOptional()
	if (!field.hasOperator()) {
		if (optional && !value) {
			this.encodeNull(ctx)
		} else {
			this.encodeI32(ctx, value.e, optional)
			this.encodeI64(ctx, Long.fromValue(value.m), false)
		}
	} else {
		switch (field.operator.name) {
			case 'constant':
				if (optional) {
					ctx.setBit(value != null)
				}
				break
			case 'copy':
				var entry = this.Dictionary.getField(field.name)
				if (optional && value == null) {
					if (!entry.isAssigned()) {
						ctx.setBit(false)
					} else {
						ctx.setBit(true)
						this.encodeNull(ctx)
						entry.assign(undefined)
					}
				} else if (entry.isAssigned() && value.m == entry.Value.m && value.e == entry.Value.e) {
					ctx.setBit(false)
				} else {
					ctx.setBit(true)
					this.encodeI32(ctx, value == null ? undefined : value.e, optional)
					if (value != null) this.encodeI64(ctx, Long.fromValue(value.m), false)
					entry.assign(value)
				}
				break
			case 'default':
				if (optional && value == null) {
					if (field.operator.value == null) {
						ctx.setBit(false)
					} else {
						ctx.setBit(true)
						this.encodeNull(ctx)
					}
				} else if ( (value != null && value.m == field.operator.decimalValue.m && value.e == field.operator.decimalValue.e) || (optional && value == null && field.operator.value == null)) {
					ctx.setBit(false)
				} else {
					ctx.setBit(true)
					this.encodeI32(ctx, value == null ? undefined : value.e, optional)
					if (value != null) this.encodeI64(ctx, Long.fromValue(value.m), false)
				}
				break
			case 'increment':
				var entry = this.Dictionary.getField(field.name)
				if (entry.isAssigned() && value == entry.Value + 1) {
					ctx.setBit(false)
				} else {
					ctx.setBit(true)
					this.encodeI32(ctx, value.e, optional)
					this.encodeI64(ctx, Long.fromValue(value.m), false)
				}
				entry.assign(value)
				break
			case 'tail':
				break
			case 'delta':
				if (optional && value == null) {
					this.encodeNull(ctx)
					break
				}
				var entry = this.Dictionary.getField(field.name)
				var deltaExpValue = value.e - (entry.isAssigned() ? entry.Value.e : 0)
				var deltaManValue = Long.fromValue(value.m).subtract(entry.isAssigned() ? Long.fromValue(entry.Value.m) : Long.ZERO)
				this.encodeI32(ctx, deltaExpValue, optional)
				this.encodeI64(ctx, deltaManValue, false)
				entry.assign(value)
				break
		}
	}
	if (logEncode) console.log('ENCODED(DEC):', toHexString(ctx.buffer.slice(pos)), '\n')
}

Encoder.prototype.encodeStringValue = function(ctx, field, value) {
	if (logEncode) console.log('EncodeStringValue:', field.name, value, field.isOptional())
	var pos = ctx.buffer.length
	var optional = field.isOptional()
	if (!field.hasOperator()) {
		if (optional && !value) {
			this.encodeNull(ctx)
		} else {
			this.encodeString(ctx, value, optional)
		}
	} else {
		switch (field.operator.name) {
			case 'constant':
				if (optional) {
					ctx.setBit(value != null)
				}
				break
			case 'copy':
				var entry = this.Dictionary.getField(field.name)
				if (entry.isAssigned() && value == entry.Value) {
					ctx.setBit(false)
				} else {
					ctx.setBit(true)
					this.encodeString(ctx, value, optional)
					entry.assign(value)
				}
				break
			case 'default':
				if (value != field.operator.value) {
					ctx.setBit(true)
					this.encodeString(ctx, value, optional)
				} else {
					ctx.setBit(false)
				}
				break
			case 'increment':
				break
			case 'tail':
				break
			case 'delta':
				var entry = this.Dictionary.getField(field.name)
				var prevValue = entry.isAssigned() ? entry.Value : ""
				this.encodeStringDelta(ctx, value, optional, prevValue)
				entry.assign(value)
				break
		}
	}
	if (logEncode) console.log('ENCODED(STR):', toHexString(ctx.buffer.slice(pos)), '\n')
}

Encoder.prototype.encodeByteVectorValue = function(ctx, field, value) {
	if (logEncode) console.log('encodeByteVectorValue:', value)
	var pos = ctx.buffer.length
	var optional = field.isOptional()
	if (!field.hasOperator()) {
		if (optional && !value) {
			this.encodeNull(ctx)
		} else {
			this.encodeByteVector(ctx, value, optional)
		}
	} else {
		switch (field.operator.name) {
			case 'constant':
				if (optional) {
					ctx.setBit(value != null)
				}
				break
			case 'copy':
				var entry = this.Dictionary.getField(field.name)
				if (entry.isAssigned() && value != null && equals(value, entry.Value)) {
					ctx.setBit(false)
				} else {
					if (optional && value == null && !entry.isAssigned()) {
						ctx.setBit(false)
					} else {
						ctx.setBit(true)
						this.encodeByteVector(ctx, value, optional)
						entry.assign(value)
					}
				}
				break
			case 'default':
				if (value != null && equals(value, field.operator.arrayValue)) {
					ctx.setBit(false)
				} else {
					ctx.setBit(true)
					this.encodeByteVector(ctx, value, optional)
				}
				break
			case 'increment':
				break
			case 'tail':
				break
			case 'delta':
				var entry = this.Dictionary.getField(field.name)
				var prevValue = entry.isAssigned() ? entry.Value : []
				this.encodeByteVectorDelta(ctx, value, optional, prevValue)
				entry.assign(value)
				break
		}
	}
	if (logEncode) console.log('ENCODED(BYT):', toHexString(ctx.buffer.slice(pos)), '\n')
}

Encoder.prototype.getSizeU32 = function(value)
{
	if (value < 128)                return 1; // 2 ^ 7
	if (value < 16384)              return 2; // 2 ^ 14
	if (value < 2097152)            return 3; // 2 ^ 21
	if (value < 268435456)          return 4; // 2 ^ 28
	return 5;
}

Encoder.prototype.getSizeU64 = function(value)
{
	const L128 = Long.fromInt(128, true)
	const L16384 = Long.fromInt(16384, true)
	const L2097152 = Long.fromInt(2097152, true)
	const L268435456 = Long.fromInt(268435456, true)
	const L34359738368 = Long.fromString("34359738368", true)
	const L4398046511104 = Long.fromString("4398046511104", true)
	const L562949953421312 = Long.fromString("562949953421312", true)
	const L72057594037927936 = Long.fromString("72057594037927936", true)
	const L9223372036854775808 = Long.fromString("9223372036854775808", true)

	if (value.lessThan(L128)) return 1; // 2 ^ 7
	if (value.lessThan(L16384)) return 2; // 2 ^ 14
	if (value.lessThan(L2097152)) return 3; // 2 ^ 21
	if (value.lessThan(L268435456)) return 4; // 2 ^ 28
	if (value.lessThan(L34359738368)) return 5; // 2 ^ 35
	if (value.lessThan(L4398046511104)) return 6; // 2 ^ 42
	if (value.lessThan(L562949953421312)) return 7; // 2 ^ 49
	if (value.lessThan(L72057594037927936)) return 8; // 2 ^ 56
	if (value.lessThan(L9223372036854775808))	return 9; // 2 ^ 63
	return 10;
}

Encoder.prototype.getSizeI32 = function(value)
{
	if ((value >= -64) && (value <= 63))																	return 1; // - 2 ^ 6 ... 2 ^ 6 -1
	if ((value >= -8192) && (value <= 8191))															return 2; // - 2 ^ 13 ... 2 ^ 13 -1
	if ((value >= -1048576) && (value <= 1048575))												return 3; // - 2 ^ 20 ... 2 ^ 20 -1
	if ((value >= -134217728) && (value <= 134217727))										return 4; // - 2 ^ 27 ... 2 ^ 27 -1
	return 5;
}

Encoder.prototype.getSizeI64 = function(value)
{
	const L64N = Long.fromInt(-64)
	const L63 = Long.fromInt(63)
	const L8192N = Long.fromInt(-8192)
	const L8191 = Long.fromInt(8191)
	const L1048576N = Long.fromInt(-1048576)
	const L1048575 = Long.fromInt(1048575)
	const L134217728N = Long.fromInt(-134217728)
	const L134217727 = Long.fromInt(134217727)
	const L17179869184N = Long.fromString("-17179869184")
	const L17179869183 = Long.fromString("17179869183")
	const L2199023255552N = Long.fromString("-2199023255552")
	const L2199023255551 = Long.fromString("2199023255551")
	const L281474976710656N = Long.fromString("-281474976710656")
	const L281474976710655 = Long.fromString("281474976710655")
	const L36028797018963968N = Long.fromString("-36028797018963968")
	const L36028797018963967 = Long.fromString("36028797018963967")
	const L4611686018427387904N = Long.fromString("-4611686018427387904")
	const L4611686018427387903 = Long.fromString("4611686018427387903")

	if (value.greaterThanOrEqual(L64N) && value.lessThanOrEqual(L63)) return 1; // - 2 ^ 6 ... 2 ^ 6 -1
	if (value.greaterThanOrEqual(L8192N) && value.lessThanOrEqual(L8191)) return 2; // - 2 ^ 13 ... 2 ^ 13 -1
	if (value.greaterThanOrEqual(L1048576N) && value.lessThanOrEqual(L1048575)) return 3; // - 2 ^ 20 ... 2 ^ 20 -1
	if (value.greaterThanOrEqual(L134217728N) && value.lessThanOrEqual(L134217727)) return 4; // - 2 ^ 27 ... 2 ^ 27 -1
	if (value.greaterThanOrEqual(L17179869184N) && value.lessThanOrEqual(L17179869183)) return 5; // - 2 ^ 34 ... 2 ^ 34 -1
	if (value.greaterThanOrEqual(L2199023255552N) && value.lessThanOrEqual(L2199023255551)) return 6; // - 2 ^ 41 ... 2 ^ 41 -1
	if (value.greaterThanOrEqual(L281474976710656N) && value.lessThanOrEqual(L281474976710655)) return 7; // - 2 ^ 48 ... 2 ^ 48 -1
	if (value.greaterThanOrEqual(L36028797018963968N) && value.lessThanOrEqual(L36028797018963967)) return 8; // - 2 ^ 55 ... 2 ^ 55 -1
	if (value.greaterThanOrEqual(L4611686018427387904N) && value.lessThanOrEqual(L4611686018427387903))	return 9; // - 2 ^ 62 ... 2 ^ 62 -1
	return 10;
}

Encoder.prototype.encodePMAP = function(ctx) {
	var pos = ctx.buffer.length

	// reduce pmap bits
	while (ctx.pmap.length > 7 && ctx.pmap[ctx.pmap.length - 1] == false) ctx.pmap.pop()

	var byteVal = 0
	var last = true
	for (var i = ctx.pmap.length - 1; i >= 0; --i) {
		byteVal |= (ctx.pmap[i] ? 1 : 0) << (6 - (i % 7))

		if (!((i) % 7)) {
			ctx.buffer.unshift(last ? byteVal | 0x80 : byteVal)
			byteVal = 0
			last = false
		}
	}
	if (logEncode) console.log('ENCODED(PMAP):', toHexString(ctx.buffer.slice(0, ctx.buffer.length - pos)), '\n')
}

Encoder.prototype.encodeNull = function(ctx) {
	ctx.buffer.push(0x80)
}

Encoder.prototype.encodeU32 = function(ctx, valueIn, optional)
{
	if (optional && valueIn == null) {
		this.encodeNull(ctx)
	} else {
		var value = optional ? valueIn + 1 : valueIn

		var size = this.getSizeU32(value)
		for (var i = 0; i < size; ++i)
			ctx.buffer.push((value >> this.SHIFT[size - i]) & 0x7f)

		// set stop bit
		ctx.buffer[ctx.buffer.length - 1] |= 0x80
	}

	return this
}

Encoder.prototype.encodeU64 = function(ctx, valueIn, optional)
{
	if (optional && valueIn == null) {
		this.encodeNull(ctx)
	} else {
		var value = optional ? valueIn.add(Long.UONE) : valueIn

		var size = this.getSizeU64(value)
		for (var i = 0; i < size; ++i) {
			ctx.buffer.push((value.shiftRightUnsigned(this.SHIFT[size - i]).getLowBitsUnsigned() & 0x7f))
		}

		// set stop bit
		ctx.buffer[ctx.buffer.length - 1] |= 0x80
	}

	return this
}

Encoder.prototype.encodeI32 = function(ctx, valueIn, optional)
{
	if (logInfo) console.log('ENCODE I32, VALUE:', valueIn, 'OPT?', optional)
	/*
	if (optional && valueIn == null) {
		this.encodeNull(ctx)
		return this
	}*/

	//var SIGN_SHIFT = (sizeof(T) * 8 - 7);
	var value = (optional && valueIn >= 0) ? valueIn + 1 : valueIn

	var size = this.getSizeI32(value);
	var sign = ctx.buffer.length - 1

	//uint8_t * sign = m_stream;
	for (var i = 0; i < size; ++i) {
		ctx.buffer.push((value >> this.SHIFT[size - i]) & (i > 0 ? 0x7f : 0x7f))
	}

	// set stop bit
	ctx.buffer[ctx.buffer.length - 1] |= 0x80

	// set sign
	if (value < 0) {
		//console.log('SET_SIGN', ctx.buffer[sign], sign)
		//ctx.buffer[sign] |= 0x40
	}
	//*sign |= (0x40 & (value >> SIGN_SHIFT));

	return this
}

Encoder.prototype.encodeI64 = function(ctx, valueIn, optional)
{
	if (logInfo) console.log('ENCODE I64', valueIn, optional)
	/*
	if (optional && valueIn == null) {
		this.encodeNull(ctx)
		return this
	}*/

	var value = (optional && valueIn.greaterThanOrEqual(Long.ZERO)) ? valueIn.add(Long.ONE) : valueIn
	if (logInfo) console.log('ENCODE I64 VAL', value.toString(16), optional, value.toBytesBE())

	var size = this.getSizeI64(value);
	var sign = value.isNegative() ? 0x40 : 0

	for (var i = 0; i < size; ++i) {
		var byte = (value.shiftRight(this.SHIFT[size - i]).getLowBits() & (i > 0 ? 0x7f : 0x3f)) | (i > 0 ? 0 : sign)
		ctx.buffer.push(byte)
	}

	// set stop bit
	ctx.buffer[ctx.buffer.length - 1] |= 0x80

	return this
}

Encoder.prototype.encodeString = function(ctx, value, optional) {
	if (optional && value == null) {
		this.encodeNull(ctx)
		return this
	}

	if ( value != null && value.length  )
	{
		for (var i = 0; i < value.length; ++i) {
			ctx.buffer.push(value.charCodeAt(i))
		}

		// set stop bit
		ctx.buffer[ctx.buffer.length - 1] |= 0x80
	}
	else
		ctx.buffer.push(0x80)

	return this
}

Encoder.prototype.encodeStringDelta = function(ctx, value, optional, dict)
{
	if (optional && (value == null)) {
		this.encodeNull(ctx)
		return this
	}

	for (var pre = 0; pre < value.length && pre < dict.length && value.charCodeAt(pre) == dict.charCodeAt(pre); ++pre) {}
	for (var i = value.length, j = dict.length; i > 0 && j > 0 && value.charCodeAt(i - 1) == dict.charCodeAt(j - 1); --i, --j) {}
	var post = value.length - i

	if ( pre > 0 || post > 0 )
	{
		if (pre == post && pre == value.length) {
			this.encodeI32(ctx, 0, optional)
			this.encodeString(ctx, "", false)
		} else if ( pre <= post ) {
			this.encodeI32(ctx, post - dict.length - 1, optional)
			this.encodeString(ctx, value.substring(0, value.length - post), false)
		} else {
			this.encodeI32(ctx, dict.length - pre, optional)
			this.encodeString(ctx, value.substring(pre), false)
		}
	} else {
		this.encodeI32(ctx, dict.length, optional)
		this.encodeString(ctx, value, false)
	}

	return this
}

Encoder.prototype.encodeByteVector = function(ctx, value, optional) {
	// encode length
	this.encodeU32(ctx, value.length, optional)

	// append content
	ctx.buffer.push.apply(ctx.buffer, value)

	return this
}

Encoder.prototype.encodeByteVectorDelta = function(ctx, value, optional, dict) {
}
