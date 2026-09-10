-- Set all users to online for testing
UPDATE users SET is_online = true WHERE profile_complete = true;
