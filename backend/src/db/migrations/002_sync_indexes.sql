-- GET /v1/sync reads each table by (shop_id, rev > cursor): give every synced
-- table an index for it (messages and alerts already have one).
CREATE INDEX catalog_items_shop_rev ON catalog_items (shop_id, rev);
CREATE INDEX learned_answers_shop_rev ON learned_answers (shop_id, rev);
CREATE INDEX conversations_shop_rev ON conversations (shop_id, rev);

-- The reply job looks for the customer messages not answered yet.
CREATE INDEX messages_conversation_role_created ON messages (conversation_id, role, created_at);
