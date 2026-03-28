# NumNum Workout — Backlog

## Email Notifications
- **Automated review emails from Railway** — Railway blocks outbound SMTP (port 587 and 465). Options to resolve:
  - Switch to an HTTP-based email service (Resend, SendGrid, or Mailgun) — these use HTTPS which Railway allows
  - Use Gmail API with OAuth credentials instead of SMTP
  - Note: The cron endpoints work fine (`/api/admin/cron/daily-reviews`, `/api/admin/cron/weekly-reviews`), reviews generate and save correctly — only the email sending fails
  - Test endpoints available: `/api/admin/cron/test` (config check), `/api/admin/cron/test-email` (SMTP test), `&dry_run=true` on daily reviews
  - cron-job.org is set up to call the endpoints on schedule

## Future Features
- _(add items here)_

## Tech Debt
- `cron_runner.py` in repo root can be deleted (was for Railway cron service approach, not needed with cron-job.org)
