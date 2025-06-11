#!/bin/bash
set -e

# MCP Collections Server Rollback Script

# Configuration
NAMESPACE="${NAMESPACE:-mcp-collections}"
DEPLOYMENT="mcp-collections-server"

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

# Show rollout history
show_history() {
    log_info "Rollout history for $DEPLOYMENT:"
    kubectl rollout history deployment/$DEPLOYMENT -n $NAMESPACE
}

# Perform rollback
rollback() {
    local revision=$1
    
    if [ -z "$revision" ]; then
        log_info "Rolling back to previous version..."
        kubectl rollout undo deployment/$DEPLOYMENT -n $NAMESPACE
    else
        log_info "Rolling back to revision $revision..."
        kubectl rollout undo deployment/$DEPLOYMENT -n $NAMESPACE --to-revision=$revision
    fi
    
    # Wait for rollback
    log_info "Waiting for rollback to complete..."
    kubectl rollout status deployment/$DEPLOYMENT -n $NAMESPACE --timeout=300s
    
    # Show current status
    log_info "Current deployment status:"
    kubectl get deployment $DEPLOYMENT -n $NAMESPACE
    kubectl get pods -n $NAMESPACE -l app=$DEPLOYMENT
}

# Main execution
main() {
    log_info "MCP Collections Server Rollback"
    
    # Check if deployment exists
    if ! kubectl get deployment $DEPLOYMENT -n $NAMESPACE &> /dev/null; then
        log_error "Deployment $DEPLOYMENT not found in namespace $NAMESPACE"
        exit 1
    fi
    
    show_history
    
    if [ "$1" == "--history-only" ]; then
        exit 0
    fi
    
    echo -e "\nDo you want to rollback? (y/N): "
    read -r confirm
    
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        log_info "Rollback cancelled"
        exit 0
    fi
    
    if [ -n "$1" ] && [ "$1" != "--history-only" ]; then
        rollback "$1"
    else
        rollback
    fi
    
    log_info "Rollback completed!"
}

# Run main function
main "$@"