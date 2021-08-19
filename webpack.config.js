const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const pathTo = target => path.resolve(__dirname, target);

const webpackSharedConfig = {
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      'unnamed-network': pathTo('src'),
    }
  },
  devtool: 'inline-source-map',
};

const webpackConfigs = {
  'browser-dev': {
    ...webpackSharedConfig,
    mode: 'development',
    target: 'web',
    entry: { 'browser-dev': './src/dev/browser.ts' },
    plugins: [
      new HtmlWebpackPlugin({
        title: 'unnamed-network dev',
      }),
    ],
    output: {
      filename: '[name].js',
      path: pathTo('dist'),
    },
    devtool: 'inline-source-map',
    devServer: {
      watchOptions: {
        ignored: /node_modules/,
      },
    },
  },
  'node-dev': {
    ...webpackSharedConfig,
    mode: 'development',
    target: 'node',
    entry: { 'node-dev': './src/dev/node.ts' },
    output: {
      filename: '[name].js',
      path: pathTo('dist'),
    },
    externals: [{
      'isomorphic-webcrypto': 'commonjs isomorphic-webcrypto',
      'ws': 'commonjs ws',
    }],
  },
  'dist': {
    ...webpackSharedConfig,
    mode: 'development',
    entry: {
      'unnamed-network': './src/index.ts',
    },
    output: {
      filename: '[name].js',
      path: pathTo('dist'),
      library: {
        type: 'commonjs-module',
      }
    },
    externals: [{
      'isomorphic-webcrypto': 'commonjs isomorphic-webcrypto',
      'ws': 'commonjs ws',
    }],
  }
};

module.exports = webpackConfigs[process.env.TARGET || 'node-dev'];
