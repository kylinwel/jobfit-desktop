import {api} from "./lib/client.js";
import {resumeHTML} from "./lib/core.js";
try {
  const s=await api("get"),id=new URL(location.href).searchParams.get("id"),j=s.jobs.find(j=>j.id===id);
  if(!j?.resume)throw Error("找不到已生成简历，请返回工作台生成");
  const doc=new DOMParser().parseFromString(resumeHTML(j.resume),"text/html");
  document.head.append(...doc.head.querySelectorAll("style"));document.title=doc.title;
  document.body.replaceChildren(...doc.body.childNodes);
  const button=document.createElement("button");button.textContent="打印 / 另存为 PDF";button.className="print-control";button.onclick=()=>window.print();document.body.prepend(button);
  const style=document.createElement("style");style.textContent=".print-control{margin-bottom:25px;padding:9px 15px;cursor:pointer}@media print{.print-control{display:none}}";document.head.append(style);
}catch(e){document.body.textContent=e.message;}
