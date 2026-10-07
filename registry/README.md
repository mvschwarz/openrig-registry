# Registry

Each file here lists one rig bundle on openrig.dev/rigs. An entry records exactly what a maintainer reviewed:

- the source repository and folder, at a full 40-character commit (and the branch or tag it was submitted as);
- each offered configuration, with its package digest, the OpenRig version that built it, and its generated
  behaviour view (under `views/`);
- the review date, and whether it's `listed` or `withdrawn`.

Format: `registry-entry.v1` in the OpenRig repository's `docs/reference/bundle-formats.md`.

The site shows only `listed` entries, at their recorded commit. A later push to the bundle's branch changes nothing
here until an update is reviewed and merged. A withdrawn entry leaves the lists, but keeps its detail page with the withdrawal date.
The generated `status/status.json` includes every registry entry, including withdrawn entries, so the site can
discover those pages. Submissions are not included.

Every listing carries the line: "Reviewed for listing on <date> at commit <short>. Review is not a security audit."

The registry check (`tools/registry-check.mjs`) runs on every pull request. It rejects entries that don't match the
format, commits that aren't 40 hex characters, configuration IDs that aren't canonical, behaviour views that are
missing or describe another package, and a status file that was edited by hand.

## Submitting a rig

Add `registry/submissions/<your-team>.yaml` with three fields (see `submissions/README.md`): your repository, the
folder holding `rig.yaml`, and a branch, tag or commit. The registry check accepts it and says "Submission received".
The separate bundle check fetches the submitted revision and reports its `rig bundle check` results without
installing or launching it. A maintainer then writes the full entry here, at a pinned commit, and removes the
submission. A submission is never listed: the site and the status file read only the entries in this folder.
