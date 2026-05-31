const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Register .txt so the Stockfish engine bundle loads as an asset
// instead of being parsed as JavaScript by Metro.
config.resolver.assetExts.push('txt');

module.exports = config;
