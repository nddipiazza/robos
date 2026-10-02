# RobOS Preferences

## GitHub accounts

Open **GitHub accounts** to choose a saved account for each connection:

- **Git client** selects the active GitHub CLI account. Git Projects, GitHub task
  servers configured to use Git client authentication, and PR Reviewer share it.
  Git over HTTPS follows the configured credential helper. SSH keys and
  repository-specific credential helpers retain their own configuration.
- **Copilot AI agent** selects the account for new Copilot terminal sessions,
  agent requests, status checks, and model discovery. The credential is supplied
  only through Copilot's process environment; it does not change the Git client
  account. Existing sessions keep the account they started with.

Use **Save accounts** (or **Save All**) to validate Copilot access and save both
selections. **Add GitHub account** opens GitHub CLI's existing login flow and
restores the previously selected Git client account when it finishes. Refresh
accounts after completing sign-in.

RobOS stores only account names in `~/.config/robos/github-accounts.json`.
Credentials remain in GitHub CLI's existing credential store. A missing or
unavailable Copilot selection is reported as an error; RobOS does not substitute
another account. The selectors currently cover accounts on github.com.
