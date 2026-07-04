# PeakStreak — Success-Metric Queries (PS-14)

Events land in the `events` table (`name`, `user_id`, `properties` jsonb,
`created_at`). Payloads carry ids only — no PII beyond the user id.

Instrumented events and where they fire:

| Event | Fires in |
|---|---|
| `signup` | credentials signup action / Auth.js `createUser` (Google) |
| `session_started` | JWT callback, once per sign-in |
| `playlist_pasted` | `/api/playlists/preview` success (userId null when anonymous) |
| `playlist_enrolled` | `enrollInPlaylist` action |
| `video_completed` | `recordCompletion` (auto + manual paths) |
| `streak_extended` | `recordCompletion`, first completion of the local day |
| `streak_frozen` | streak maintenance, freeze consumed |
| `streak_reset` | streak maintenance, live streak died with no freeze left |
| `note_created` | first non-empty save of a (user, video) note |
| `reminder_sent` | reminder sweep after the email_log claim |
| `reminder_opened` | Resend webhook `email.opened` |
| `playlist_completed` | `recordCompletion`, final video |

## Activation rate — % of signups who paste a playlist in their first session

```sql
with signups as (
  select user_id, created_at from events where name = 'signup'
)
select
  count(*) filter (where p.user_id is not null)::float / nullif(count(*), 0) as activation_rate
from signups s
left join lateral (
  select user_id from events p
  where p.name = 'playlist_pasted' and p.user_id = s.user_id
    and p.created_at between s.created_at and s.created_at + interval '1 hour'
  limit 1
) p on true;
```

## D7 retention — % of signups with a session on day 7 (±1 day)

```sql
with signups as (select user_id, created_at from events where name = 'signup')
select
  count(distinct s.user_id) filter (
    where exists (
      select 1 from events e
      where e.user_id = s.user_id and e.name = 'session_started'
        and e.created_at between s.created_at + interval '6 days'
                             and s.created_at + interval '8 days'
    )
  )::float / nullif(count(distinct s.user_id), 0) as d7_retention
from signups s
where s.created_at < now() - interval '8 days';
```

## % of users with a streak ≥ 3

Streaks are derived from `daily_activity` (a frozen day counts):

```sql
with runs as (
  select user_id, activity_date,
    activity_date - (row_number() over (partition by user_id order by activity_date))::int as grp
  from daily_activity
  where videos_completed >= 1 or is_frozen
)
select count(distinct user_id) filter (where len >= 3)::float
     / nullif((select count(*) from users), 0) as pct_streak_3plus
from (select user_id, grp, count(*) as len from runs group by 1, 2) t;
```

## Email open rate

```sql
select count(opened_at)::float / nullif(count(*), 0) as open_rate
from email_log where type = 'daily_reminder';
```

## Streak-save rate — session within 2h of a reminder

```sql
select
  count(*) filter (where saved)::float / nullif(count(*), 0) as streak_save_rate
from (
  select exists (
    select 1 from events e
    where e.user_id = l.user_id and e.name = 'session_started'
      and e.created_at between l.sent_at and l.sent_at + interval '2 hours'
  ) as saved
  from email_log l where l.type = 'daily_reminder'
) t;
```

## Playlist completion rate

```sql
select count(*) filter (where status = 'completed')::float
     / nullif(count(*), 0) as completion_rate
from user_playlists;
```

## Notes per active user

```sql
select count(*)::float / nullif(count(distinct user_id), 0) as notes_per_active_user
from notes where content <> '';
```
