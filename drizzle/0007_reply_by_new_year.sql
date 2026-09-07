INSERT INTO `wedding_settings` (`id`, `rsvp_deadline`) VALUES (1, '2026-12-31')
ON CONFLICT(`id`) DO UPDATE SET `rsvp_deadline` = '2026-12-31', `updated_at` = CURRENT_TIMESTAMP;
