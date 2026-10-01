const account = {
  W: { account_id: "ozon_w", sales: 6876122, returns: -488820, net_sales: 6387302, commission: -3299381.80, logistics: -347838.70, storage: 0, promotion: -641839.17, other: -63716.42, marketplace_expenses: -4352776.09, result_without_compensation: 2034525.91, cogs: 1958207, result_after_cogs: 76318.91, units: [475, 34, 441] },
  CPR: { account_id: "ozon_cpr", sales: 8030008, returns: -870349, net_sales: 7159659, commission: -3713109.37, logistics: -758494.31, storage: -8688, promotion: -86920.14, other: -55964.68, marketplace_expenses: -4623176.50, result_without_compensation: 2536482.50, cogs: 1169100, result_after_cogs: 1367382.50, units: [485, 52, 433] },
};

const sku = {
  W: [
    [54,"3780563724","BAN120X80LMP","Зеркало Анданте 120х80 LED",988943,67,-513349.03,-47345.50,-98251.91,-11040.25,318956.31,290177,28779.31],
    [30,"3780216591","GR120X80LTMP","Зеркало АллегроЛайт 120х80 LED",842754,55,-431651.63,-41894.74,-84510.97,-6672.57,278024.09,254980,23044.09],
    [18,"3780215320","GR100X80LTMP","Зеркало АллегроЛайт 100х80 LED",531405,40,-272129.89,-31708.61,-53691.90,-3245.83,170628.77,161040,9588.77],
  ],
  CPR: [
    [68,"2873291467","Аврора-60","Тумба с раковиной CAPRIS Аврора 60",2851410,159,-1475991.82,-325463.06,-34616.86,-21101.35,990771.91,429300,561471.91],
    [1,"1547097879","Аврора-52","Тумба с раковиной CAPRIS Аврора 52",2376510,149,-1232205.24,-207364.15,-28851.46,-19878.40,886914.75,402300,484614.75],
    [13,"1547097965","Аврора-47","Тумба с раковиной CAPRIS Аврора 47",1922744,124,-1000335.42,-221979.97,-23342.62,-14923.88,658235.11,334800,323435.11],
  ],
};

function skuRows(tenant) {
  return sku[tenant].map(([product_id,canonical_sku,article,product_name,net_sales,financial_net_units,commission,logistics,promotion,other,result_without_compensation,cogs,result_after_cogs]) => ({ product_id,canonical_sku,article,product_name,sales:net_sales,returns:0,net_sales,financial_sale_units:financial_net_units,financial_return_units:0,financial_net_units,commission,logistics,storage:0,promotion,other,marketplace_expenses:commission+logistics+promotion+other,result_without_compensation,compensation:0,unit_cost:null,cogs,result_after_cogs,cost_status:"COMPLETE",compensation_status:"PENDING" }));
}

export function fixtureFor(tenant, month) {
  const a = account[tenant];
  if (month === "2026-10") return { contract_version:"monthly-api-v2.0",metadata:{tenant_id:tenant,account_id:a.account_id,marketplace:"OZON",month,marketplace_close_status:"LIVE",base_close_revision:0,overall_readiness:"LIVE",compensation_status:"UNAVAILABLE",cost_status:"UNAVAILABLE",business_expense_status:"UNAVAILABLE",data_available:true,source_layer:"SHADOW_CURRENT",finance_data_status:"WAITING_FOR_FINANCE",finance_source_rows:0,finance_max_accounting_date:null,refreshed_at:"2026-10-01T18:35:00Z",closed_at:null},financial_economics:{sales:null,returns:null,net_sales:null,commission:null,logistics:null,storage:null,promotion:null,other:null,marketplace_expenses:null,result_without_compensation:null,compensation:null,result_with_compensation:null,cogs:null,result_after_cogs:null,business_expenses:null,final_business_result:null},units:{financial_sale_units:null,financial_return_units:null,financial_net_units:null,ordered_units:null,delivered_units:null,returned_units:null,written_off_units:null,operational_metrics_status:"UNAVAILABLE"},expense_structure:{total:{commission:null,logistics:null,storage:null,promotion:null,other:null},direct:{commission:null,logistics:null,storage:null,promotion:null,other:null},allocated_shared:{commission:null,logistics:null,storage:null,promotion:null,other:null}},sku_rows:[],warnings:["OPERATIONAL_METRICS_UNAVAILABLE","FINANCE_NOT_ARRIVED"]};
  return { contract_version:"monthly-api-v2.0",metadata:{tenant_id:tenant,account_id:a.account_id,marketplace:"OZON",month,marketplace_close_status:"CLOSED",base_close_revision:1,overall_readiness:"BASE_CLOSED",compensation_status:"PENDING",cost_status:"COMPLETE",business_expense_status:"NOT_APPLICABLE",data_available:true,source_layer:"CLOSED_IMMUTABLE",finance_data_status:"CLOSED",finance_source_rows:null,finance_max_accounting_date:null,refreshed_at:"2026-10-01T17:58:32Z",closed_at:"2026-10-01T14:02:09Z"},financial_economics:{sales:a.sales,returns:a.returns,net_sales:a.net_sales,commission:a.commission,logistics:a.logistics,storage:a.storage,promotion:a.promotion,other:a.other,marketplace_expenses:a.marketplace_expenses,result_without_compensation:a.result_without_compensation,compensation:0,result_with_compensation:a.result_without_compensation,cogs:a.cogs,result_after_cogs:a.result_after_cogs,business_expenses:0,final_business_result:null},units:{financial_sale_units:a.units[0],financial_return_units:a.units[1],financial_net_units:a.units[2],ordered_units:null,delivered_units:null,returned_units:null,written_off_units:null,operational_metrics_status:"UNAVAILABLE"},expense_structure:{total:{commission:a.commission,logistics:a.logistics,storage:a.storage,promotion:a.promotion,other:a.other},direct:{commission:a.commission,logistics:a.logistics,storage:a.storage,promotion:a.promotion,other:a.other},allocated_shared:{commission:0,logistics:0,storage:0,promotion:0,other:0}},sku_rows:skuRows(tenant),warnings:["OPERATIONAL_METRICS_UNAVAILABLE","COMPENSATION_PENDING"]};
}
