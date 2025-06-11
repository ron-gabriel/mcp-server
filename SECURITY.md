# Security Guide

This document outlines security considerations and best practices for the MCP Email Processing Server.

## Table of Contents

1. [Security Overview](#security-overview)
2. [Authentication & Authorization](#authentication--authorization)
3. [Secrets Management](#secrets-management)
4. [Network Security](#network-security)
5. [Container Security](#container-security)
6. [Data Security](#data-security)
7. [Security Checklist](#security-checklist)
8. [Incident Response](#incident-response)

## Security Overview

The MCP Email Processing Server handles sensitive data including:
- Azure AD credentials
- Email content from designated inbox
- API keys for external services
- Email message data and attachments

All components must be secured appropriately.

## Authentication & Authorization

### Azure AD Application

1. **Principle of Least Privilege**:
   - Only grant required Graph API permissions:
     - `Mail.Read` - Read mail in all mailboxes
     - `Mail.ReadWrite` - Read and write mail in all mailboxes
   - Do NOT grant unnecessary permissions

2. **Application Secret Rotation**:
   ```bash
   # Create new secret in Azure Portal
   # Update Kubernetes secret
   kubectl create secret generic mcp-email-secret \
     --from-literal=AZURE_CLIENT_SECRET='new-secret' \
     --dry-run=client -o yaml | kubectl apply -f -
   
   # Restart pods to pick up new secret
   kubectl rollout restart deployment/mcp-email-server -n mcp-email-processing
   ```

3. **Conditional Access**:
   - Consider implementing conditional access policies
   - Restrict app access to specific IP ranges if possible

### API Authentication

1. **API Key Security**:
   - Use strong, randomly generated API keys
   - Rotate keys regularly
   - Never expose keys in logs or error messages

2. **Bearer Token Validation**:
   - Validate all incoming webhook requests
   - Use the `WEBHOOK_CLIENT_STATE` for request validation

## Secrets Management

### Never Store Secrets In:
- Source code
- Docker images
- ConfigMaps
- Git repositories
- Log files

### Recommended Secret Storage:

1. **Kubernetes Secrets** (baseline):
   ```bash
   # Create secret from file
   kubectl create secret generic mcp-email-secret \
     --from-env-file=secrets.env \
     -n mcp-email-processing
   ```

2. **Sealed Secrets** (better):
   ```bash
   # Install sealed-secrets controller
   kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.18.0/controller.yaml
   
   # Create sealed secret
   echo -n 'mysecret' | kubectl create secret generic mcp-secret \
     --dry-run=client --from-literal=key=/dev/stdin -o yaml | \
     kubeseal -o yaml > sealed-secret.yaml
   ```

3. **External Secret Operators** (best):
   - Azure Key Vault with CSI driver
   - HashiCorp Vault
   - AWS Secrets Manager

### Secret Rotation Procedures

1. **Azure Client Secret**:
   - Rotate every 90 days
   - Keep two valid secrets during rotation
   - Update automation after rotation

2. **API Keys**:
   - Rotate monthly or after any suspected compromise
   - Implement key versioning if possible

3. **Webhook Client State**:
   - Rotate when changing webhook URLs
   - Coordinate with Graph subscription updates

## Network Security

### Ingress Configuration

1. **TLS/SSL**:
   - Always use HTTPS for webhooks
   - Minimum TLS 1.2
   - Strong cipher suites only

2. **Rate Limiting**:
   ```yaml
   nginx.ingress.kubernetes.io/limit-rps: "10"
   nginx.ingress.kubernetes.io/limit-connections: "20"
   ```

3. **IP Allowlisting** (if possible):
   ```yaml
   nginx.ingress.kubernetes.io/whitelist-source-range: "52.159.0.0/16,40.74.0.0/16"
   ```

### Network Policies

The included NetworkPolicy restricts:
- Ingress: Only from ingress controller and monitoring
- Egress: Only to DNS, Microsoft Graph API, and configured endpoints

Customize based on your environment:
```yaml
# Add additional allowed namespaces
- from:
  - namespaceSelector:
      matchLabels:
        name: your-namespace
```

### Firewall Rules

For Azure/Cloud environments:
1. Restrict outbound to:
   - Microsoft Graph API endpoints
   - Your API endpoints
   - Container registry

2. Restrict inbound to:
   - Load balancer/Ingress controller only

## Container Security

### Image Security

1. **Base Image**:
   - Uses official Node.js Alpine image
   - Regularly update base images
   - Scan for vulnerabilities

2. **Vulnerability Scanning**:
   ```bash
   # Scan with Trivy
   trivy image mcp-email-server:latest
   
   # Scan with Docker Scout
   docker scout cves mcp-email-server:latest
   ```

3. **Image Signing**:
   ```bash
   # Sign with cosign
   cosign sign --key cosign.key mcp-email-server:latest
   ```

### Runtime Security

1. **Security Context**:
   - Non-root user (1001)
   - Read-only root filesystem
   - No privilege escalation
   - All capabilities dropped

2. **Resource Limits**:
   - CPU and memory limits prevent resource exhaustion
   - Ephemeral storage limits prevent disk filling

3. **Security Policies**:
   ```yaml
   # Pod Security Policy (deprecated)
   # Use Pod Security Standards instead
   apiVersion: v1
   kind: Namespace
   metadata:
     name: mcp-email-processing
     labels:
       pod-security.kubernetes.io/enforce: restricted
       pod-security.kubernetes.io/audit: restricted
       pod-security.kubernetes.io/warn: restricted
   ```

## Data Security

### Email Data

1. **Data in Transit**:
   - All Graph API calls use HTTPS
   - Webhook notifications are encrypted
   - Internal cluster traffic should use mTLS

2. **Data at Rest**:
   - No persistent storage of email content
   - Temporary files in memory-backed volumes
   - Logs should not contain email content

3. **Data Processing**:
   - Minimize data retention
   - Process and forward immediately
   - Don't log sensitive content

### Audit Logging

1. **What to Log**:
   - Authentication attempts
   - Webhook requests (without body)
   - API calls (without sensitive data)
   - Errors and exceptions

2. **What NOT to Log**:
   - Email content
   - Credentials
   - API keys
   - Personal information

3. **Log Retention**:
   - Follow your organization's policy
   - Typically 30-90 days
   - Ensure secure storage

## Security Checklist

### Pre-Deployment

- [ ] All secrets removed from code
- [ ] Docker image scanned for vulnerabilities
- [ ] Network policies configured
- [ ] TLS certificates valid
- [ ] Rate limiting configured
- [ ] Security headers configured
- [ ] Resource limits set
- [ ] Non-root user configured

### Post-Deployment

- [ ] Verify TLS is working
- [ ] Test rate limiting
- [ ] Verify network isolation
- [ ] Check logs for sensitive data
- [ ] Validate webhook authentication
- [ ] Test health endpoints
- [ ] Document security contacts

### Regular Maintenance

- [ ] Weekly: Review logs for anomalies
- [ ] Monthly: Update base images
- [ ] Monthly: Rotate API keys
- [ ] Quarterly: Rotate Azure credentials
- [ ] Quarterly: Security audit
- [ ] Annually: Penetration testing

## Incident Response

### Suspected Compromise

1. **Immediate Actions**:
   ```bash
   # Isolate the deployment
   kubectl scale deployment mcp-email-server --replicas=0 -n mcp-email-processing
   
   # Preserve logs
   kubectl logs -n mcp-email-processing -l app=mcp-email-server > incident-logs.txt
   ```

2. **Investigation**:
   - Review access logs
   - Check for unauthorized API calls
   - Verify webhook authenticity
   - Audit Azure AD sign-in logs

3. **Remediation**:
   - Rotate all credentials
   - Update and patch
   - Review and update security policies
   - Document lessons learned

### Security Contacts

Define and maintain:
- Security team contact
- On-call rotation
- Escalation procedures
- External security contacts

## Compliance Considerations

### GDPR

If processing EU data:
- Implement data minimization
- Ensure right to deletion
- Document data flows
- Implement appropriate controls

### Industry Standards

Consider implementing:
- CIS Kubernetes Benchmark
- NIST Cybersecurity Framework
- ISO 27001 controls
- SOC 2 requirements

## Security Tools

### Recommended Tools

1. **Scanning**:
   - Trivy - Container scanning
   - Falco - Runtime security
   - OPA - Policy enforcement

2. **Monitoring**:
   - Prometheus - Metrics
   - Grafana - Dashboards
   - AlertManager - Alerting

3. **Secrets**:
   - Sealed Secrets
   - External Secrets Operator
   - HashiCorp Vault

## Reporting Security Issues

If you discover a security vulnerability:

1. Do NOT open a public issue
2. Email security contact with:
   - Description of the issue
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

## Additional Resources

- [OWASP Kubernetes Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Kubernetes_Security_Cheat_Sheet.html)
- [CIS Kubernetes Benchmark](https://www.cisecurity.org/benchmark/kubernetes)
- [Kubernetes Security Best Practices](https://kubernetes.io/docs/concepts/security/)
- [Microsoft Graph Security Best Practices](https://docs.microsoft.com/en-us/graph/security-concept-overview)