import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Coffee, ShoppingBag, Plus, Minus, Trash2, ArrowRight, CheckCircle2, RefreshCw } from 'lucide-react';
import './styles.css';

type Product = { id:number; name:string; price:number; stock:number };
type Order = { id:number; total:number };
const money = (n:number) => `Q${n.toFixed(2)}`;
const descriptions:Record<number,string> = {1:'Espresso suave con agua caliente',2:'Espresso, leche y una delicada espuma',3:'Hojaldre dorado, recién horneado',4:'Té negro con especias y leche'};
async function api<T>(path:string, options?:RequestInit):Promise<T> {
  const response = await fetch(path, options);
  const data = await response.json().catch(()=>null);
  if (!response.ok) throw new Error(data?.error || `Error de API (${response.status}). Intenta de nuevo.`);
  if (!data) throw new Error('La API devolvió una respuesta inválida.');
  return data as T;
}
function App(){
  const [products,setProducts] = useState<Product[]>([]);
  const [cart,setCart] = useState<Record<number,number>>({});
  const [loading,setLoading] = useState(true);
  const [pending,setPending] = useState(false);
  const [error,setError] = useState('');
  const [catalogError,setCatalogError] = useState('');
  const [order,setOrder] = useState<Order|null>(null);
  async function loadProducts(){
    setLoading(true);setCatalogError('');
    try{setProducts(await api<Product[]>('/api/products'));}
    catch(e){setCatalogError(e instanceof Error?e.message:'No se pudo cargar el catálogo.');}
    finally{setLoading(false);}
  }
  useEffect(()=>{void loadProducts();},[]);
  const lines = products.filter(p=>cart[p.id]>0);
  const count = lines.reduce((s,p)=>s+cart[p.id],0);
  const total = lines.reduce((s,p)=>s+p.price*cart[p.id],0);
  const valid = lines.length>0 && lines.every(p=>Number.isSafeInteger(cart[p.id])&&cart[p.id]>0&&cart[p.id]<=p.stock);
  function change(p:Product,quantity:number){
    if(pending || !Number.isSafeInteger(quantity) || quantity<0 || quantity>p.stock) return;
    setError('');setOrder(null);
    setCart(previous=>{const next={...previous};if(quantity===0) delete next[p.id];else next[p.id]=quantity;return next;});
  }
  async function confirm(){
    if(!valid||pending)return;
    setPending(true);setError('');setOrder(null);
    try{
      const result = await api<Order>('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:lines.map(p=>({productId:p.id,quantity:cart[p.id]}))})});
      setOrder(result);setCart({});
      await loadProducts();
    }catch(e){setError(e instanceof Error?e.message:'No se pudo confirmar. Intenta de nuevo.');await loadProducts();}
    finally{setPending(false);}
  }
  return <>
    <header className="header"><a className="brand" href="/" aria-label="Café Central, inicio"><span className="brand-icon"><Coffee size={26}/></span><span>Café Central<small>HECHO CON CALMA</small></span></a><span className="header-note"><span className="dot"/> Pedidos para recoger</span></header>
    <main>
      <div className="page-heading"><div><p className="eyebrow">TU PAUSA FAVORITA</p><h1>Algo rico te espera.</h1><p>Café recién preparado y pequeños antojos para tu día.</p></div><span className="menu-label">MENÚ DEL DÍA <Coffee size={17}/></span></div>
      <div className="layout">
        <section aria-labelledby="catalog-title"><div className="section-title"><h2 id="catalog-title">Nuestro menú</h2><span>{products.length} productos</span></div>
          {loading&&products.length===0&&<p role="status" data-cy="catalog-loading">Cargando menú...</p>}
          {catalogError&&<div className="notice error" role="alert" data-cy="catalog-error">{catalogError}<button className="retry" onClick={()=>void loadProducts()}><RefreshCw size={16}/> Reintentar</button></div>}
          <div className="catalog" data-cy="catalog">{products.map(p=><article className="product" key={p.id} data-cy={`product-${p.id}`}>
            <div className="product-photo"><img src={`/images/product-${p.id}.jpg`} alt={p.name}/><span className={`stock ${p.stock===0?'sold-out':''}`} data-cy={`stock-${p.id}`}>{p.stock===0?'Agotado':`${p.stock} disponibles`}</span></div>
            <div className="product-body"><h3>{p.name}</h3><p>{descriptions[p.id]}</p><div className="product-bottom"><strong data-cy={`price-${p.id}`}>{money(p.price)}</strong><button className="add" data-cy={`add-${p.id}`} disabled={pending||p.stock===0||(cart[p.id]||0)>=p.stock} onClick={()=>change(p,(cart[p.id]||0)+1)} aria-label={`Agregar ${p.name}`}><Plus size={17}/> Agregar</button></div></div>
          </article>)}</div>
        </section>
        <aside className="cart" data-cy="cart" aria-labelledby="cart-title"><div className="cart-heading"><h2 id="cart-title"><ShoppingBag size={21}/> Tu pedido</h2><span className="count" data-cy="cart-count">{count}</span></div>
          {order&&<div className="notice success" role="status" data-cy="order-success"><CheckCircle2 size={23}/><div><strong>¡Pedido confirmado!</strong><p>Orden <b data-cy="order-id">#{order.id}</b></p><p>Total confirmado: <b data-cy="order-total">{money(order.total)}</b></p></div></div>}
          {lines.length===0?<div className="empty" data-cy="cart-empty"><span><ShoppingBag size={30}/></span><h3>Tu próxima pausa empieza aquí</h3><p>Agrega algo del menú para<br/>comenzar tu pedido.</p></div>:<ul className="cart-items">{lines.map(p=><li key={p.id} data-cy={`cart-item-${p.id}`}><div className="line-title"><h3>{p.name}</h3><button className="icon-button" title="Eliminar artículo" aria-label={`Eliminar ${p.name}`} data-cy={`remove-${p.id}`} disabled={pending} onClick={()=>change(p,0)}><Trash2 size={16}/></button></div><span className="unit-price">{money(p.price)} c/u</span><div className="line-bottom"><div className="quantity"><button title="Disminuir cantidad" aria-label={`Disminuir ${p.name}`} data-cy={`decrease-${p.id}`} disabled={pending} onClick={()=>change(p,cart[p.id]-1)}><Minus size={14}/></button><input type="number" min="1" max={p.stock} step="1" aria-label={`Cantidad de ${p.name}`} data-cy={`quantity-${p.id}`} disabled={pending} value={cart[p.id]} onChange={e=>{const q=Number(e.target.value);if(Number.isSafeInteger(q)&&q>0&&q<=p.stock)change(p,q);}}/><button title="Aumentar cantidad" aria-label={`Aumentar ${p.name}`} data-cy={`increase-${p.id}`} disabled={pending||cart[p.id]>=p.stock} onClick={()=>change(p,cart[p.id]+1)}><Plus size={14}/></button></div><strong data-cy={`subtotal-${p.id}`}>{money(p.price*cart[p.id])}</strong></div>{cart[p.id]>p.stock&&<p className="stock-warning">Solo quedan {p.stock}. Reduce la cantidad o elimina el artículo.</p>}</li>)}</ul>}
          <div className="checkout"><div className="total"><span>Total</span><strong data-cy="cart-total">{money(total)}</strong></div><p className="tax-note">Precios en quetzales · Impuestos incluidos</p>
          {error&&<div className="notice error" role="alert" data-cy="api-error">{error} Tu carrito se conserva; puedes reintentar.</div>}
          <button className="confirm" data-cy="confirm-order" disabled={!valid||pending} onClick={()=>void confirm()}>{pending?'Confirmando...':error?'Reintentar pedido':'Confirmar pedido'}<ArrowRight size={18}/></button>
          {lines.length===0&&<p className="checkout-hint" data-cy="empty-message">Agrega productos para confirmar tu pedido.</p>}</div>
        </aside>
      </div>
      <footer><span>Café Central</span><span>Un buen café. Un buen momento.</span></footer>
    </main>
  </>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
