import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

await mkdir('data', { recursive:true });
const folder = await mkdtemp(resolve('data/smoke-'));
const port = 3107;
const base = `http://localhost:${port}`;
let child;
async function start(mode){
  child = spawn(process.execPath,['--import','tsx','server/index.ts'], {env:{...process.env,NODE_ENV:mode,ENABLE_TEST_RESET:'true',DATABASE_PATH:resolve(folder,'verify.sqlite'),PORT:String(port)},stdio:['ignore','pipe','pipe']});
  let output = '';
  child.stdout.on('data',b=>output+=b);
  child.stderr.on('data',b=>output+=b);
  for(let i=0;i<100;i++){
    if(child.exitCode!==null)throw new Error(output);
    if(output.includes('API:'))return;
    await new Promise(r=>setTimeout(r,100));
  }
  throw new Error(`API no disponible: ${output}`);
}
async function stop(){if(child&&child.exitCode===null){const done=once(child,'exit');child.kill();await done;}}
async function request(path, body){
  const response=await fetch(base+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
}
try{
  await start('testing');
  assert.equal((await request('/api/test/reset',{})).status,200);
  const initial=(await request('/api/products')).body;
  assert.deepEqual(initial.map(p=>[p.price,p.stock]),[[15,20],[22,15],[18,12],[20,10]]);
  for(const quantity of [0,-1,1.5,'2',null,9007199254740992])assert.equal((await request('/api/orders',{items:[{productId:1,quantity}]})).status,400);
  assert.equal((await request('/api/orders',{items:[]})).status,400);
  assert.equal((await request('/api/orders',{items:[{productId:1,quantity:1},{productId:1,quantity:1}]})).status,400);
  assert.equal((await request('/api/orders',{items:[{productId:999,quantity:1}]})).status,404);
  assert.equal((await request('/api/orders',{items:[{productId:1,quantity:1},{productId:2,quantity:16}]})).status,409);
  assert.deepEqual((await request('/api/products')).body,initial);
  const order=await request('/api/orders',{items:[{productId:1,quantity:2},{productId:3,quantity:1}],total:0});
  assert.equal(order.status,201);assert.deepEqual(order.body,{id:1,total:48});
  assert.equal((await request('/api/products')).body[0].stock,18);
  assert.equal((await request('/api/products')).body[2].stock,11);
  await stop();await start('testing');
  const persisted=await request('/api/orders/1');
  assert.equal(persisted.status,200);assert.equal(persisted.body.total,48);assert.equal(persisted.body.items.length,2);
  assert.equal((await request('/api/orders/999')).status,404);
  assert.equal((await request('/api/orders/nope')).status,400);
  await request('/api/test/reset',{});
  assert.deepEqual((await request('/api/products')).body,initial);
  assert.equal((await request('/api/orders/1')).status,404);
  assert.equal((await request('/api/orders',{items:[{productId:4,quantity:1}]})).body.id,1);
  await stop();await start('production');
  assert.equal((await request('/api/test/reset',{})).status,404);
  assert.equal((await request('/api/orders/1')).body.total,20);
  await stop();await start('development');
  assert.equal((await request('/api/test/reset',{})).status,404);
  console.log('OK: catálogo, validación, stock, rollback, total del servidor, persistencia, reset determinista y reset ausente en producción/desarrollo.');
}finally{await stop();await rm(folder,{recursive:true,force:true});}
