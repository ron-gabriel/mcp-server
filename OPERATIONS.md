# Operations Guide

This guide covers day-to-day operations, monitoring, and maintenance of the MCP Email Processing Server.

## Table of Contents

1. [Daily Operations](#daily-operations)
2. [Monitoring](#monitoring)
3. [Alerting](#alerting)
4. [Backup & Recovery](#backup--recovery)
5. [Performance Tuning](#performance-tuning)
6. [Troubleshooting Playbook](#troubleshooting-playbook)
7. [Maintenance Windows](#maintenance-windows)
8. [Runbooks](#runbooks)

## Daily Operations

### Health Checks

1. **Manual Health Check**:
   ```bash
   # Check pod status
   kubectl get pods -n mcp-email-processing
   
   # Check health endpoint
   kubectl exec -n mcp-email-processing deploy/mcp-email-server -- \
     curl -s http://localhost/health
   ```

2. **Automated Monitoring**:
   - Prometheus alerts for pod restarts
   - Uptime monitoring for webhook endpoint
   - Graph subscription status checks

### Log Review

Daily log review checklist:
```bash
# Check for errors
kubectl logs -n mcp-email-processing -l app=mcp-email-server \
  --since=24h | grep -i error

# Check for authentication issues
kubectl logs -n mcp-email-processing -l app=mcp-email-server \
  --since=24h | grep -i "auth\|401\|403"

# Check webhook activity
kubectl logs -n mcp-email-processing -l app=mcp-email-server \
  --since=24h | grep "webhook"
```

## Monitoring

### Key Metrics

1. **Application Metrics**:
   - Webhook requests per minute
   - Email processing time
   - Graph API call success rate
   - Memory usage
   - CPU usage

2. **Business Metrics**:
   - Emails processed per hour
   - Failed email processing
   - API submission success rate

### Prometheus Configuration

```yaml
apiVersion: v1
kind: ServiceMonitor
metadata:
  name: mcp-email-server
  namespace: mcp-email-processing
spec:
  selector:
    matchLabels:
      app: mcp-email-server
  endpoints:
  - port: http
    path: /metrics
    interval: 30s
```

### Grafana Dashboard

Import the dashboard JSON:
```json
{
  "dashboard": {
    "title": "MCP Email Processing Server",
    "panels": [
      {
        "title": "Webhook Requests",
        "targets": [
          {
            "expr": "rate(webhook_requests_total[5m])"
          }
        ]
      },
      {
        "title": "Processing Errors",
        "targets": [
          {
            "expr": "rate(email_processing_errors_total[5m])"
          }
        ]
      }
    ]
  }
}
```

## Alerting

### Critical Alerts

1. **Pod Down**:
   ```yaml
   - alert: MCPServerDown
     expr: up{job="mcp-email-server"} == 0
     for: 5m
     annotations:
       summary: "MCP Email Server is down"
       description: "MCP Email Server has been down for 5 minutes"
   ```

2. **High Error Rate**:
   ```yaml
   - alert: HighErrorRate
     expr: rate(email_processing_errors_total[5m]) > 0.1
     for: 10m
     annotations:
       summary: "High email processing error rate"
       description: "Error rate is {{ $value }} errors per second"
   ```

3. **Graph API Failures**:
   ```yaml
   - alert: GraphAPIFailures
     expr: rate(graph_api_errors_total[5m]) > 0.05
     for: 5m
     annotations:
       summary: "Microsoft Graph API failures"
       description: "Graph API error rate is {{ $value }} per second"
   ```

### Alert Routing

```yaml
route:
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  receiver: 'team-email'
  routes:
  - match:
      severity: critical
    receiver: 'pagerduty'
  - match:
      severity: warning
    receiver: 'slack'
```

## Backup & Recovery

### What to Backup

1. **Configuration**:
   ```bash
   # Backup ConfigMaps and Secrets
   kubectl get configmap,secret -n mcp-email-processing -o yaml > backup-config.yaml
   ```

2. **Subscription State**:
   - Graph subscriptions are recreated on startup
   - No backup needed

3. **Deployment Configuration**:
   ```bash
   # Backup all K8s resources
   kubectl get all,ingress,networkpolicy -n mcp-email-processing -o yaml > backup-resources.yaml
   ```

### Recovery Procedures

1. **Full Recovery**:
   ```bash
   # Create namespace
   kubectl create namespace mcp-email-processing
   
   # Restore configuration
   kubectl apply -f backup-config.yaml
   
   # Restore resources
   kubectl apply -f backup-resources.yaml
   ```

2. **Partial Recovery** (just the app):
   ```bash
   # Redeploy using scripts
   ./scripts/deploy.sh
   ```

## Performance Tuning

### Optimizing for High Volume

1. **Increase Resources**:
   ```yaml
   resources:
     requests:
       memory: "512Mi"
       cpu: "250m"
     limits:
       memory: "1Gi"
       cpu: "1000m"
   ```

2. **Adjust Webhook Processing**:
   - Implement queue for webhook processing
   - Add Redis for temporary storage
   - Use job queue for email processing

3. **Graph API Optimization**:
   - Batch API requests
   - Implement caching where appropriate
   - Use delta queries for changes

### Connection Pool Tuning

```javascript
// In email service
const graphClient = Client.initWithMiddleware({
  authProvider,
  defaultVersion: 'v1.0',
  fetchOptions: {
    pool: {
      maxSockets: 50
    }
  }
});
```

## Troubleshooting Playbook

### Issue: Webhook Not Receiving Notifications

1. **Check Ingress**:
   ```bash
   kubectl describe ingress mcp-email-server -n mcp-email-processing
   ```

2. **Verify Subscription**:
   ```bash
   kubectl logs -n mcp-email-processing -l app=mcp-email-server | grep subscription
   ```

3. **Test Webhook Endpoint**:
   ```bash
   curl -X POST https://your-domain.com/webhook \
     -H "Content-Type: application/json" \
     -d '{"test": "data"}'
   ```

### Issue: High Memory Usage

1. **Check for Memory Leaks**:
   ```bash
   kubectl top pod -n mcp-email-processing
   ```

2. **Get Heap Dump**:
   ```bash
   kubectl exec -n mcp-email-processing deploy/mcp-email-server -- \
     kill -USR2 1
   ```

3. **Analyze Logs**:
   ```bash
   kubectl logs -n mcp-email-processing -l app=mcp-email-server | \
     grep -i "memory\|heap"
   ```

### Issue: Authentication Failures

1. **Verify Credentials**:
   ```bash
   kubectl get secret mcp-email-secret -n mcp-email-processing -o yaml
   ```

2. **Check Token Expiry**:
   ```bash
   kubectl logs -n mcp-email-processing -l app=mcp-email-server | \
     grep -i "token\|auth"
   ```

3. **Test Graph API Access**:
   ```bash
   # Use Graph Explorer to test with same credentials
   ```

## Maintenance Windows

### Planning Maintenance

1. **Pre-Maintenance Checklist**:
   - [ ] Notify stakeholders
   - [ ] Backup configuration
   - [ ] Prepare rollback plan
   - [ ] Test in staging

2. **During Maintenance**:
   ```bash
   # Scale down to prevent processing
   kubectl scale deployment mcp-email-server --replicas=0 -n mcp-email-processing
   
   # Perform maintenance
   # ...
   
   # Scale back up
   kubectl scale deployment mcp-email-server --replicas=1 -n mcp-email-processing
   ```

3. **Post-Maintenance**:
   - [ ] Verify health endpoint
   - [ ] Check webhook functionality
   - [ ] Monitor for errors
   - [ ] Update documentation

### Zero-Downtime Updates

For updates without downtime:
```bash
# Update image
kubectl set image deployment/mcp-email-server \
  mcp-server=your-registry/mcp-email-server:new-tag \
  -n mcp-email-processing

# Watch rollout
kubectl rollout status deployment/mcp-email-server -n mcp-email-processing
```

## Runbooks

### Runbook: Emergency Shutdown

**When to use**: Security incident, data breach, critical bug

```bash
#!/bin/bash
# emergency-shutdown.sh

echo "Emergency shutdown initiated at $(date)"

# Scale to zero
kubectl scale deployment mcp-email-server --replicas=0 -n mcp-email-processing

# Delete ingress to prevent access
kubectl delete ingress mcp-email-server -n mcp-email-processing

# Preserve logs
kubectl logs -n mcp-email-processing -l app=mcp-email-server > emergency-logs-$(date +%Y%m%d-%H%M%S).txt

echo "Shutdown complete. Logs preserved."
```

### Runbook: Graph Subscription Refresh

**When to use**: Subscriptions expired or not working

```bash
#!/bin/bash
# refresh-subscriptions.sh

echo "Refreshing Graph subscriptions..."

# Delete pod to force recreation
kubectl delete pod -n mcp-email-processing -l app=mcp-email-server

# Wait for new pod
kubectl wait --for=condition=ready pod -n mcp-email-processing -l app=mcp-email-server --timeout=300s

# Verify subscription created
kubectl logs -n mcp-email-processing -l app=mcp-email-server | grep "subscription created"
```

### Runbook: Performance Diagnostics

**When to use**: Slow processing, high latency

```bash
#!/bin/bash
# performance-diagnostics.sh

echo "Running performance diagnostics..."

# Get resource usage
echo "=== Resource Usage ==="
kubectl top pod -n mcp-email-processing

# Get recent errors
echo "=== Recent Errors ==="
kubectl logs -n mcp-email-processing -l app=mcp-email-server --since=1h | grep ERROR

# Get processing times
echo "=== Processing Times ==="
kubectl logs -n mcp-email-processing -l app=mcp-email-server --since=1h | grep "Processing email"

# Check API latency
echo "=== API Response Times ==="
kubectl logs -n mcp-email-processing -l app=mcp-email-server --since=1h | grep "API Response"
```

## Capacity Planning

### Metrics to Track

1. **Email Volume**:
   - Emails per hour/day
   - Peak processing times
   - Growth trends

2. **Resource Usage**:
   - CPU utilization
   - Memory consumption
   - Network bandwidth

3. **API Limits**:
   - Graph API quota usage
   - Rate limit proximity

### Scaling Guidelines

| Emails/Hour | Recommended Config |
|-------------|-------------------|
| < 100 | 1 replica, 256Mi RAM |
| 100-500 | 1 replica, 512Mi RAM |
| 500-1000 | 2 replicas, 512Mi RAM |
| > 1000 | 3 replicas, 1Gi RAM |

Note: Multiple replicas require coordination for Graph subscriptions.

## Disaster Recovery

### RTO/RPO Targets

- **RTO** (Recovery Time Objective): 30 minutes
- **RPO** (Recovery Point Objective): 0 (no data storage)

### DR Procedures

1. **Primary Region Failure**:
   ```bash
   # Deploy to DR region
   kubectl config use-context dr-cluster
   ./scripts/deploy.sh
   ```

2. **Verify DR Deployment**:
   ```bash
   # Update DNS to point to DR
   # Test webhook endpoint
   # Monitor for email processing
   ```

## SLA Monitoring

Track and report on:
- Uptime percentage
- Email processing time
- Failed processing rate
- API response time

Generate monthly reports:
```bash
# Example Prometheus query for uptime
100 * (1 - avg_over_time(up{job="mcp-email-server"}[30d]))
```