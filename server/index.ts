import express from 'express';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const file = resolve(process.env.DATABASE_PATH || 'data/cafe.sqlite');
mkdirSync(dirname(file), { recursive: true });
const db = new Database(file);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.exec(`CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, price_cents INTEGER NOT NULL CHECK(price_cents > 0), stock INTEGER NOT NULL CHECK(stock >= 0));
CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, total_cents INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE IF NOT EXISTS order_items (order_id INTEGER NOT NULL REFERENCES orders(id), product_id INTEGER NOT NULL REFERENCES products(id), name TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0), unit_price_cents INTEGER NOT NULL, PRIMARY KEY(order_id, product_id));`);
const seed = () => {
  const insert = db.prepare('INSERT INTO products (id,name,price_cents,stock) VALUES (?,?,?,?)');
  [[1,'Café americano',1500,20],[2,'Capuchino',2200,15],[3,'Croissant',1800,12],[4,'Té chai',2000,10]].forEach(row => insert.run(...row));
};
db.transaction(() => { if (!(db.prepare('SELECT id FROM products LIMIT 1').get())) seed(); })();
type Product = {id:number;name:string;price_cents:number;stock:number};
class ApiError extends Error { constructor(public status:number, message:string){super(message);} }
const app = express();
app.use(express.json({limit:'32kb'}));
app.get('/api/products', (_req,res) => {
  res.json((db.prepare('SELECT * FROM products ORDER BY id').all() as Product[]).map(p => ({id:p.id,name:p.name,price:p.price_cents/100,stock:p.stock})));
});
const createOrder = db.transaction((body:unknown) => {
  const items = (body as {items?:unknown})?.items;
  if (!Array.isArray(items) || !items.length || items.length > 100) throw new ApiError(400,'La orden debe contener entre 1 y 100 artículos.');
  const seen = new Set<number>();
  const lines = items.map((item:unknown) => {
    const {productId, quantity} = (item ?? {}) as {productId:number;quantity:number};
    if (!Number.isSafeInteger(productId) || productId <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0) throw new ApiError(400,'Producto y cantidad deben ser enteros positivos.');
    if (seen.has(productId)) throw new ApiError(400,'No se permiten productos duplicados.');
    seen.add(productId);
    const p = db.prepare('SELECT * FROM products WHERE id=?').get(productId) as Product | undefined;
    if (!p) throw new ApiError(404,'El producto no existe.');
    if (quantity > p.stock) throw new ApiError(409,`Existencias insuficientes para ${p.name}. Disponibles: ${p.stock}.`);
    return {...p,quantity};
  });
  const total = lines.reduce((sum,p) => sum+p.price_cents*p.quantity,0);
  const result = db.prepare('INSERT INTO orders(total_cents) VALUES (?)').run(total);
  const id = Number(result.lastInsertRowid);
  for (const p of lines) {
    db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(p.quantity,p.id);
    db.prepare('INSERT INTO order_items(order_id,product_id,name,quantity,unit_price_cents) VALUES (?,?,?,?,?)').run(id,p.id,p.name,p.quantity,p.price_cents);
  }
  return {id,total:total/100};
});
app.post('/api/orders', (req,res) => { res.status(201).json(createOrder.immediate(req.body)); });
app.get('/api/orders/:id', (req,res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id<=0) throw new ApiError(400,'Identificador inválido.');
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(id) as {id:number;total_cents:number;created_at:string}|undefined;
  if (!order) throw new ApiError(404,'La orden no existe.');
  const items = (db.prepare('SELECT product_id AS productId,name,quantity,unit_price_cents FROM order_items WHERE order_id=? ORDER BY product_id').all(id) as {productId:number;name:string;quantity:number;unit_price_cents:number}[]).map(p=>({productId:p.productId,name:p.name,quantity:p.quantity,unitPrice:p.unit_price_cents/100,subtotal:p.quantity*p.unit_price_cents/100}));
  res.json({id:order.id,total:order.total_cents/100,createdAt:order.created_at,items});
});
if (process.env.NODE_ENV === 'testing' && process.env.ENABLE_TEST_RESET === 'true') {
  app.post('/api/test/reset', (_req,res) => {
    db.transaction(()=>{db.exec("DELETE FROM order_items; DELETE FROM orders; DELETE FROM products; DELETE FROM sqlite_sequence WHERE name='orders';");seed();}).immediate();
    res.json({ok:true});
  });
}
app.use((_req,res)=>{res.status(404).json({error:'Ruta no encontrada.'});});
app.use((err:Error & {type?:string},_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
  const status = err instanceof ApiError ? err.status : err.type === 'entity.parse.failed' || err.type === 'entity.too.large' ? 400 : 500;
  if(status===500) console.error(err);
  res.status(status).json({error:status===500?'No se pudo procesar la solicitud. Intenta de nuevo.':err.type?'JSON inválido o demasiado grande.':err.message});
});
const server = app.listen(Number(process.env.PORT || 3000),'localhost',()=>console.log(`API: http://localhost:${process.env.PORT || 3000} (${process.env.NODE_ENV || 'development'})`));
for(const signal of ['SIGINT','SIGTERM'] as const) process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
