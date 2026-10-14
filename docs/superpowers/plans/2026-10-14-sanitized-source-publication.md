# Sanitized Source Publication Implementation Plan

> **For agentic workers:** Use inline execution for this user-authorized copy-and-publish task. Perform every mutation in this independent copy. Do not dispatch agents or modify the original project.

**Goal:** Publish a complete, sanitized source repository without changing the original source, configuration, history, or deployed website.

**Architecture:** Copy every project file and verify SHA-256 hashes before editing. Sanitize identifying deployment values, isolate non-source artifacts according to the user's decision, and verify the exact Git index and commit before uploading anything.

**Tech Stack:** Python, PowerShell, Git, existing JavaScript and Python validation commands.

**Spec:** User request to copy the entire project, sanitize sensitive information, update Git ignore rules, document replacements, and publish a first GitHub commit.

## Global Constraints

- Do not edit the original project or its Git metadata.
- Do not run deployment commands or change the live website.
- Preserve business behavior and all business source versions.
- Do not publish raw credentials, personally identifying values, logs, databases, private keys, or certificates.
- Use consistent `YOUR_*` placeholders for actual identifying configuration values.
- Use only repository-local Git author settings approved by the user.
- Confirm GitHub owner, name, visibility, history, author and ambiguous test-data boundaries before publishing.

### Task 1: Independent copy and inventory

- [x] Snapshot original files and Git metadata into a private audit directory outside the copy.
- [x] Copy the full project and compare every file hash.
- [x] Restrict access to the new copy and audit directory to the local owner and system.
- [x] Scan text, archive inventories and binary file types without printing secret values.
- [x] Ask all repository and uncertain-data questions in one batch.

### Task 2: Sanitization and documentation

**Files:** Existing source, deployment scripts, documentation, test fixtures, `.gitignore`; create `README.md` and `SANITIZATION-REPORT.md`.

- [x] Expand `.gitignore` to exclude secrets, dependencies, generated files, diagnostics and private editor settings.
- [x] Replace real deployment hosts, personal addresses, credentials and absolute user paths using consistent placeholders.
- [x] Keep verified non-sensitive synthetic fixtures; exclude uncertain artifacts from the public index without deleting local files.
- [x] Write a report listing original relative file paths, line numbers, replacement labels and reasons; never include original secret values.
- [x] Write a sanitized README with architecture, installation, build, test and configuration instructions.

### Task 3: Validation and first commit

- [x] Run `node --check update-v4/site/app.js` and Python source compilation without writing into the original.
- [x] Run relevant existing frontend and API tests from the copy.
- [ ] Scan all files selected by `git ls-files` and verify no forbidden artifacts or actual identifying values remain.
- [ ] Initialize an independent repository using the approved author identity and create the first commit.
- [ ] Compare the original files and Git metadata against the original snapshot.

### Task 4: GitHub publication

- [ ] Create or use only the owner/name and visibility approved by the user.
- [ ] Push the sanitized commit using an approved authenticated connection; never expose credentials.
- [ ] Verify repository visibility and remote commit/tree against the local commit/tree.
- [ ] Report the new project directory, repository URL, checks and replacement report.
