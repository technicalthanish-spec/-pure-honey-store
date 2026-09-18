import fs from 'node:fs';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();const root=new URL('../',import.meta.url).pathname.replace(/^\/(?=[A-Z]:)/i,'');
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email text);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;create publication supabase_realtime;`);
await db.exec(fs.readFileSync(root+'supabase/schema.sql','utf8').replace('create extension if not exists pgcrypto;',''));
await db.exec(fs.readFileSync(root+'supabase/migration_v5.sql','utf8'));
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',admin='33333333-3333-4333-8333-333333333333';
await db.exec(`insert into auth.users values('${a}','{}','a@test'),('${b}','{}','b@test'),('${admin}','{}','admin@test');update profiles set role='admin' where id='${admin}';update products set available_quantity=10;insert into coupons(code,kind,value,product_id,usage_limit) select 'SMALL10','percent',10,id,1 from products where grams=250;insert into coupons(code,kind,value,product_id) select 'FIXED','fixed',999,id from products where grams=250;`);
const ps=(await db.query('select * from products order by grams')).rows;
const quote=async(p=ps[0].id,q=2,c='SMALL10')=>(await db.query('select quote_order($1,$2,$3,$4) r',[p,q,'9999999999',c])).rows[0].r;
const place=async(id=crypto.randomUUID(),total=360,c='SMALL10')=>(await db.query(`select place_order($1,2,'Test Customer','9999999999','12 Honey Street, City 123456',$2,$3,$4) r`,[ps[0].id,c,id,total])).rows[0].r;
let checks=0;async function rejects(fn,regex){await assert.rejects(fn,regex);checks++}
await db.exec('set role anon');await rejects(()=>quote(),/permission denied/);await rejects(()=>place(),/permission denied/);
await db.exec(`reset role;select set_config('request.jwt.claim.sub','${a}',false);set role authenticated`);
assert.equal((await quote()).grand_total,360);checks++;
await rejects(()=>quote(ps[1].id),/different honey size/);await rejects(()=>quote(ps[2].id),/different honey size/);await rejects(()=>quote(ps[0].id,0),/quantity/);await rejects(()=>quote(ps[0].id,11),/stock/);await rejects(()=>quote(ps[0].id,101),/quantity/);await rejects(()=>quote(ps[0].id,1,'BOGUS'),/invalid/);
assert.equal((await quote(ps[0].id,1,'FIXED')).grand_total,0);checks++;
await rejects(()=>place(crypto.randomUUID(),1),/Total changed/);
const req=crypto.randomUUID(),o=await place(req);assert.equal(o.invoice.discount_amount,40);assert.equal(o.order.customer_id,a);assert.equal((await place(req)).id,o.id);checks+=3;
await rejects(()=>quote(),/usage limit/);
assert.equal((await db.query('select * from orders')).rows.length,1);assert.equal((await db.query('select * from invoices')).rows.length,1);checks+=2;
await rejects(()=>db.query('update orders set grand_total=1'),/permission denied/);await rejects(()=>db.query("insert into coupons(code,kind,value) values('HACK','fixed',1)"),/row-level security/);
assert.equal((await db.query("update products set price=1 returning id")).rows.length,0);checks++;
await db.exec(`select set_config('request.jwt.claim.sub','${b}',false)`);for(const table of ['orders','order_items','invoices','coupons']){assert.equal((await db.query('select * from '+table)).rows.length,0);checks++}await rejects(()=>db.query('select admin_coupon_data()'),/Admin/);
await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false)`);assert.equal((await db.query('select admin_coupon_data() r')).rows[0].r.coupons.find(c=>c.code==='SMALL10').uses,1);checks++;
await db.query("update orders set status='Cancelled' where id=$1",[o.id]);assert.equal((await db.query('select available_quantity from products where id=$1',[ps[0].id])).rows[0].available_quantity,10);checks++;
await db.query("update coupons set active=false where code='FIXED'");await rejects(()=>quote(ps[0].id,1,'FIXED'),/invalid/);await db.query("update coupons set active=true,expires_at=now()-interval '1 day' where code='FIXED'");await rejects(()=>quote(ps[0].id,1,'FIXED'),/expired/);
console.log(`PASS ${checks} backend assertions: auth, RLS isolation, both mismatched weights, quantity/stock, fixed/percent, limits, expiry, inactive, server totals, invoices, retry, cancellation, admin usage. Fresh schema and repeat migration pass.`);await db.close();

