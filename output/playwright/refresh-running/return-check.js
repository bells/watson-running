async function verifyReturn(page) {
 const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
 const output=[];
 for(const root of ['http://127.0.0.1:4173/','http://127.0.0.1:4174/watson-running/']) {
  await page.setViewportSize({width:390,height:844});
  await page.goto(`${root}?year=2025&sport=Run`);
  await page.getByRole('region',{name:'当前范围统计'}).getByText('654.9 km',{exact:true}).waitFor();
  const link=page.locator('#records').getByRole('link',{name:'查看详情 ↗'}).first();
  const href=await link.getAttribute('href');await link.click();
  await page.getByRole('heading',{name:'运动曲线',exact:true}).waitFor();
  await page.getByRole('link',{name:'← 返回跑步记录',exact:true}).click();
  await page.waitForURL(url=>url.searchParams.get('year')==='2025'&&url.searchParams.get('sport')==='Run'&&url.hash.startsWith('#run_'));
  await page.getByRole('region',{name:'当前范围统计'}).getByText('654.9 km',{exact:true}).waitFor();
  await page.getByRole('button',{name:/取消定位/}).first().waitFor();
  const mobileOrder=await page.evaluate(()=>document.getElementById('records').getBoundingClientRect().top<document.getElementById('map-container').getBoundingClientRect().top);
  assert(mobileOrder,'records precede map');
  await page.goto(`${root}summary?year=2025&sport=Run&interval=month`);
  await page.getByRole('region',{name:'汇总范围'}).waitFor();
  await page.locator('article').first().locator('summary').click();
  const detail=page.locator('article').first().getByRole('link',{name:'查看详情 ↗'}).first();await detail.waitFor();await detail.click();
  await page.getByRole('heading',{name:'运动曲线',exact:true}).waitFor();
  await page.getByRole('link',{name:'← 返回跑步记录',exact:true}).click();
  await page.waitForURL(url=>url.pathname.endsWith('/summary')&&url.searchParams.get('year')==='2025'&&url.searchParams.get('interval')==='month');
  output.push({root,href,filtersRetained:true,selectionRetained:true,summaryRetained:true,mobileOrder});
 }
 return {result:'PASS',cases:output};
}
