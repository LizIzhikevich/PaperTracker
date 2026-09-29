# PaperTracker Roadmap

This roadmap translates the Catalyst Teaching Grant proposal into implementation tasks for PaperTracker. It is organized as GitHub-milestone-ready work so items can be converted into issues or moved into a GitHub Project board.

## Milestone 1: Summer 2026 Prototype

Goal: deliver a local-first desktop prototype for uploading, storing, organizing, and revisiting academic papers.

- [ ] Add URL and DOI paper capture
  - Support adding papers by URL and DOI in addition to local PDFs.
  - Resolve metadata where possible: title, authors, venue/year, abstract, and PDF URL.
  - Preserve the original URL/DOI even when metadata extraction fails.

- [ ] Harden local-first paper storage
  - Make local data and PDF storage locations visible in settings.
  - Add export/import backup support for the local library.
  - Document what is stored locally and what is never transmitted.

- [ ] Improve metadata extraction quality
  - Refine title, author, institution, abstract, venue, and year parsing.
  - Add manual re-run metadata extraction for an existing paper.
  - Show confidence/fallback states when fields are uncertain.

- [ ] Build deadline-aware reading queue
  - Let papers have due dates, reading status, and high-priority flags.
  - Surface recommended next reading based first on due date, then queue order.
  - Keep the queue local and binder-aware.

- [ ] Add self-reported time-to-read tracking
  - Let students log reading sessions and estimated reading time.
  - Track total time spent per paper and per binder.
  - Include time data in progress views without making it feel punitive.

- [ ] Support structured typed notes
  - Keep notes editable per paper.
  - Add lightweight note prompts.
  - Preserve notes in local search.

- [ ] Add C.R.E.A.T.E.S.-compatible reading workflow
  - Add structured fields/prompts aligned with the UCLA Library C.R.E.A.T.E.S. methodology.
  - Let instructors enable/disable the workflow per course or binder.
  - Keep prompts student-authored rather than LLM-generated.

- [ ] Package for macOS and Windows
  - Add build scripts for distributable desktop apps.
  - Verify local storage paths and file opening behavior on both platforms.
  - Document installation and update flow.

## Milestone 2: Fall 2026 Beta

Goal: validate offline behavior, usability, instrumentation, and initial LLM-powered retrieval/recommendations before classroom deployment.

- [ ] Add semantic search over PDFs and notes
  - Index paper text, abstracts, metadata, and student notes.
  - Support natural-language search across the local library.
  - Return paper matches with relevant passages or note snippets.

- [ ] Add question-driven retrieval
  - Let students ask questions like “Which readings assumed X?” or “What evidence supported Y?”
  - Retrieve relevant passages and notes without generating replacement summaries.
  - Clearly separate retrieved evidence from any generated explanation.

- [ ] Add local LLM / embedding backend support
  - Prefer local or user-controlled inference.
  - Avoid sending PDFs, notes, or student data to third-party services by default.
  - Add explicit opt-in if any external API is ever supported.

- [ ] Build citation/reference insight feature
  - Extract references from papers where possible.
  - Identify prior works repeatedly cited across a binder or course reading set.
  - Recommend dominant/foundational references as suggested earlier readings.

- [ ] Add topic-relevance recommendations
  - Recommend related papers from the student’s library.
  - Explain why a paper is recommended using metadata, citations, notes, or topic similarity.
  - Keep recommendations transparent and dismissible.

- [ ] Add beta instrumentation controls
  - Track local engagement metrics needed for evaluation: pacing, completion, notes, revisits, and retrieval usage.
  - Make instrumentation inspectable and privacy-preserving.
  - Add a setting to disable optional instrumentation.

- [ ] Run usability beta checklist
  - Test first-run onboarding.
  - Test offline usage.
  - Test PDF import, search, note-taking, and queue flows.
  - Collect feedback on confusing UI states.

## Milestone 3: Winter 2027 Graduate Course Pilot

Goal: deploy PaperTracker in ECE239AS with a smaller graduate cohort and use feedback to refine onboarding and workflow.

- [ ] Add course/binder setup flow
  - Let an instructor or student create a course binder with readings and deadlines.
  - Support starter reading lists.
  - Keep course setup local or user-controlled.

- [ ] Build onboarding for course-paced reading
  - Explain how to add papers, track status, log time, write notes, and search later.
  - Include privacy/local-storage explanation.
  - Include a short “first paper” walkthrough.

- [ ] Add instructor playbook draft
  - Document suggested reading assignments.
  - Document how to introduce the app in class.
  - Include language for privacy and student expectations.

- [ ] Add feedback collection hooks
  - Add links or prompts for pulse surveys and end-of-course surveys.
  - Keep survey participation separate from private reading data.
  - Support IRB-approved language/configuration when ready.

- [ ] Refine based on graduate pilot feedback
  - Triage usability issues.
  - Improve reading queue and notes workflows.
  - Identify which features should be simplified before the undergraduate pilot.

## Milestone 4: Spring 2027 Undergraduate Course Pilot

Goal: scale PaperTracker to ECE132B with a larger undergraduate cohort that includes first-time paper readers.

- [ ] Improve beginner-friendly paper reading UX
  - Add clearer empty states and guidance.
  - Add “what to do next” prompts for first-time readers.
  - Reduce jargon in onboarding and labels.

- [ ] Support TA-assisted deployment
  - Document install/troubleshooting steps for TAs.
  - Add a quick diagnostic screen for local storage, app version, and import status.
  - Prepare a standard support checklist.

- [ ] Add scalable reading progress views
  - Show progress by binder/course.
  - Show reading streaks or activity heatmaps.
  - Avoid leaderboard-style comparisons unless explicitly desired.

- [ ] Validate undergraduate workflow at scale
  - Test reading deadlines and completion patterns.
  - Test notes persistence and revisit behavior.
  - Test retrieval/query usage under course load.

## Milestone 5: Evaluation and Research Output

Goal: support IRB-approved mixed-methods evaluation and prepare results for a computing education publication.

- [ ] Define evaluation data schema
  - Track pacing relative to deadlines, completion, self-reported reading time, note-taking frequency, note reuse, revisits, and retrieval usage.
  - Store data locally or under explicit user/instructor control.
  - Keep personally identifiable or academic data out of telemetry by default.

- [ ] Add anonymized export for approved studies
  - Export engagement summaries suitable for IRB-approved analysis.
  - Include a data dictionary.
  - Avoid exporting paper text, private notes, or identifiers unless explicitly configured.

- [ ] Add survey integration plan
  - Document pulse survey and end-of-course survey timing.
  - Link survey questions to learning outcomes.
  - Keep survey collection outside the app unless approved.

- [ ] Create analysis notebooks/scripts
  - Analyze note frequency, revisit behavior, retrieval usage, and reading completion.
  - Support comparison across graduate and undergraduate deployments.
  - Produce figures/tables for reporting.

- [ ] Draft computing education paper outline
  - Frame PaperTracker as a course-embedded research literacy tool.
  - Connect findings to ERG literature, Bloom’s taxonomy, and research pipeline support.
  - Target ICER/SIGCSE-style contribution.

## Milestone 6: Year 2 Scale-Up

Goal: prepare PaperTracker for additional UCLA courses and eventual use beyond UCLA.

- [ ] Generalize course configuration
  - Make course/binder setup reusable across instructors and departments.
  - Support course templates.
  - Support import/export of reading lists.

- [ ] Improve multi-course library organization
  - Let students separate, archive, and search across course contexts.
  - Support “lifelong library” behavior beyond one quarter.
  - Preserve student ownership over local data.

- [ ] Prepare open-source contributor documentation
  - Add development setup instructions.
  - Add architecture notes.
  - Add contribution guidelines and issue labels.

- [ ] Expand deployment documentation
  - Write an instructor playbook.
  - Write a student quick-start guide.
  - Document privacy and data ownership in plain language.

