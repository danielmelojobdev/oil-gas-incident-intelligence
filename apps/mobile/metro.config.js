// Metro configuration for an npm-workspaces monorepo.
// Without this, Metro does not watch packages/domain and cannot resolve @ogii/domain.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch the whole workspace so edits to packages/domain trigger a rebuild.
config.watchFolders = [workspaceRoot];

// 2. Resolve modules from the app first, then from the workspace root (hoisted deps).
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Do not walk up past the workspace root looking for node_modules.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
