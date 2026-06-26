const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

// Our portable core uses explicit `.ts` import specifiers so the exact same files
// run under `node --experimental-strip-types` (headless shield tests) AND under
// Metro. Metro doesn't resolve explicit `.ts` specifiers by default, so strip the
// extension from relative imports and let the default resolver re-add it.
const config = {
  resolver: {
    resolveRequest: (context, moduleName, platform) => {
      const m = moduleName.startsWith('.') ? moduleName.replace(/\.tsx?$/, '') : moduleName;
      return context.resolveRequest(context, m, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
