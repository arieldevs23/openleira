import path from 'node:path';

import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setCodec('h264');
Config.setConcurrency(null);

// The video renders the app's real components: `@/` is the app's src, its
// dependencies come from the app's node_modules, and React stays one copy.
Config.overrideWebpackConfig((config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    alias: {
      ...(config.resolve?.alias as Record<string, string>),
      '@': path.resolve(process.cwd(), '..', 'src'),
      react: path.resolve(process.cwd(), 'node_modules', 'react'),
      'react-dom': path.resolve(process.cwd(), 'node_modules', 'react-dom'),
    },
    modules: [...(config.resolve?.modules ?? ['node_modules']), path.resolve(process.cwd(), '..', 'node_modules')],
  },
}));
