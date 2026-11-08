import test from 'node:test';
import assert from 'node:assert/strict';
import {access,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('GitHub Pages工作流只发布dist且具备官方所需权限',async()=>{
 const workflow=await readFile(path.join(root,'.github/workflows/deploy-pages.yml'),'utf8');
 assert.match(workflow,/pages:\s*write/);assert.match(workflow,/id-token:\s*write/);
 assert.match(workflow,/actions\/configure-pages@v5/);assert.match(workflow,/actions\/upload-pages-artifact@v3/);assert.match(workflow,/actions\/deploy-pages@v5/);
 assert.match(workflow,/path:\s*dist/);assert.doesNotMatch(workflow,/path:\s*['"]?\./);
});

test('静态入口使用相对资源路径，支持GitHub Pages仓库子路径',async()=>{
 const html=await readFile(path.join(root,'dist/index.html'),'utf8'),assets=[...html.matchAll(/(?:href|src)="(\.\/[^"#?]+)"/g)].map(match=>match[1]);
 assert.ok(assets.length>=4);assert.doesNotMatch(html,/(?:href|src)="\/(?!\/)/);
 for(const asset of assets)await access(path.join(root,'dist',asset.slice(2)));
});

test('在线静态模式只保存浏览器数据并明确不使用本机代理',async()=>{
 const app=await readFile(path.join(root,'dist/app.js'),'utf8');
 assert.match(app,/const staticHosting=!localRuntime/);assert.match(app,/if\(staticHosting\)\{config\.proxy=false;config\.useStoredKey=false;\}/);
 assert.match(app,/在线静态模式 · 不使用本机代理/);assert.match(app,/在线版不使用本机代理/);assert.match(app,/proxy:localRuntime&&/);
 assert.doesNotMatch(app,/name="proxyToken"|name="proxyUrl"/);
});
