INSERT INTO user_notification_preferences (
    user_id,
    data_app_enabled,
    deal_notifications_enabled,
    vendor_notifications_enabled,
    analytics_enabled,
    data_app_status_filter,
    deal_type_filter,
    created_at,
    updated_at
)
SELECT
    id,
    true,
    true,
    false,
    false,
    ARRAY[]::text[],
    ARRAY[]::text[],
    now(),
    now()
FROM users
WHERE id NOT IN (SELECT user_id FROM user_notification_preferences);
