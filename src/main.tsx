import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './AppV2'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
)

if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').then(registration=>{
  const announce=()=>window.dispatchEvent(new CustomEvent('founder-update',{detail:registration}))
  if(registration.waiting&&navigator.serviceWorker.controller)announce()
  registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)announce()})})
  let reloading=false
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!reloading){reloading=true;window.location.reload()}})
  setInterval(()=>registration.update(),30*60*1000)
}).catch(()=>{}))
