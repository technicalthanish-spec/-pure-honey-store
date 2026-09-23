-- Integration checks: all fixture data is rolled back.
begin;
-- CI fixture identity; removed by rollback.
insert into auth.users(id,email) values('00000000-0000-0000-0000-000000000003','corrections@example.test');
update public.profiles set role='admin' where id='00000000-0000-0000-0000-000000000003';
do $$
#variable_conflict use_variable
declare actor uuid; product uuid; id uuid; oid uuid; payid uuid; giftid uuid; req uuid; before jsonb; payload jsonb; result jsonb; rowdata jsonb; qty integer; failed boolean; base numeric;
begin
 -- No authenticated admin must fail, even if a valid record id is supplied.
 perform set_config('request.jwt.claim.sub','',true);
 failed:=false;
 begin perform public.admin_correct_record(gen_random_uuid(),'expense',gen_random_uuid(),'edit','{}','{}');exception when others then failed:=sqlerrm='Admin access required.';end;
 if not failed then raise exception 'Authorization test failed';end if;
 actor:='00000000-0000-0000-0000-000000000003';
 perform set_config('request.jwt.claim.sub',actor::text,true);
 select p.id into product from public.products p where grams=250 limit 1;
 update public.products set available_quantity=100,cost_price=100,active=true where products.id=product;
 base:=(public.admin_dashboard_data()->'summary'->>'operating_expenses')::numeric;
 result:=public.admin_save_record(gen_random_uuid(),'expense',jsonb_build_object('category','Other','amount',100,'date',current_date,'note','QA rollback'));
 id:=(result->>'id')::uuid;
 select to_jsonb(e) into before from public.business_expenses e where e.id=id;
 payload:=before||'{"amount":125}'::jsonb;req:=gen_random_uuid();
 perform public.admin_correct_record(req,'expense',id,'edit',before,payload);
 perform public.admin_correct_record(req,'expense',id,'edit',before,payload);
 if (select amount from public.business_expenses e where e.id=id)<>125 then raise exception 'Expense edit failed';end if;
 failed:=false;begin perform public.admin_correct_record(gen_random_uuid(),'expense',id,'edit',before,payload);exception when others then failed:=sqlerrm like 'This record changed%';end;
 if not failed then raise exception 'Stale edit test failed';end if;
 select to_jsonb(e) into before from public.business_expenses e where e.id=id;
 perform public.admin_correct_record(gen_random_uuid(),'expense',id,'delete',before,'{}');
 if (public.admin_dashboard_data()->'summary'->>'operating_expenses')::numeric<>base then raise exception 'Deleted expense still counted';end if;
 select to_jsonb(e) into before from public.business_expenses e where e.id=id;
 perform public.admin_correct_record(gen_random_uuid(),'expense',id,'restore',before,'{}');
 if (public.admin_dashboard_data()->'summary'->>'operating_expenses')::numeric<>base+125 then raise exception 'Expense restore failed';end if;
 result:=public.admin_save_record(gen_random_uuid(),'purchase',jsonb_build_object('product_id',product,'quantity',10,'unit_cost',100,'supplier','QA Supplier','date',current_date,'note','QA rollback'));
 id:=(result->>'id')::uuid;select to_jsonb(p) into before from public.stock_purchases p where p.id=id;
 perform public.admin_correct_record(gen_random_uuid(),'purchase',id,'edit',before,before||'{"quantity":12,"unit_cost":110}'::jsonb);
 if (select available_quantity from public.products p where p.id=product)<>112 then raise exception 'Purchase stock failed';end if;
 perform public.record_giveaway(product,2,'QA recipient','QA rollback');
 select g.id,to_jsonb(g) into giftid,before from public.stock_giveaways g where g.recipient='QA recipient' order by created_at desc limit 1;
 perform public.admin_correct_record(gen_random_uuid(),'giveaway',giftid,'edit',before,before||'{"quantity":3,"unit_cost":80}'::jsonb);
 if (select available_quantity from public.products p where p.id=product)<>109 or (select total_cost from public.stock_giveaways g where g.id=giftid)<>240 then raise exception 'Giveaway correction failed';end if;
 result:=public.admin_save_record(gen_random_uuid(),'sale',jsonb_build_object('name','QA Customer','mobile','0000000000','address','','status','Delivered','method','Cash','items',jsonb_build_array(jsonb_build_object('product_id',product,'quantity',2,'rate',200)),'discount_kind','fixed','discount_value',0,'delivery',0,'paid',100,'expected_total',400,'note','QA rollback'));
 oid:=(result->>'id')::uuid;
 select to_jsonb(o) into before from public.orders o where o.id=oid;
 select jsonb_agg(to_jsonb(i)||'{"quantity":3,"rate":210,"unit_cost":90}'::jsonb) into rowdata from public.order_items i where i.order_id=oid;
 payload:=before||jsonb_build_object('items',rowdata,'discount_amount',30,'delivery_charge',20,'customer_name','QA Corrected');
 perform public.admin_correct_record(gen_random_uuid(),'order',oid,'edit',before,payload);
 if (select grand_total from public.orders o where o.id=oid)<>620 or (select grand_total from public.invoices i where i.order_id=oid)<>620 or (select available_quantity from public.products p where p.id=product)<>106 then raise exception 'Order invoice stock correction failed';end if;
 select p.id,to_jsonb(p) into payid,before from public.payments p where p.order_id=oid;
 perform public.admin_correct_record(gen_random_uuid(),'payment',payid,'edit',before,before||'{"amount":150}'::jsonb);
 if (select amount from public.payments p where p.id=payid)<>150 then raise exception 'Payment edit failed';end if;
 select to_jsonb(p) into before from public.payments p where p.id=payid;
 failed:=false;begin perform public.admin_correct_record(gen_random_uuid(),'payment',payid,'edit',before,before||'{"amount":9999}'::jsonb);exception when others then failed:=sqlerrm like 'Correction would exceed%';end;
 if not failed then raise exception 'Overpayment guard failed';end if;
 select to_jsonb(p) into before from public.stock_purchases p where p.id=id;
 failed:=false;begin perform public.admin_correct_record(gen_random_uuid(),'purchase',id,'edit',before,before||'{"quantity":13}'::jsonb);exception when others then failed:=sqlerrm like 'Stock has moved%';end;
 if not failed then raise exception 'Consumed purchase guard failed';end if;
end;$$;
select 'PASS: authorization, expense edit/delete/restore, stale edit, retry, purchase, giveaway, order/invoice/stock, payment bounds and historical stock guards' as result;
rollback;
