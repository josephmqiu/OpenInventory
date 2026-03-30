use std::net::{IpAddr, TcpListener as StdTcpListener};
use std::sync::Mutex;

use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::{header, HeaderValue, Request, StatusCode, Uri};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, post, put};
use axum::{Json, Router};
use include_dir::{include_dir, Dir};
use local_ip_address::list_afinet_netifas;
use mime_guess::from_path;
use rand::distributions::{Alphanumeric, DistString};
use serde::Deserialize;
use serde_json::json;
use tauri::async_runtime::JoinHandle;
use tokio::net::TcpListener;
use tokio::sync::oneshot;

use crate::application::inventory_service;
use crate::domain::error::{AppError, AppResult};
use crate::domain::models::{
    AddPersonnelInput, AppSnapshot, CreateInventoryItemInput, LanAccessState, LanAccessStatus,
    Language, PublicIssueContext, StockMutationInput, UpdateBackupPlanInput,
    UpdateInventoryItemInput, UpdateLanAccessInput,
};
use crate::infrastructure::db::{InventoryDb, LanAccessSettings};

static EMBEDDED_FRONTEND: Dir<'static> = include_dir!("$CARGO_MANIFEST_DIR/../dist");

#[derive(Clone)]
struct HttpApiState {
    db: InventoryDb,
    access_key: String,
}

struct RuntimeState {
    status: LanAccessStatus,
    status_message: String,
    urls: Vec<String>,
    shutdown: Option<oneshot::Sender<()>>,
    task: Option<JoinHandle<()>>,
}

pub struct LanServerController {
    db: InventoryDb,
    runtime: Mutex<RuntimeState>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateLanguagePayload {
    language: Language,
}

struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {}

impl From<AppError> for ApiError {
    fn from(value: AppError) -> Self {
        let status = match value {
            AppError::NotFound(_) => StatusCode::NOT_FOUND,
            AppError::DuplicateSku(_) | AppError::InsufficientStock { .. } => StatusCode::CONFLICT,
            AppError::ValidationError(_) => StatusCode::BAD_REQUEST,
            AppError::DatabaseError(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };

        Self {
            status,
            message: value.to_string(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(json!({
                "message": self.message,
            })),
        )
            .into_response()
    }
}

impl LanServerController {
    pub fn new(db: InventoryDb) -> AppResult<Self> {
        let controller = Self {
            db,
            runtime: Mutex::new(RuntimeState {
                status: LanAccessStatus::Stopped,
                status_message: "LAN access is disabled.".into(),
                urls: Vec::new(),
                shutdown: None,
                task: None,
            }),
        };

        let mut settings = controller.db.load_lan_access_settings()?;
        if settings.access_key.trim().is_empty() {
            settings.access_key = generate_access_key();
            controller.db.save_lan_access_settings(&settings)?;
        }
        controller.apply_settings(&settings)?;

        Ok(controller)
    }

    pub fn load_state(&self) -> AppResult<LanAccessState> {
        let settings = self.db.load_lan_access_settings()?;
        Ok(self.state_from_settings(&settings))
    }

    pub fn update_settings(&self, input: UpdateLanAccessInput) -> AppResult<LanAccessState> {
        if input.port == 0 {
            return Err(AppError::ValidationError(
                "LAN access port must be between 1 and 65535.".into(),
            ));
        }

        let mut settings = self.db.load_lan_access_settings()?;
        settings.enabled = input.enabled;
        settings.port = input.port;
        settings.primary_url.clear();
        self.db.save_lan_access_settings(&settings)?;
        self.apply_settings(&settings)?;
        Ok(self.state_from_settings(&settings))
    }

    pub fn regenerate_access_key(&self) -> AppResult<LanAccessState> {
        let mut settings = self.db.load_lan_access_settings()?;
        settings.access_key = generate_access_key();
        self.db.save_lan_access_settings(&settings)?;
        self.apply_settings(&settings)?;
        Ok(self.state_from_settings(&settings))
    }

    fn apply_settings(&self, settings: &LanAccessSettings) -> AppResult<()> {
        self.stop_server();

        if !settings.enabled {
            self.db.refresh_qr_assets()?;
            let mut runtime = self
                .runtime
                .lock()
                .map_err(|_| AppError::DatabaseError("LAN server state is unavailable.".into()))?;
            runtime.status = LanAccessStatus::Stopped;
            runtime.status_message = "LAN access is disabled.".into();
            runtime.urls.clear();
            return Ok(());
        }

        match start_server(settings, self.db.clone()) {
            Ok(started) => {
                let primary_url = started
                    .urls
                    .iter()
                    .find(|url| !url.contains("localhost"))
                    .cloned()
                    .or_else(|| started.urls.first().cloned())
                    .unwrap_or_default();
                let mut updated_settings = self.db.load_lan_access_settings()?;
                updated_settings.primary_url = primary_url;
                self.db.save_lan_access_settings(&updated_settings)?;
                self.db.refresh_qr_assets()?;
                let mut runtime = self.runtime.lock().map_err(|_| {
                    AppError::DatabaseError("LAN server state is unavailable.".into())
                })?;
                runtime.status = LanAccessStatus::Running;
                runtime.status_message = "LAN access is running on your local network.".into();
                runtime.urls = started.urls;
                runtime.shutdown = Some(started.shutdown);
                runtime.task = Some(started.task);
                Ok(())
            }
            Err(error) => {
                let mut runtime = self.runtime.lock().map_err(|_| {
                    AppError::DatabaseError("LAN server state is unavailable.".into())
                })?;
                runtime.status = LanAccessStatus::Error;
                runtime.status_message = error.to_string();
                runtime.urls.clear();
                runtime.shutdown = None;
                runtime.task = None;
                Err(error)
            }
        }
    }

    fn stop_server(&self) {
        if let Ok(mut runtime) = self.runtime.lock() {
            if let Some(shutdown) = runtime.shutdown.take() {
                let _ = shutdown.send(());
            }
            runtime.task.take();
        }
    }

    fn state_from_settings(&self, settings: &LanAccessSettings) -> LanAccessState {
        let runtime = self.runtime.lock().expect("LAN server state lock poisoned");
        LanAccessState {
            enabled: settings.enabled,
            port: settings.port,
            access_key: settings.access_key.clone(),
            urls: runtime.urls.clone(),
            status: runtime.status.clone(),
            status_message: runtime.status_message.clone(),
        }
    }
}

struct StartedServer {
    urls: Vec<String>,
    shutdown: oneshot::Sender<()>,
    task: JoinHandle<()>,
}

fn start_server(settings: &LanAccessSettings, db: InventoryDb) -> AppResult<StartedServer> {
    let listener = bind_listener(settings.port)?;
    let urls = build_access_urls(settings.port);
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    let access_key = settings.access_key.clone();
    let router = build_router(db, access_key);

    let task = tauri::async_runtime::spawn(async move {
        let listener = match TcpListener::from_std(listener) {
            Ok(listener) => listener,
            Err(error) => {
                eprintln!("LAN server failed to attach to Tokio runtime: {error}");
                return;
            }
        };

        if let Err(error) = axum::serve(listener, router.into_make_service())
            .with_graceful_shutdown(async move {
                let _ = shutdown_rx.await;
            })
            .await
        {
            eprintln!("LAN server stopped unexpectedly: {error}");
        }
    });

    Ok(StartedServer {
        urls,
        shutdown: shutdown_tx,
        task,
    })
}

fn bind_listener(port: u16) -> AppResult<StdTcpListener> {
    let std_listener = StdTcpListener::bind(("0.0.0.0", port)).map_err(|error| {
        AppError::DatabaseError(format!(
            "Unable to start LAN access on port {}. Check whether another app is already using it. {}",
            port, error
        ))
    })?;
    std_listener.set_nonblocking(true).map_err(AppError::from)?;
    Ok(std_listener)
}

fn build_access_urls(port: u16) -> Vec<String> {
    let mut hosts = vec!["localhost".to_string()];

    if let Ok(interfaces) = list_afinet_netifas() {
        let mut ranked: Vec<(i32, String)> = interfaces
            .into_iter()
            .filter_map(|(name, ip)| match ip {
                IpAddr::V4(address) if !address.is_loopback() => Some((
                    interface_priority(&name, &address.to_string()),
                    address.to_string(),
                )),
                _ => None,
            })
            .collect();

        ranked.sort_by(|left, right| right.0.cmp(&left.0).then_with(|| left.1.cmp(&right.1)));

        for (_, host) in ranked {
            if !hosts.contains(&host) {
                hosts.push(host);
            }
        }
    }

    hosts
        .into_iter()
        .map(|host| format!("http://{}:{}", host, port))
        .collect()
}

fn interface_priority(name: &str, ip: &str) -> i32 {
    let lower = name.to_ascii_lowercase();

    if lower.contains("wi-fi") || lower.contains("wifi") || lower.contains("wireless") {
        return 400;
    }
    if lower == "ethernet" || lower.contains("ethernet") {
        return 300;
    }
    if lower.contains("wsl") || lower.contains("vethernet") || lower.contains("virtual") {
        return 50;
    }
    if ip.starts_with("192.168.") {
        return 250;
    }
    if ip.starts_with("10.") {
        return 240;
    }
    if ip.starts_with("172.") {
        return 200;
    }

    100
}

fn build_router(db: InventoryDb, access_key: String) -> Router {
    let state = HttpApiState { db, access_key };

    let api = Router::new()
        .route("/health", get(http_health))
        .route("/snapshot", get(load_snapshot))
        .route("/items", post(create_inventory_item))
        .route(
            "/items/:item_id",
            put(update_inventory_item).delete(remove_inventory_item),
        )
        .route("/items/:item_id/receive", post(receive_stock))
        .route("/items/:item_id/issue", post(issue_material))
        .route("/personnel", post(add_personnel))
        .route("/personnel/:personnel_id", delete(remove_personnel))
        .route("/backup-plan", put(update_backup_plan))
        .route("/language", put(update_language))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            require_access_key,
        ))
        .with_state(state.clone());

    let public = Router::new()
        .route("/items/:item_id/context", get(load_public_issue_context))
        .route("/items/:item_id/issue", post(issue_material_public))
        .with_state(state.clone());

    Router::new()
        .nest("/api", api)
        .nest("/public", public)
        .route("/", get(serve_embedded_app))
        .route("/*path", get(serve_embedded_app))
        .with_state(state)
}

async fn require_access_key(
    State(state): State<HttpApiState>,
    request: Request<Body>,
    next: Next,
) -> Response {
    let provided = request
        .headers()
        .get("x-inventory-key")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();

    if provided != state.access_key {
        return ApiError {
            status: StatusCode::UNAUTHORIZED,
            message: "Access key required or invalid.".into(),
        }
        .into_response();
    }

    next.run(request).await
}

async fn http_health() -> Json<serde_json::Value> {
    Json(json!({
        "status": "ready",
        "storage": "sqlite-local",
    }))
}

async fn load_snapshot(State(state): State<HttpApiState>) -> Result<Json<AppSnapshot>, ApiError> {
    inventory_service::load_snapshot(&state.db)
        .map(Json)
        .map_err(ApiError::from)
}

async fn load_public_issue_context(
    Path(item_id): Path<String>,
    State(state): State<HttpApiState>,
) -> Result<Json<PublicIssueContext>, ApiError> {
    inventory_service::load_public_issue_context(&state.db, &item_id)
        .map(Json)
        .map_err(ApiError::from)
}

async fn create_inventory_item(
    State(state): State<HttpApiState>,
    Json(input): Json<CreateInventoryItemInput>,
) -> Result<Json<AppSnapshot>, ApiError> {
    let result =
        inventory_service::create_inventory_item(&state.db, input).map_err(ApiError::from)?;
    Ok(Json(result.snapshot))
}

async fn update_inventory_item(
    Path(item_id): Path<String>,
    State(state): State<HttpApiState>,
    Json(mut input): Json<UpdateInventoryItemInput>,
) -> Result<Json<AppSnapshot>, ApiError> {
    input.item_id = item_id;
    let result =
        inventory_service::update_inventory_item(&state.db, input).map_err(ApiError::from)?;
    Ok(Json(result.snapshot))
}

async fn receive_stock(
    Path(item_id): Path<String>,
    State(state): State<HttpApiState>,
    Json(mut input): Json<StockMutationInput>,
) -> Result<Json<AppSnapshot>, ApiError> {
    input.item_id = item_id;
    let result = inventory_service::receive_stock(&state.db, input).map_err(ApiError::from)?;
    Ok(Json(result.snapshot))
}

async fn issue_material(
    Path(item_id): Path<String>,
    State(state): State<HttpApiState>,
    Json(mut input): Json<StockMutationInput>,
) -> Result<Json<AppSnapshot>, ApiError> {
    input.item_id = item_id;
    let result = inventory_service::issue_material(&state.db, input).map_err(ApiError::from)?;
    Ok(Json(result.snapshot))
}

async fn issue_material_public(
    Path(item_id): Path<String>,
    State(state): State<HttpApiState>,
    Json(mut input): Json<StockMutationInput>,
) -> Result<Json<PublicIssueContext>, ApiError> {
    input.item_id = item_id;
    inventory_service::issue_material_public(&state.db, input)
        .map(Json)
        .map_err(ApiError::from)
}

async fn update_backup_plan(
    State(state): State<HttpApiState>,
    Json(input): Json<UpdateBackupPlanInput>,
) -> Result<Json<AppSnapshot>, ApiError> {
    inventory_service::update_backup_plan(&state.db, input)
        .map(Json)
        .map_err(ApiError::from)
}

async fn update_language(
    State(state): State<HttpApiState>,
    Json(payload): Json<UpdateLanguagePayload>,
) -> Result<StatusCode, ApiError> {
    inventory_service::update_language(&state.db, payload.language).map_err(ApiError::from)?;
    Ok(StatusCode::NO_CONTENT)
}

async fn remove_inventory_item(
    Path(item_id): Path<String>,
    State(state): State<HttpApiState>,
) -> Result<Json<AppSnapshot>, ApiError> {
    inventory_service::remove_inventory_item(&state.db, item_id)
        .map(Json)
        .map_err(ApiError::from)
}

async fn add_personnel(
    State(state): State<HttpApiState>,
    Json(input): Json<AddPersonnelInput>,
) -> Result<Json<AppSnapshot>, ApiError> {
    inventory_service::add_personnel(&state.db, input)
        .map(Json)
        .map_err(ApiError::from)
}

async fn remove_personnel(
    Path(personnel_id): Path<String>,
    State(state): State<HttpApiState>,
) -> Result<Json<AppSnapshot>, ApiError> {
    inventory_service::remove_personnel(&state.db, personnel_id)
        .map(Json)
        .map_err(ApiError::from)
}

async fn serve_embedded_app(uri: Uri) -> Response {
    serve_embedded_file(uri.path())
}

fn serve_embedded_file(request_path: &str) -> Response {
    let path = request_path.trim_start_matches('/');
    let asset_path = if path.is_empty() { "index.html" } else { path };
    let file = EMBEDDED_FRONTEND
        .get_file(asset_path)
        .or_else(|| {
            asset_path
                .find("assets/")
                .and_then(|index| EMBEDDED_FRONTEND.get_file(&asset_path[index..]))
        })
        .or_else(|| {
            (!asset_path.contains('.'))
                .then(|| EMBEDDED_FRONTEND.get_file("index.html"))
                .flatten()
        });

    let Some(file) = file else {
        return StatusCode::NOT_FOUND.into_response();
    };

    let mime = from_path(file.path()).first_or_octet_stream();
    let mut response = Response::new(Body::from(file.contents().to_vec()));
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(mime.as_ref())
            .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream")),
    );
    response
}

fn generate_access_key() -> String {
    Alphanumeric.sample_string(&mut rand::thread_rng(), 24)
}
