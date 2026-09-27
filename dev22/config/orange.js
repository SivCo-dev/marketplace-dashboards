export default {
  slug: "orange", tenant_id: "ORANGE", display_name: "Orange", core_version: "2.2.0-dev",
  data_url: "https://tcefrvybgulcwwsdarcw.supabase.co/functions/v1/dashboard-data-dev22?tenant=ORANGE",
  data_headers: { apikey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjZWZydnliZ3VsY3d3c2RhcmN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1MDE4MjYsImV4cCI6MjEwNTA3NzgyNn0.MbpagnH8fJCgNusLjsV6WIbmIj3QUmzga_l-dGmb_5Q", Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjZWZydnliZ3VsY3d3c2RhcmN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1MDE4MjYsImV4cCI6MjEwNTA3NzgyNn0.MbpagnH8fJCgNusLjsV6WIbmIj3QUmzga_l-dGmb_5Q" },
  theme: { accent: "#f47b20" },
  footer_note: "Reference UI: Orange PROD snapshot 2026-09-24",
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
