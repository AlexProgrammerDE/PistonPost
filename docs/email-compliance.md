# Email compliance controls

This reference describes how PistonPost classifies email, applies user choices, and verifies the
production delivery path. It is an engineering control record, not a substitute for legal advice
about a particular campaign or jurisdiction.

## Message classification

| Message                                                             | Classification                       | Default                       | Opt-out mechanism                          | Sender                                         |
| ------------------------------------------------------------------- | ------------------------------------ | ----------------------------- | ------------------------------------------ | ---------------------------------------------- |
| Verification, sign-in, password, email change, and account security | Required account or security message | Required                      | None                                       | `auth@transactional.pistonmaster.net`          |
| Moderation action                                                   | Required service message             | Required                      | None                                       | `notifications@transactional.pistonmaster.net` |
| Comment notification                                                | Optional service notification        | On                            | Comment category link and one-click header | `notifications@transactional.pistonmaster.net` |
| Reply notification                                                  | Optional service notification        | On                            | Reply category link and one-click header   | `notifications@transactional.pistonmaster.net` |
| Product update                                                      | Optional commercial update           | Off until the user enables it | Product category link and one-click header | `updates@transactional.pistonmaster.net`       |

Required messages must not contain `List-Unsubscribe`, `List-Unsubscribe-Post`, or `List-ID`.
Optional messages must contain all three headers and a visible body link. Product updates must also
show the configured physical mailing address.

## Provider boundary

[Cloudflare Email Service currently supports transactional email, not marketing campaigns](https://developers.cloudflare.com/email-service/reference/faq/).
The product update tool may send factual changes to PistonPost only. Do not use it for promotions,
sales, sponsorships, or third-party advertising. Move commercial campaigns to a provider that
explicitly supports marketing email before sending that kind of content. The application still
treats product updates as commercial for consent, unsubscribe, sender separation, and postal-address
controls because that is the safer compliance boundary.

## Application controls

- Every optional message receives a signed token containing its user ID, exact email category,
  version, and expiry. The token contains no email address.
- The unsubscribe page uses `GET` only for confirmation. A person must activate the button before
  the setting changes.
- Mailbox providers use an RFC 8058 `POST` with
  `List-Unsubscribe=One-Click`. This endpoint does not require cookies, does not redirect, returns
  `204` when successful, and accepts repeated requests safely.
- Unsubscribe tokens remain valid for 180 days. `EMAIL_UNSUBSCRIBE_SECRET` can retain up to two old
  verification keys during rotation.
- Settings, email-link, and one-click changes all use the same preference repository. Email changes
  record the category, value, source, and time without storing a network address or user agent.
- Queue consumers reload the latest setting immediately before delivery. Product delivery requires
  an explicit `true`; a missing settings row never opts a user into product mail.
- Cloudflare automatically suppresses hard bounces, repeated soft bounces, and spam complaints. A
  provider `E_RECIPIENT_SUPPRESSED` response is terminal in PistonPost, so the Queue records the skip
  without retrying that address.
- Deleting an account cascades its preference history. A token for a deleted account returns success
  without recreating the account or settings.

The implementation follows [RFC 8058](https://www.rfc-editor.org/rfc/rfc8058), the
[Google email sender guidelines](https://support.google.com/a/answer/81126),
[Yahoo sender best practices](https://senders.yahooinc.com/best-practices/), and the
[FTC CAN-SPAM compliance guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business).

## Configure a deployment

Set these values before testing email:

- `AUTH_EMAIL_FROM`: required authentication and security sender.
- `NOTIFICATIONS_EMAIL_FROM`: service notification and moderation sender.
- `MARKETING_EMAIL_FROM`: product update sender.
- `SUPPORT_EMAIL`: monitored reply address.
- `MARKETING_POSTAL_ADDRESS`: real physical postal address shown in product updates.
- `EMAIL_UNSUBSCRIBE_SECRET`: signing key or JSON key ring.

A single signing key is valid:

```text
replace-with-at-least-32-random-characters
```

During rotation, place the new key in `current` and retain the old key in `previous`. New messages
use only `current`; unsubscribe requests try every listed key.

```json
{
  "current": "new-key-with-at-least-32-random-characters",
  "previous": ["old-key-with-at-least-32-random-characters"]
}
```

Keep an old key for at least 180 days after the last message it signed. Remove it only after that
window closes.

## Verify a production release

Use dedicated test accounts that can receive mail in Gmail and Yahoo. Complete this check after any
sender, DNS, template, header, token, or delivery-provider change.

1. Confirm SPF, DKIM, and DMARC pass for `transactional.pistonmaster.net`, and confirm Cloudflare
   allows all three configured sender addresses.
2. Confirm `MARKETING_POSTAL_ADDRESS` contains the current physical mailing address. Do not send a
   product campaign with a placeholder.
3. Send one required authentication message and one message from each optional category to the test
   accounts.
4. Inspect the raw source of each optional message. Confirm it contains:

   ```text
   List-Unsubscribe: <https://post.pistonmaster.net/email/unsubscribe?token=...>
   List-Unsubscribe-Post: List-Unsubscribe=One-Click
   List-ID: ...
   ```

   Confirm the DKIM signature covers the list headers. Confirm the required authentication message
   contains none of them.

5. Open each body link. Confirm the page does not change a preference on load, the button disables
   only the named category, and required messages remain enabled.
6. Copy an optional message's `List-Unsubscribe` URL and exercise the provider request directly:

   ```bash
   curl --include \
     --request POST \
     --header 'Content-Type: application/x-www-form-urlencoded' \
     --data 'List-Unsubscribe=One-Click' \
     'https://post.pistonmaster.net/email/unsubscribe?token=REDACTED'
   ```

   Expect `204 No Content`, no redirect, and `Cache-Control: private, no-store`. Repeat the request
   and expect the same result.

7. Confirm the setting is off and the preference history identifies `one-click`. Queue another
   message in that category and confirm delivery is skipped.
8. Confirm Gmail and Yahoo expose their native unsubscribe control for optional messages. Record the
   raw headers, mailbox result, tested commit, and date in the release evidence. Review queue
   dead-letter events and delivery failures before closing the check. Review the
   [Cloudflare suppression list](https://developers.cloudflare.com/email-service/concepts/suppressions/)
   monthly for bounce and complaint patterns.

Never paste live unsubscribe URLs into issue trackers or logs. They are bearer links tied to one
recipient and category.
