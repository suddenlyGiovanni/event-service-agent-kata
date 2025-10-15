# How to Trigger CodeRabbit Full Review for PR #23

## Quick Start

This branch (`copilot/full-review-pr-23`) contains a GitHub Actions workflow that enables triggering CodeRabbit full reviews programmatically.

### To Trigger the Review for PR #23:

1. **Automated Method (Recommended):**
   - Go to the [Actions tab](../../actions/workflows/trigger-coderabbit-review.yml) in the repository
   - Select the "Trigger CodeRabbit Full Review" workflow
   - Click "Run workflow"
   - Confirm PR number is 23 (default)
   - Click the green "Run workflow" button
   
   The workflow will automatically comment `@coderabbitai full review` on PR #23.

2. **Manual Method:**
   - Go to [PR #23](../../pull/23)
   - Add a comment: `@coderabbitai full review`

## What Was Done

This branch adds:

1. **GitHub Actions Workflow** (`.github/workflows/trigger-coderabbit-review.yml`)
   - Manually dispatchable workflow
   - Uses `actions/github-script` to create PR comments
   - Can be used for any PR by changing the input number

2. **Documentation** (`.github/CODERABBIT_REVIEW.md`)
   - Comprehensive guide for triggering reviews
   - Explains both automated and manual methods

3. **Trigger File** (`.coderabbit.trigger`)
   - Documents the request with context

4. **Updated .gitignore**
   - Removed `.github/` exclusion to allow workflow versioning

## Why This Was Needed

CodeRabbit initially skipped the automatic review of PR #23 because it detected a bot user (GitHub Copilot). The bot indicated:

> **Review skipped** - Bot user detected. To trigger a single review, invoke the `@coderabbitai review` command.

This solution provides a programmatic way to trigger the review without manual intervention.

## Next Steps

1. Merge or cherry-pick this branch to enable the workflow in the main repository
2. Run the workflow from the Actions tab to trigger the review on PR #23
3. The workflow can be reused for any future PR requiring manual review triggers

## References

- [CodeRabbit Documentation](https://docs.coderabbit.ai/)
- [CodeRabbit FAQs](https://docs.coderabbit.ai/faq)
- [PR #23](../../pull/23) - The PR to be reviewed
