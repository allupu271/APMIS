// Standard Expo Metro config. Kept minimal so it stays in sync with the SDK
// defaults; extend `config` below only if a real customization is needed.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
