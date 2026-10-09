async function verifyStates(page) {
 const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
 const record={run_id:42,name:'合成跑步',distance:1000,moving_time:'0:05:00',type:'Run',subtype:'',start_date:'2025-12-31T12:00:00Z',start_date_local:'2025-12-31 20:00:00',location_country:null,summary_polyline:'??o}@o}@',average_heartrate:null,elevation_gain:null,average_speed:1000/300,streak:1,detail_available:false};
 const context=await page.context().browser().newContext({hasTouch:true,isMobile:true,viewport:{width:390,height:844},reducedMotion:'reduce'});
 const touch=await context.newPage();const errors=[];touch.on('pageerror',e=>errors.push(e.message));
 try {
  let failure=true;
  await context.route('**/activities*.json*',route=>route.request().resourceType()==='fetch'?failure?route.fulfill({status:503,body:'unavailable'}):route.fulfill({json:[record]}):route.continue());
  await context.route('**/basemaps.cartocdn.com/**',route=>route.fulfill({json:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#14191d'}}]}}));
  await touch.goto('http://127.0.0.1:5173/');await touch.getByRole('alert').waitFor();
  failure=false;await touch.getByRole('button',{name:'重试加载',exact:true}).tap();
  await touch.getByRole('region',{name:'当前范围统计'}).waitFor();
  await touch.getByRole('button',{name:/地图定位/}).tap();
  await touch.getByRole('button',{name:/取消定位/}).waitFor();
  await touch.getByRole('button',{name:/Switch to .* theme/}).tap();
  await touch.getByRole('combobox',{name:'年份',exact:true}).focus();
  const focus=await touch.getByRole('combobox',{name:'年份',exact:true}).evaluate(el=>({outline:getComputedStyle(el).outlineStyle,width:getComputedStyle(el).outlineWidth,height:el.getBoundingClientRect().height}));
  assert(focus.height>=44,'touch select height');
  let privacy=true;
  await context.route('**/src/themes/classic/utils/const.ts*',async route=>{
   const response=await route.fetch();const body=await response.text();
   assert(/const PRIVACY_MODE = false/.test(body),'privacy module interception');
   await route.fulfill({response,body:body.replace('const PRIVACY_MODE = false',`const PRIVACY_MODE = ${privacy}`)});
  });
  await touch.reload();await touch.locator('#map-container canvas').waitFor();
  assert(await touch.getByTitle(/the Light/).count()===0,'privacy exposes lights toggle');
  privacy=false;await touch.reload();await touch.getByTitle(/the Light/).waitFor();
  assert(errors.length===0,errors.join(';'));
  return {result:'PASS',syntheticTouch:true,activityErrorRetry:true,recordTap:true,themeTap:true,selectHeight:focus.height,privacyLightControlHidden:true,reducedMotion:true,pageErrors:errors};
 }finally{await context.close()}
}
