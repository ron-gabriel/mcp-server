# Deployment Guide

This guide covers deploying the MCP Email Processing Server using Docker and Kubernetes.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Docker Deployment](#docker-deployment)
4. [Kubernetes Deployment](#kubernetes-deployment)
5. [Configuration](#configuration)
6. [Security](#security)
7. [Monitoring](#monitoring)
8. [Troubleshooting](#troubleshooting)
9. [Rollback Procedures](#rollback-procedures)

## Prerequisites

### Required Tools
- Docker 20.10+ (for building images)
- kubectl 1.24+ (for Kubernetes deployment)
- Node.js 22+ (for local development)
- A container registry (Docker Hub, Azure Container Registry, etc.)
- A Kubernetes cluster (AKS, EKS, GKE, or local)

### Azure Requirements
- Azure AD App Registration with Graph API permissions:
  - `Mail.Read`
  - `Mail.ReadWrite`
- Application (client) ID
- Client secret
- Directory (tenant) ID

### Domain Requirements
- A domain with SSL certificate for webhook endpoint
- Access to configure DNS records

## Quick Start

```bash
# Clone the repository
git clone <repository-url>
cd mcp-server

# Copy configuration files
cp .env.example .env
cp k8s/config.env.example k8s/config.env
cp k8s/secrets.env.example k8s/secrets.env

# Edit configuration files with your values
# IMPORTANT: Update all placeholder values

# Deploy to Kubernetes
./scripts/deploy.sh
```

## Docker Deployment

### Building the Image

```bash
# Build locally
docker build -t mcp-email-server:latest .

# Build for multiple platforms
docker buildx build --platform linux/amd64,linux/arm64 \
  -t your-registry/mcp-email-server:latest \
  --push .
```

### Running with Docker Compose

1. Copy the environment file:
   ```bash
   cp .env.docker-compose .env
   ```

2. Edit `.env` with your values

3. Run the container:
   ```bash
   docker-compose up -d
   ```

4. Check logs:
   ```bash
   docker-compose logs -f
   ```

5. Test health endpoint:
   ```bash
   curl http://localhost/health
   ```

### Running with Docker directly

```bash
docker run -d \
  --name mcp-email-server \
  -p 80:80 \
  -e AZURE_CLIENT_ID='your-client-id' \
  -e AZURE_CLIENT_SECRET='your-client-secret' \
  -e AZURE_TENANT_ID='your-tenant-id' \
  -e OUTLOOK_USER_EMAIL='processing@yourdomain.com' \
  -e WEBHOOK_ENABLED=true \
  -e WEBHOOK_PUBLIC_URL='https://mcp-email.yourdomain.com' \
  -e WEBHOOK_CLIENT_STATE='your-secret' \
  --restart unless-stopped \
  mcp-email-server:latest
```

## Kubernetes Deployment

### 1. Prepare Configuration

```bash
# Navigate to k8s directory
cd k8s/

# Copy configuration templates
cp config.env.example config.env
cp secrets.env.example secrets.env

# Edit both files with your values
# WARNING: Never commit secrets.env to version control
```

### 2. Create Namespace

```bash
kubectl create namespace mcp-email-processing
```

### 3. Deploy Using Kustomize

```bash
# Set environment variables
export REGISTRY=your-registry
export IMAGE_TAG=latest
export ENVIRONMENT=production

# Deploy all resources
kubectl apply -k k8s/ -n mcp-email-processing
```

### 4. Deploy Using Scripts

```bash
# Make scripts executable
chmod +x scripts/*.sh

# Deploy with script
REGISTRY=your-registry IMAGE_TAG=latest ./scripts/deploy.sh
```

### 5. Verify Deployment

```bash
# Check pod status
kubectl get pods -n mcp-email-processing

# Check logs
kubectl logs -n mcp-email-processing -l app=mcp-email-server

# Check ingress
kubectl get ingress -n mcp-email-processing

# Test health endpoint (from inside cluster)
kubectl run test-curl --rm -it --image=curlimages/curl -- \
  curl http://mcp-email-server.mcp-email-processing/health
```

## Configuration

### Environment Variables

#### Required Variables
| Variable | Description | Example |
|----------|-------------|---------|
| `AZURE_CLIENT_ID` | Azure AD App ID | `12345678-1234-1234-1234-123456789012` |
| `AZURE_CLIENT_SECRET` | Azure AD App Secret | `your-secret` |
| `AZURE_TENANT_ID` | Azure AD Tenant ID | `87654321-4321-4321-4321-210987654321` |
| `OUTLOOK_USER_EMAIL` | Email to monitor | `processing@company.com` |

#### Webhook Configuration
| Variable | Description | Default |
|----------|-------------|---------|
| `WEBHOOK_ENABLED` | Enable webhook mode | `false` |
| `WEBHOOK_PORT` | Webhook server port | `80` |
| `WEBHOOK_PUBLIC_URL` | Public webhook URL | Required if enabled |
| `WEBHOOK_CLIENT_STATE` | Webhook validation secret | Required if enabled |
| `LLM_WEBHOOK_URL` | Forward emails to this URL | Optional |

#### API Configuration
| Variable | Description | Default |
|----------|-------------|---------|
| `API_ENDPOINT` | Your API endpoint | Optional |
| `API_KEY` | API authentication key | Optional |

### Kubernetes ConfigMaps and Secrets

1. **ConfigMap** (`k8s/config.env`):
   - Non-sensitive configuration
   - Can be stored in version control (without actual values)

2. **Secret** (`k8s/secrets.env`):
   - Sensitive credentials
   - Never commit to version control
   - Consider using sealed-secrets or external secret operators

## Security

### Best Practices

1. **Secrets Management**:
   ```bash
   # Use kubectl to create secrets
   kubectl create secret generic mcp-email-secret \
     --from-env-file=secrets.env \
     -n mcp-email-processing
   
   # Or use sealed-secrets
   kubeseal --format=yaml < secret.yaml > sealed-secret.yaml
   ```

2. **Network Policies**:
   - NetworkPolicy is included to restrict traffic
   - Adjust namespaceSelector labels based on your cluster

3. **Pod Security**:
   - Runs as non-root user (1001)
   - Read-only root filesystem
   - No privilege escalation
   - All capabilities dropped

4. **Ingress Security**:
   - Rate limiting enabled
   - Security headers configured
   - TLS required

### Certificate Management

Using cert-manager (recommended):
```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: mcp-email-tls
  namespace: mcp-email-processing
spec:
  secretName: mcp-email-tls
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
  - mcp-email.yourdomain.com
```

## Monitoring

### Health Checks

The application exposes `/health` endpoint:
```json
{
  "status": "ok",
  "timestamp": "2024-01-10T10:00:00Z"
}
```

### Prometheus Metrics

If implementing metrics, they would be available at `/metrics`.

### Logging

Logs are written to stderr and can be collected by your logging solution:
```bash
# View logs
kubectl logs -n mcp-email-processing -l app=mcp-email-server

# Follow logs
kubectl logs -n mcp-email-processing -l app=mcp-email-server -f

# View previous container logs
kubectl logs -n mcp-email-processing -l app=mcp-email-server --previous
```

## Troubleshooting

### Common Issues

1. **Pod not starting**:
   ```bash
   # Check pod events
   kubectl describe pod -n mcp-email-processing -l app=mcp-email-server
   
   # Check logs
   kubectl logs -n mcp-email-processing -l app=mcp-email-server --previous
   ```

2. **Webhook not receiving notifications**:
   - Verify ingress is configured correctly
   - Check that the public URL is accessible
   - Verify Graph subscription was created in logs
   - Check ingress controller logs

3. **Authentication failures**:
   - Verify Azure AD credentials
   - Check tenant ID is correct
   - Ensure app has correct Graph permissions

4. **Memory issues**:
   ```bash
   # Check resource usage
   kubectl top pod -n mcp-email-processing
   
   # Adjust limits in deployment.yaml if needed
   ```

### Debug Mode

Set these environment variables for more logging:
```yaml
- name: NODE_ENV
  value: "development"
- name: DEBUG
  value: "*"
```

## Rollback Procedures

### Using kubectl

```bash
# View rollout history
kubectl rollout history deployment/mcp-email-server -n mcp-email-processing

# Rollback to previous version
kubectl rollout undo deployment/mcp-email-server -n mcp-email-processing

# Rollback to specific revision
kubectl rollout undo deployment/mcp-email-server -n mcp-email-processing --to-revision=2
```

### Using the rollback script

```bash
# View history
./scripts/rollback.sh --history-only

# Rollback to previous
./scripts/rollback.sh

# Rollback to specific revision
./scripts/rollback.sh 3
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Deploy
on:
  push:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Log in to Container Registry
        uses: docker/login-action@v2
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Build and push
        uses: docker/build-push-action@v4
        with:
          push: true
          tags: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
      
      - name: Deploy to Kubernetes
        env:
          KUBE_CONFIG: ${{ secrets.KUBE_CONFIG }}
        run: |
          echo "$KUBE_CONFIG" | base64 -d > kubeconfig
          export KUBECONFIG=kubeconfig
          export IMAGE_TAG=${{ github.sha }}
          ./scripts/deploy.sh
```

## Zero-Downtime Deployments

The deployment is configured for zero-downtime updates:

1. **Rolling Update Strategy**: New pods are created before old ones are terminated
2. **Health Checks**: Ensures pods are ready before receiving traffic
3. **PodDisruptionBudget**: Maintains minimum availability during updates
4. **PreStop Hook**: Allows graceful shutdown with 15-second delay

## Backup and Restore

### Subscription State

Graph subscriptions are managed by the application. On restart:
1. Old subscriptions are cleaned up
2. New subscriptions are created automatically

### Processed Emails Tracking

If using persistent tracking (not included by default):
```bash
# Backup processed emails list
kubectl exec -n mcp-email-processing <pod-name> -- cat /app/.processed-emails.json > backup.json

# Restore
kubectl cp backup.json mcp-email-processing/<pod-name>:/app/.processed-emails.json
```

## Performance Tuning

### Scaling

The HorizontalPodAutoscaler is configured but note:
- Multiple replicas will create duplicate Graph subscriptions
- Consider implementing leader election for webhook handling
- Or use external coordination service

### Resource Limits

Adjust based on your load:
```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "100m"
  limits:
    memory: "512Mi"  # Increase for high volume
    cpu: "500m"      # Increase for complex processing
```

## Support

For issues:
1. Check logs first
2. Verify configuration
3. Check Azure AD permissions
4. Review troubleshooting section
5. File an issue with logs and configuration (sanitized)