# AKS Deployment Guide

## Prerequisites

```bash
# 1. Login to Azure
az login
az account set --subscription "<YOUR_SUBSCRIPTION_ID>"

# 2. Get AKS credentials
az aks get-credentials --resource-group <RG_NAME> --name <CLUSTER_NAME>

# 3. Login to ACR (Azure Container Registry)
az acr login --name <YOUR_ACR_NAME>
```

## Step 1: Build and Push Docker Image

```bash
# From project root directory
# Replace <YOUR_ACR_NAME> with your Azure Container Registry name

# Build the image
docker build -t <YOUR_ACR_NAME>.azurecr.io/chat-ui:latest .

# Push to ACR
docker push <YOUR_ACR_NAME>.azurecr.io/chat-ui:latest

# Or use ACR Tasks to build in the cloud:
az acr build --registry <YOUR_ACR_NAME> --image chat-ui:latest .
```

## Step 2: Update Configuration

Before deploying, update these values in the manifests:

| File | Value to Update |
|------|-----------------|
| `k8s/deployment.yaml` | `<YOUR_ACR_NAME>.azurecr.io/chat-ui:latest` |
| `k8s/ingress.yaml` | `chat.yourdomain.com` → your domain |
| `k8s/configmap.yaml` | `ALLOWED_ORIGIN` → your frontend URL |

## Step 3: Create Secrets (Do this BEFORE applying manifests)

```bash
# Create the namespace first
kubectl apply -f k8s/namespace.yaml

# Create the secret with your actual n8n webhook URL
kubectl create secret generic chat-ui-secrets \
  --namespace=chat-ui \
  --from-literal=n8n-webhook-url='https://your-n8n-domain/webhook/chat-ui-trigger'

# Verify secret was created
kubectl get secrets -n chat-ui
```

## Step 4: Deploy to AKS

```bash
# Apply all manifests (order matters!)
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/hpa.yaml

# Or apply all at once:
kubectl apply -f k8s/
```

## Step 5: Verify Deployment

```bash
# Check pods are running
kubectl get pods -n chat-ui

# Check deployment status
kubectl get deployments -n chat-ui

# Check service
kubectl get svc -n chat-ui

# Check ingress (get external IP/hostname)
kubectl get ingress -n chat-ui

# View logs
kubectl logs -n chat-ui -l app=chat-ui --tail=100 -f

# Describe pod for troubleshooting
kubectl describe pod -n chat-ui -l app=chat-ui
```

## Updating the Application

```bash
# Build and push new image
docker build -t <YOUR_ACR_NAME>.azurecr.io/chat-ui:v1.0.1 .
docker push <YOUR_ACR_NAME>.azurecr.io/chat-ui:v1.0.1

# Update deployment with new image
kubectl set image deployment/chat-ui \
  chat-ui=<YOUR_ACR_NAME>.azurecr.io/chat-ui:v1.0.1 \
  -n chat-ui

# Or edit deployment directly
kubectl edit deployment chat-ui -n chat-ui

# Watch rollout status
kubectl rollout status deployment/chat-ui -n chat-ui
```

## Rollback

```bash
# View rollout history
kubectl rollout history deployment/chat-ui -n chat-ui

# Rollback to previous version
kubectl rollout undo deployment/chat-ui -n chat-ui

# Rollback to specific revision
kubectl rollout undo deployment/chat-ui -n chat-ui --to-revision=2
```

## Troubleshooting

```bash
# Pod not starting?
kubectl describe pod -n chat-ui -l app=chat-ui
kubectl logs -n chat-ui -l app=chat-ui --previous

# Check events
kubectl get events -n chat-ui --sort-by='.lastTimestamp'

# Exec into pod for debugging
kubectl exec -it -n chat-ui <pod-name> -- /bin/sh

# Test health endpoint from inside cluster
kubectl run test --rm -it --image=curlimages/curl -- curl http://chat-ui.chat-ui.svc.cluster.local/health
```

## DNS Configuration

After deploying, get the ingress IP and configure DNS:

```bash
# Get external IP
kubectl get ingress -n chat-ui

# Add A record in your DNS:
# chat.yourdomain.com → <EXTERNAL-IP>
```

## Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `N8N_WEBHOOK_URL` | n8n webhook endpoint for chat | ✅ Yes |
| `ALLOWED_ORIGIN` | CORS origin (use `*` or specific domain) | ✅ Yes |
| `PORT` | Server port (default: 8080) | No |
| `NODE_ENV` | Environment (production/development) | No |
