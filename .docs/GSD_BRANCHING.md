# GSD Workflow Branching

By default, GSD executes all plans on the current branch. For stacked PRs:

1. **Configure branching in `.planning/config.json`:**
   ```json
   {
     "branching_strategy": "phase",
     "phase_branch_template": "feature/{issue}-plan-{phase}-{slug}"
   }
   ```

2. **Or create branches manually after execution:**
   ```bash
   # Create branch at each plan's completion commit
   git branch feature/plan-01-01 <commit-hash>
   git branch feature/plan-01-02 <commit-hash>
   ```

3. **Create stacked PRs:**
   - PR 1: plan-01-01 → main
   - PR 2: plan-01-02 → plan-01-01
   - PR 3: plan-01-03 → plan-01-02
   - Merge sequentially
