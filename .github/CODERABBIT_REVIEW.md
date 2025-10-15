# Triggering CodeRabbit Full Review

## Automated Method (Recommended)

This repository includes a GitHub Actions workflow to programmatically trigger CodeRabbit full reviews.

### Usage

1. Go to the [Actions tab](../../actions/workflows/trigger-coderabbit-review.yml)
2. Click "Run workflow"
3. Enter the PR number (default is 23)
4. Click the green "Run workflow" button

The workflow will automatically add a comment `@coderabbitai full review` to the specified PR, triggering CodeRabbit to perform a full code review.

## Manual Method

If you prefer to trigger the review manually:

1. Go to the PR page (e.g., PR #23)
2. Add a comment with one of these commands:
   - `@coderabbitai full review` - Triggers a comprehensive full review
   - `@coderabbitai review` - Triggers a standard review

## Background

CodeRabbit may skip automatic reviews when it detects bot users (like GitHub Copilot). In such cases, a manual trigger is required to initiate the code review process.

## Reference

- CodeRabbit Documentation: https://docs.coderabbit.ai/
- Available Commands: https://docs.coderabbit.ai/faq
