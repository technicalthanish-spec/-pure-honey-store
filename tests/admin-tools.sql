-- Disposable database only. All changes roll back.
begin;
insert into auth.users(id,email) values('00000000-0000-0000-0000-000000000001','admin@example.test'),('00000000-0000-0000-0000-000000000002','customer@example.test');
update public.profiles set role='admin' where id='00000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
update public.products set available_quantity=10,cost_price=100;
do $$
declare p uuid; payload jsonb; result jsonb; again jsonb; oid uuid; inv uuid; req uuid:=gen_random_uuid(); fail boolean; snapshot numeric;
begin
 select id into p from public.products where grams=500;
 payload:=jsonb_build_object('name','Test Customer','mobile','9000000001','address','','status','Delivered','method','Cash','discount_kind','fixed','discount_value',50,'delivery',20,'paid',500,'expected_total',770,'note','','items',jsonb_build_array(jsonb_build_object('product_id',p,'quantity',2,'rate',400)));
 result:=public.admin_save_record(req,'sale',payload);oid:=(result->>'id')::uuid;inv:=(result->>'invoice_id')::uuid;
 again:=public.admin_save_record(req,'sale',payload);
 if result<>again or (select available_quantity from public.products where id=p)<>8 then raise exception 'Duplicate save or stock deduction failed'; end if;
 if (select grand_total from public.orders where id=oid)<>770 or (select customer_id from public.orders where id=oid) is not null then raise exception 'Order total or identity failed'; end if;
 if (select grand_total from public.invoices where id=inv)<>770 or (select sum(amount) from public.payments where order_id=oid)<>500 then raise exception 'Invoice/payment failed'; end if;
 if (select sum(allocated_discount) from public.order_items where order_id=oid)<>50 then raise exception 'Discount allocation failed'; end if;
 fail:=false;
 begin perform public.admin_save_record(gen_random_uuid(),'sale',payload||jsonb_build_object('paid',900));exception when others then fail:=true;end;
 if not fail or (select available_quantity from public.products where id=p)<>8 or (select count(*) from public.orders)<>1 then raise exception 'Failed sale rollback failed'; end if;
 fail:=false;
 begin perform public.admin_save_record(req,'sale',payload||jsonb_build_object('paid',0));exception when others then fail:=true;end;
 if not fail then raise exception 'Changed retry should fail'; end if;
 result:=public.admin_save_record(gen_random_uuid(),'purchase',jsonb_build_object('product_id',p,'quantity',2,'unit_cost',200,'supplier','Test supplier','date',current_date,'note',''));
 if (select available_quantity from public.products where id=p)<>10 or (select cost_price from public.products where id=p)<>120 then raise exception 'Weighted purchase cost failed'; end if;
 if (select unit_cost from public.order_items where order_id=oid)<>100 then raise exception 'Purchase rewrote historical cost'; end if;
 perform public.admin_save_record(gen_random_uuid(),'expense',jsonb_build_object('category','Courier','amount',30,'date',current_date,'note','Test courier'));
 result:=public.admin_dashboard_data();
 if (result->'summary'->>'operating_expenses')::numeric<>30 or (result->'summary'->>'estimated_net_profit')::numeric<>540 then raise exception 'Profit totals failed: %',result->'summary'; end if;
 if jsonb_array_length(public.admin_backup_v7()->'orders')<>1 then raise exception 'Backup failed'; end if;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
 fail:=false;
 begin perform public.admin_save_record(gen_random_uuid(),'sale',payload);exception when others then fail:=true;end;
 if not fail then raise exception 'Non-admin can save sale'; end if;
 fail:=false;
 begin perform public.admin_backup_v7();exception when others then fail:=true;end;
 if not fail then raise exception 'Non-admin can export'; end if;
end; $$;
set local role authenticated;
do $$begin
 if (select count(*) from public.business_expenses)<>0 or (select count(*) from public.stock_purchases)<>0 then raise exception 'RLS exposed business records'; end if;
end; $$;
reset role;
rollback;
