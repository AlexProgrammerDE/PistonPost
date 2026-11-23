-- Concurrent report submissions could both pass the duplicate check and leave several open
-- reports from one reporter for the same target. The next migration adds a unique index for open
-- reports, so dismiss every duplicate except the earliest. Dismissed rows keep their evidence.
UPDATE `content_reports`
SET
  `status` = 'dismissed',
  `resolved_at` = CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  `updated_at` = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE `id` IN (
  SELECT `id`
  FROM (
    SELECT
      `id`,
      row_number() OVER (
        PARTITION BY `reporter_id`, `target_type`, `target_id`
        ORDER BY `created_at`, `id`
      ) AS `position`
    FROM `content_reports`
    WHERE `status` = 'open' AND `reporter_id` IS NOT NULL
  )
  WHERE `position` > 1
);
