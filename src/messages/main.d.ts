import * as $protobuf from "protobufjs";
/** Namespace unnamedNetwork. */
export namespace unnamedNetwork {

    /** Terms enum. */
    enum Terms {
        HELLO = 0
    }

    /** Properties of a HelloMessage. */
    interface IHelloMessage {

        /** HelloMessage term */
        term?: (unnamedNetwork.Terms|null);

        /** HelloMessage myName */
        myName?: (string|null);

        /** HelloMessage addrs */
        addrs?: (string[]|null);
    }

    /** Represents a HelloMessage. */
    class HelloMessage implements IHelloMessage {

        /**
         * Constructs a new HelloMessage.
         * @param [properties] Properties to set
         */
        constructor(properties?: unnamedNetwork.IHelloMessage);

        /** HelloMessage term. */
        public term: unnamedNetwork.Terms;

        /** HelloMessage myName. */
        public myName: string;

        /** HelloMessage addrs. */
        public addrs: string[];

        /**
         * Creates a new HelloMessage instance using the specified properties.
         * @param [properties] Properties to set
         * @returns HelloMessage instance
         */
        public static create(properties?: unnamedNetwork.IHelloMessage): unnamedNetwork.HelloMessage;

        /**
         * Encodes the specified HelloMessage message. Does not implicitly {@link unnamedNetwork.HelloMessage.verify|verify} messages.
         * @param message HelloMessage message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: unnamedNetwork.IHelloMessage, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified HelloMessage message, length delimited. Does not implicitly {@link unnamedNetwork.HelloMessage.verify|verify} messages.
         * @param message HelloMessage message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: unnamedNetwork.IHelloMessage, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a HelloMessage message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns HelloMessage
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): unnamedNetwork.HelloMessage;

        /**
         * Decodes a HelloMessage message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns HelloMessage
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): unnamedNetwork.HelloMessage;

        /**
         * Verifies a HelloMessage message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a HelloMessage message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns HelloMessage
         */
        public static fromObject(object: { [k: string]: any }): unnamedNetwork.HelloMessage;

        /**
         * Creates a plain object from a HelloMessage message. Also converts values to other types if specified.
         * @param message HelloMessage
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: unnamedNetwork.HelloMessage, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this HelloMessage to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };
    }
}
