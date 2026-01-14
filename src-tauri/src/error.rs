use thiserror::Error;

#[derive(Debug, Error)]
pub enum K8sError {
    #[error("Kubeconfig not found or unreadable")]
    Kubeconfig(#[from] kube::config::KubeconfigError),
    #[error("Client not initialized")]
    ClientMissing,
    #[error("Kubernetes error: {0}")]
    Kube(#[from] kube::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Serialization error: {0}")]
    Serde(#[from] serde_json::Error),
}

pub type Result<T> = std::result::Result<T, K8sError>;

