UPDATE `account`
SET
  `issuer` = 'local:credential',
  `account_id` = `user_id`
WHERE `provider_id` = 'credential';
