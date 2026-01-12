# CCoE Chat Ops - AKS Deployment Guide

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
docker build -t <YOUR_ACR_NAME>.azurecr.io/ccoe-chat-ops:latest .

# Push to ACR
docker push <YOUR_ACR_NAME>.azurecr.io/ccoe-chat-ops:latest

# Or use ACR Tasks to build in the cloud:
az acr build --registry <YOUR_ACR_NAME> --image ccoe-chat-ops:latest .
```

## Step 2: Update Configuration

Before deploying, update these values in the manifests:

| File | Value to Update |
|------|-----------------|
| `k8s/deployment.yaml` | `<YOUR_ACR_NAME>.azurecr.io/ccoe-chat-ops:latest` |
| `k8s/ingress.yaml` | `chat.yourdomain.com` → your domain |
| `k8s/configmap.yaml` | `ALLOWED_ORIGIN` → your frontend URL |

## Step 3: Create Secrets (Do this BEFORE applying manifests)

```bash
# Create the namespace first
kubectl apply -f k8s/namespace.yaml

# Create the secret with your n8n webhook URL
kubectl create secret generic ccoe-chat-ops-secrets \
  --namespace=ccoe-chat-ops \
  --from-literal=n8n-webhook-url='https://tsaraspanos.app.n8n.cloud/webhook/chat-ui-trigger'

# Verify secret was created
kubectl get secrets -n ccoe-chat-ops

# View secret details (base64 encoded)
kubectl get secret ccoe-chat-ops-secrets -n ccoe-chat-ops -o yaml

# Decode and verify the value
kubectl get secret ccoe-chat-ops-secrets -n ccoe-chat-ops -o jsonpath='{.data.n8n-webhook-url}' | base64 -d
```

### Updating Secrets

```bash
# Delete and recreate
kubectl delete secret ccoe-chat-ops-secrets -n ccoe-chat-ops
kubectl create secret generic ccoe-chat-ops-secrets \
  --namespace=ccoe-chat-ops \
  --from-literal=n8n-webhook-url='https://new-webhook-url.com'

# Or patch directly
kubectl patch secret ccoe-chat-ops-secrets -n ccoe-chat-ops \
  --type='json' \
  -p='[{"op":"replace","path":"/data/n8n-webhook-url","value":"'$(echo -n 'https://new-url' | base64)'"}]'
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
kubectl get pods -n ccoe-chat-ops

# Check deployment status
kubectl get deployments -n ccoe-chat-ops

# Check service
kubectl get svc -n ccoe-chat-ops

# Check ingress (get external IP/hostname)
kubectl get ingress -n ccoe-chat-ops

# View logs
kubectl logs -n ccoe-chat-ops -l app=ccoe-chat-ops --tail=100 -f

# Describe pod for troubleshooting
kubectl describe pod -n ccoe-chat-ops -l app=ccoe-chat-ops
```

## Updating the Application

```bash
# Build and push new image
docker build -t <YOUR_ACR_NAME>.azurecr.io/ccoe-chat-ops:v1.0.1 .
docker push <YOUR_ACR_NAME>.azurecr.io/ccoe-chat-ops:v1.0.1

# Update deployment with new image
kubectl set image deployment/ccoe-chat-ops \
  ccoe-chat-ops=<YOUR_ACR_NAME>.azurecr.io/ccoe-chat-ops:v1.0.1 \
  -n ccoe-chat-ops

# Or edit deployment directly
kubectl edit deployment ccoe-chat-ops -n ccoe-chat-ops

# Watch rollout status
kubectl rollout status deployment/ccoe-chat-ops -n ccoe-chat-ops
```

## Rollback

```bash
# View rollout history
kubectl rollout history deployment/ccoe-chat-ops -n ccoe-chat-ops

# Rollback to previous version
kubectl rollout undo deployment/ccoe-chat-ops -n ccoe-chat-ops

# Rollback to specific revision
kubectl rollout undo deployment/ccoe-chat-ops -n ccoe-chat-ops --to-revision=2
```

## Troubleshooting

```bash
# Pod not starting?
kubectl describe pod -n ccoe-chat-ops -l app=ccoe-chat-ops
kubectl logs -n ccoe-chat-ops -l app=ccoe-chat-ops --previous

# Check events
kubectl get events -n ccoe-chat-ops --sort-by='.lastTimestamp'

# Exec into pod for debugging
kubectl exec -it -n ccoe-chat-ops <pod-name> -- /bin/sh

# Test health endpoint from inside cluster
kubectl run test --rm -it --image=curlimages/curl -- curl http://ccoe-chat-ops.ccoe-chat-ops.svc.cluster.local/health
```

## DNS Configuration

After deploying, get the ingress IP and configure DNS:

```bash
# Get external IP
kubectl get ingress -n ccoe-chat-ops

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
