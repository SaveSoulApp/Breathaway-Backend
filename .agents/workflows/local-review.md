# Local AI Review Workflow

**Description**: Automates the code review process locally by calling Gemini 3.1 Flash Lite via a script before committing.

## Constraints
- **MAXIMUM ITERATIONS: 3**. To prevent infinite loops and excessive API costs, do not run this review script more than 3 times for a single task. If the code still has issues after 3 back-and-forth review cycles, stop, present the current state to the user, and ask for manual intervention.

## Steps

1.  **Check for changes**: Before running a review, ensure there are actually uncommitted or staged changes. You can run `git status` or `git diff` to verify.
2.  **Run the script**: Execute the local review script:
    ```bash
    .agents/scripts/run-flash-lite-review.sh
    ```
    *Note: If you get a permission denied error, run `chmod +x .agents/scripts/run-flash-lite-review.sh` first. This script requires `GEMINI_API_KEY` to be present in the `.env` file (or exported in the environment).*
3.  **Read the feedback**: The script will output the review results to a file named `review.md` in the current directory. Read the contents of this file.
4.  **Iterate and Fix**: Address the feedback and suggestions mentioned in `review.md` by applying the necessary edits to the codebase. Ensure you follow all NestJS and project guidelines while fixing.
5.  **Cleanup**: Delete the `review.md` file once you are done processing it.
6.  **Summarize**: Present the changes you made based on the Flash Lite review to the user. Ask if they are ready to proceed with a commit.
