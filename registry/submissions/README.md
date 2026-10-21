# Submissions

To submit a rig bundle for openrig.dev/rigs, open a pull request that adds one file here, `<your-team>.yaml`, with
exactly these three fields. The repository must be public on GitHub, because the check fetches your ref from it: a local-only or
private repository can't be checked, so push your team to a public repository first.

```yaml
repository: https://github.com/<owner>/<repo>
folder: rigs/my-team   # the folder holding rig.yaml; "." for the repository root
ref: main              # a branch, tag or commit
```

On your first pull request here, GitHub waits for a maintainer to approve the checks before they run; that's normal, and a
maintainer starts them. The registry check accepts it and says "Submission received". The **Bundle and installed-name check** job then fetches that
ref and runs `rig bundle check` using the latest published OpenRig (`@openrig/cli@latest`; the job prints the version it used). Its PR annotation and job summary show the resolved commit,
findings and checks left unverified. Bundle-validation findings or an unreadable source fail the check. To fix one, push the fix
to your own repository, set `ref` in your submission file to that new full commit SHA, and push it to your pull request; the
check runs again on the new commit (a maintainer may need to approve it again). The job does not install
dependencies from the bundle, run its scripts, or launch its team. To check before submitting, run
`rig bundle check <folder>` locally with a current OpenRig.

The installed `name` in `rig.yaml` should differ from every listed team's; the check reports a clash to the maintainer
as a notice without failing the job.

A maintainer then pins your link to an exact commit, reviews the bundle, writes the full entry in `registry/`, and
removes this file. If it isn't listed, you get a short reply saying why.

Listing slugs on openrig.dev/rigs are unique. If `registry/<your-team>.yaml` already exists, the check still passes but
says the name is taken; rename your file to a distinct one, for example `<taken-name>-<your-name>.yaml`.
