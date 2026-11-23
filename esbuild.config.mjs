import {build} from 'esbuild';
await build({entryPoints:['src/main.ts'],bundle:true,external:['obsidian','electron','@codemirror/state','@codemirror/view'],platform:'node',format:'cjs',target:'es2022',outfile:'main.js',banner:{js:'/* Track Changes. Source: https://github.com/neuronsarealsocool/obsidian-track-changes */'}});
