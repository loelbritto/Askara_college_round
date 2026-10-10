"use client";

export function SessionFields({account,email,setEmail,password,setPassword,prefix,disabled=false}:{account:boolean;email:string;setEmail:(value:string)=>void;password:string;setPassword:(value:string)=>void;prefix:string;disabled?:boolean}) {
  return <>
    {account&&<><label className="field-label" htmlFor={`${prefix}-email`}>Email</label><input id={`${prefix}-email`} className="text-input" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} maxLength={254} required disabled={disabled}/></>}
    <label className="field-label" htmlFor={account?`${prefix}-password`:prefix}>{account?"Password":"Pilot access code"}</label>
    <input id={account?`${prefix}-password`:prefix} className="text-input" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} maxLength={200} required disabled={disabled}/>
    {account&&<p className="small muted">Use the individual account provided by the pilot operator. Your session expires automatically; signing out revokes access on this device.</p>}
  </>;
}
