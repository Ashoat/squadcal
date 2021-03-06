// flow-typed signature: d2fab7bd2a9cee86a71d4dbf7d7d6fbc
// flow-typed version: <<STUB>>/rereadable-stream_v1.4.5/flow_v0.137.0

/**
 * This is an autogenerated libdef stub for:
 *
 *   'rereadable-stream'
 *
 * Fill this stub out by replacing all the `any` types.
 *
 * Once filled out, we encourage you to share your work with the
 * community by sending a pull request to:
 * https://github.com/flowtype/flow-typed
 */

declare module 'rereadable-stream' {
  declare type ReReadableOptions = { length: number, ... } & writableStreamOptions;
  declare export class ReReadable extends stream$Writable {
    constructor(options?: ReReadableOptions): this;
    tail(count: number): stream$Readable;
    rewind(): stream$Readable;
  }
}

/**
 * We include stubs for each file inside this npm package in case you need to
 * require those files directly. Feel free to delete any files that aren't
 * needed.
 */


// Filename aliases
declare module 'rereadable-stream/index' {
  declare module.exports: $Exports<'rereadable-stream'>;
}
declare module 'rereadable-stream/index.js' {
  declare module.exports: $Exports<'rereadable-stream'>;
}
