module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      'babel-preset-expo',
    ],
    plugins: [
      // Reanimated 4.x: the worklets babel plugin lives in react-native-worklets,
      // not react-native-reanimated. Must remain the LAST plugin in the list.
      'react-native-worklets/plugin',
    ],
  };
};
