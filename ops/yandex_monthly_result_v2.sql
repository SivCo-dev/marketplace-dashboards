CREATE OR REPLACE VIEW public.monthly_orange_yandex_core_v1 AS
 WITH src AS (
         SELECT y.month,
            to_date(y.month || '-01'::text, 'YYYY-MM-DD'::text) AS month_date,
            y.cabinet,
                CASE y.cabinet
                    WHEN 'IPP'::text THEN 'yandex_orange_ipp'::text
                    WHEN 'IPT'::text THEN 'yandex_orange_ipt'::text
                    WHEN 'IPU'::text THEN 'yandex_orange_ipu'::text
                    ELSE NULL::text
                END AS account_id,
            y.source_sku,
            y.product_name,
            y.sale_units,
            y.return_units,
            y.sales_rub + y.sales_points AS sales,
            y.returns_rub + y.returns_points AS returns,
            y.commission_rub_hold + y.commission_points_hold + y.commission_rub_refund + y.commission_points_refund AS commission,
            y.logistics_rub_hold + y.logistics_points_hold + y.logistics_rub_refund + y.logistics_points_refund AS logistics,
            y.promotion_rub_hold + y.promotion_points_hold + y.promotion_rub_refund + y.promotion_points_refund AS promotion,
            y.other_rub_hold + y.other_points_hold + y.other_rub_refund + y.other_points_refund AS other,
            y.compensation_rub AS compensation
           FROM orange_yandex_balance_sku_2x y
          WHERE y.month = ANY (ARRAY['2026-07'::text, '2026-08'::text, '2026-09'::text])
        ), direct AS (
         SELECT s.month,
            s.month_date,
            s.cabinet,
            s.account_id,
            s.source_sku,
            s.product_name,
            s.sale_units,
            s.return_units,
            s.sales,
            s.returns,
            s.commission,
            s.logistics,
            s.promotion,
            s.other,
            s.compensation,
            COALESCE(im.canonical_sku,bp.canonical_article) AS canonical_sku,
            COALESCE(bp.canonical_name, s.product_name) AS canonical_name,
            COALESCE(bp.master_category, 'Прочие'::text) AS master_category
           FROM src s
             LEFT JOIN core.orange_identity_article_map_v2 im ON im.marketplace = 'YANDEX'::text AND im.account_id = s.account_id AND lower(TRIM(BOTH FROM im.external_sku)) = lower(TRIM(BOTH FROM s.source_sku))
             LEFT JOIN core.business_products_v2 bp ON bp.tenant_id = 'ORANGE'::text AND ((im.canonical_sku IS NOT NULL AND bp.canonical_article = im.canonical_sku) OR (im.canonical_sku IS NULL AND lower(trim(bp.canonical_article))=lower(trim(s.source_sku)))) AND bp.product_variant_type = 'STANDARD'::text AND bp.identity_status = 'ACTIVE'::text
          WHERE s.source_sku <> '__SHARED__'::text
        ), shared AS (
         SELECT src.month,
            src.month_date,
            src.account_id,
            src.cabinet,
            sum(src.commission) AS commission,
            sum(src.logistics) AS logistics,
            sum(src.promotion) AS promotion,
            sum(src.other) AS other,
            sum(src.compensation) AS compensation
           FROM src
          WHERE src.source_sku = '__SHARED__'::text
          GROUP BY src.month, src.month_date, src.account_id, src.cabinet
        ), weights AS (
         SELECT direct.month,
            direct.account_id,
            sum(GREATEST(direct.sale_units - direct.return_units, 0::numeric)) AS units_base,
            sum(GREATEST(direct.sales + direct.returns, 0::numeric)) AS sales_base
           FROM direct
          GROUP BY direct.month, direct.account_id
        ), f AS (
         SELECT d.month,
            d.month_date,
            d.cabinet,
            d.account_id,
            d.source_sku,
            d.product_name,
            d.sale_units,
            d.return_units,
            d.sales,
            d.returns,
            d.commission,
            d.logistics,
            d.promotion,
            d.other,
            d.compensation,
            d.canonical_sku,
            d.canonical_name,
            d.master_category,
            COALESCE(s.commission, 0::numeric) *
                CASE
                    WHEN w.sales_base > 0::numeric THEN GREATEST(d.sales + d.returns, 0::numeric) / w.sales_base
                    ELSE 0::numeric
                END AS allocated_commission,
            COALESCE(s.logistics, 0::numeric) *
                CASE
                    WHEN w.units_base > 0::numeric THEN GREATEST(d.sale_units - d.return_units, 0::numeric) / w.units_base
                    ELSE 0::numeric
                END AS allocated_logistics,
            COALESCE(s.promotion, 0::numeric) *
                CASE
                    WHEN w.sales_base > 0::numeric THEN GREATEST(d.sales + d.returns, 0::numeric) / w.sales_base
                    ELSE 0::numeric
                END AS allocated_promotion,
            COALESCE(s.other, 0::numeric) *
                CASE
                    WHEN w.sales_base > 0::numeric THEN GREATEST(d.sales + d.returns, 0::numeric) / w.sales_base
                    ELSE 0::numeric
                END AS allocated_other,
            COALESCE(s.compensation, 0::numeric) *
                CASE
                    WHEN w.sales_base > 0::numeric THEN GREATEST(d.sales + d.returns, 0::numeric) / w.sales_base
                    ELSE 0::numeric
                END AS allocated_compensation
           FROM direct d
             LEFT JOIN shared s USING (month, month_date, account_id, cabinet)
             LEFT JOIN weights w USING (month, account_id)
        )
 SELECT month_date AS month,
    month AS month_key,
    (((month || '|YANDEX|'::text) || cabinet) || '|'::text) || canonical_sku AS month_sku,
    'YANDEX'::text AS marketplace,
    account_id,
    cabinet,
    canonical_sku AS article,
    canonical_sku AS sku,
    canonical_name AS product_name,
    master_category,
    (sales) AS sales,
    (returns) AS returns,
    (sales + returns) AS net_sales,
    sale_units - return_units AS sold_units,
    sale_units - return_units AS economic_units,
    (commission) AS commission,
    (logistics) AS logistics,
    (allocated_logistics) AS allocated_logistics,
    0::numeric AS storage,
    0::numeric AS allocated_storage,
    (promotion) AS promotion,
    (allocated_promotion) AS allocated_promotion,
    (other) AS other,
    (allocated_other) AS allocated_other,
    (allocated_commission) AS allocated_commission,
    (compensation + allocated_compensation) AS net_compensation_amount,
    (compensation + allocated_compensation) AS preliminary_compensation,
    (sales + returns + commission + allocated_commission + logistics + allocated_logistics + promotion + allocated_promotion + other + allocated_other + compensation + allocated_compensation) AS final_with_compensation,
    false AS is_closed,
    now() AS updated_at
   FROM f;
