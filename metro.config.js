// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push(
  'db',
  'mp3',
  'ttf',
  'obj',
  'mtl',
  'png',
  'jpg',
  'jpeg'
);

config.resolver.sourceExts.push(
  'jsx',
  'js',
  'ts',
  'tsx',
  'json',
  'cjs'
);

module.exports = config;