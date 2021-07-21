import path from 'path';
import { fileURLToPath } from 'url';
import HtmlWebpackPlugin from 'html-webpack-plugin';

export default {
  mode: process.env.production ? 'production' : 'development',
  entry: {
    demo: './src/demo.ts',
  },
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
  },
  plugins: [
    new HtmlWebpackPlugin({
      title: 'unnamed-network demo',
    }),
  ],
  output: {
    filename: '[name].[contenthash].js',
    path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'dist'),
    clean: true,
  },
  devtool: 'inline-source-map',
  devServer: {
    watchOptions: {
      ignored: /node_modules/,
    },
  },
};
