-- Emits index name -> ordered column list as JSON.
-- The runtime needs this to reproduce Convex's ORDER BY semantics: a Convex
-- query ordered by an index sorts by that index's fields in declaration order,
-- with _creationTime as the final tiebreaker.
SELECT json_object_agg(i.indexname, i.cols ORDER BY i.indexname)
FROM (
  SELECT
    ci.relname AS indexname,
    json_agg(a.attname ORDER BY k.ord) AS cols
  FROM pg_index x
  JOIN pg_class ci ON ci.oid = x.indexrelid
  JOIN pg_class ct ON ct.oid = x.indrelid
  JOIN pg_namespace n ON n.oid = ct.relnamespace
  CROSS JOIN LATERAL unnest(x.indkey) WITH ORDINALITY AS k(attnum, ord)
  JOIN pg_attribute a ON a.attrelid = ct.oid AND a.attnum = k.attnum
  WHERE n.nspname = 'public'
    AND NOT x.indisprimary
  GROUP BY ci.relname
) i;
