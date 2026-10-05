// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // react-three-fiber uses three.js props (args, emissive, intensity…) on JSX elements.
    files: ["src/components/tiko-3d/**"],
    rules: { "react/no-unknown-property": "off" },
  }
]);
