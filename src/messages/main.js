/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars*/
import * as $protobuf from "protobufjs/minimal.js";

// Common aliases
const $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;

// Exported root namespace
const $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});

export const unnamedNetwork = $root.unnamedNetwork = (() => {

    /**
     * Namespace unnamedNetwork.
     * @exports unnamedNetwork
     * @namespace
     */
    const unnamedNetwork = {};

    /**
     * Terms enum.
     * @name unnamedNetwork.Terms
     * @enum {number}
     * @property {number} HELLO=0 HELLO value
     */
    unnamedNetwork.Terms = (function() {
        const valuesById = {}, values = Object.create(valuesById);
        values[valuesById[0] = "HELLO"] = 0;
        return values;
    })();

    unnamedNetwork.HelloMessage = (function() {

        /**
         * Properties of a HelloMessage.
         * @memberof unnamedNetwork
         * @interface IHelloMessage
         * @property {unnamedNetwork.Terms|null} [term] HelloMessage term
         * @property {string|null} [myName] HelloMessage myName
         * @property {Array.<string>|null} [addrs] HelloMessage addrs
         */

        /**
         * Constructs a new HelloMessage.
         * @memberof unnamedNetwork
         * @classdesc Represents a HelloMessage.
         * @implements IHelloMessage
         * @constructor
         * @param {unnamedNetwork.IHelloMessage=} [properties] Properties to set
         */
        function HelloMessage(properties) {
            this.addrs = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * HelloMessage term.
         * @member {unnamedNetwork.Terms} term
         * @memberof unnamedNetwork.HelloMessage
         * @instance
         */
        HelloMessage.prototype.term = 0;

        /**
         * HelloMessage myName.
         * @member {string} myName
         * @memberof unnamedNetwork.HelloMessage
         * @instance
         */
        HelloMessage.prototype.myName = "";

        /**
         * HelloMessage addrs.
         * @member {Array.<string>} addrs
         * @memberof unnamedNetwork.HelloMessage
         * @instance
         */
        HelloMessage.prototype.addrs = $util.emptyArray;

        /**
         * Creates a new HelloMessage instance using the specified properties.
         * @function create
         * @memberof unnamedNetwork.HelloMessage
         * @static
         * @param {unnamedNetwork.IHelloMessage=} [properties] Properties to set
         * @returns {unnamedNetwork.HelloMessage} HelloMessage instance
         */
        HelloMessage.create = function create(properties) {
            return new HelloMessage(properties);
        };

        /**
         * Encodes the specified HelloMessage message. Does not implicitly {@link unnamedNetwork.HelloMessage.verify|verify} messages.
         * @function encode
         * @memberof unnamedNetwork.HelloMessage
         * @static
         * @param {unnamedNetwork.IHelloMessage} message HelloMessage message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        HelloMessage.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.term != null && Object.hasOwnProperty.call(message, "term"))
                writer.uint32(/* id 0, wireType 0 =*/0).int32(message.term);
            if (message.myName != null && Object.hasOwnProperty.call(message, "myName"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.myName);
            if (message.addrs != null && message.addrs.length)
                for (let i = 0; i < message.addrs.length; ++i)
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.addrs[i]);
            return writer;
        };

        /**
         * Encodes the specified HelloMessage message, length delimited. Does not implicitly {@link unnamedNetwork.HelloMessage.verify|verify} messages.
         * @function encodeDelimited
         * @memberof unnamedNetwork.HelloMessage
         * @static
         * @param {unnamedNetwork.IHelloMessage} message HelloMessage message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        HelloMessage.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a HelloMessage message from the specified reader or buffer.
         * @function decode
         * @memberof unnamedNetwork.HelloMessage
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {unnamedNetwork.HelloMessage} HelloMessage
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        HelloMessage.decode = function decode(reader, length) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.unnamedNetwork.HelloMessage();
            while (reader.pos < end) {
                let tag = reader.uint32();
                switch (tag >>> 3) {
                case 0:
                    message.term = reader.int32();
                    break;
                case 1:
                    message.myName = reader.string();
                    break;
                case 2:
                    if (!(message.addrs && message.addrs.length))
                        message.addrs = [];
                    message.addrs.push(reader.string());
                    break;
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a HelloMessage message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof unnamedNetwork.HelloMessage
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {unnamedNetwork.HelloMessage} HelloMessage
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        HelloMessage.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a HelloMessage message.
         * @function verify
         * @memberof unnamedNetwork.HelloMessage
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        HelloMessage.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.term != null && message.hasOwnProperty("term"))
                switch (message.term) {
                default:
                    return "term: enum value expected";
                case 0:
                    break;
                }
            if (message.myName != null && message.hasOwnProperty("myName"))
                if (!$util.isString(message.myName))
                    return "myName: string expected";
            if (message.addrs != null && message.hasOwnProperty("addrs")) {
                if (!Array.isArray(message.addrs))
                    return "addrs: array expected";
                for (let i = 0; i < message.addrs.length; ++i)
                    if (!$util.isString(message.addrs[i]))
                        return "addrs: string[] expected";
            }
            return null;
        };

        /**
         * Creates a HelloMessage message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof unnamedNetwork.HelloMessage
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {unnamedNetwork.HelloMessage} HelloMessage
         */
        HelloMessage.fromObject = function fromObject(object) {
            if (object instanceof $root.unnamedNetwork.HelloMessage)
                return object;
            let message = new $root.unnamedNetwork.HelloMessage();
            switch (object.term) {
            case "HELLO":
            case 0:
                message.term = 0;
                break;
            }
            if (object.myName != null)
                message.myName = String(object.myName);
            if (object.addrs) {
                if (!Array.isArray(object.addrs))
                    throw TypeError(".unnamedNetwork.HelloMessage.addrs: array expected");
                message.addrs = [];
                for (let i = 0; i < object.addrs.length; ++i)
                    message.addrs[i] = String(object.addrs[i]);
            }
            return message;
        };

        /**
         * Creates a plain object from a HelloMessage message. Also converts values to other types if specified.
         * @function toObject
         * @memberof unnamedNetwork.HelloMessage
         * @static
         * @param {unnamedNetwork.HelloMessage} message HelloMessage
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        HelloMessage.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            let object = {};
            if (options.arrays || options.defaults)
                object.addrs = [];
            if (options.defaults) {
                object.term = options.enums === String ? "HELLO" : 0;
                object.myName = "";
            }
            if (message.term != null && message.hasOwnProperty("term"))
                object.term = options.enums === String ? $root.unnamedNetwork.Terms[message.term] : message.term;
            if (message.myName != null && message.hasOwnProperty("myName"))
                object.myName = message.myName;
            if (message.addrs && message.addrs.length) {
                object.addrs = [];
                for (let j = 0; j < message.addrs.length; ++j)
                    object.addrs[j] = message.addrs[j];
            }
            return object;
        };

        /**
         * Converts this HelloMessage to JSON.
         * @function toJSON
         * @memberof unnamedNetwork.HelloMessage
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        HelloMessage.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        return HelloMessage;
    })();

    return unnamedNetwork;
})();

export { $root as default };
