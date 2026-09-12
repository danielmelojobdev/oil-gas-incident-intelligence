module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'react' }]],
    plugins: [
      // Reanimated's plugin must stay last.
      'react-native-worklets/plugin',
    ],
  };
};
