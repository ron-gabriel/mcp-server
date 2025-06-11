#!/bin/bash
set -e

# MCP Collections Server Deployment Script

# Configuration
NAMESPACE="${NAMESPACE:-mcp-collections}"
REGISTRY="${REGISTRY:-your-registry}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
ENVIRONMENT="${ENVIRONMENT:-production}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed"
        exit 1
    fi
    
    # Check if connected to cluster
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Not connected to a Kubernetes cluster"
        exit 1
    fi
    
    # Check if namespace exists
    if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
        log_warn "Namespace $NAMESPACE does not exist. Creating..."
        kubectl create namespace "$NAMESPACE"
    fi
    
    # Check if config files exist
    if [ ! -f "k8s/config.env" ]; then
        log_error "k8s/config.env not found. Copy k8s/config.env.example and update values"
        exit 1
    fi
    
    if [ ! -f "k8s/secrets.env" ]; then
        log_error "k8s/secrets.env not found. Copy k8s/secrets.env.example and update values"
        exit 1
    fi
}

# Build and push Docker image
build_and_push() {
    log_info "Building Docker image..."
    docker build -t "$REGISTRY/mcp-collections-server:$IMAGE_TAG" .
    
    log_info "Pushing Docker image..."
    docker push "$REGISTRY/mcp-collections-server:$IMAGE_TAG"
}

# Deploy to Kubernetes
deploy() {
    log_info "Deploying to Kubernetes..."
    
    # Export variables for kustomize
    export REGISTRY
    export IMAGE_TAG
    export ENVIRONMENT
    export NAMESPACE
    
    # Apply kustomization
    kubectl apply -k k8s/ -n "$NAMESPACE"
    
    # Wait for deployment
    log_info "Waiting for deployment to be ready..."
    kubectl rollout status deployment/mcp-collections-server -n "$NAMESPACE" --timeout=300s
    
    # Show pod status
    log_info "Pod status:"
    kubectl get pods -n "$NAMESPACE" -l app=mcp-collections-server
}

# Main execution
main() {
    log_info "Starting deployment of MCP Collections Server"
    
    check_prerequisites
    
    if [ "$SKIP_BUILD" != "true" ]; then
        build_and_push
    else
        log_warn "Skipping Docker build (SKIP_BUILD=true)"
    fi
    
    deploy
    
    log_info "Deployment completed successfully!"
    log_info "Webhook URL: $(kubectl get ingress mcp-collections-server -n $NAMESPACE -o jsonpath='{.spec.rules[0].host}')"
}

# Run main function
main "$@"