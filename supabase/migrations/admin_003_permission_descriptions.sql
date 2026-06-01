-- Stone Harbor Admin — admin_permissions.description
--
-- Adds a short plain-English explanation to each permission so
-- the /admins/groups checkbox UI can show "what does this do?"
-- under the label. Without this column, every checkbox in the
-- group editor relies on the admin already knowing what e.g.
-- "manage_blog" or "system_settings" actually authorizes — fine
-- for the founder, bad for any future delegated admin.
--
-- NOT NULL with a fallback default so future seed rows never
-- ship blank. Backfills every existing row in the same migration
-- to keep the change atomic.

alter table public.admin_permissions
  add column if not exists description text not null default '';

update public.admin_permissions set description = case key
  when 'manage_blog'      then 'Publish, unpublish, and edit blog posts. Generators and AI drafts also live here.'
  when 'manage_external'  then 'Approve or reject external links suggested for the resources library.'
  when 'moderate_content' then 'Review reports, issue warnings, and suspend member accounts.'
  when 'view_analytics'   then 'See site-wide analytics: traffic, retention, AI cost, Eidos completions.'
  when 'view_blog'        then 'Read the blog drafts queue without being able to publish.'
  when 'view_dashboard'   then 'Access the main admin home (calendar, alerts, activity).'
  when 'view_external'    then 'Read the external content queue without being able to approve.'
  when 'view_members'     then 'Access member directory and individual member profiles.'
  when 'view_moderation'  then 'Read the moderation queue without being able to take action.'
  when 'view_tests'       then 'See test run results and history.'
  when 'manage_admins'    then 'Invite admins, change groups, manage permissions. The keys to the kingdom.'
  when 'system_settings'  then 'Toggle registration, About-page publish, and other site-wide switches.'
  when 'run_tests'        then 'Trigger test suite runs from the admin console.'
  else description
end
where description = '' or description is null;

-- Drop the empty-string default once existing rows are filled.
-- New rows must specify a description explicitly so we don't
-- regress on documentation quality.
alter table public.admin_permissions
  alter column description drop default;
