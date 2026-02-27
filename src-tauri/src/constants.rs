use std::time::Duration;

pub const PORT_FORWARD_BUFFER_SIZE: usize = 4096;
pub const INITIAL_RECONNECT_DELAY: Duration = Duration::from_secs(1);
pub const MAX_RECONNECT_DELAY: Duration = Duration::from_secs(30);
pub const MAX_KUBECTL_CONNECT_RETRIES: u32 = 30;
pub const KUBECTL_RETRY_INTERVAL: Duration = Duration::from_millis(100);
pub const DEFAULT_LOG_TAIL_LINES: i64 = 200;

// Resource listing limits
pub const MAX_LIST_RESOURCES: u32 = 500;
pub const MAX_SEARCH_RESULTS: usize = 200;
pub const MAX_DASHBOARD_RESOURCES: u32 = 1000;

// AI response streaming limit
pub const MAX_AI_RESPONSE_BYTES: usize = 2 * 1024 * 1024; // 2MB

// YAML input size limit
pub const MAX_YAML_INPUT_BYTES: usize = 5 * 1024 * 1024; // 5MB
