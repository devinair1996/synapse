#!/usr/bin/env bash
# Deploys SynapseOS to Cloud Run (single instance: evidence store is held in memory) using Vertex AI for Gemini (no API key needed).
# Usage: PROJECT_ID=my-project ./deploy.sh
set -euo pipefail
: "${PROJECT_ID:?Set PROJECT_ID}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-synapseos}"

gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com aiplatform.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

# Cloud Run's default compute service account needs Vertex AI access.
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/aiplatform.user" --condition=None >/dev/null

gcloud run deploy "$SERVICE" --source . --region "$REGION" --allow-unauthenticated \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_LOCATION=${REGION},GEMINI_MODEL=gemini-2.5-flash" \
  --max-instances 1 --timeout 300
