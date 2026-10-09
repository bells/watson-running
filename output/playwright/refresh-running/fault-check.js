async function verifyFaults(page) {
  const assert = (ok, message) => { if(!ok) throw Error(message); };
  const errors=[];
  const onError=error=>errors.push(error.message);
  page.on('pageerror',onError);
  try {
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize({width:390,height:844});
  await page.route('**/basemaps.cartocdn.com/**',route=>route.abort('failed'));
  await page.unroute('**/activities*.json*'); await page.unroute('**/activity-details/42.json');
  await page.goto('http://127.0.0.1:5173/');
  await page.getByText('地图暂不可用',{exact:true}).waitFor({timeout:16000});
  assert(await page.locator('article').count()>0,'records available despite map failure');
  await page.getByRole('button',{name:'重试地图'}).click();
  await page.getByText('地图暂不可用',{exact:true}).waitFor({timeout:16000});
  await page.screenshot({path:'/tmp/running-refresh-map-failure-mobile.png'});
  const mapHeight=await page.getByRole('region',{name:'Map',exact:true}).evaluate(el=>el.getBoundingClientRect().height);
  assert(mapHeight<=220,'map failure did not collapse');
  const record={run_id:42,name:'合成跑步',distance:1000,moving_time:'0:05:00',type:'Run',subtype:'',start_date:'2025-12-31T12:00:00Z',start_date_local:'2025-12-31 20:00:00',location_country:null,summary_polyline:null,average_heartrate:null,elevation_gain:null,average_speed:1000/300,streak:1,detail_available:true};
  const walking={...record,run_id:43,type:'Walk',name:'合成步行',start_date_local:'2026-01-01 09:00:00',moving_time:'0:10:00',average_speed:1000/600,detail_available:false};
  let activityMode='two';
  await page.route('**/activities*.json*',route=>route.request().resourceType()==='fetch'?route.fulfill({json:activityMode==='empty'?[]:[record,walking]}):route.continue());
  await page.goto('http://127.0.0.1:5173/?year=Total');
  await page.getByRole('status').filter({hasText:'没有公开路线'}).waitFor();
  await page.getByRole('combobox',{name:'运动类型',exact:true}).selectOption('Walk');
  await page.getByRole('region',{name:'当前范围统计'}).getByText('1.0 km',{exact:true}).waitFor();
  await page.getByRole('combobox',{name:'年份',exact:true}).selectOption('2025');
  await page.getByText('这个范围没有运动记录',{exact:true}).waitFor();
  await page.screenshot({path:'/tmp/running-refresh-empty-filter-mobile.png'});
  await page.goto('http://127.0.0.1:5173/summary?year=Total&interval=week');
  await page.getByRole('heading',{name:'2025-12-29 起的一周',exact:true}).waitFor();
  assert((await page.getByRole('region',{name:'汇总范围'}).innerText()).includes('2.0'),'summary distance');
  let detailMode='http';
  const detail={schema_version:1,run_id:42,start_time_unix:1767182400,source:null,heart_rate_source:null,distance_m:1000,moving_seconds:300,elapsed_seconds:300,calories_kcal:null,total_steps:null,sample_interval_seconds:20,average_cadence_spm:null,average_stride_m:null,min_heart_rate_bpm:null,max_heart_rate_bpm:null,average_heart_rate_bpm:null,min_altitude_m:null,max_altitude_m:null,splits:[],samples:[]};
  await page.route('**/activity-details/42.json',route=>detailMode==='http'?route.fulfill({status:503,body:'unavailable'}):route.fulfill({json:detailMode==='malformed'?{schema_version:1,run_id:42}:detail}));
  await page.goto('http://127.0.0.1:5173/activity/42');
  await page.getByRole('alert').waitFor();
  await page.getByRole('heading',{name:'合成跑步',exact:true}).waitFor();
  await page.screenshot({path:'/tmp/running-refresh-detail-failure-mobile.png'});
  detailMode='success';
  await page.getByRole('button',{name:'重试加载'}).click();
  await page.getByRole('heading',{name:'运动曲线',exact:true}).waitFor();
  assert(await page.getByText('这次运动没有心率采样。',{exact:true}).count()===1,'missing sampling must not make zero chart');
  assert(await page.getByText('这次运动没有分公里记录。',{exact:true}).count()===1,'missing splits');
  detailMode='malformed';
  await page.reload();
  await page.getByRole('alert').waitFor();
  assert((await page.getByRole('alert').innerText()).includes('不匹配'),'malformed detail safely rejected');
  activityMode='empty';
  await page.goto('http://127.0.0.1:5173/');
  await page.getByText('这个范围没有运动记录',{exact:true}).waitFor();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'empty layout overflow');
  await page.unroute('**/activities*.json*');await page.unroute('**/activity-details/42.json');await page.unroute('**/basemaps.cartocdn.com/**');
  assert(errors.length===0,errors.join(';'));
  return {result:'PASS',mapHeight,coverage:'map-failure/retry/no-route/sport/empty/year-boundary/missing-samples/missing-splits/detail-http/retry/invalid-json/reduced-motion',pageErrors:errors};
  } finally {
  await page.unroute('**/activities*.json*');await page.unroute('**/activity-details/42.json');await page.unroute('**/basemaps.cartocdn.com/**');page.off('pageerror',onError);
  }
}
