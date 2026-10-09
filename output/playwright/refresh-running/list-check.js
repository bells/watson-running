async function verifyList(page) {
 const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
 const records=Array.from({length:21},(_,i)=>({run_id:i+1,name:`合成记录 ${i+1}`,distance:(i+1)*1000,moving_time:'0:10:00',type:'Run',subtype:'',start_date:`2025-01-${String(i+1).padStart(2,'0')}T01:00:00Z`,start_date_local:`2025-01-${String(i+1).padStart(2,'0')} 09:00:00`,location_country:null,summary_polyline:null,average_heartrate:null,elevation_gain:null,average_speed:(i+1)*1000/600,streak:1,detail_available:false}));
 try {
  await page.route('**/activities*.json*',route=>route.request().resourceType()==='fetch'?route.fulfill({json:records}):route.continue());
  await page.setViewportSize({width:1440,height:1000});await page.goto('http://127.0.0.1:5173/');
  const table=page.locator('#records table');await table.getByRole('button',{name:'km',exact:true}).waitFor();
  await table.getByRole('button',{name:'km',exact:true}).focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('#records tbody tr td:nth-child(2)')?.textContent==='21.00');
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('#records tbody tr td:nth-child(2)')?.textContent==='1.00');
  await page.getByRole('button',{name:'下一页',exact:true}).click();await page.getByText('第 2 / 2 页',{exact:true}).waitFor();
  assert(await page.locator('#records tbody tr').count()===1,'second page size');
  await page.getByRole('combobox',{name:'每页显示',exact:true}).selectOption('50');
  await page.waitForFunction(()=>document.querySelectorAll('#records tbody tr').length===21);
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('combobox',{name:'记录排序',exact:true}).selectOption('Pace');
  await page.getByRole('button',{name:'降序 ↓',exact:true}).waitFor();
  assert(await page.getByRole('button',{name:/地图定位/}).count()===21,'mobile entry count');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile list overflow');
  return {result:'PASS',keyboardSortBothDirections:true,pagination:true,pageSize:true,mobileSort:true,syntheticActivities:21};
 }finally{await page.unroute('**/activities*.json*')}
}
