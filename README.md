# OpenRig rig catalog

Reviewed rig listings, submission requests, before-install diagrams and public status for
[openrig.dev/rigs](https://openrig.dev/rigs).

The bundles stay in their authors' repositories. This repository records reviewed commits and generated views;
it does not host or launch the bundles. OpenRig's workshop and factory-rsi sources stay in
[openrig-world/rigs](https://github.com/mvschwarz/openrig-world/tree/main/rigs).

- [Submit a rig](registry/submissions/README.md): add one YAML file with its repository, folder and ref.
- [Registry entries](registry/README.md): reviewed pins, configurations, digests and diagrams.
- [Checks and status generation](tools/README.md): local validation and evidence-based status.

A listing means its pinned content was reviewed for listing. It is not a security audit and does not mean
OpenRig ran or tested the team. The status data says what was tested separately.

## Workshop compatibility with OpenRig 0.6.6

This repository is the canonical registry. OpenRig 0.6.6's operator still reads the raw
`openrig-world/registry/workshop.yaml` URL. That one file remains as a compatibility mirror; it is not a second
catalog. New submissions, entries, diagrams and status changes belong here.

When changing the workshop pin, prepare paired pull requests here and in openrig-world. Copy the complete
canonical entry to the old location, review both, and merge both before announcing the new pin:

```sh
cp registry/workshop.yaml ../openrig-world/registry/workshop.yaml
cmp registry/workshop.yaml ../openrig-world/registry/workshop.yaml
```

Keep `source.repository` and `source.folder` pointing at the bundle in openrig-world. The mirror supplies the
source commit and configurations to older operators; diagram files are served from this registry. Preserve the
mirror while 0.6.6 installs still use it. A pin may require the existing two-step sequence: merge bundle source
first, then review the registry entry for that resulting commit. These steps make no automated cross-repository
writes.

## Check a change

```sh
cd tools
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run check
```

CI runs these checks on pull requests and pushes to main. A separate **Bundle and installed-name check** job fetches
each submission's source and runs the pinned OpenRig validator. It also compares installed names with the pinned
listed entries and reports clashes to the maintainer without failing the job. Its PR annotation and job summary show
the exact commit and results. Submitted bundles are not installed or launched. Status is generated from run records;
it is not edited by hand.

## License

[Apache-2.0](LICENSE), retained from openrig-world.
