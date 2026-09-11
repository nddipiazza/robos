# Retired graph-viewer demos

The graph viewer no longer exposes the Traceability, Autonomous EDD, Local Test
Fabric, Video Walkthrough or GitOps object panels. These panels showed canned
examples unrelated to the selected graph node. The following demo entry points
are retained only to explain retirement to old commands and bookmarks; they exit
with status 1 without launching Electron or producing a recording:

- `gherkin-linker-demo.js`
- `edd-runner-demo.js`
- `test-fabric-demo.js`
- `video-generator-demo.js`
- `gitops-schema-demo.js`

Historical screenshots and recordings of those panels are not evidence of the
current viewer or of live execution. Do not run these entries to regenerate them.

The backend tests remain available under `tests/sdlc-graph/` with the same names
and the `.test.js` suffix. `elearning-doc-sync.test.js` also retains catalog and
file-generation checks. The Gherkin, EDD and eLearning GUI cases now assert that
removed tabs are absent from the DOM and that legacy `switchTab` requests return
to Overview. They do not skip those checks or substitute canned success text.

Run the suites inside the repository Docker/Xvfb environment, in a disposable
checkout and HOME: legacy catalog tests write `.robos/elearning.yaml` relative to
both their working directory and HOME. Never run them against a shared checkout
without isolating or preserving those outputs. Backend sample fixtures verify
library behavior; they are not production execution or deployment evidence.
