-- generated_media.source_media_id references generated_media (ON DELETE SET NULL). Without an index,
-- every media delete scans the whole table looking for rows that point at it.
CREATE INDEX generated_media_source_idx ON generated_media (source_media_id) WHERE source_media_id IS NOT NULL;
