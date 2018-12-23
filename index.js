
var convert = require('xml-js')
var Long = require('long')
var fs = require('fs');


module.exports = {
	Decoder: Decoder,
	Encoder: Encoder
}


var logInfo = false

function toHexString(byteArray) {
  var s = '';
  byteArray.forEach(function(byte) {
    s += ('0' + (byte & 0xFF).toString(16)).slice(-2) + ' ';
  });
  return s;
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
		/*
		var ret = Operator.properties[operator].pmap[optional ? 'optional' : 'mandatory']
		console.log('Occupy', Operator.properties[operator].pmap, optional, ret)
		return ret
		*/
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

Element.prototype.isMessage = function()  {
	return this.type == 'message'
}

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
			break
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
	if (logInfo) console.log('IS_BIT_SET', this.pmap[this.idx], this.idx)
	if (!this.pmap.length) console.trace()
	return this.pmap[this.idx++]
}

Context.prototype.setBit = function(bit) {
	if (logInfo) console.log('SET BIT', this.pmap.length, bit)
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

	//this.xml = xml
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
		//console.log('Add Template: ', templates[i].attributes.name, templates[i].attributes.id)

		var tpl = new Element(templates[i].attributes.name, 'message', templates[i].attributes.id)
		Element.parse(tpl, templates[i].elements)

		this.templates[tpl.id] = tpl
		//console.log('TEMPLATE', '\n', tpl)
		//console.log(JSON.stringify(tpl, null, 2));
		//this.templates[templates[i].attributes.id] = templates[i]
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
			//console.log('\n', 'Template definition for', this.TemplateID, 'found:', tpl.name)

			var msg = this.decodeGroup(ctx, tpl.elements)

			// call handler if available
			if (typeof callbacks === 'function') {
				callbacks(msg, tpl.name)
			} else if (callbacks[tpl.name]) {
				callbacks[tpl.name](msg, tpl)
			} else if (callbacks['default']){
				callbacks['default'](msg, tpl.name, tpl)
			}
		}
	}
}

Decoder.prototype.decodeUInt32Value = function(ctx, field) {
	//console.log('DecodeUInt32Value', field.name, field.isOptional(), field.operator, ctx.pmap, ctx.idx)
	var optional = field.isOptional()
	if (!field.hasOperator()) return this.decodeU32(optional)

	switch (field.operator.name) {
		case 'constant':
			if (optional) {
				// OPTIONAL
				return ctx.isBitSet() ? field.operator.value : undefined
			} else {
				// MANDATORY
				return field.operator.value
			}
			break
		case 'copy':
			var entry = this.Dictionary.getField(field.name)
			if (ctx.isBitSet()) {
				entry.assign(this.decodeU32(optional))
			}
			return entry.Value
		case 'default':
			if (ctx.isBitSet()) {
				return this.decodeU32(optional)
			} else {
				return field.operator.value
			}
			break
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
		case 'tail':
			break
		case 'delta':
			var entry = this.Dictionary.getField(field.name)
			var streamValue = this.decodeI32(optional)
			//console.log('STREAM_VALUE', streamValue)
			entry.assign((streamValue == null) ? undefined : (entry.isAssigned() ? entry.Value : 0) + streamValue)
			return entry.Value
	}
}

Decoder.prototype.decodeInt32Value = function(ctx, field) {
	//console.log('DecodeInt32Value', field.name, field.isOptional(), field.operator)
	var optional = field.isOptional()
	if (!field.hasOperator()) return this.decodeI32(optional)

	switch (field.operator.name) {
		case 'constant':
			if (optional) {
				// OPTIONAL
				return ctx.isBitSet() ? field.operator.value : undefined
			} else {
				// MANDATORY
				return field.operator.value
			}
			break
		case 'copy':
			var entry = this.Dictionary.getField(field.name)
			if (ctx.isBitSet()) {
				entry.assign(this.decodeI32(optional))
			}
			return entry.Value
		case 'default':
			if (ctx.isBitSet()) {
				return this.decodeI32(optional)
			} else {
				return field.operator.value
			}
			break
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
		case 'tail':
			break
		case 'delta':
		var entry = this.Dictionary.getField(field.name)
		var streamValue = this.decodeI32(optional)
		entry.assign(streamValue == null ? undefined : entry.Value + streamValue)
		return entry.Value
	}
}

Decoder.prototype.decodeUInt64Value = function(ctx, field) {
	//console.log('DecodeUInt64Value', field.name, field.isOptional(), field.operator)
	var optional = field.isOptional()
	if (!field.hasOperator()) return this.decodeU64(optional)

	switch (field.operator.name) {
		case 'constant':
			if (optional) {
				// OPTIONAL
				return ctx.isBitSet() ? field.operator.value : undefined
			} else {
				// MANDATORY
				return field.operator.value
			}
			break
		case 'copy':
			var entry = this.Dictionary.getField(field.name)
			if (ctx.isBitSet()) {
				entry.assign(this.decodeU64(optional))
			}
			return entry.Value
		case 'default':
			if (ctx.isBitSet()) {
				return this.decodeU64(optional)
			} else {
				return field.operator.value
			}
			break
		case 'increment':
			var entry = this.Dictionary.getField(field.name)
			if (ctx.isBitSet()) {
				entry.assign(this.decodeU64(optional))
			} else {
				entry.assign(entry.Value + 1)
			}
			return entry.Value
		case 'tail':
			break
		case 'delta':
			var entry = this.Dictionary.getField(field.name)
			var streamValue = this.decodeI64(optional)
			entry.assign(streamValue == null ? undefined : entry.isAssigned() ? Long.fromValue(entry.Value, true).add(streamValue) : streamValue)
			return entry.isAssigned() ? entry.Value.toString(10) : undefined
	}
}

Decoder.prototype.decodeInt64Value = function(ctx, field) {
	//console.log('DecodeInt64Value', field.name, field.isOptional(), field.operator)
	var optional = field.isOptional()
	if (!field.hasOperator()) return this.decodeI64(optional)

	switch (field.operator.name) {
		case 'constant':
			if (optional) {
				// OPTIONAL
				return ctx.isBitSet() ? field.operator.value : undefined
			} else {
				// MANDATORY
				return field.operator.value
			}
			break
		case 'copy':
			var entry = this.Dictionary.getField(field.name)
			if (ctx.isBitSet()) {
				entry.assign(this.decodeI64(optional))
			}
			return entry.Value
		case 'default':
			if (ctx.isBitSet()) {
				return this.decodeI64(optional)
			} else {
				return field.operator.value
			}
			break
		case 'increment':
			var entry = this.Dictionary.getField(field.name)
			if (ctx.isBitSet()) {
				entry.assign(this.decodeI64(optional))
			} else {
				entry.assign(Long.fromValue(entry.Value).add(Long.ONE))
			}
			return entry.isAssigned() ? entry.Value.toString(10) : undefined
		case 'tail':
			break
		case 'delta':
			var entry = this.Dictionary.getField(field.name)
			var streamValue = this.decodeI64(optional)
			entry.assign(streamValue == null ? undefined : entry.isAssigned() ? Long.fromValue(entry.Value).add(streamValue) : streamValue)
			return entry.isAssigned() ? entry.Value.toString(10) : undefined
	}
}

Decoder.prototype.decodeDecimalValue = function(ctx, field) {
	//console.log('DecodeDecimalValue', field.name, field.isOptional(), field.operator)
	var optional = field.isOptional()
	if (!field.hasOperator()) return this.decodeDecimal(optional)

	switch (field.operator.name) {
		case 'constant':
			if (optional) {
				// OPTIONAL
				return ctx.isBitSet() ? field.operator.value : undefined
			} else {
				// MANDATORY
				return field.operator.value
			}
			break
		case 'copy':
			var entry = this.Dictionary.getField(field.name)
			if (ctx.isBitSet()) {
				entry.assign(this.decodeDecimal(optional))
			}
			return entry.Value
		case 'default':
			if (ctx.isBitSet()) {
				return this.decodeDecimal(optional)
			} else {
				return field.operator.value
			}
			break
		case 'increment':
			break
		case 'tail':
			break
		case 'delta':
		var entry = this.Dictionary.getField(field.name)
		var streamExpValue = this.decodeI32(optional)
		if (streamExpValue == null) {
			entry.assign(undefined)
		} else {
			var streamManValue = this.decodeI64(false)

			if (!entry.isAsigned()) {
				entry.assign({'m': 0, 'e': 0})
			}

			entry.assign({'m': entry.Value.man + streamManValue, 'e': entry.Value.exp + exp})
		}
		return entry.Value
	}
}

Decoder.prototype.decodeStringValue = function(ctx, field) {
	//console.log('DecodeStringValue', field.name, field.isOptional(), field.operator)
	var optional = field.isOptional()
	if (!field.hasOperator()) return this.decodeString(optional)

	switch (field.operator.name) {
		case 'constant':
			if (optional) {
				// OPTIONAL
				return ctx.isBitSet() ? field.operator.value : undefined
			} else {
				// MANDATORY
				return field.operator.value
			}
			break
		case 'copy':
			var entry = this.Dictionary.getField(field.name)
			if (ctx.isBitSet()) {
				entry.assign(this.decodeString(optional))
			}
			return entry.Value
		case 'default':
			if (ctx.isBitSet()) {
				return this.decodeString(optional)
			} else {
				return field.operator.value
			}
			break
		case 'increment':
			break
		case 'tail':
			break
		case 'delta':
			var entry = this.Dictionary.getField(field.name)
			var length = this.decodeI32(optional)
			if (optional && length == null) {
				entry.assign(undefined)
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

Decoder.prototype.decodePMAP = function() {
	//console.log('DECODE PMAP', this.buffer.length - this.pos)
	//console.trace()
	if (logInfo) console.log('DECODE PMAP', this.pos, this.buffer.length - this.pos)
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
			//s.clear();
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
	//console.log('Decoding', this.buffer.length - this.pos, 'bytes')
	for (; this.pos < this.buffer.length; ) {
		var byteVal = this.buffer[this.pos++]
		//console.log('Byte:', byteVal & 0x7f)
		val = (val << 7) + (byteVal & 0x7f)
		if (byteVal & 0x80) break
	}

	return val
}

Decoder.prototype.decodeI64 = function(optional) {
	if (optional) {
		var byteVal = this.buffer[this.pos]
		if (byteVal == 0x80) {
			++this.pos;
			return undefined;
		}
	}

	//var val = (this.buffer[this.pos] & 0x40) > 0 ? -1 : 0
	var value = Long.fromInt((this.buffer[this.pos] & 0x40) > 0 ? -1 : 0)
	for (; this.pos < this.buffer.length; ) {
		var byteVal = this.buffer[this.pos++]
		//val = (val << 7) + (byteVal & 0x7f)
		value = value.shiftLeft(7).or(byteVal & 0x7f)
		if (byteVal & 0x80) break
	}

	if (optional && value.greaterThan(Long.ZERO)) value = value.subtract(Long.ONE)

	return value.toString(10)
}

Decoder.prototype.decodeU64 = function(optional) {
	if (optional) {
		var byteVal = this.buffer[this.pos]
		if (byteVal == 0x80)
		{
			++this.pos;
			return undefined;
		}
	}

	var value = Long.UZERO
	//console.log('Decoding', this.buffer.length - this.pos, 'bytes')
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
			//s.clear();
			++this.pos;
			return undefined;
		}
	}

	var exp = this.decodeI32()
	var man = this.decodeI64()
	return {'m': man, 'e': exp}
}

Decoder.prototype.decodeString = function(optional) {
	//console.log('DECODE_STRING', optional)
	if (optional) {
		var byteVal = this.buffer[this.pos]
		if (byteVal == 0x80)
		{
			++this.pos;
			//console.log('RETURN undefined for String')
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

Decoder.prototype.decodeByteVector = function() {
	var len = this.decodeU32()
	var val = this.buffer.slice(this.pos, this.pos + len)
	this.pos += len
	return val
}

Decoder.prototype.decodeGroup = function(ctx, elements, start) {
	var val = {}
	if (!elements) return val

	for (var i = start ? start : 0; i < elements.length; ++i) {
		var element = elements[i]
		var fieldName = element.name
		var optional = (element.presence == null) ? false : (element.presence == 'optional')
		var operator = element.operator
		//console.log('Decode', element.type, fieldName, optional, operator, element.pmap)

		switch (element.type) {
			case 'int32':
				val[fieldName] = this.decodeInt32Value(ctx, element)
				//console.log(fieldName, '=', val[fieldName])
				break
			case 'uInt32':
				val[fieldName] = this.decodeUInt32Value(ctx, element)
				//console.log(fieldName, '=', val[fieldName])
				break
			case 'int64':
				val[fieldName] = this.decodeInt64Value(ctx, element)
				//console.log(fieldName, '=', val[fieldName])
				break
			case 'uInt64':
				val[fieldName] = this.decodeUInt64Value(ctx, element)
				//console.log(fieldName, '=', val[fieldName])
				break
			case 'decimal':
				val[fieldName] = this.decodeDecimalValue(ctx, element)
				//console.log(fieldName, '=', val[fieldName])
				break
			case 'string':
				val[fieldName] = this.decodeStringValue(ctx, element)
				//console.log(fieldName, '=', val[fieldName])
				break
			case 'byteVector':
				val[fieldName] = this.decodeByteVector()
				//console.log(fieldName, '=', val[fieldName])
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
	var length = this.decodeUInt32Value(ctx, sequence.lengthField)
	if (!length) {
		return undefined
	}

	var val = []
	for (var i = 0; i < length; ++i) {
		var groupCtx = new Context(sequence.pmapElements ? this.decodePMAP() : [])
		//val.push(groupCtx)
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
}

Encoder.prototype.encode = function(name, value) {

	// lookup template definition
	var tpl = this.templates[name]
	if (tpl == null) return undefined

	// encode/reserve pmap bits
	var ctx = new Context([])

	// encode template id
	this.encodeUInt32Value(ctx, this.templateID, tpl.id)

	// encode message body
	this.encodeGroup(ctx, tpl, value)

	// return the binary encoded message
	return ctx.buffer
}

Encoder.prototype.encodeGroup = function(ctx, field, value, start) {
	var elements = field.elements
	//console.log('EncodeGroup:', field.name, 'PMAP_ELEMENTS:', field.pmapElements, elements.length)
	if (!elements) return

	// LOG
	//var begin = ctx.buffer.length

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
				console.log('Not supported type', element.type, fieldName)
				break
		}
	}

	if (field.pmapElements > 0)	this.encodePMAP(ctx)
}

Encoder.prototype.encodeSequence = function(ctx, field, value, start) {
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
	//console.log('EncodeUInt32Value:', field.name, value, 'OPT:', field.isOptional(), 'HAS_OP:', field.hasOperator())
	var optional = field.isOptional()
	if (!field.hasOperator()) {
		if (optional && !value) {
			this.encodeNull(ctx)
		} else {
			this.encodeU32(ctx, value, optional)
		}
		return
	}

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
				this.encodeU32(ctx, value, optional)
				entry.assign(value)
			}
			break
		case 'default':
			if (value != field.operator.value) {
				ctx.setBit(true)
				this.encodeU32(ctx, value, optional)
			} else {
				ctx.setBit(false)
			}
			break
		case 'increment':
			var entry = this.Dictionary.getField(field.name)
			if (entry.isAssigned() && value == entry.Value + 1) {
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
			var entry = this.Dictionary.getField(field.name)
			var deltaValue = value ? value - (entry.isAssigned() ? entry.Value : 0) : undefined
			this.encodeI32(ctx, deltaValue, optional)
			entry.assign(value)
			break
	}
}

Encoder.prototype.encodeInt32Value = function(ctx, field, value) {
	//console.log('EncodeUInt32Value:', field.name, value, 'OPT:', field.isOptional(), 'HAS_OP:', field.hasOperator())
	var optional = field.isOptional()
	if (!field.hasOperator()) {
		if (optional && !value) {
			this.encodeNull(ctx)
		} else {
			this.encodeI32(ctx, value, optional)
		}
		return
	}

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
				this.encodeI32(ctx, value, optional)
				entry.assign(value)
			}
			break
		case 'default':
			if (value != field.operator.value) {
				ctx.setBit(true)
				this.encodeI32(ctx, value, optional)
			} else {
				ctx.setBit(false)
			}
			break
		case 'increment':
			var entry = this.Dictionary.getField(field.name)
			if (entry.isAssigned() && value == entry.Value + 1) {
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
			var entry = this.Dictionary.getField(field.name)
			var deltaValue = value ? value - (entry.isAssigned() ? entry.Value : 0) : undefined
			this.encodeI32(ctx, deltaValue, optional)
			entry.assign(value)
			break
	}
}

Encoder.prototype.encodeInt64Value = function(ctx, field, value) {
	//console.log('EncodeInt64Value:', field.name, value, 'OPT:', field.isOptional(), 'HAS_OP:', field.hasOperator())
	var optional = field.isOptional()
	if (!field.hasOperator()) {
		if (optional && !value) {
			this.encodeNull(ctx)
		} else {
			this.encodeI64(ctx, value, optional)
		}
		return
	}

	switch (field.operator.name) {
		case 'constant':
			if (optional) {
				ctx.setBit(value != null)
			}
			break
		case 'copy':
			var entry = this.Dictionary.getField(field.name)
			//if (optional) console.log('ENCODE INT64:', value, entry)
			if (entry.isAssigned() && value.equals(entry.Value)) {
				ctx.setBit(false)
			} else {
				ctx.setBit(true)
				this.encodeI64(ctx, value, optional)
				entry.assign(value)
			}
			break
		case 'default':
			if (optional && !value) {
				ctx.setBit(true)
				this.encodeNull(ctx)
			} else if (value.notEquals(field.operator.value)) {
				ctx.setBit(true)
				this.encodeI64(ctx, value, optional)
			} else {
				ctx.setBit(false)
			}
			break
		case 'increment':
			var entry = this.Dictionary.getField(field.name)
			if (optional && !value) {
				ctx.setBit(true)
				this.encodeNull(ctx)
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
			var entry = this.Dictionary.getField(field.name)
			var deltaValue = value != null ? value.subtract((entry.isAssigned() ? entry.Value : Long.ZERO)) : undefined
			this.encodeI64(ctx, deltaValue, optional)
			entry.assign(value)
			break
	}
}

Encoder.prototype.encodeUInt64Value = function(ctx, field, value) {
	//console.log('EncodeUInt64Value:', field.name, value, 'OPT:', field.isOptional(), 'HAS_OP:', field.hasOperator())
	var optional = field.isOptional()
	if (!field.hasOperator()) {
		if (optional && !value) {
			this.encodeNull(ctx)
		} else {
			this.encodeU64(ctx, Long.fromValue(value, true), optional)
		}
		return
	}

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
				this.encodeU64(ctx, value, optional)
				entry.assign(value)
			}
			break
		case 'default':
			if (value != field.operator.value) {
				ctx.setBit(true)
				this.encodeU64(ctx, value, optional)
			} else {
				ctx.setBit(false)
			}
			break
		case 'increment':
			var entry = this.Dictionary.getField(field.name)
			if (entry.isAssigned() && value == entry.Value + 1) {
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
			var entry = this.Dictionary.getField(field.name)
			var deltaValue = value != null ? value.subtract((entry.isAssigned() ? entry.Value : Long.UZERO)) : undefined
			this.encodeI64(ctx, deltaValue == null ? undefined : deltaValue.toSigned(), optional)
			entry.assign(value)
			break
	}
}

Encoder.prototype.encodeDecimalValue = function(ctx, field, value) {
	//console.log('EncodeDecimalValue:', field.name, value, field.isOptional(), field.operator)
	var optional = field.isOptional()
	if (!field.hasOperator()) {
		if (optional && !value) {
			this.encodeNull(ctx)
		} else {
			this.encodeI32(ctx, value.e, optional)
			this.encodeI64(ctx, Long.fromValue(value.m), false)
		}
		return
	}

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
				this.encodeI32(ctx, value.e, optional)
				this.encodeI64(ctx, Long.fromValue(value.m), false)
				entry.assign(value)
			}
			break
		case 'default':
			if (value != field.operator.value) {
				ctx.setBit(true)
				this.encodeI32(ctx, value.e, optional)
				this.encodeI64(ctx, Long.fromValue(value.m), false)
			} else {
				ctx.setBit(false)
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
			var entry = this.Dictionary.getField(field.name)
			var deltaValue = value ? value - (entry.isAssigned() ? entry.Value : 0) : undefined
			this.encodeI32(ctx, value.e, optional)
			this.encodeI64(ctx, Long.fromValue(value.m), false)
			entry.assign(value)
			break
	}
}

Encoder.prototype.encodeStringValue = function(ctx, field, value) {
	//console.log('ENCODE:', field.name, value, field.isOptional())
	var optional = field.isOptional()
	if (!field.hasOperator()) {
		if (optional && !value) {
			this.encodeNull(ctx)
		} else {
			this.encodeString(ctx, value, optional)
		}
		return
	}

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
			/*
			var deltaValue = value ? value - (entry.isAssigned() ? entry.Value : 0) : undefined
			this.encodeI(ctx, deltaValue, optional)
			*/
			entry.assign(value)
			break
	}
}

Encoder.prototype.encodeByteVectorValue = function(ctx, field, value) {
	//console.log('ENCODE BYTEVECTOR:', value)
	var optional = field.isOptional()
	if (!field.hasOperator()) {
		if (optional && !value) {
			this.encodeNull(ctx)
		} else {
			this.encodeByteVector(ctx, value, optional)
		}
		return
	}

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
				this.encodeByteVector(ctx, value, optional)
				entry.assign(value)
			}
			break
		case 'default':
			if (value != field.operator.value) {
				ctx.setBit(true)
				this.encodeByteVector(ctx, value, optional)
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
			var prevValue = entry.isAssigned() ? entry.Value : []
			this.encodeByteVectorDelta(ctx, value, optional, prevValue)
			entry.assign(value)
			break
	}
}

Encoder.prototype.getSizeU32 = function(value)
{
	if (value < 128)                return 1; // 2 ^ 7
	if (value < 16384)              return 2; // 2 ^ 14
	if (value < 2097152)            return 3; // 2 ^ 21
	if (value < 268435456)          return 4; // 2 ^ 28
	if (value < 34359738368)        return 5; // 2 ^ 35
	if (value < 4398046511104)      return 6; // 2 ^ 42
	if (value < 562949953421312)    return 7; // 2 ^ 49
	if (value < 72057594037927936)  return 8; // 2 ^ 56
	return 9;
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
	if ((value >= -17179869184) && (value <= 17179869183))								return 5; // - 2 ^ 34 ... 2 ^ 34 -1
	if ((value >= -2199023255552) && (value <= 2199023255551))						return 6; // - 2 ^ 41 ... 2 ^ 41 -1
	if ((value >= -281474976710656) && (value <= 281474976710655))				return 7; // - 2 ^ 48 ... 2 ^ 48 -1
	if ((value >= -36028797018963968) && (value <= 36028797018963967))		return 8; // - 2 ^ 55 ... 2 ^ 55 -1
	if ((value >= -4611686018427387904 && value <= 4611686018427387903))	return 9;
	return 10;
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
	if (value.greaterThanOrEqual(L4611686018427387904N) && value.lessThanOrEqual(L4611686018427387903))	return 9;
	return 10;
}

Encoder.prototype.encodePMAP = function(ctx) {
	//console.log('ENCODE PMAP', ctx.pmap)
	var byteVal = 0
	var last = true
	for (var i = ctx.pmap.length - 1; i >= 0; --i) {
		//console.log('BIT', byteVal, i, ctx.pmap[i])
		byteVal |= (ctx.pmap[i] ? 1 : 0) << (6 - (i % 7))

		if (!((i) % 7)) {
			//console.log('BYTE', byteVal, i)
			ctx.buffer.unshift(last ? byteVal | 0x80 : byteVal)
			byteVal = 0
			last = false
		}
	}
}

Encoder.prototype.encodeNull = function(ctx) {
	ctx.buffer.push(0x80)
}

Encoder.prototype.encodeU32 = function(ctx, value, optional)
{
	if (optional && value == null) {
		this.encodeNull(ctx)
	} else {
		//console.log('EncodeU', value)
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
	//console.log('encodeU64:', value.toString(10))
	if (optional && valueIn == null) {
		this.encodeNull(ctx)
	} else {
		var value = optional ? valueIn.add(Long.UONE) : valueIn

		//console.log('EncodeU', value)
		var size = this.getSizeU64(value)
		for (var i = 0; i < size; ++i) {
			//ctx.buffer.push((value >> this.SHIFT[size - i]) & 0x7f)
			ctx.buffer.push((value.shiftRightUnsigned(this.SHIFT[size - i]).getLowBitsUnsigned() & 0x7f))
		}

		// set stop bit
		ctx.buffer[ctx.buffer.length - 1] |= 0x80
	}

	return this
}

Encoder.prototype.encodeI32 = function(ctx, value, optional)
{
	if (optional && value == null) {
		this.encodeNull(ctx)
		return this
	}

	//var SIGN_SHIFT = (sizeof(T) * 8 - 7);
	if (optional && value >= 0) {
		value += 1
	}

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
	//console.log('ENCODE I64', valueIn, optional)
	if (optional && valueIn == null) {
		this.encodeNull(ctx)
		return this
	}

	var value = (optional && valueIn.greaterThanOrEqual(Long.ZERO)) ? valueIn.add(Long.ONE) : valueIn

	//var SIGN_SHIFT = (sizeof(T) * 8 - 7);
	/*
	if (optional && value.greaterThanOrEqual(Long.ZERO)) {
		value = value.add(Long.ONE)
	}*/

	var size = this.getSizeI64(value);
	var sign = ctx.buffer.length - 1

	//console.log('encodeI64:', value.toString(10), 'SIZE:', size)

	for (var i = 0; i < size; ++i) {
		var byte = value.shiftRight(this.SHIFT[size - i]).getLowBits() & 0x7f
		//ctx.buffer.push((value >> this.SHIFT[size - i]) & (i > 0 ? 0x7f : 0x7f))
		//ctx.buffer.push(value.shiftRight(this.SHIFT[size - i]).getLowBits() & 0x7f)
		ctx.buffer.push(byte)
	}

	// set stop bit
	ctx.buffer[ctx.buffer.length - 1] |= 0x80

	// set sign
	//if (value < 0) {
		//console.log('SET_SIGN', ctx.buffer[sign], sign)
		//ctx.buffer[sign] |= 0x40
	//}
	//*sign |= (0x40 & (value >> SIGN_SHIFT));

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
	for (var pre = 0; pre < value.length && pre < dict.length && value.charCodeAt(pre) == dict.charCodeAt(pre); ++pre) {}
	for (var i = value.length, j = dict.length; i > 0 && j > 0 && value.charCodeAt(i - 1) == dict.charCodeAt(j - 1); --i, --j) {}
	var post = value.length - i

	//console.log('COMPARE, PRE:', pre, 'POST:', post)
	if ( pre > 0 || post > 0 )
	{
		if (pre == post && pre == value.length) {
			//console.log('STRING EQUALS')
			this.encodeI32(ctx, 0, optional)
			this.encodeString(ctx, "", false)
		} else if ( pre < post ) {
			//console.log('POST', post - dict.length - 1, value.substring(0, value.length - post))
			this.encodeI32(ctx, post - dict.length - 1, optional)
			this.encodeString(ctx, value.substring(0, value.length - post), false)
		} else {
			//console.log('PRE', dict.length - pre , value.substring(pre))
			this.encodeI32(ctx, dict.length - pre, optional)
			this.encodeString(ctx, value.substring(pre), false)
		}
	} else {
		//console.log('ENCODE DELTA ALL', value, dict.length)
		this.encodeI32(ctx, dict.length, optional)
		this.encodeString(ctx, value, false)
	}

	return this
}

Encoder.prototype.encodeByteVector = function(ctx, value, optional) {
	if (optional && (value == null)) {
		this.encodeNull(ctx)
		return this
	}

	// encode length
	this.encodeU32(ctx, value.length, optional)

	// append content
	ctx.buffer.push.apply(ctx.buffer, value)

	return this
}

Encoder.prototype.encodeByteVectorDelta = function(ctx, value, optional, dict) {
}
