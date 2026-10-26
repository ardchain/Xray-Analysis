const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
let source = fs.readFileSync(path.join(__dirname, '..', 'panel.js'), 'utf8');
source = source.slice(0, source.lastIndexOf('  window.addEventListener("message"')) +
  'globalThis.periods = { bucket: getPeriodBucket, aggregate: aggregateMetricMap, nativeAnchor: getNativePayPeriodAnchor }; getDateWindow = () => globalThis.dateWindow;\n})();';
const context = { window: {}, dateWindow: {start:new Date('2026-07-29Z'),end:new Date('2026-10-26Z')}, document:{querySelectorAll:()=>[{textContent:'Oct 21'}]} };
vm.runInNewContext(source, context);
const {bucket, aggregate, nativeAnchor} = context.periods;
const anchor = Date.parse('2026-10-21T00:00:00Z');
assert.equal(nativeAnchor(), anchor);
for (const [day, expected] of [['2026-07-29','2026-07-29'],['2026-08-11','2026-07-29'],['2026-08-12','2026-08-12'],['2026-09-01','2026-08-26'],['2026-09-23','2026-09-23'],['2026-10-07','2026-10-07'],['2026-10-20','2026-10-07'],['2026-10-21','2026-10-21'],['2026-11-03','2026-10-21'],['2026-11-04','2026-11-04']]) assert.equal(bucket(day,'Pay period',anchor),expected);
for (const [length, expected] of [[7,['2026-10-07','2026-10-21']],[14,['2026-10-07','2026-10-21']],[28,['2026-09-23','2026-10-07','2026-10-21']],[90,['2026-07-29','2026-08-12','2026-08-26','2026-09-09','2026-09-23','2026-10-07','2026-10-21']]]) {
  const source = new Map();
  for(let i=0;i<length;i++){const day=new Date(Date.UTC(2026,9,26)-i*86400000).toISOString().slice(0,10);source.set(day,{verified:1,unverified:2,unknown:3,items:[]});}
  const grouped=aggregate(source,'Pay period',anchor);
  assert.deepEqual([...grouped.keys()].sort(),expected);
  for(const [key,factor] of [['verified',1],['unverified',2],['unknown',3]]) assert.equal([...grouped.values()].reduce((sum,v)=>sum+v[key],0),length*factor);
  if(length===7){assert.equal(grouped.get('2026-10-07').verified,1);assert.equal(grouped.get('2026-10-21').verified,6);}
}
context.dateWindow={start:new Date('2026-12-20Z'),end:new Date('2027-01-05Z')};
context.document.querySelectorAll=()=>[{textContent:'Dec 30'}];
assert.equal(nativeAnchor(),Date.parse('2026-12-30Z'));
assert.equal(bucket('2027-01-01','Pay period',nativeAnchor()),'2026-12-30');
const leap=Date.parse('2024-02-21Z');
assert.equal(bucket('2024-03-05','Pay period',leap),'2024-02-21');
assert.equal(bucket('2024-03-06','Pay period',leap),'2024-03-06');
assert.equal(bucket('2026-10-26','Monthly',anchor),'2026-10-01');
assert.equal(bucket('2026-10-26','Daily',anchor),'2026-10-26');
console.log('PASS: native Pay period boundaries, 7D/2W/4W/3M, partial periods, totals per audience, month/year/leap-day transitions');
