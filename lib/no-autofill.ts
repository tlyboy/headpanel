// 展开到不需要密码管理器的输入框上（搜索、名称、备注等），
// 让 1Password / LastPass / Bitwarden / Dashlane 不在这里弹出填充建议。
export const noAutofill = {
  autoComplete: 'off',
  'data-1p-ignore': true,
  'data-lpignore': 'true',
  'data-bwignore': true,
  'data-form-type': 'other',
} as const
