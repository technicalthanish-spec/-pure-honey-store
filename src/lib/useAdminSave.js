import { useRef, useState } from 'react'
import { supabase } from './supabase.js'
// Keep an uncertain request across refreshes; retry exactly the same operation.
export function useAdminSave(operation){
 const key='honey-pending-admin-'+operation
 const [pending,setPending]=useState(()=>{try{return JSON.parse(sessionStorage.getItem(key)||'null')}catch{return null}})
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const lock=useRef(false)
 async function save(payload){
  if(lock.current)return null
  lock.current=true;setBusy(true);setError('')
  try{
   const attempt=pending||{id:crypto.randomUUID(),payload}
   sessionStorage.setItem(key,JSON.stringify(attempt));setPending(attempt)
   const {data,error}=await supabase.rpc('admin_save_record',{p_request_id:attempt.id,p_operation:operation,p_data:attempt.payload})
   if(error){
    // A server SQL error rolls the entire transaction back; a network error is uncertain.
    if(error.code&&/^[0-9A-Z]{5}$/.test(error.code)){sessionStorage.removeItem(key);setPending(null)}
    throw error
   }
   sessionStorage.removeItem(key);setPending(null);return data
  }catch(e){setError(e.message||'Could not save. Retry the pending request.');return null}
  finally{lock.current=false;setBusy(false)}
 }
 return {save,pending,busy,error}
}
