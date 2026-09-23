// Apply this to input fields that don't need a password manager (search, name, notes, etc.),
// so 1Password / LastPass / Bitwarden / Dashlane won't pop up fill suggestions here.
export const noAutofill = {
  autoComplete: 'off',
  'data-1p-ignore': true,
  'data-lpignore': 'true',
  'data-bwignore': true,
  'data-form-type': 'other',
} as const
