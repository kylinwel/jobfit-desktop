import {escapeHtml as e} from './lib/core.js';
const date=value=>value?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'待核实';
export function mountDigest(api,download,notice){
  const $=s=>document.querySelector(s);let snapshot=null,selectedDay='',current=null,userSelectedHistory=false;
  const table=rows=>rows.length?'<div class="digest-table-wrap"><table class="digest-table"><thead><tr><th>公司 / 岗位</th><th>城市 / 薪资</th><th>匹配分</th><th>平台创建时间</th><th>符合项与待确认项</th><th>投递链接</th></tr></thead><tbody>'+rows.map(row=>'<tr><td><strong>'+e(row.title)+'</strong><small>'+e(row.company)+' · '+e(row.kind)+'</small></td><td>'+e(row.city||'待确认')+'<small>'+e(row.salary)+'</small></td><td><b>'+row.score+'</b> / 100</td><td>'+e(date(row.publishedAt))+'<small>'+e(row.timeBasis)+'</small></td><td><p>'+e(row.reasons.join('；'))+'</p><small>'+e([...row.questions,...row.cautions,...(row.gaps.length?['技能缺口：'+row.gaps.join('、')]:[])].join('；'))+'</small></td><td><a href="'+e(row.url)+'" data-digest-open="'+e(row.id)+'" target="_blank" rel="noreferrer">查看岗位 ↗</a></td></tr>').join('')+'</tbody></table></div>':'<div class="empty"><span>本次没有符合条件的新发岗位</span><p>请同时查看来源状态；采集失败与没有匹配岗位会分别标注。</p></div>';
  function render(){
    if(!snapshot)return;const settings=snapshot.settings;
    if(!$('#digest-settings').contains(document.activeElement)){$('#digest-enabled').checked=settings.enabled;$('#digest-time').value=String(settings.hour).padStart(2,'0')+':'+String(settings.minute).padStart(2,'0');}
    $('#digest-status').textContent=snapshot.status==='running'?snapshot.progress:snapshot.status==='error'?'整理失败：'+snapshot.progress:settings.enabled?'每日 '+String(settings.hour).padStart(2,'0')+':'+String(settings.minute).padStart(2,'0')+'（北京时间） · 匹配分 ≥ 60':'定时整理已关闭';
    $('#digest-run').disabled=snapshot.status==='running';$('#digest-export').disabled=!current||current.status==='failed';
    $('#digest-history').innerHTML=snapshot.history.length?snapshot.history.map(h=>'<option value="'+h.day+'" '+(h.day===selectedDay?'selected':'')+'>'+h.day+' · '+h.count+' 项'+(h.status==='failed'?' · 采集失败':'')+'</option>').join(''):'<option value="">暂无日报</option>';
    if(!current&&snapshot.status==='error'){$('#digest-result').innerHTML='<p class="digest-error">'+e(snapshot.progress)+'</p>';return;}
    if(!current){$('#digest-result').innerHTML='<div class="empty"><span>启用定时整理，或点击「立即整理」生成首份日报</span></div>';return;}
    const sourceHtml=current.sources.map(s=>'<li><strong>'+e(s.name)+'</strong> · '+(s.status==='error'?'采集失败':s.status==='unavailable'?'未采集':'已检查 '+s.scanned+' 项')+'<small>'+e(s.note)+'</small></li>').join('');
    $('#digest-result').innerHTML='<div class="digest-summary"><strong>'+current.rows.length+' 项新发岗位达到 60 分</strong><span>生成于 '+e(date(current.generatedAt))+'</span></div><p class="muted">范围：'+e(date(current.since))+' 至 '+e(date(current.generatedAt))+'。硬性条件冲突已排除；匹配分用于排序，不是录取概率。</p><ul class="digest-sources">'+sourceHtml+'</ul>'+(current.status==='failed'?'<p class="digest-error">'+e(current.summary)+'</p>':'')+(current.profileSummary.projectCount===0?'<p class="muted">当前没有已填写的项目素材，匹配使用已保存的背景条件与 '+current.profileSummary.skillCount+' 项技能。</p>':'')+(current.status==='failed'&&!current.rows.length?'<div class="empty"><span>来源未完成，暂时无法判断是否有匹配岗位</span></div>':table(current.rows))+(current.unverified.length?'<details class="digest-unverified"><summary>首次发现、发布时间待核实（'+current.unverified.length+' 项，不计入新发日报与 CSV）</summary>'+table(current.unverified)+'</details>':'');
  }
  async function load(){
    snapshot=await api('digestGet');if(!userSelectedHistory)selectedDay=snapshot.history[0]?.day||'';
    if(selectedDay===snapshot.latest?.day)current=snapshot.latest;else if(selectedDay&&current?.day!==selectedDay)current=await api('digestReport',{day:selectedDay});
    render();
  }
  const act=fn=>async event=>{try{await fn(event);}catch(error){notice(error.message,true);}};
  $('#digest-settings').addEventListener('submit',act(async ev=>{ev.preventDefault();const [hour,minute]=$('#digest-time').value.split(':').map(Number);await api('digestConfigure',{enabled:$('#digest-enabled').checked,hour,minute});await load();notice('日报设置已保存；错过计划时间会在打开 JobFit 后补跑');}));
  $('#digest-run').addEventListener('click',act(async()=>{userSelectedHistory=false;await api('digestRun');await load();}));
  $('#digest-history').addEventListener('change',act(async ev=>{userSelectedHistory=true;selectedDay=ev.target.value;current=await api('digestReport',{day:selectedDay});render();}));
  $('#digest-export').addEventListener('click',act(async()=>{const file=await api('digestCsv',{day:selectedDay});download(file.filename,file.content,'text/csv;charset=utf-8');}));
  $('#digest-folder').addEventListener('click',act(async()=>{await api('digestFolder');}));
  $('#digest-result').addEventListener('click',act(async ev=>{const a=ev.target.closest('[data-digest-open]');if(!a)return;ev.preventDefault();await api('digestOpenJob',{day:selectedDay,id:a.dataset.digestOpen});}));
  setInterval(()=>{if(!$('#view-digest').hidden)void load().catch(()=>{});},4000);
  return {load};
}
