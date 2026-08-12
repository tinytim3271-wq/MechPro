-- Emits the schema as JSON so aws/runtime/schema.ts is generated from the real
-- database rather than hand-maintained. Regenerate whenever schema.sql changes.
SELECT json_object_agg(t.table_name, t.cols ORDER BY t.table_name)
FROM (
  SELECT
    c.table_name,
    json_object_agg(
      c.column_name,
      json_build_object(
        'type', c.data_type,
        'nullable', (c.is_nullable = 'YES')
      )
      ORDER BY c.ordinal_position
    ) AS cols
  FROM information_schema.columns c
  JOIN information_schema.tables tb
    ON tb.table_schema = c.table_schema
   AND tb.table_name = c.table_name
   AND tb.table_type = 'BASE TABLE'
  WHERE c.table_schema = 'public'
  GROUP BY c.table_name
) t;
