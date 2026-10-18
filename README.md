SynapseOS is a cited evidence chat over your work tools. It pulls commits, pull requests, tickets, chat messages and documents into one evidence store, then answers questions with every statement linked to a source item and checked by code. It serves two uses from the same store: an employee preparing a performance review or update, and a manager looking up team status.

Built on Gemini via Vertex AI and deployed on Cloud Run.

## What it does

- **Connectors, not pasting.** GitHub is live through the REST API (public repo, or a personal access token). Jira is live with an API token, or accepts a CSV or JSON export. Slack takes a channel export upload (day JSON files plus users.json). Documents take .txt, .md or .pdf (PDF via Gemini). Each item is normalised to `{id, source, type, date, author, title, text, url, project, status}`. A people list maps GitHub logins, Jira names and Slack names to one person.
- **Chat.** Ask "What did I ship on payments in the last 6 months?" or "What is blocking the usage export?". The flow is: Gemini extracts filters from the question (period, source, project), the store filters by metadata and person, embeddings rank the filtered items, and the top items go to Gemini with a citation requirement.
- **Verifier (plain code).** Cited ids that were not retrieved are removed, and claims left with no citation are removed. Numbers in a claim that appear in none of the cited items are flagged for checking. Each answer shows coverage: items in store, after filters, passed to the model.
- **Employee view.** Answers use only the signed-in person's own evidence and favour outcomes over activity.
- **Review prep (employee only).** For a set of competencies, it finds evidence per competency and marks thin ones. You tick the claims you want, and the draft self-assessment is written from only those claims, citing only your own items.
- **Manager view.** Team update and free-form status questions across people. The prompt reports work status and declines to evaluate or rank individuals. Review evidence and drafts are blocked for the manager role.
- **Standup and team update** are one-click presets over the same store (last 7 or 14 days).

## Is RAG justified here?

For one person's week, everything fits in the model's context and retrieval adds nothing, so the standup and team presets pass the whole window (newest 60 items) with no retrieval. Retrieval is used for open questions over a long review period across several tools, where the volume is too large to send each time and answers need item-level citations. Embeddings are computed on the filtered set only. This is plain embedding search, not Vertex AI Search. Swapping `lib/retrieve.js` to Vertex AI Search is the production path if you want a managed index.

## Run locally

```bash
npm install
npm test                                         # offline tests, no credentials
OFFLINE=1 npm start                              # no model, lists matching items (UI testing)
GEMINI_API_KEY=... npm start                     # AI Studio free tier
gcloud auth application-default login
GOOGLE_CLOUD_PROJECT=your-project npm start      # Vertex AI
```

Open http://localhost:8080, go to Sources, click "Load demo data", then use Chat and Review prep. The demo data is a fictional payments team with outcome evidence (a latency improvement, a duplicate-charge fix), buried mentoring work in Slack, and no mentoring evidence for one person, so a thin competency shows up.

## Deploy to Cloud Run

```bash
PROJECT_ID=your-project ./deploy.sh
```

This enables the APIs, grants the Cloud Run service account `roles/aiplatform.user`, and deploys from source. The service is capped at one instance because the evidence store is in memory (it also writes `data/evidence.json`, which is ephemeral on Cloud Run). `--allow-unauthenticated` is for the demo only.

### Deploy via GitHub Actions

`.github/workflows/deploy.yml` runs the tests, builds the Dockerfile image in Actions (no Cloud Build service account permissions needed), pushes it to Artifact Registry, deploys to Cloud Run, and smoke-tests `/api/health`. It authenticates with Workload Identity Federation — no GCP key is stored in GitHub.

One-time setup:

```bash
# project and pool/provider for GitHub OIDC
PROJECT_ID=your-project
gcloud services enable iamcredentials.googleapis.com artifactregistry.googleapis.com run.googleapis.com

gcloud iam workload-identity-pools create github --location=global
gcloud iam workload-identity-pools providers create-oidc github-oidc \
  --location=global --workload-identity-pool=github \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub" \
  --attribute-condition="assertion.repository_owner=='devinair1996'"
# Do NOT pass --allowed-audiences here: the auth flow requests the GitHub OIDC
# token with audience = this provider's resource URI, and restricting audiences
# to token.actions.githubusercontent.com makes the token exchange fail with
# "The audience in ID Token [...] does not match the expected audience."

# deployer service account and the roles the workflow needs. artifactregistry
# .admin (not .writer) is required because the workflow creates the repository.
gcloud iam service-accounts create synapse-deploy
SA="synapse-deploy@${PROJECT_ID}.iam.gserviceaccount.com"
for ROLE in roles/run.admin roles/artifactregistry.admin roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA" --role="$ROLE" --condition=None
done
gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --member="principalSet://iam.googleapis.com/$(gcloud iam workload-identity-pools describe github --location=global --format='value(name)')/*" \
  --role="roles/iam.workloadIdentityUser"
```

Then set in the GitHub repo (Settings → Secrets and variables → Actions):

| Name | Type | Value |
|------|------|-------|
| `GCP_PROJECT` | variable | your project ID |
| `GCP_REGION` | variable | `asia-south1` (Mumbai, for India viewers) |
| `GCP_WIF_PROVIDER` | variable | `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github-oidc` |
| `GCP_DEPLOY_SA` | secret | `synapse-deploy@PROJECT_ID.iam.gserviceaccount.com` |

The workflow runs on pushes to `main` and on demand via workflow_dispatch.

## Honest scope

- **Live connectors:** GitHub (live), Jira (live or export), Slack (export), documents (upload). Slack and Google Drive APIs, scheduled sync and webhooks are the production path. Credentials entered in the UI are used for one request and are not stored.
- **Untested against live services.** Only the offline path and the parsers are tested here, using fixture payloads. These have not been run: Gemini calls, embeddings, PDF transcription, the GitHub fetch, and the Jira live fetch. The Jira call uses the `POST /rest/api/3/search/jql` endpoint from memory of Atlassian's recent API change, so confirm it against current Atlassian docs. Jira CSV date formats vary by instance, and rows whose dates cannot be read are skipped and counted.
- **Pagination limits.** GitHub fetches up to 5 pages of 100 per type and Jira up to 5 pages. When the limit is hit the UI says older items were not fetched.
- **No authentication.** The employee/manager toggle and "I am" picker are client-side, so the scoping is a demo, not access control. In production the role and identity must come from the identity layer (for example IAP), and the manager scope needs an explicit policy.
- **Privacy.** The review use case touches employment records and employee monitoring. Validate the design with HR and legal before any claims about it, and before connecting real colleagues' data. The AI Studio free tier may use requests to improve Google products, so use fixture or public data there.
- **Activity is not impact.** The model is told not to treat item counts as performance and not to rate or rank people, and the manager role is told to decline evaluation. These are prompt instructions, not guarantees, so spot-check outputs.
- **Offline mode** matches items by keyword overlap. It is not a model and its ranking is weak.
- Number checks catch figures that appear in no cited item. They do not catch a wrong interpretation of a correctly cited item.

## How it differs from existing tools

This comes from general knowledge, not checks of current product pages, so verify before using it on a slide. Performance platforms (Lattice, Leapsome, 15Five, Culture Amp) mostly work from feedback and goals entered in the platform. Engineering analytics (LinearB, Swarmia, Jellyfish) report team-level metrics. Enterprise assistants (Glean, Atlassian Rovo, Microsoft Copilot, Gemini in Workspace) answer cross-tool questions but are general purpose. Standup bots collect manual input.

A general assistant with connectors can produce a similar single answer, so chat over your tools is not the difference. The intended difference is the surrounding pipeline: ingest once into a structured store, state coverage, verify citations in code, and keep the person in control of what enters a review draft. The way to test this claim is to give a general assistant with connectors the same seeded dataset and compare what it misses and what it states without evidence. I have not run that comparison.

## Layout

```
server.js                    Express API + static UI
lib/store.js                 evidence store, people aliases, filters
lib/connectors/              github.js, jira.js, slack.js, drive.js
lib/retrieve.js              embedding ranking (token overlap offline)
lib/chat.js                  filter planning, retrieval, grounded answer, presets
lib/review.js                employee-only evidence gathering and draft
lib/verify.js                citation and number checks
lib/llm.js                   Gemini client, structured output, embeddings, cache
lib/demo.js                  fictional demo evidence
public/index.html            UI (Tailwind CDN)
```
