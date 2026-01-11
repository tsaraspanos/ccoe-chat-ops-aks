#!/bin/bash

# =============================================================================
# Build script for Chat UI Docker image
# Usage: ./build.sh <acr-name> <version>
# Example: ./build.sh myacr v1.0.0
# =============================================================================

set -e

ACR_NAME=${1:-"your-acr-name"}
VERSION=${2:-"v1.0.0"}
IMAGE_NAME="chat-ui"

echo "============================================="
echo "Building Chat UI for AKS"
echo "============================================="
echo "ACR: ${ACR_NAME}.azurecr.io"
echo "Image: ${IMAGE_NAME}:${VERSION}"
echo "============================================="

# Navigate to project root
cd "$(dirname "$0")/../.."

# Login to ACR
echo "Logging into Azure Container Registry..."
az acr login --name ${ACR_NAME}

# Build the image
echo "Building Docker image..."
docker build \
  -f aks-deploy/Dockerfile \
  -t ${ACR_NAME}.azurecr.io/${IMAGE_NAME}:${VERSION} \
  -t ${ACR_NAME}.azurecr.io/${IMAGE_NAME}:latest \
  .

# Push the image
echo "Pushing image to ACR..."
docker push ${ACR_NAME}.azurecr.io/${IMAGE_NAME}:${VERSION}
docker push ${ACR_NAME}.azurecr.io/${IMAGE_NAME}:latest

echo "============================================="
echo "Build complete!"
echo "Image: ${ACR_NAME}.azurecr.io/${IMAGE_NAME}:${VERSION}"
echo "============================================="
