import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
export default function AdminToolsGate({children}){
 const [ready,setReady]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(true)
 async function check(){setBusy(true);setError('');const {data,error}=await supabase.rpc('admin_tools_version');if(error)setError(error.message);setReady(!error&&data===7);setBusy(false)}
 useEffect(()=>{check()},[])
 if(busy)return <p className="loading">Checking business tools…</p>
 if(!ready)return <div className="admin-page"><section className="admin-card"><h1>Business tools setup</h1><p>The database update is needed before new sales, expenses and stock purchases can be saved.</p><p>Run the V7 setup once in your Supabase SQL Editor, then return here.</p><div className="report-actions"><a className="secondary-btn" href="https://github.com/technicalthanish-spec/-pure-honey-store/blob/main/supabase/migration_v7.sql" target="_blank" rel="noreferrer">Open V7 setup SQL</a><button className="primary-btn" onClick={check}>Check again</button></div>{error&&<details><summary>Setup details</summary><p>{error}</p></details>}</section></div>
 return children
}
