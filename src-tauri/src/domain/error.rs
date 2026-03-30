use std::fmt::{Display, Formatter};

use tauri::ipc::InvokeError;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Clone)]
pub enum AppError {
    NotFound(String),
    DuplicateSku(String),
    InsufficientStock { available: i64, requested: i64 },
    ValidationError(String),
    DatabaseError(String),
}

impl Display for AppError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotFound(message)
            | Self::DuplicateSku(message)
            | Self::ValidationError(message)
            | Self::DatabaseError(message) => write!(f, "{message}"),
            Self::InsufficientStock {
                available,
                requested,
            } => write!(
                f,
                "Cannot issue {requested} units. Current available stock is {available}."
            ),
        }
    }
}

impl std::error::Error for AppError {}

impl From<AppError> for String {
    fn from(value: AppError) -> Self {
        value.to_string()
    }
}

impl From<AppError> for InvokeError {
    fn from(value: AppError) -> Self {
        InvokeError::from(String::from(value))
    }
}

impl From<std::io::Error> for AppError {
    fn from(value: std::io::Error) -> Self {
        Self::DatabaseError(value.to_string())
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(value: rusqlite::Error) -> Self {
        Self::DatabaseError(value.to_string())
    }
}
