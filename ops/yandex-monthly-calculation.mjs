// Economic result: delivered buyer cash + earned sales points + financial returns
// - seller-funded services (cash + spent sales points - refunded sales points)
// + compensation. Premium is already represented by unused sales points.
export function calculateYandexMonth(files, months, cabinets, deliveredOrders=[]) {
 const cols=['sale_units','return_units','sales_rub','sales_points','returns_rub','returns_points',...['commission','logistics','promotion','other'].flatMap(g=>['rub_hold','points_hold','rub_refund','points_refund'].map(k=>g+'_'+k)),'compensation_rub'];
 const money=cols.filter(k=>!k.endsWith('units'));
 const date=s=>s?.match(/^(\d{2})\.(\d{2})\.(\d{4})(.*)$/)?.slice(1).reduce((_,v,i,a)=>`${a[2]}-${a[1]}-${a[0]}${a[3]}`, '')||s||'';
 const cent=v=>Math.round(Number(v||0)*100);
 const rows=new Map();
 const get=(cab,month,sku,name='')=>{const key=[cab,month,sku||'__SHARED__'].join('|');if(!rows.has(key)) rows.set(key,{month,cabinet:cab,source_sku:sku||'__SHARED__',product_name:name,...Object.fromEntries(cols.map(k=>[k,0]))});return rows.get(key);};
 const valid=(r,cab)=>String(r.inn)===cabinets[cab].inn && r.placementContract===cabinets[cab].contract;
 const groups={'placement.json':'commission','payment_accepting.json':'commission','payment_transfer.json':'commission','boost.json':'promotion','cpm-boost.json':'promotion','product-banners.json':'promotion','loyalty_and_reviews.json':'promotion','delivery.json':'logistics','crossregional_delivery.json':'logistics','order_processing.json':'logistics','storage_of_returns.json':'logistics','business_subscription.json':'other'};
 for(const cab of Object.keys(cabinets)) {
  const net=files.filter(f=>f.cabinet===cab&&f.kind==='netting').flatMap(f=>f.data.rows).filter(r=>valid(r,cab));
  const orders=new Map(); for(const r of net){if(r.orderId&&r.shopSku){const s=orders.get(String(r.orderId))||new Set();s.add(r.shopSku);orders.set(String(r.orderId),s);}}
  const saleKeys=new Set(),returnKeys=new Set();
  for(const r of net){
   const confirmed=deliveredOrders.find(o=>o.cabinet===cab&&String(o.order_id)===String(r.orderId)&&o.shop_sku===r.shopSku);
   const tx=date(r.transactionDate),delivery=confirmed?.delivery_date?.slice(0,19)||date(r.orderDeliveryDate),dm=delivery.slice(0,7),tm=tx.slice(0,7),src=r.transactionSource,status=r.paymentStatus;
   const amount=cent(r.transactionSum),sku=r.shopSku||'__SHARED__'; let month,key;
   if(src==='Платёж покупателя' && /^(Переведён|Будет переведён)/.test(status) && delivery){month=dm;key='sales_rub';}
   else if(/^Баллы за скидку (Маркета|Яндекс Плюс)$/.test(src)&&status==='Справочно: пополнен баланс'&&delivery){month=dm;key='sales_points';}
   else if(src==='Возврат платежа покупателя'&&/^(Удержан|Будет удержан) из платежей покупателей$/.test(status)&&delivery){month=tx<delivery?dm:tm;key=tx<delivery?'sales_rub':'returns_rub';}
   else if(/^Возврат баллов за скидку (Маркета|Яндекс Плюс)$/.test(src)&&status==='Справочно: списан с баланса'&&delivery){month=tm;key='returns_points';}
   else if(src==='Возврат скидки за участие в совместных акциях'&&status==='Справочно: пополнен баланс'){month=r.bonusAccountYearMonth||tm;key='commission_points_refund';}
   else if(/^Компенсация/.test(src)&&/^(Переведён|Будет переведён)/.test(status)){month=tm;key='compensation_rub';}
   if(!key||!months.includes(month))continue;
   const out=get(cab,month,sku,r.offerOrServiceName);out[key]+=amount;
   const identity=[month,r.orderId,sku].join('|');
   if(key==='sales_rub'&&amount>0&&!saleKeys.has(identity)){out.sale_units+=Number(r.count||0);saleKeys.add(identity);}
   if(key==='returns_rub'&&!returnKeys.has(identity)){out.return_units+=Number(r.count||0);returnKeys.add(identity);}
  }
  // Delivery export recovers buyer credits missing from a netting report whose
  // transaction window starts after payment. Never add the same order twice.
  for(const o of deliveredOrders.filter(o=>o.cabinet===cab)){
   const month=o.delivery_date.slice(0,7),identity=[month,o.order_id,o.shop_sku].join('|');
   if(months.includes(month)&&!saleKeys.has(identity)){
    const out=get(cab,month,o.shop_sku,o.product_name);out.sales_rub+=cent(o.sale_amount);out.sale_units+=Number(o.quantity);saleKeys.add(identity);
   }
  }
  for(const f of files.filter(f=>f.cabinet===cab&&f.kind==='services')){
   const group=groups[f.fileName];if(!group)throw new Error('Unknown service file '+f.fileName);
   for(const r of f.data.rows){
    if(!valid(r,cab))continue;const month=(r.actDate||r.serviceDateTime||r.serviceDate||'').slice(0,7);if(!months.includes(month))continue;
    let sku=r.shopSku;if(!sku){const choices=orders.get(String(r.orderId));if(choices?.size===1)sku=[...choices][0];}
    const out=get(cab,month,sku,r.offerName);
    // servicePrice / totalAmount is actual ruble liability. Promo funding is excluded.
    const cash=cent(f.fileName==='placement.json'?r.totalAmount:r.servicePrice),points=cent(r.netting);
    out[group+'_'+(cash>=0?'rub_hold':'rub_refund')]-=cash;
    out[group+'_'+(points>=0?'points_hold':'points_refund')]-=points;
   }
  }
 }
 return [...rows.values()].map(r=>({...r,...Object.fromEntries(money.map(k=>[k,r[k]/100]))}));
}
