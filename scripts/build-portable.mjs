import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const assetsDir = path.join(distDir, 'assets');

const assetFiles = fs.readdirSync(assetsDir);
const cssFile = assetFiles.find((f) => f.endsWith('.css'));
const jsFile = assetFiles.find((f) => f.endsWith('.js'));

if (!cssFile || !jsFile) {
  throw new Error('Missing built CSS or JS asset in dist/assets. Run `npm run build` first.');
}

const cssContent = fs.readFileSync(path.join(assetsDir, cssFile), 'utf8');
const rawJsContent = fs.readFileSync(path.join(assetsDir, jsFile), 'utf8');
const rawBundleJson = fs
  .readFileSync(path.join(distDir, 'data', 'library_bundle.json'), 'utf8')
  .replace(/^\uFEFF/, '');

// Validate JSON before embedding
JSON.parse(rawBundleJson);

// Prevent HTML parser from prematurely closing <script> tags
const safeBundleJson = rawBundleJson.replace(/<\/script/gi, '<\\/script');
const safeJsContent = rawJsContent.replace(/<\/script/gi, '<\\/script');

const portableHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Ex Libris — Portable Personal Reading Archive & Literary Observatory</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
    <style>${cssContent}</style>
  </head>
  <body>
    <div id="root"></div>
    <script>window.__EXLIBRIS_INLINE_BUNDLE__ = ${safeBundleJson};</script>
    <script type="module">${safeJsContent}</script>
  </body>
</html>
`;

const localOutPath = path.join(distDir, 'ExLibris-Portable.html');
fs.writeFileSync(localOutPath, portableHtml, 'utf8');
console.log(
  `[build-portable] Built ${localOutPath} (${(Buffer.byteLength(portableHtml) / 1024 / 1024).toFixed(2)} MB)`
);

// Also mirror to Google Drive workspace if mounted
const driveWorkspaceDir = "g:\\Drive'\u0131m\\Antigravity\\Goodreads";
if (fs.existsSync(driveWorkspaceDir)) {
  const driveOutPath = path.join(driveWorkspaceDir, 'ExLibris-Portable.html');
  fs.writeFileSync(driveOutPath, portableHtml, 'utf8');
  console.log(`[build-portable] Synced portable app to Google Drive: ${driveOutPath}`);
}
