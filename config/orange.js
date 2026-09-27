export default {
  slug: "orange", tenant_id: "ORANGE", display_name: "Orange", core_version: "2.3.0",
  data_url: "https://tcefrvybgulcwwsdarcw.supabase.co/functions/v1/dashboard-data-dev23?tenant=ORANGE",
  data_headers: {},
  theme: { accent: "#f47b20" },
  footer_note: "Reference UI: Orange 2.3 production",
  accounts: [
    { account_id: "ozon_orange_market_ipt", marketplace: "OZON", cabinet: "Market IPT" },
    { account_id: "ozon_orange_bond", marketplace: "OZON", cabinet: "BOND" },
    { account_id: "wb_orange_ipt", marketplace: "WB", cabinet: "IPT" },
    { account_id: "yandex_orange_ipu", marketplace: "YANDEX", cabinet: "IPU" }
  ],
  sku_aliases: [
    { marketplace: "*", account_id: "*", external_sku: "TU", canonical_sku: "TUW" },
    { marketplace: "*", account_id: "*", external_sku: "xxx_TUW", canonical_sku: "TUW" },
    { marketplace: "*", account_id: "*", external_sku: "xxx-TUW", canonical_sku: "TUW" }
  ]
};
