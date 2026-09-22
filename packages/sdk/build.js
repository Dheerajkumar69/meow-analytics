import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve(process.cwd(), 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

async function build() {
  console.log('🐾 Building Meow Analytics SDK...');

  // 1. ESM build for npm/module import
  await esbuild.build({
    entryPoints: ['src/index.ts'],
    outfile: 'dist/index.js',
    bundle: true,
    format: 'esm',
    target: 'es2020',
    sourcemap: true,
    minify: false,
  });

  // 2. Standalone IIFE bundle for <script defer src=".../meow.js">
  await esbuild.build({
    entryPoints: ['src/index.ts'],
    outfile: 'dist/meow.js',
    bundle: true,
    format: 'iife',
    globalName: 'MeowAnalyticsModule',
    target: 'es2020',
    sourcemap: true,
    minify: true,
  });

  const meowJsStat = fs.statSync('dist/meow.js');
  console.log(`✅ Meow Analytics SDK build complete! dist/meow.js size: ${(meowJsStat.size / 1024).toFixed(2)} KB`);
}

build().catch((err) => {
  console.error('Failed to build SDK:', err);
  process.exit(1);
});
