begin;
insert into auth.users(id,email) values('00000000-0000-0000-0000-000000000004','cost-test@example.test');
update public.profiles set role='admin' where id='00000000-0000-0000-0000-000000000004';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
do $$
declare pid uuid; result jsonb; oid uuid; req uuid:=gen_random_uuid(); failed boolean;
begin
 select id into pid from public.products where grams=250;
 update public.products set available_quantity=10,cost_price=0,active=true where id=pid;
 result:=public.admin_save_record(gen_random_uuid(),'sale',jsonb_build_object('name','Test Buyer','mobile','0000000000','address','','status','Delivered','method','Cash','items',jsonb_build_array(jsonb_build_object('product_id',pid,'quantity',2,'rate',200)),'discount_kind','fixed','discount_value',0,'delivery',0,'paid',0,'expected_total',400));oid:=(result->>'id')::uuid;
 update public.products set cost_price=50 where id=pid;
 result:=public.admin_apply_sale_cost(req,pid,50,'missing');
 if (result->>'cost_change')::numeric<>100 or public.admin_apply_sale_cost(req,pid,50,'missing')<>result then raise exception 'Backfill/retry failed';end if;
 if (select sum(quantity*unit_cost) from public.order_items where order_id=oid)<>100 or (select grand_total from public.orders where id=oid)<>400 or (select available_quantity from public.products where id=pid)<>8 then raise exception 'Cost/bill/stock checks failed';end if;
 update public.products set cost_price=60 where id=pid;
 result:=public.admin_apply_sale_cost(gen_random_uuid(),pid,60,'missing');if (result->>'lines')::integer<>0 then raise exception 'Existing cost overwritten in missing-only mode';end if;
 result:=public.admin_apply_sale_cost(gen_random_uuid(),pid,60,'all');if (result->>'cost_change')::numeric<>20 then raise exception 'All-cost replacement failed';end if;
 perform set_config('request.jwt.claim.sub','',true);failed:=false;
 begin perform public.admin_apply_sale_cost(gen_random_uuid(),pid,60,'all');exception when others then failed:=sqlerrm='Admin access required.';end;
 if not failed then raise exception 'Unauthorized backfill allowed';end if;
end;$$;
rollback;
