use crate::error::{K8sError, Result};
use futures::{StreamExt, TryStreamExt};
use kube::{
    api::{Api, DeleteParams, DynamicObject, ListParams, LogParams, Resource, ResourceExt},
    config::{KubeConfigOptions, Kubeconfig},
    core::{ApiResource, GroupVersionKind, NamespaceResourceScope},
    runtime::watcher,
    Client, Config,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;

#[derive(Debug, Clone, Serialize)]
pub struct WatchEventPayload {
    pub action: String,
    pub kind: String,
    pub object: serde_json::Value,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ResourceKind {
    Pods,
    Deployments,
    Services,
    Nodes,
}

struct StateInner {
    client: Option<Client>,
    kubeconfig: Option<Kubeconfig>,
    current_context: Option<String>,
}

#[derive(Clone)]
pub struct K8sState {
    inner: Arc<RwLock<StateInner>>,
}

impl K8sState {
    pub async fn new() -> Result<Self> {
        let kubeconfig = Kubeconfig::read()?;
        let ctx_name = kubeconfig
            .current_context
            .clone()
            .or_else(|| kubeconfig.contexts.first().map(|c| c.name.clone()));
        let client = Self::client_for_context(&kubeconfig, ctx_name.clone()).await?;

        Ok(Self {
            inner: Arc::new(RwLock::new(StateInner {
                client: Some(client),
                kubeconfig: Some(kubeconfig),
                current_context: ctx_name,
            })),
        })
    }

    async fn client_for_context(kubeconfig: &Kubeconfig, context: Option<String>) -> Result<Client> {
        let opts = KubeConfigOptions {
            context,
            ..Default::default()
        };
        let config = Config::from_custom_kubeconfig(kubeconfig.clone(), &opts)
            .await?;
        Client::try_from(config).map_err(K8sError::Kube)
    }

    pub async fn reload_kubeconfig(&self) -> Result<Kubeconfig> {
        let cfg = Kubeconfig::read()?;
        Ok(cfg)
    }

    pub async fn list_contexts(&self) -> Result<Vec<String>> {
        let inner = self.inner.read().await;
        let kubeconfig = inner
            .kubeconfig
            .clone()
            .ok_or(K8sError::ClientMissing)?;
        Ok(kubeconfig.contexts.iter().map(|c| c.name.clone()).collect())
    }

    pub async fn switch_context(&self, name: String) -> Result<String> {
        let kubeconfig = self.reload_kubeconfig().await?;
        let client = Self::client_for_context(&kubeconfig, Some(name.clone())).await?;
        let mut inner = self.inner.write().await;
        inner.client = Some(client);
        inner.kubeconfig = Some(kubeconfig);
        inner.current_context = Some(name.clone());
        Ok(name)
    }

    pub async fn current_client(&self) -> Result<Client> {
        let inner = self.inner.read().await;
        inner
            .client
            .clone()
            .ok_or(K8sError::ClientMissing)
    }

    pub async fn list_resources(&self, kind: ResourceKind, namespace: Option<String>) -> Result<Vec<serde_json::Value>> {
        match kind {
            ResourceKind::Pods => {
                self.list_namespaced_direct::<k8s_openapi::api::core::v1::Pod>(namespace).await
            }
            ResourceKind::Deployments => {
                self.list_namespaced_direct::<k8s_openapi::api::apps::v1::Deployment>(namespace).await
            }
            ResourceKind::Services => {
                self.list_namespaced_direct::<k8s_openapi::api::core::v1::Service>(namespace).await
            }
            ResourceKind::Nodes => {
                self.list_cluster_scoped_direct::<k8s_openapi::api::core::v1::Node>().await
            }
        }
    }

    pub async fn start_watch(&self, app: AppHandle, kind: ResourceKind, namespace: Option<String>) -> Result<()> {
        match kind {
            ResourceKind::Pods => {
                self.watch_namespaced::<k8s_openapi::api::core::v1::Pod>(app, "pods", namespace).await?
            }
            ResourceKind::Deployments => {
                self.watch_namespaced::<k8s_openapi::api::apps::v1::Deployment>(app, "deployments", namespace).await?
            }
            ResourceKind::Services => {
                self.watch_namespaced::<k8s_openapi::api::core::v1::Service>(app, "services", namespace).await?
            }
            ResourceKind::Nodes => {
                self.watch_cluster_scoped::<k8s_openapi::api::core::v1::Node>(app, "nodes").await?
            }
        }
        Ok(())
    }

    async fn list_namespaced_direct<K>(&self, ns: Option<String>) -> Result<Vec<serde_json::Value>>
    where
        K: Clone + serde::de::DeserializeOwned + serde::Serialize + Resource<Scope = NamespaceResourceScope> + Send + Sync + std::fmt::Debug + 'static,
        <K as Resource>::DynamicType: Default + Eq + std::hash::Hash,
    {
        let client = self.current_client().await?;
        let api: Api<K> = match ns {
            Some(namespace) => Api::namespaced(client, &namespace),
            None => Api::all(client), // List from all namespaces
        };

        let list = api.list(&ListParams::default()).await.map_err(K8sError::Kube)?;
        let items: Vec<serde_json::Value> = list.items
            .iter()
            .map(|obj| serde_json::to_value(obj).unwrap_or_else(|_| json!({ "name": obj.name_any() })))
            .collect();

        Ok(items)
    }

    async fn list_cluster_scoped_direct<K>(&self) -> Result<Vec<serde_json::Value>>
    where
        K: Clone + serde::de::DeserializeOwned + serde::Serialize + Resource + Send + Sync + std::fmt::Debug + 'static,
        <K as Resource>::DynamicType: Default + Eq + std::hash::Hash,
    {
        let client = self.current_client().await?;
        let api: Api<K> = Api::all(client);

        let list = api.list(&ListParams::default()).await.map_err(K8sError::Kube)?;
        let items: Vec<serde_json::Value> = list.items
            .iter()
            .map(|obj| serde_json::to_value(obj).unwrap_or_else(|_| json!({ "name": obj.name_any() })))
            .collect();

        Ok(items)
    }

    async fn watch_namespaced<K>(&self, app: AppHandle, kind: &str, ns: Option<String>) -> Result<()>
    where
        K: Clone + serde::de::DeserializeOwned + serde::Serialize + Resource<Scope = NamespaceResourceScope> + Send + Sync + std::fmt::Debug + 'static,
        <K as Resource>::DynamicType: Default + Eq + std::hash::Hash,
    {
        let client = self.current_client().await?;
        let api: Api<K> = match ns {
            Some(namespace) => Api::namespaced(client, &namespace),
            None => Api::all(client), // Watch all namespaces
        };

        self.spawn_watcher(api, app, kind).await
    }

    async fn watch_cluster_scoped<K>(&self, app: AppHandle, kind: &str) -> Result<()>
    where
        K: Clone + serde::de::DeserializeOwned + serde::Serialize + Resource + Send + Sync + std::fmt::Debug + 'static,
        <K as Resource>::DynamicType: Default + Eq + std::hash::Hash,
    {
        let client = self.current_client().await?;
        let api: Api<K> = Api::all(client);
        self.spawn_watcher(api, app, kind).await
    }

    async fn spawn_watcher<K>(&self, api: Api<K>, app: AppHandle, kind: &str) -> Result<()>
    where
        K: Clone + serde::de::DeserializeOwned + serde::Serialize + Resource + Send + Sync + std::fmt::Debug + 'static,
        <K as Resource>::DynamicType: Default + Eq + std::hash::Hash,
    {
        let mut stream = watcher(api, watcher::Config::default()).boxed();
        let handle = app.clone();
        let kind_name = kind.to_string();

        tauri::async_runtime::spawn(async move {
            while let Some(evt) = stream.try_next().await.transpose() {
                match evt {
                    Ok(watcher::Event::Applied(obj)) => {
                        let payload = WatchEventPayload {
                            action: "applied".into(),
                            kind: kind_name.clone(),
                            object: serde_json::to_value(&obj).unwrap_or_else(|_| json!({ "name": obj.name_any() })),
                        };
                        let _ = handle.emit("resource://event", &payload);
                    }
                    Ok(watcher::Event::Deleted(obj)) => {
                        let payload = WatchEventPayload {
                            action: "deleted".into(),
                            kind: kind_name.clone(),
                            object: serde_json::to_value(&obj).unwrap_or_else(|_| json!({ "name": obj.name_any() })),
                        };
                        let _ = handle.emit("resource://event", &payload);
                    }
                    Ok(watcher::Event::Restarted(objs)) => {
                        for obj in objs {
                            let payload = WatchEventPayload {
                                action: "applied".into(),
                                kind: kind_name.clone(),
                                object: serde_json::to_value(&obj)
                                    .unwrap_or_else(|_| json!({ "name": obj.name_any() })),
                            };
                            let _ = handle.emit("resource://event", &payload);
                        }
                    }
                    Err(err) => {
                        let payload = WatchEventPayload {
                            action: "error".into(),
                            kind: kind_name.clone(),
                            object: json!({ "message": err.to_string() }),
                        };
                        let _ = handle.emit("resource://event", &payload);
                    }
                }
            }
        });

        Ok(())
    }

    pub async fn fetch_logs(
        &self,
        namespace: String,
        pod: String,
        container: Option<String>,
        tail_lines: Option<i64>,
    ) -> Result<String> {
        let client = self.current_client().await?;
        let api: Api<k8s_openapi::api::core::v1::Pod> = Api::namespaced(client, &namespace);
        let mut lp = LogParams::default();
        lp.container = container;
        lp.tail_lines = tail_lines;
        api.logs(&pod, &lp).await.map_err(K8sError::Kube)
    }

    pub async fn get_pod(
        &self,
        namespace: String,
        pod_name: String,
    ) -> Result<serde_json::Value> {
        let client = self.current_client().await?;
        let api: Api<k8s_openapi::api::core::v1::Pod> = Api::namespaced(client, &namespace);
        let pod = api.get(&pod_name).await.map_err(K8sError::Kube)?;
        serde_json::to_value(pod).map_err(K8sError::Serde)
    }

    pub async fn stream_pod_logs(
        &self,
        app: AppHandle,
        namespace: String,
        pod_name: String,
        container: Option<String>,
    ) -> Result<()> {
        let state = self.clone();
        let handle = app.clone();
        let event_name = format!("pod-logs://{}/{}", namespace, pod_name);
        let ns = namespace.clone();
        let pn = pod_name.clone();
        let cont = container.clone();
        
        tauri::async_runtime::spawn(async move {
            let mut last_size = 0u64;
            
            // First, get initial logs
            match state.fetch_logs(ns.clone(), pn.clone(), cont.clone(), Some(200)).await {
                Ok(logs) => {
                    let _ = handle.emit(&event_name, &json!({ "logs": logs, "append": false }));
                    last_size = logs.len() as u64;
                }
                Err(err) => {
                    let _ = handle.emit(&event_name, &json!({ "error": err.to_string() }));
                    return;
                }
            }
            
            // Then poll for updates
            loop {
                tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
                
                match state.fetch_logs(ns.clone(), pn.clone(), cont.clone(), None).await {
                    Ok(logs) => {
                        let current_size = logs.len() as u64;
                        if current_size > last_size {
                            // Only send the new portion
                            let new_logs: String = logs.chars().skip(last_size as usize).collect();
                            if !new_logs.is_empty() {
                                let _ = handle.emit(&event_name, &json!({ "logs": new_logs, "append": true }));
                                last_size = current_size;
                            }
                        }
                    }
                    Err(err) => {
                        let _ = handle.emit(&event_name, &json!({ "error": err.to_string() }));
                        break;
                    }
                }
            }
        });
        
        Ok(())
    }

    pub async fn delete_resource(&self, kind: ResourceKind, namespace: String, name: String) -> Result<()> {
        let client = self.current_client().await?;
        let dp = DeleteParams::default();

        match kind {
            ResourceKind::Pods => {
                let api: Api<k8s_openapi::api::core::v1::Pod> = Api::namespaced(client, &namespace);
                api.delete(&name, &dp).await.map_err(K8sError::Kube)?;
            }
            ResourceKind::Deployments => {
                let api: Api<k8s_openapi::api::apps::v1::Deployment> = Api::namespaced(client, &namespace);
                api.delete(&name, &dp).await.map_err(K8sError::Kube)?;
            }
            ResourceKind::Services => {
                let api: Api<k8s_openapi::api::core::v1::Service> = Api::namespaced(client, &namespace);
                api.delete(&name, &dp).await.map_err(K8sError::Kube)?;
            }
            ResourceKind::Nodes => {
                let api: Api<k8s_openapi::api::core::v1::Node> = Api::all(client);
                api.delete(&name, &dp).await.map_err(K8sError::Kube)?;
            }
        }

        Ok(())
    }

    pub async fn get_pod_metrics(
        &self,
        namespace: String,
        pod_name: String,
    ) -> Result<serde_json::Value> {
        let client = self.current_client().await?;
        
        // Construct ApiResource for metrics.k8s.io/v1beta1 PodMetrics
        // The plural name for PodMetrics is "pods" in the metrics API
        let gvk = GroupVersionKind::gvk("metrics.k8s.io", "v1beta1", "PodMetrics");
        let api_resource = ApiResource::from_gvk_with_plural(&gvk, "pods");
        
        // Ensure the ApiResource is namespaced (which it should be for pods)
        let api: Api<DynamicObject> = Api::namespaced_with(client, &namespace, &api_resource);
        
        // Try to get the metrics
        match api.get(&pod_name).await {
            Ok(metrics) => {
                serde_json::to_value(metrics).map_err(K8sError::Serde)
            }
            Err(kube::Error::Api(kube::error::ErrorResponse { code: 404, message, reason, .. })) => {
                // For 404, check if it's likely a metrics server issue
                // Common reasons: pod not found, metrics server not available
                let error_msg = if message.contains("not found") || message.is_empty() {
                    format!("Pod '{}' metrics not found. {}", pod_name, 
                        if message.is_empty() { "Metrics Server may not be available." } else { &message })
                } else {
                    format!("Metrics Server error: {}", message)
                };
                
                eprintln!("Metrics fetch failed (404): reason={}, message={}", reason, message);
                Err(K8sError::Kube(kube::Error::Api(kube::error::ErrorResponse {
                    code: 404,
                    message: error_msg,
                    reason: "NotFound".to_string(),
                    status: "Failure".to_string(),
                })))
            }
            Err(kube::Error::Api(kube::error::ErrorResponse { code, message, reason, .. })) => {
                // Other API errors - log and pass through
                let error_msg = format!("Metrics API error ({}): {}", code, message);
                eprintln!("Metrics API error: code={}, reason={}, message={}", code, reason, message);
                Err(K8sError::Kube(kube::Error::Api(kube::error::ErrorResponse {
                    code,
                    message: error_msg,
                    reason,
                    status: "Failure".to_string(),
                })))
            }
            Err(e) => {
                // Log the actual error for debugging
                eprintln!("Error fetching metrics for pod {}/{}: {:?}", namespace, pod_name, e);
                Err(K8sError::Kube(e))
            }
        }
    }
}

