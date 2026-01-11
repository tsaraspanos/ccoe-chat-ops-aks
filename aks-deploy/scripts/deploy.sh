#!/bin/bash

# =============================================================================
# Deploy script for Chat UI to AKS
# Usage: ./deploy.sh <acr-name> <version>
# Example: ./deploy.sh myacr v1.0.0
# =============================================================================

set -e

ACR_NAME=${1:-"your-acr-name"}
VERSION=${2:-"v1.0.0"}
NAMESPACE="chat-app"

echo "============================================="
echo "Deploying Chat UI to AKS"
echo "============================================="
echo "ACR: ${ACR_NAME}.azurecr.io"
echo "Version: ${VERSION}"
echo "Namespace: ${NAMESPACE}"
echo "============================================="

# Navigate to k8s directory
cd "$(dirname "$0")/../k8s"

# Create namespace with Istio injection
echo "Creating namespace..."
kubectl apply -f namespace.yaml

# Wait for namespace to be ready
sleep 2

# Apply ConfigMap
echo "Applying ConfigMap..."
kubectl apply -f configmap.yaml

# Update deployment with correct ACR name and apply
echo "Applying Deployment..."
sed "s|<ACR_NAME>|${ACR_NAME}|g; s|:v1.0.0|:${VERSION}|g" deployment.yaml | kubectl apply -f -

# Apply Service
echo "Applying Service..."
kubectl apply -f service.yaml

# Apply HPA
echo "Applying HPA..."
kubectl apply -f hpa.yaml

# Apply Istio configuration
echo "Applying Istio configuration..."
kubectl apply -f istio/gateway.yaml
kubectl apply -f istio/virtualservice.yaml
kubectl apply -f istio/destinationrule.yaml

# Wait for rollout
echo "Waiting for deployment rollout..."
kubectl rollout status deployment/chat-ui -n ${NAMESPACE} --timeout=300s

# Show status
echo "============================================="
echo "Deployment complete!"
echo "============================================="
echo ""
echo "Pod status:"
kubectl get pods -n ${NAMESPACE} -l app=chat-ui
echo ""
echo "Service status:"
kubectl get svc -n ${NAMESPACE}
echo ""
echo "Istio Gateway:"
kubectl get gateway -n ${NAMESPACE}
echo ""
echo "To get external IP:"
echo "  kubectl get svc istio-ingressgateway -n istio-system"
echo ""
echo "To test locally:"
echo "  kubectl port-forward svc/chat-ui-service -n ${NAMESPACE} 8080:8080"
echo "  open http://localhost:8080"
echo "============================================="
