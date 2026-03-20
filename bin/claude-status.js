#!/usr/bin/env node
// ESM wrapper – loads the compiled CJS server bundle
import(new URL('../dist-server/standalone.js', import.meta.url).href).catch((e) => {
  console.error(e);
  process.exit(1);
});
