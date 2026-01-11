# Chat UI - AKS Deployment Guide

This directory contains everything needed to deploy the Chat UI application to Azure Kubernetes Service (AKS) with Istio service mesh. The solution is designed for **fully internal operation** where all components (n8n, chat-ui) run inside the same AKS cluster.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        AKS Cluster                               │
│                                                                  │
│  ┌─────────────────┐         ┌─────────────────────────────┐   │
│  │   n8n Pod       │         │   Chat UI Pod               │   │
│  │                 │  POST   │                             │   │
│  │  Workflow       │────────▶│  Express Server (:8080)     │   │
│  │  Automation     │         │    └─ /api/webhook/update   │   │
│  │                 │         │    └─ /api/webhook/stream   │   │
│  └─────────────────┘         │    └─ /api/chat             │   │
│                              │                             │   │
│                              │  React Frontend             │   │
│                              │    └─ SSE Real-time         │   │
│                              └─────────────────────────────┘   │
│                                           ▲                     │
│  ┌─────────────────────────────────────────┐                   │
│  │          Istio Gateway                   │                   │
│  │  (External access for users)             │                   │
│  └─────────────────────────────────────────┘                   │
│                              ▲                                  │
└──────────────────────────────│──────────────────────────────────┘
                               │
                         User Browser
```

## Key Features

- **No external dependencies**: All real-time communication uses internal Express SSE (no Supabase)
- **Internal service mesh**: n8n → Chat UI communication via Kubernetes service DNS
- **Istio mTLS**: Automatic encryption between pods
- **Horizontal scaling ready**: Stateless design supports multiple replicas

---

## Directory Structure

```
aks-deploy/
├── README.md                    # This file
├── Dockerfile                   # Multi-stage Docker build
├── k8s/
│   ├── namespace.yaml           # Kubernetes namespace
│   ├── configmap.yaml           # Environment configuration
│   ├── deployment.yaml          # Chat UI deployment
│   ├── service.yaml             # Internal Kubernetes service
│   ├── hpa.yaml                 # Horizontal Pod Autoscaler
│   └── istio/
│       ├── gateway.yaml         # Istio ingress gateway
│       ├── virtualservice.yaml  # Traffic routing rules
│       └── destinationrule.yaml # Load balancing config
├── src/
│   ├── hooks/
│   │   ├── useChat.ts           # Modified to use SSE (no Supabase)
│   │   └── useSSEUpdates.ts     # New SSE hook for real-time
│   └── lib/
│       └── api.ts               # Modified API layer
└── scripts/
    ├── build.sh                 # Build Docker image
    └── deploy.sh                # Deploy to AKS
```

---

## Prerequisites

1. **Azure CLI** installed and configured
2. **kubectl** configured to access your AKS cluster
3. **Istio** installed in your AKS cluster
4. **Docker** for building images
5. **Azure Container Registry (ACR)** or another container registry

### Verify Prerequisites

```bash
# Check Azure CLI
az --version

# Check kubectl connection
kubectl cluster-info

# Check Istio installation
kubectl get pods -n istio-system

# Check if Istio sidecar injection is enabled
kubectl get namespace -L istio-injection
```

---

## Step-by-Step Deployment

### Step 1: Configure Environment

Edit `k8s/configmap.yaml` with your specific values:

```yaml
data:
  # URL where n8n will POST workflow updates
  # This is the internal Kubernetes DNS name
  WEBHOOK_CALLBACK_URL: "http://chat-ui-service.chat-app.svc.cluster.local:8080/api/webhook/update"
  
  # n8n webhook URL (internal)
  N8N_WEBHOOK_URL: "http://n8n-service.n8n.svc.cluster.local:5678/webhook/chat-ui-trigger"
  
  # Your domain for external access
  EXTERNAL_DOMAIN: "chat.yourdomain.com"
```

### Step 2: Build Docker Image

```bash
# Navigate to project root (not aks-deploy)
cd ..

# Login to your Azure Container Registry
az acr login --name <your-acr-name>

# Build and push the image
docker build -f aks-deploy/Dockerfile -t <your-acr-name>.azurecr.io/chat-ui:v1.0.0 .
docker push <your-acr-name>.azurecr.io/chat-ui:v1.0.0
```

Or use the provided script:

```bash
cd aks-deploy
./scripts/build.sh <your-acr-name> v1.0.0
```

### Step 3: Create Namespace with Istio Injection

```bash
kubectl apply -f k8s/namespace.yaml
```

Verify Istio sidecar injection is enabled:

```bash
kubectl get namespace chat-app -o jsonpath='{.metadata.labels.istio-injection}'
# Should output: enabled
```

### Step 4: Deploy ConfigMap

```bash
kubectl apply -f k8s/configmap.yaml
```

### Step 5: Deploy Application

```bash
# Update the image in deployment.yaml with your ACR name
sed -i 's|<ACR_NAME>|your-acr-name|g' k8s/deployment.yaml

# Apply deployment
kubectl apply -f k8s/deployment.yaml

# Apply service
kubectl apply -f k8s/service.yaml

# Apply HPA for auto-scaling
kubectl apply -f k8s/hpa.yaml
```

### Step 6: Configure Istio Ingress

```bash
# Apply Istio gateway (external access)
kubectl apply -f k8s/istio/gateway.yaml

# Apply virtual service (routing)
kubectl apply -f k8s/istio/virtualservice.yaml

# Apply destination rule (load balancing)
kubectl apply -f k8s/istio/destinationrule.yaml
```

### Step 7: Configure n8n Webhook

In your n8n workflows, update the webhook callback URL to use the internal Kubernetes service:

```
POST http://chat-ui-service.chat-app.svc.cluster.local:8080/api/webhook/update
```

**Request Body Format:**
```json
{
  "jobId": "{{ $execution.id }}",
  "sessionId": "{{ $json.sessionId }}",
  "status": "completed",
  "answer": "Your workflow response here",
  "meta": {
    "runID": "{{ $execution.id }}",
    "pipelineID": "{{ $workflow.id }}"
  }
}
```

### Step 8: Verify Deployment

```bash
# Check pods are running
kubectl get pods -n chat-app

# Check pod has Istio sidecar (should show 2/2 containers)
kubectl get pods -n chat-app -o jsonpath='{.items[*].spec.containers[*].name}'

# Check service
kubectl get svc -n chat-app

# Check Istio gateway
kubectl get gateway -n chat-app

# Get external IP
kubectl get svc istio-ingressgateway -n istio-system
```

### Step 9: Test the Application

```bash
# Port-forward for local testing
kubectl port-forward svc/chat-ui-service -n chat-app 8080:8080

# Open browser
open http://localhost:8080
```

---

## Configuring n8n (Inside AKS)

### n8n Webhook Node Configuration

When creating webhooks in n8n that need to call back to the chat UI:

1. **HTTP Request Node** for callback:
   - Method: `POST`
   - URL: `http://chat-ui-service.chat-app.svc.cluster.local:8080/api/webhook/update`
   - Body Content Type: `JSON`
   - Body:
     ```json
     {
       "jobId": "={{ $execution.id }}",
       "sessionId": "={{ $('Webhook').item.json.sessionId }}",
       "status": "completed",
       "answer": "={{ $json.response }}",
       "meta": {
         "runID": "={{ $execution.id }}",
         "pipelineID": "={{ $workflow.id }}"
       }
     }
     ```

### n8n Environment Variables

If n8n is deployed via Helm, add these to your values.yaml:

```yaml
env:
  - name: CHAT_UI_WEBHOOK_URL
    value: "http://chat-ui-service.chat-app.svc.cluster.local:8080/api/webhook/update"
```

---

## Troubleshooting

### Common Issues

#### 1. Pods not starting (ImagePullBackOff)

```bash
# Check if ACR is attached to AKS
az aks check-acr --resource-group <rg> --name <aks-name> --acr <acr-name>

# Attach ACR if needed
az aks update -n <aks-name> -g <rg> --attach-acr <acr-name>
```

#### 2. n8n cannot reach chat-ui webhook

```bash
# Test connectivity from n8n pod
kubectl exec -it <n8n-pod> -n n8n -- curl -v http://chat-ui-service.chat-app.svc.cluster.local:8080/health
```

#### 3. SSE connections dropping

Check Istio timeout settings in the VirtualService. SSE requires longer timeouts:

```yaml
timeout: 3600s  # 1 hour for SSE
```

#### 4. View application logs

```bash
kubectl logs -f deployment/chat-ui -n chat-app
```

#### 5. Check Istio sidecar logs

```bash
kubectl logs -f deployment/chat-ui -n chat-app -c istio-proxy
```

---

## Security Considerations

### 1. mTLS Between Services

Istio automatically provides mTLS between pods. Verify with:

```bash
kubectl exec -it <pod> -n chat-app -c istio-proxy -- pilot-agent request GET stats | grep ssl
```

### 2. Network Policies (Optional)

For additional isolation, apply network policies:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: chat-ui-policy
  namespace: chat-app
spec:
  podSelector:
    matchLabels:
      app: chat-ui
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: n8n
    - namespaceSelector:
        matchLabels:
          name: istio-system
```

### 3. Webhook Authentication

For production, add a shared secret for webhook authentication:

```bash
# Generate secret
kubectl create secret generic webhook-auth \
  --from-literal=WEBHOOK_SECRET=$(openssl rand -hex 32) \
  -n chat-app
```

---

## Scaling

### Horizontal Pod Autoscaler

The included HPA scales based on CPU:

```yaml
minReplicas: 2
maxReplicas: 10
targetCPUUtilizationPercentage: 70
```

### Manual Scaling

```bash
kubectl scale deployment/chat-ui --replicas=5 -n chat-app
```

---

## Monitoring

### Prometheus Metrics

The application exposes metrics at `/metrics`. Configure Prometheus to scrape:

```yaml
annotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "8080"
  prometheus.io/path: "/metrics"
```

### Istio Dashboards

Access Kiali dashboard for service mesh visualization:

```bash
kubectl port-forward svc/kiali -n istio-system 20001:20001
open http://localhost:20001
```

---

## Environment Variables Reference

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8080` |
| `NODE_ENV` | Environment | `production` |
| `N8N_WEBHOOK_URL` | n8n trigger webhook URL | Required |
| `WEBHOOK_SECRET` | Shared secret for webhook auth | Optional |
| `ALLOWED_ORIGIN` | CORS allowed origin | `*` |

---

## Quick Start Checklist

- [ ] Azure CLI installed and logged in
- [ ] kubectl configured for your AKS cluster
- [ ] Istio installed with sidecar injection enabled
- [ ] ACR created and attached to AKS
- [ ] ConfigMap updated with your values
- [ ] Docker image built and pushed
- [ ] Kubernetes resources applied
- [ ] Istio gateway configured
- [ ] n8n webhook callback URL updated
- [ ] DNS configured for external domain
- [ ] TLS certificates configured (optional but recommended)

---

## Support

For issues specific to this deployment:
1. Check pod logs: `kubectl logs -f deployment/chat-ui -n chat-app`
2. Check Istio proxy logs: `kubectl logs -f deployment/chat-ui -n chat-app -c istio-proxy`
3. Verify service connectivity from within cluster
