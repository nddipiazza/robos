'use strict';
// Deterministic "AI" answer for Task Planner's Generate button.
// Mirrors the shape the real planner asks for: epics and tasks with acceptance
// criteria plus happy / negative / edge cases written into the markdown body.
function tasksFor(prompt) {
  if (/contract-check fails/i.test(String(prompt))) return followUp();
  return [
    {
      title: 'Search quality: filter by species and rank results',
      isEpic: true,
      epicName: 'Search quality',
      labels: ['epic', 'search'],
      issueType: 'epic',
      body: 'Adopters can narrow pet search to the species they want and see the best matches first.\n\n**Success:** fewer zero-result searches on the adoption site.',
    },
    {
      title: 'Add species filter and ranking to pet search',
      isEpic: false,
      parentEpicIndex: 0,
      labels: ['enhancement', 'search', 'role:backend-engineer'],
      issueType: 'task',
      body: [
        '`searchPets` only matches free text. Let callers narrow by species and return the most relevant pets first.',
        '',
        '**Acceptance criteria**',
        '- `searchPets(query, { species })` returns only pets of that species.',
        '- Exact and prefix matches rank above substring matches.',
        '- Unknown species are rejected with the list of valid choices.',
        '',
        '**Happy path:** `searchPets("", { species: "cat" })` returns Mochi and Pepper.',
        '**Negative:** `{ species: "dragon" }` throws `Unknown species "dragon"`.',
        '**Edge:** no matches returns `[]`; species is case-insensitive.',
      ].join('\n'),
    },
  ];
}
// Follow-up filed after the merge: CI on main reports the OpenAPI contract check failing.
function followUp() {
  return [{
    title: 'Document the species query parameter in the OpenAPI spec',
    isEpic: false,
    labels: ['bug', 'ci', 'role:backend-engineer'],
    issueType: 'bug',
    body: [
      'After merging the species filter, `contract-check` fails on `main`: `GET /pets` accepts `species`, but openapi.yaml does not describe it.',
      '',
      '**Acceptance criteria**',
      '- `openapi.yaml` documents `species` (enum: cat, dog, rabbit) on `GET /pets`.',
      '- `contract-check` passes on `main`.',
      '',
      '**Negative:** an unknown species is documented as a 400 response.',
      '**Edge:** omitting `species` keeps the existing behavior.',
    ].join('\n'),
  }];
}
module.exports = { tasksFor };
