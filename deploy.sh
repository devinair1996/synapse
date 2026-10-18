#!/usr/bin/env bash
# Deploys Synapse to Cloud Run (single instance: evidence store is held in memory) using Vertex AI for Gemini (no API key needed).
# Usage: PROJECT_ID=my-project ./deploy.sh
set -euo pipefail
: "${PROJECT_ID:?Set PROJECT_ID}"
REGION="${REGION:-asia-southeast1}"
SERVICE="${SERVICE:-synapse}"

gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com aiplatform.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"

# Find the SA that runs Cloud Builds. Newer projects use the compute default SA,
# which starts with no build roles, and `gcloud run deploy --source` always uses
# it, so the build roles below are what make a source deploy possible.
# https://cloud.google.com/build/docs/cloud-build-service-account-updates
BUILD_SA="$(curl -sf -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  "https://cloudbuild.googleapis.com/v1/projects/${PROJECT_ID}/serviceAccount" \
  | grep -o '[0-9@.a-z-]*@cloudbuild\.gserviceaccount\.com' | head -n1 || true)"
BUILD_SA="${BUILD_SA:-${PROJECT_NUMBER}-compute@developer.gserviceaccount.com}"
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Idempotent grant: skips bindings that already exist so reruns are safe.
grant() {
  local member="serviceAccount:${1}" role="${2}"
  if gcloud projects get-iam-policy "$PROJECT_ID" --flatten=bindings \
      --filter="bindings.role:${role}" --format='value(bindings.members)' \
      | grep -F "${member}" >/dev/null; then
    echo "  already granted: ${role} -> ${1}"
  else
    echo "  granting: ${role} -> ${1}"
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
      --member="${member}" --role="${role}" --condition=None >/dev/null
  fi
}

echo "Granting build roles to ${BUILD_SA} (skips already-granted roles)..."
for role in \
  roles/cloudbuild.builds.builder \
  roles/artifactregistry.writer \
  roles/storage.objectAdmin \
  roles/run.admin \
  roles/iam.serviceAccountUser; do
  grant "$BUILD_SA" "$role"
done

# The service Cloud Run runs as (the compute default SA) needs Vertex AI access for Gemini.
grant "$RUNTIME_SA" roles/aiplatform.user

gcloud run deploy "$SERVICE" --source . --region "$REGION" --allow-unauthenticated \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_REGION=${REGION},GEMINI_MODEL=gemini-2.5-flash" \
  --max-instances 1 --timeout 300

gcloud storage rm --recursive gs://run-sources-project-c7995de8-4e20-4549-82b-australia-southeast1