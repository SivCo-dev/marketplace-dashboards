import assert from 'node:assert/strict';
import {calculateYandexMonth} from './yandex-monthly-calculation.mjs';
const base={inn:'1',placementContract:'c',orderId:10,shopSku:'A',count:1,orderDeliveryDate:'05.08.2026 12:00'};
const tx=(transactionSource,transactionSum,transactionDate,paymentStatus)=>({...base,transactionSource,transactionSum,transactionDate,paymentStatus});
const net=[
 tx('Платёж покупателя',1000,'30.07.2026 12:00','Переведён по графику выплат'),
 tx('Платёж покупателя',1000,'30.07.2026 12:01','Переведён по графику выплат'),
 tx('Возврат платежа покупателя',-1000,'30.07.2026 12:02','Удержан из платежей покупателей'),
 tx('Баллы за скидку Маркета',500,'30.07.2026 12:00','Справочно: пополнен баланс'),
 tx('Возврат платежа покупателя',-200,'20.08.2026 12:00','Будет удержан из платежей покупателей'),
 tx('Возврат баллов за скидку Маркета',-100,'20.08.2026 12:00','Справочно: списан с баланса'),
 tx('Возврат скидки за участие в совместных акциях',10,'22.08.2026 12:00','Справочно: пополнен баланс'),
 tx('Компенсация по претензии',50,'22.08.2026 12:00','Будет переведён по графику выплат'),
 tx('Премия',999,'22.08.2026 12:00','Переведён по графику выплат'),
 tx('Платёж покупателя',888,'22.08.2026 12:00','Не будет переведён из-за отмены заказа')
];
const service={...base,actDate:'2026-08-31',servicePrice:50,netting:100,bonusPaid:2000};
const files=[{cabinet:'C',kind:'netting',data:{rows:net}},{cabinet:'C',kind:'services',fileName:'boost.json',data:{rows:[service,{...service,inn:'foreign',servicePrice:10000}]}}];
const [row]=calculateYandexMonth(files,['2026-07','2026-08'],{C:{inn:'1',contract:'c'}});
assert.equal(row.month,'2026-08');assert.equal(row.sale_units,1);assert.equal(row.return_units,1);
assert.equal(row.sales_rub,1000);assert.equal(row.sales_points,500);assert.equal(row.returns_rub,-200);assert.equal(row.returns_points,-100);
assert.equal(row.promotion_rub_hold,-50);assert.equal(row.promotion_points_hold,-100);assert.equal(row.commission_points_refund,10);assert.equal(row.compensation_rub,50);
assert.equal(row.sales_rub+row.sales_points+row.returns_rub+row.returns_points+row.promotion_rub_hold+row.promotion_points_hold+row.commission_points_refund+row.compensation_rub,1110);
const delivered=[{cabinet:'C',order_id:'11',shop_sku:'B',delivery_date:'2026-08-12',quantity:1,sale_amount:300}];
const restored=calculateYandexMonth(files,['2026-08'],{C:{inn:'1',contract:'c'}},delivered);
assert.equal(restored.find(r=>r.source_sku==='B').sales_rub,300);
console.log('PASS: sales points, promo funding, premium exclusion, financial returns, pre-delivery reversal, legal entity isolation, missing buyer credit recovery');
