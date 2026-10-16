// Metro para la app Expo dentro del monorepo: services/mobile no forma parte del workspace de pnpm,
// pero reutiliza código de packages/* y services/web (i18n, esquemas y validación del frontend).
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "../..");
const config = getDefaultConfig(projectRoot);

config.watchFolders = [repoRoot];
config.resolver.nodeModulesPaths = [
  path.join(projectRoot, "node_modules"),
  path.join(repoRoot, "packages/schemas/node_modules"),
  path.join(repoRoot, "services/web/node_modules"),
  path.join(repoRoot, "node_modules"),
];
// React y React Native deben venir sólo de services/mobile para no duplicar instancias.
config.resolver.extraNodeModules = {
  react: path.join(projectRoot, "node_modules/react"),
  "react-native": path.join(projectRoot, "node_modules/react-native"),
  "@mcet/schemas": path.join(repoRoot, "packages/schemas"),
};
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
