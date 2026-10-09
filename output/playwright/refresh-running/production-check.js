async function verifyProduction(page) {
 const assert=(ok,message)=>{if(!ok)throw Error(message)};
 const errors=[]; const onError=e=>errors.push(e.message);page.on('pageerror',onError);
 const workerErrors=[];const onConsole=m=>{if(/Worker failed to load/.test(m.text()))workerErrors.push(m.text())};page.on('console',onConsole);
 const requests=[]; const onRequest=r=>requests.push(r.url());page.on('request',onRequest);
 const result=[];
 try {
  for(const [theme,port,prefix] of [['classic',4173,'/'],['classic',4174,'/watson-running/'],['dashboard',4175,'/'],['dashboard',4176,'/watson-running/']]) {
   const root=`http://127.0.0.1:${port}${prefix}`;
   await page.setViewportSize({width:1440,height:1000});
   await page.goto(root);await page.waitForLoadState('networkidle');
   if(theme==='classic') await page.getByRole('region',{name:'当前范围统计'}).waitFor();
   else await page.getByRole('heading',{name:'跑步记录',exact:true}).waitFor();
   assert(await page.getByRole('button',{name:'AI 跑步助手',exact:true}).count()===0,'production chat entry');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${theme} desktop overflow`);
   const info=await page.evaluate(async()=>{
    const response=performance.getEntriesByType('resource').find(e=>/activities.*\.json/.test(e.name));
    if(!response)throw Error('activity asset missing');
    const activities=await (await fetch(response.name)).json();
    return {asset:response.name,id:activities.find(a=>a.detail_available)?.run_id};
   });
   assert(info.asset.startsWith(root),'activity asset escaped base');assert(info.id,'detail record');
   if(prefix==='/')await page.screenshot({path:`/Users/watson/work/watson-running/output/playwright/refresh-${theme}-home-desktop.png`});
   await page.setViewportSize({width:390,height:844});
   await page.getByRole('button',{name:/Switch to .* theme/}).click();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${theme} mobile overflow`);
   if(prefix==='/')await page.screenshot({path:`/Users/watson/work/watson-running/output/playwright/refresh-${theme}-home-mobile.png`});
   if(theme==='classic') {
    await page.goto(`${root}summary?year=2025&interval=month`);await page.getByRole('region',{name:'汇总范围'}).waitFor();
    for(const interval of ['week','year','day','month']){await page.getByRole('combobox',{name:'周期',exact:true}).selectOption(interval);await page.getByRole('combobox',{name:'周期',exact:true}).evaluate((el,value)=>new Promise(resolve=>{const check=()=>el.value===value?resolve():requestAnimationFrame(check);check()}),interval);}
    await page.reload();await page.getByRole('region',{name:'汇总范围'}).waitFor();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'summary mobile overflow');
    if(prefix==='/')await page.screenshot({path:'/Users/watson/work/watson-running/output/playwright/refresh-classic-summary-mobile.png'});
   } else {
    await page.getByRole('button',{name:'轨迹墙',exact:true}).click();await page.getByRole('heading',{name:'轨迹墙',exact:true}).waitFor();
    await page.getByRole('button',{name:/km ·/}).first().waitFor();
    await page.getByRole('button',{name:/km ·/}).first().focus();await page.keyboard.press('Enter');
    await page.getByRole('button',{name:/km ·/}).first().filter({has:page.locator('svg')}).waitFor();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'tracks mobile overflow');
    if(prefix==='/')await page.screenshot({path:'/Users/watson/work/watson-running/output/playwright/refresh-dashboard-tracks-mobile.png'});
    await page.getByRole('button',{name:'返回',exact:true}).click();await page.getByRole('heading',{name:'跑步记录',exact:true}).waitFor();
   }
   await page.goto(`${root}activity/${info.id}`);await page.getByRole('heading',{name:'运动曲线',exact:true}).waitFor();
   const detail=await page.evaluate(async(path)=>{const res=await fetch(path);const d=await res.json();return {status:res.status,id:d.run_id,distance:d.distance_m,seconds:d.moving_seconds,samples:d.samples.length,splits:d.splits.length}},`${prefix}activity-details/${info.id}.json`);
   assert(detail.status===200&&detail.id===info.id,'detail asset identity');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'detail mobile overflow');
   await page.reload();await page.getByRole('heading',{name:'运动曲线',exact:true}).waitFor();
   if(prefix==='/'&&theme==='classic')await page.screenshot({path:'/Users/watson/work/watson-running/output/playwright/refresh-classic-detail-mobile.png'});
   await page.getByRole('link',{name:'← 返回跑步记录',exact:true}).click();
   await page.waitForURL(root);
   result.push({theme,prefix,home:true,summary:theme==='classic'?'periods/direct/reload':'single-page theme',tracks:theme==='dashboard',detail,chatAbsent:true});
  }
  assert(errors.length===0,errors.join(';'));assert(workerErrors.length===0,workerErrors.join(';'));assert(!requests.some(u=>/\/api\/(chat|agent|stream)/.test(u)),'production API call');
  return {result:'PASS',matrix:result,pageErrors:errors,apiCalls:0};
 } finally {page.off('pageerror',onError);page.off('request',onRequest);page.off('console',onConsole)}
}
