'use strict';

const { BackstageAdapter } = require('./lib/backstage-adapter');
const { TypeSpecAdapter } = require('./lib/typespec-adapter');
const { BufAdapter } = require('./lib/buf-adapter');
const { PactAdapter } = require('./lib/pact-adapter');
const { DevcontainerAdapter } = require('./lib/devcontainer-adapter');

module.exports = {
  BackstageAdapter,
  TypeSpecAdapter,
  BufAdapter,
  PactAdapter,
  DevcontainerAdapter,
  createAdapters: () => ({
    backstage: new BackstageAdapter(),
    typespec: new TypeSpecAdapter(),
    buf: new BufAdapter(),
    pact: new PactAdapter(),
    devcontainer: new DevcontainerAdapter(),
  }),
};
