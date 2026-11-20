# Dependency review setup

The repository's Dependency Review action requires GitHub's dependency graph feature.

## Required repository setting

Before running the workflow, open **Settings → Code security and analysis** and enable **Dependency graph**. GitHub reported that dependency review is unsupported while this feature is disabled.

## Running the review

After enabling the dependency graph, open **Actions → Dependency Review → Run workflow**. The workflow fails when a proposed dependency change introduces a vulnerability rated High or Critical.

The workflow is currently manual (workflow_dispatch) so pull requests are not blocked by a repository-level prerequisite that has not yet been enabled.

## Lockfile requirement

The npm project should commit a generated package-lock.json and switch CI installation from npm install to npm ci only after the lockfile has been generated and validated against the complete dependency manifest. Do not hand-author or approximate a lockfile.
