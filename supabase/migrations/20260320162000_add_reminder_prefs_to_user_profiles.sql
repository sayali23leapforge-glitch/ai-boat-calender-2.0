/*
  # Add reminder memory to user profiles

  The adaptive reminder classifier stores user feedback in `reminder_prefs`.
  This adds the column to `user_profiles`, which is the active profile table
  in this project.
*/

alter table public.user_profiles
  add column if not exists reminder_prefs text default '';
