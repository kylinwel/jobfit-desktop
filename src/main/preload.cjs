const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('jobfitDesktop',Object.freeze({
  openData:()=>ipcRenderer.invoke('jobfit:open-data'),
  onDigest:callback=>{const listener=()=>callback();ipcRenderer.on('jobfit:digest',listener);return()=>ipcRenderer.removeListener('jobfit:digest',listener);}
}));
