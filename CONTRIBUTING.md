# PicApp Contribution Guidelines

Welcome to the PicApp repository! To keep our codebase clean and avoid overwriting each other's work, please follow these core guidelines.

## 1. Branching Strategy (GitFlow)
* **`main`**: Production-ready code only. **Never push directly to main.**
* **`develop`**: Our active integration branch. All new work merges here first.
* **Feature Branches**: Create a new branch for every task or feature.
  * Naming format: `feature/short-description` (e.g., `feature/login-ui`, `feature/db-schema`)
  * Always branch off of `develop`. In GitHub Desktop, ensure your current branch is `develop` before clicking "New Branch".

## 2. Monorepo Workflow
Since we have a unified repository:
* **Frontend**: All Next.js and React work happens exclusively inside the `/frontend` directory.
* **Backend**: All Python and FastAPI work happens exclusively inside the `/backend` directory.

## 3. Commit Guidelines
* Commit your work frequently to avoid losing progress.
* Write clear, brief commit messages in GitHub Desktop (e.g., "Add user registration endpoint" or "Update sidebar navigation").

## 4. Pull Requests (PRs) & Code Review
1. When your feature is complete, publish your branch to GitHub.
2. Go to the GitHub website and open a **Pull Request (PR)** to merge your feature branch into `develop`.
3. Do not merge your own PR immediately. Have your partner briefly review the code.
4. Once reviewed and approved, merge the PR into `develop` and delete the feature branch.