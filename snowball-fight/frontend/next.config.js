const path = require('path');

/** @type {import('next').NextConfig} */
module.exports = {
  webpack: (config, { isServer }) => {
    // Prevent webpack from trying to resolve optional native modules used by some
    // packages (debug/ws) which are not needed in the browser.
    config.resolve.fallback = Object.assign(config.resolve.fallback || {}, {
      bufferutil: false,
      'utf-8-validate': false,
      'supports-color': false,
    });

    // Alias a few node-specific paths to a tiny browser-safe shim so imports
    // don't cause module not found errors during dev.
    const emptyModule = path.resolve(__dirname, './empty-module.js');
    config.resolve.alias = Object.assign(config.resolve.alias || {}, {
      'bufferutil': emptyModule,
      'utf-8-validate': emptyModule,
      'supports-color': emptyModule,
      // prefer the browser debug entry when some packages accidentally import the node debug file
      'debug/src/node.js': path.resolve(__dirname, './node_modules/debug/src/browser.js'),
      // Force emotion packages to resolve to the single copy in this project's node_modules.
      // This avoids warnings and runtime issues when multiple builds or versions are
      // accidentally included by transitive deps or HMR.
      '@emotion/react': path.resolve(__dirname, 'node_modules', '@emotion', 'react'),
      '@emotion/styled': path.resolve(__dirname, 'node_modules', '@emotion', 'styled'),
      '@emotion/cache': path.resolve(__dirname, 'node_modules', '@emotion', 'cache'),
    });

    return config;
  },
};
