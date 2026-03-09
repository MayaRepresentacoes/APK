const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Adiciona suporte para arquivos .cjs
config.resolver.sourceExts.push('cjs');

// Desabilita uma funcionalidade experimental que causa o problema
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
